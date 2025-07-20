/**
 * OmniZap WhatsApp Connection Controller
 *
 * Refatorado para seguir o padrão do Baileys
 * Utiliza eventos globais para comunicação
 *
 * @version 2.0.0
 * @license MIT
 */

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const path = require('path');
const logger = require('../utils/logger/loggerModule');
const { processMessages, processEvent } = require('../controllers/messageController');

let activeSocket = null;
let connectionAttempts = 0;
let lastConnectionTime = null;
let isReconnecting = false;

/**
 * Lida com todos os eventos do Baileys
 */
function handleAllEvents(sock) {
  sock.ev.on('connection.update', (update) => {
    logger.info('🔄 Evento de conexão:', update);
    processEvent(update);
  });

  sock.ev.on('messages.upsert', (messageUpdate) => {
    logger.info('📨 Evento de mensagens:', messageUpdate);
    processMessages(messageUpdate, sock);
  });

  sock.ev.on('creds.update', () => {
    logger.info('🔐 Credenciais atualizadas');
  });

  sock.ev.on('chats.upsert', (chats) => {
    logger.info('💬 Novos chats:', chats);
    processEvent(chats);
  });

  sock.ev.on('groups.update', (groups) => {
    logger.info('👥 Atualizações de grupos:', groups);
    processEvent(groups);
  });

  sock.ev.on('contacts.upsert', (contacts) => {
    logger.info('👤 Novos contatos:', contacts);
    processEvent(contacts);
  });

  // Adicione outros eventos conforme necessário
}

/**
 * Configura e retorna o socket do Baileys
 */
async function connectToWhatsApp() {
  if (isReconnecting) {
    logger.warn('🔄 Já está em processo de reconexão, aguarde...');
    return;
  }

  try {
    isReconnecting = true;
    connectionAttempts++;
    logger.info(`🔗 Tentativa de conexão #${connectionAttempts}`);

    const authPath = path.join(__dirname, 'auth_info_baileys');
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: require('pino')({ level: 'silent' }),
      browser: Browsers.ubuntu('OmniZap'),
      printQRInTerminal: !process.env.PAIRING_CODE,
    });

    if (!sock.authState.creds.registered && !process.env.PAIRING_CODE) {
      logger.warn('⚠️ Nenhuma credencial encontrada. Certifique-se de escanear o QR Code ou usar o código de pareamento.');
    }

    if (process.env.PAIRING_CODE && !sock.authState.creds.registered) {
      const phoneNumber = process.env.PHONE_NUMBER?.replace(/[^0-9]/g, '');
      if (!phoneNumber) {
        throw new Error('Número de telefone é obrigatório para o modo de pareamento.');
      }

      if (sock.ws.readyState !== sock.ws.OPEN) {
        logger.warn('⚠️ Aguardando conexão ser estabelecida antes de solicitar o código de pareamento.');
        await new Promise((resolve) => {
          const interval = setInterval(() => {
            if (sock.ws.readyState === sock.ws.OPEN) {
              clearInterval(interval);
              resolve();
            }
          }, 1000);
        });
      }

      try {
        logger.info(`📞 Solicitando código de pareamento para: ${phoneNumber}`);
        const code = await sock.requestPairingCode(phoneNumber);
        logger.info('═══════════════════════════════════════════════════');
        logger.info('📱 SEU CÓDIGO DE PAREAMENTO 📱');
        logger.info(`\n          > ${code.match(/.{1,4}/g).join('-')} <\n`);
        logger.info('💡 WhatsApp → Dispositivos vinculados → Vincular com número');
        logger.info('═══════════════════════════════════════════════════');
      } catch (error) {
        logger.error('❌ Erro ao solicitar o código de pareamento:', error.message);
        throw error;
      }
    }

    handleAllEvents(sock);

    activeSocket = sock;
    sock.ev.on('creds.update', saveCreds);
    return sock;
  } catch (error) {
    isReconnecting = false;
    logger.error('❌ Erro ao conectar ao WhatsApp:', error.message);
    throw error;
  }
}

/**
 * Lida com atualizações de conexão
 */
function handleConnectionUpdate(update, sock, saveCreds) {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    logger.info('📱 QR Code gerado! Escaneie com seu WhatsApp:');
    qrcode.generate(qr, { small: true });
  }

  if (connection === 'close') {
    const shouldReconnect = (lastDisconnect?.error?.output?.statusCode || 0) !== DisconnectReason.loggedOut;
    if (shouldReconnect && connectionAttempts < 5) {
      setTimeout(connectToWhatsApp, 10000);
    } else {
      logger.error('❌ Sessão encerrada. Reinicie a aplicação para reconectar.');
    }
  } else if (connection === 'open') {
    logger.info('✅ Conectado com sucesso ao WhatsApp!');
    lastConnectionTime = Date.now();
    connectionAttempts = 0;
    isReconnecting = false;
  }

  sock.ev.on('creds.update', saveCreds);
}

/**
 * Lida com novas mensagens
 */
function handleMessagesUpsert({ messages }) {
  for (const message of messages) {
    logger.info(`📨 Nova mensagem de ${message.key.remoteJid}: ${message.message?.conversation || 'Sem conteúdo'}`);
  }
}

/**
 * Força reconexão ao WhatsApp
 */
async function reconnectToWhatsApp() {
  if (activeSocket) {
    activeSocket.ws.close();
  }
  await connectToWhatsApp();
}

module.exports = {
  connectToWhatsApp,
  reconnectToWhatsApp,
};
