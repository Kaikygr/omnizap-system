const { getPool } = require('../../database/mysql');
const logger = require('../utils/logger/loggerModule');

const store = {
  chats: [],
  contacts: {},
  messages: {},
  groups: {},
  blocklist: [],
  // ... outros estados em memória, se necessário

  async loadData() {
    logger.info('Carregando dados iniciais do banco de dados...');
    const pool = getPool();
    try {
      const [chats] = await pool.query('SELECT * FROM `chats`');
      this.chats = chats;

      const [contacts] = await pool.query('SELECT * FROM `contacts`');
      this.contacts = contacts.reduce((acc, contact) => {
        acc[contact.id] = contact;
        return acc;
      }, {});

      const [groups] = await pool.query('SELECT * FROM `groups`');
      this.groups = groups.reduce((acc, group) => {
        acc[group.id] = group;
        return acc;
      }, {});
      
      const [blocklist] = await pool.query('SELECT * FROM `blocklist`');
      this.blocklist = blocklist.map(item => item.jid);

      logger.info('Dados carregados com sucesso do banco de dados.');
    } catch (error) {
      logger.error('Erro catastrófico ao carregar dados do banco de dados:', error);
      // Considere uma estratégia de fallback ou encerramento do processo
    }
  },

  bind: function (ev) {
    const pool = getPool();
    logger.info('Vinculando o store aos eventos do WhatsApp com persistência no MySQL.');

    ev.on('messages.upsert', async ({ messages: incomingMessages }) => {
      for (const msg of incomingMessages) {
        try {
          const { id, remoteJid, fromMe, participant, pushName, messageTimestamp, messageType, messageContent, full_message_data } = msg;
          await pool.query(
            'INSERT INTO `messages` (id, remoteJid, fromMe, participant, pushName, messageTimestamp, messageType, messageContent, full_message_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE full_message_data = VALUES(full_message_data)',
            [id, remoteJid, fromMe, participant, pushName, messageTimestamp, messageType, messageContent, JSON.stringify(full_message_data)]
          );
        } catch (error) {
          logger.error('Erro ao salvar mensagem no banco de dados:', { error, msg });
        }
      }
    });

    ev.on('messages.delete', async (item) => {
        if ('all' in item) {
            try {
                await pool.query('DELETE FROM `messages` WHERE remoteJid = ?', [item.jid]);
            } catch (error) {
                logger.error(`Erro ao deletar todas as mensagens para ${item.jid}:`, error);
            }
        } else {
            for (const { key } of item.keys) {
                try {
                    await pool.query('DELETE FROM `messages` WHERE id = ?', [key.id]);
                } catch (error) {
                    logger.error(`Erro ao deletar mensagem ${key.id}:`, error);
                }
            }
        }
    });

    ev.on('groups.upsert', async (newGroups) => {
      for (const group of newGroups) {
        try {
          await pool.query(
            'INSERT INTO `groups` (id, name, creation, owner, description, restricted, announce, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), owner = VALUES(owner), description = VALUES(description), restricted = VALUES(restricted), announce = VALUES(announce), size = VALUES(size)',
            [group.id, group.subject, group.creation, group.owner, group.desc, group.restrict, group.announce, group.size]
          );
        } catch (error) {
          logger.error('Erro ao salvar grupo no banco de dados:', { error, group });
        }
      }
    });
    
    ev.on('group-participants.update', async ({ id, participants, action }) => {
        for (const jid of participants) {
            try {
                if (action === 'add') {
                    await pool.query('INSERT INTO `group_participants` (group_id, participant_jid) VALUES (?, ?) ON DUPLICATE KEY UPDATE participant_jid = VALUES(participant_jid)', [id, jid]);
                } else if (action === 'remove') {
                    await pool.query('DELETE FROM `group_participants` WHERE group_id = ? AND participant_jid = ?', [id, jid]);
                } else if (action === 'promote' || action === 'demote') {
                    await pool.query('UPDATE `group_participants` SET is_admin = ? WHERE group_id = ? AND participant_jid = ?', [action === 'promote', id, jid]);
                }
            } catch (error) {
                logger.error(`Erro ao atualizar participante ${jid} no grupo ${id}:`, { error, action });
            }
        }
    });

    ev.on('blocklist.set', async ({ blocklist }) => {
        try {
            await pool.query('DELETE FROM `blocklist`');
            if (blocklist.length > 0) {
                const values = blocklist.map(jid => [jid]);
                await pool.query('INSERT INTO `blocklist` (jid) VALUES ?', [values]);
            }
        } catch (error) {
            logger.error('Erro ao definir a blocklist:', error);
        }
    });

    ev.on('blocklist.update', async ({ blocklist, type }) => {
        for (const jid of blocklist) {
            try {
                if (type === 'add') {
                    await pool.query('INSERT INTO `blocklist` (jid) VALUES (?) ON DUPLICATE KEY UPDATE jid = VALUES(jid)', [jid]);
                } else if (type === 'remove') {
                    await pool.query('DELETE FROM `blocklist` WHERE jid = ?', [jid]);
                }
            } catch (error) {
                logger.error(`Erro ao atualizar a blocklist para ${jid}:`, { error, type });
            }
        }
    });

    ev.on('chats.upsert', async (newChats) => {
        for (const chat of newChats) {
            try {
                await pool.query('INSERT INTO `chats` (id, name, isGroup, unreadCount, lastMessageTimestamp) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), isGroup = VALUES(isGroup), unreadCount = VALUES(unreadCount), lastMessageTimestamp = VALUES(lastMessageTimestamp)', 
                    [chat.id, chat.name, chat.isGroup, chat.unreadCount, chat.lastMessageTimestamp]
                );
            } catch (error) {
                logger.error(`Erro ao salvar chat ${chat.id}:`, error);
            }
        }
    });

    ev.on('chats.delete', async (deletions) => {
        for (const id of deletions) {
            try {
                await pool.query('DELETE FROM `chats` WHERE id = ?', [id]);
            } catch (error) {
                logger.error(`Erro ao deletar chat ${id}:`, error);
            }
        }
    });

    ev.on('contacts.upsert', async (newContacts) => {
        for (const contact of newContacts) {
            try {
                await pool.query('INSERT INTO `contacts` (id, name, pushName, isBusiness) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), pushName = VALUES(pushName), isBusiness = VALUES(isBusiness)',
                    [contact.id, contact.name, contact.pushName, contact.isBusiness]
                );
            } catch (error) {
                logger.error(`Erro ao salvar contato ${contact.id}:`, error);
            }
        }
    });
  }
};

module.exports = store;
