/**
 * OmniZap WhatsApp Connection Controller
 *
 * Refatorado para seguir o padrão do Baileys
 * Utiliza eventos globais para comunicação
 *
 * @version 2.0.0
 * @license MIT
 * @source https://github.com/Kaikygr/omnizap-system
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  getAggregateVotesInPollMessage,
} = require("@whiskeysockets/baileys");

const store = {
  chats: [],
  contacts: {},
  messages: {},
  groups: {},
  blocklist: [],
  labels: {},
  presences: {},
  calls: [],
  newsletters: {},
  bind: function (ev) {
    ev.on("messages.upsert", ({ messages: incomingMessages, type }) => {
      const MAX_MESSAGES_PER_CHAT = 100;
      if (type === "append") {
        for (const msg of incomingMessages) {
          if (!this.messages[msg.key.remoteJid]) {
            this.messages[msg.key.remoteJid] = [];
          }
          this.messages[msg.key.remoteJid].push(msg);
          if (this.messages[msg.key.remoteJid].length > MAX_MESSAGES_PER_CHAT) {
            this.messages[msg.key.remoteJid].shift();
          }
        }
        this.debouncedWrite("messages");
      }
    });
    ev.on("messages.delete", (item) => {
      if ("all" in item) {
        this.messages[item.jid] = [];
      } else {
        for (const { key } of item.keys) {
          if (this.messages[key.remoteJid]) {
            this.messages[key.remoteJid] = this.messages[key.remoteJid].filter(
              (msg) => msg.key.id !== key.id
            );
          }
        }
      }
      this.debouncedWrite("messages");
    });
    ev.on("messages.update", (updates) => {
      for (const update of updates) {
        if (this.messages[update.key.remoteJid]) {
          const idx = this.messages[update.key.remoteJid].findIndex(
            (msg) => msg.key.id === update.key.id
          );
          if (idx !== -1) {
            Object.assign(this.messages[update.key.remoteJid][idx], update);
          }
        }
      }
      this.debouncedWrite("messages");
    });
    ev.on("messages.media-update", (updates) => {
      for (const update of updates) {
        if (this.messages[update.key.remoteJid]) {
          const idx = this.messages[update.key.remoteJid].findIndex(
            (msg) => msg.key.id === update.key.id
          );
          if (idx !== -1) {
            Object.assign(this.messages[update.key.remoteJid][idx], {
              media: update.media,
            });
          }
        }
      }
      this.debouncedWrite("messages");
    });
    ev.on("messages.reaction", (reactions) => {
      for (const { key, reaction } of reactions) {
        if (this.messages[key.remoteJid]) {
          const idx = this.messages[key.remoteJid].findIndex(
            (msg) => msg.key.id === key.id
          );
          if (idx !== -1) {
            const message = this.messages[key.remoteJid][idx];
            if (!message.reactions) {
              message.reactions = [];
            }
            const existingReactionIdx = message.reactions.findIndex(
              (r) => r.key.id === reaction.key.id
            );
            if (existingReactionIdx !== -1) {
              if (reaction.text) {
                Object.assign(message.reactions[existingReactionIdx], reaction);
              } else {
                message.reactions.splice(existingReactionIdx, 1);
              }
            } else if (reaction.text) {
              message.reactions.push(reaction);
            }
          }
        }
      }
      this.debouncedWrite("messages");
    });
    ev.on("message-receipt.update", (updates) => {
      for (const { key, receipt } of updates) {
        if (this.messages[key.remoteJid]) {
          const idx = this.messages[key.remoteJid].findIndex(
            (msg) => msg.key.id === key.id
          );
          if (idx !== -1) {
            const message = this.messages[key.remoteJid][idx];
            if (!message.userReceipt) {
              message.userReceipt = [];
            }
            const existingReceiptIdx = message.userReceipt.findIndex(
              (r) => r.userJid === receipt.userJid
            );
            if (existingReceiptIdx !== -1) {
              Object.assign(message.userReceipt[existingReceiptIdx], receipt);
            } else {
              message.userReceipt.push(receipt);
            }
          }
        }
      }
      this.debouncedWrite("messages");
    });
    ev.on('groups.upsert', (newGroups) => {
      for (const group of newGroups) {
        this.groups[group.id] = group;
      }
      this.debouncedWrite('groups');
    });
    ev.on('groups.update', (updates) => {
      for (const update of updates) {
        if (this.groups[update.id]) {
          Object.assign(this.groups[update.id], update);
        } else {
          this.groups[update.id] = update;
        }
      }
      this.debouncedWrite('groups');
    });
    ev.on('group-participants.update', ({ id, participants, action }) => {
      if (this.groups[id]) {
        if (!Array.isArray(this.groups[id].participants)) {
          this.groups[id].participants = [];
        }
        if (action === 'add') {
          for (const participantJid of participants) {
            if (!this.groups[id].participants.some((p) => p.id === participantJid)) {
              this.groups[id].participants.push({ id: participantJid });
            }
          }
        } else if (action === 'remove') {
          this.groups[id].participants = this.groups[id].participants.filter(
            (p) => !participants.includes(p.id),
          );
        } else if (action === 'promote' || action === 'demote') {
          for (const participantJid of participants) {
            const participantObj = this.groups[id].participants.find(
              (p) => p.id === participantJid,
            );
            if (participantObj) {
              participantObj.admin = action === 'promote' ? 'admin' : null;
            }
          }
        }
      }
      this.debouncedWrite('groups');
    });
    ev.on('group.join-request', (update) => {
      logger.info('Group join request:', update);
    });
    ev.on('blocklist.set', ({ blocklist }) => {
      this.blocklist = blocklist;
      this.debouncedWrite('blocklist');
    });
    ev.on('blocklist.update', ({ blocklist, type }) => {
      if (type === 'add') {
        this.blocklist.push(...blocklist);
      } else if (type === 'remove') {
        this.blocklist = this.blocklist.filter((jid) => !blocklist.includes(jid));
      }
      this.debouncedWrite('blocklist');
    });
    ev.on('call', (calls) => {
      for (const call of calls) {
        const existingCall = this.calls.find((c) => c.id === call.id);
        if (existingCall) {
          Object.assign(existingCall, call);
        } else {
          this.calls.push(call);
        }
      }
      this.debouncedWrite('calls');
    });
    ev.on('labels.edit', (label) => {
      this.labels[label.id] = label;
      this.debouncedWrite('labels');
    });
    ev.on('labels.association', ({ association, type }) => {
      if (type === 'add') {
        if (!this.labels[association.labelId].associations) {
          this.labels[association.labelId].associations = [];
        }
        this.labels[association.labelId].associations.push(association);
      } else if (type === 'remove') {
        if (this.labels[association.labelId].associations) {
          this.labels[association.labelId].associations = this.labels[association.labelId].associations.filter(
            (assoc) => assoc.jid !== association.jid,
          );
        }
      }
      this.debouncedWrite('labels');
    });
    ev.on('newsletter.reaction', (reaction) => {
      if (!this.newsletters[reaction.id]) {
        this.newsletters[reaction.id] = {};
      }
      if (!this.newsletters[reaction.id].reactions) {
        this.newsletters[reaction.id].reactions = [];
      }
      const existingReactionIdx = this.newsletters[reaction.id].reactions.findIndex(
        (r) => r.server_id === reaction.server_id,
      );
      if (existingReactionIdx !== -1) {
        Object.assign(this.newsletters[reaction.id].reactions[existingReactionIdx], reaction);
      } else {
        this.newsletters[reaction.id].reactions.push(reaction);
      }
      this.debouncedWrite('newsletters');
    });
    ev.on('newsletter.view', (view) => {
      if (!this.newsletters[view.id]) {
        this.newsletters[view.id] = {};
      }
      this.newsletters[view.id].view = view;
      this.debouncedWrite('newsletters');
    });
    ev.on('newsletter-participants.update', (update) => {
      if (!this.newsletters[update.id]) {
        this.newsletters[update.id] = {};
      }
      if (!this.newsletters[update.id].participants) {
        this.newsletters[update.id].participants = [];
      }
      const existingParticipantIdx = this.newsletters[update.id].participants.findIndex(
        (p) => p.user === update.user,
      );
      if (existingParticipantIdx !== -1) {
        Object.assign(this.newsletters[update.id].participants[existingParticipantIdx], update);
      } else {
        this.newsletters[update.id].participants.push(update);
      }
      this.debouncedWrite('newsletters');
    });
    ev.on('newsletter-settings.update', (update) => {
      if (!this.newsletters[update.id]) {
        this.newsletters[update.id] = {};
      }
      Object.assign(this.newsletters[update.id], update);
      this.debouncedWrite('newsletters');
    });
    ev.on(
      "messaging-history.set",
      ({ chats, contacts, messages, isLatest }) => {
        if (isLatest) {
          this.chats = chats;
          this.contacts = contacts.reduce((acc, contact) => {
            acc[contact.id] = contact;
            return acc;
          }, {});
          this.messages = messages.reduce((acc, msg) => {
            if (!acc[msg.key.remoteJid]) {
              acc[msg.key.remoteJid] = [];
            }
            acc[msg.key.remoteJid].push(msg);
            return acc;
          }, {});
        } else {
          for (const chat of chats) {
            const existingChat = this.chats.find((c) => c.id === chat.id);
            if (existingChat) {
              Object.assign(existingChat, chat);
            } else {
              this.chats.push(chat);
            }
          }
          for (const contact of contacts) {
            this.contacts[contact.id] = contact;
          }
          for (const msg of messages) {
            if (!this.messages[msg.key.remoteJid]) {
              this.messages[msg.key.remoteJid] = [];
            }
            this.messages[msg.key.remoteJid].push(msg);
          }
        }
        this.debouncedWrite("chats");
        this.debouncedWrite("contacts");
        this.debouncedWrite("messages");
      }
    );
    ev.on("chats.upsert", (newChats) => {
      for (const chat of newChats) {
        const existingChat = this.chats.find((c) => c.id === chat.id);
        if (existingChat) {
          Object.assign(existingChat, chat);
        } else {
          this.chats.push(chat);
        }
      }
      this.debouncedWrite("chats");
    });
    ev.on("chats.update", (updates) => {
      for (const update of updates) {
        const existingChat = this.chats.find((c) => c.id === update.id);
        if (existingChat) {
          Object.assign(existingChat, update);
        }
      }
      this.debouncedWrite("chats");
    });
    ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
      logger.info(`Phone number shared for chat ${jid} (LID: ${lid})`);
    });
    ev.on("chats.delete", (deletions) => {
      this.chats = this.chats.filter((c) => !deletions.includes(c.id));
      this.debouncedWrite("chats");
    });
    ev.on("presence.update", ({ id, presences }) => {
      this.presences[id] = presences;
      this.debouncedWrite("presences");
    });
    ev.on("contacts.upsert", (newContacts) => {
      for (const contact of newContacts) {
        this.contacts[contact.id] = contact;
      }
      this.debouncedWrite("contacts");
    });
    ev.on("messages.delete", (item) => {
      if ("all" in item) {
        this.messages[item.jid] = [];
      } else {
        for (const { key } of item.keys) {
          if (this.messages[key.remoteJid]) {
            this.messages[key.remoteJid] = this.messages[key.remoteJid].filter(
              (msg) => msg.key.id !== key.id
            );
          }
        }
      }
      this.debouncedWrite("messages");
    });
    ev.on("messages.update", (updates) => {
      for (const update of updates) {
        if (this.messages[update.key.remoteJid]) {
          const idx = this.messages[update.key.remoteJid].findIndex(
            (msg) => msg.key.id === update.key.id
          );
          if (idx !== -1) {
            Object.assign(this.messages[update.key.remoteJid][idx], update);
          }
        }
      }
      this.debouncedWrite("messages");
    });
    ev.on("messages.media-update", (updates) => {
      for (const update of updates) {
        if (this.messages[update.key.remoteJid]) {
          const idx = this.messages[update.key.remoteJid].findIndex(
            (msg) => msg.key.id === update.key.id
          );
          if (idx !== -1) {
            Object.assign(this.messages[update.key.remoteJid][idx], {
              media: update.media,
            });
          }
        }
      }
      this.debouncedWrite("messages");
    });
    ev.on("messages.reaction", (reactions) => {
      for (const { key, reaction } of reactions) {
        if (this.messages[key.remoteJid]) {
          const idx = this.messages[key.remoteJid].findIndex(
            (msg) => msg.key.id === key.id
          );
          if (idx !== -1) {
            const message = this.messages[key.remoteJid][idx];
            if (!message.reactions) {
              message.reactions = [];
            }
            const existingReactionIdx = message.reactions.findIndex(
              (r) => r.key.id === reaction.key.id
            );
            if (existingReactionIdx !== -1) {
              if (reaction.text) {
                Object.assign(message.reactions[existingReactionIdx], reaction);
              } else {
                message.reactions.splice(existingReactionIdx, 1);
              }
            } else if (reaction.text) {
              message.reactions.push(reaction);
            }
          }
        }
      }
      this.debouncedWrite("messages");
    });
    ev.on("message-receipt.update", (updates) => {
      for (const update of updates) {
        if (this.contacts[update.id]) {
          Object.assign(this.contacts[update.id], update);
        }
      }
      this.debouncedWrite("contacts");
    });
  },
  readFromFile: function (dataType) {
    const filePath = path.join(__dirname, "store", `${dataType}.json`);
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, "utf8");
        this[dataType] = JSON.parse(data);
        logger.info(`Store for ${dataType} read from ${filePath}`);
      } else {
        logger.warn(
          `Store file for ${dataType} not found at ${filePath}. Starting with empty data.`
        );
      }
    }
    catch (error) {
      logger.error(
        `Error reading store for ${dataType} from ${filePath}:`,
        error
      );
    }
  },
  writeToFile: function (dataType) {
    const filePath = path.join(__dirname, "store", `${dataType}.json`);
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileAtomic(filePath, JSON.stringify(this[dataType], null, 2));
      logger.info(`Store for ${dataType} written to ${filePath}`);
    }
    catch (error) {
      logger.error(
        `Error writing store for ${dataType} to ${filePath}:`,
        error
      );
    }
  },
  debouncedWrites: {},
  debouncedWrite: function (dataType, delay = 1000) {
    if (this.debouncedWrites[dataType]) {
      clearTimeout(this.debouncedWrites[dataType]);
    }
    this.debouncedWrites[dataType] = setTimeout(() => {
      this.writeToFile(dataType);
      delete this.debouncedWrites[dataType];
    }, delay);
  },
};

const fs = require("fs");
const writeFileAtomic = require("write-file-atomically");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
const path = require("path");

const logger = require("../utils/logger/loggerModule");
const {
  processMessages,
  processEvent,
} = require("../controllers/messageController");
const {
  getSystemMetrics,
} = require("../utils/systemMetrics/systemMetricsModule");

let activeSocket = null;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 10000;

async function connectToWhatsApp() {
  logger.info("Iniciando conexão com o WhatsApp...", {
    action: "connect_init",
  });
  connectionAttempts = 0;

  const authPath = path.join(__dirname, "auth_info_baileys");
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  store.readFromFile("chats");
  store.readFromFile("contacts");
  store.readFromFile("messages");
  store.readFromFile("groups");
  store.readFromFile("blocklist");
  store.readFromFile("labels");
  store.readFromFile('presences');
  store.readFromFile('calls');
  store.readFromFile('newsletters');
  const version = "6.7.0";

  const usePairingCode = process.env.PAIRING_CODE === "true";

  const sock = makeWASocket({
    version,
    auth: state,
    logger: require("pino")({ level: "silent" }),
    browser: Browsers.macOS("Desktop"),

    qrTimeout: 30000,
    syncFullHistory: true,
    markOnlineOnConnect: false,
    getMessage: async (key) =>
      (store.messages[key.remoteJid] || []).find((m) => m.key.id === key.id),
  });

  store.bind(sock.ev);

  if (usePairingCode && !sock.authState.creds.registered) {
    const phoneNumber = process.env.PHONE_NUMBER?.replace(/[^0-9]/g, "");
    if (!phoneNumber) {
      logger.error(
        "Número de telefone é obrigatório para o modo de pareamento.",
        {
          errorType: "config_error",
          field: "PHONE_NUMBER",
        }
      );
      return;
    }
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        logger.info("═══════════════════════════════════════════════════");
        logger.info("📱 SEU CÓDIGO DE PAREAMENTO 📱");
        logger.info(
          "\n          > " + code.match(/.{1,4}/g).join("-") + " <\n"
        );
        logger.info(
          "💡 WhatsApp → Dispositivos vinculados → Vincular com número"
        );
        logger.info("═══════════════════════════════════════════════════");
      }
      catch (error) {
        logger.error("❌ Erro ao solicitar o código de pareamento:", {
          error: error.message,
          stack: error.stack,
          action: "request_pairing_code",
        });
      }
    }, 3000);
  }

  activeSocket = sock;
  sock.ev.on("creds.update", async () => {
    await saveCreds();
  });
  sock.ev.on("connection.update", (update) =>
    handleConnectionUpdate(update, sock)
  );
  sock.ev.on("messages.upsert", (messageUpdate) => {
    try {
      processMessages(messageUpdate, sock);
    }
    catch (err) {
      logger.error("Error in messages.upsert event:", err);
    }
  });
  sock.ev.on("messages.update", (update) => {
    try {
      handleMessageUpdate(update, sock);
    }
    catch (err) {
      logger.error("Error in messages.update event:", err);
    }
  });
  sock.ev.on("groups.update", (updates) => {
    try {
      handleGroupUpdate(updates, sock);
    }
    catch (err) {
      logger.error("Error in groups.update event:", err);
    }
  });
  sock.ev.on("group-participants.update", (update) => {
    try {
      handleGroupParticipantsUpdate(update, sock);
    }
    catch (err) {
      logger.error("Error in group-participants.update event:", err);
    }
  });

  sock.ev.on("all", (event) => {
    try {
      processEvent(event);
    }
    catch (err) {
      logger.error("Error in all event:", err);
    }
  });
}

async function handleConnectionUpdate(update, sock) {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    logger.info("📱 QR Code gerado! Escaneie com seu WhatsApp:", {
      action: "qr_code_generated",
    });
    qrcode.generate(qr, { small: true });
  }

  if (connection === "close") {
    const shouldReconnect =
      lastDisconnect?.error instanceof Boom &&
      lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut;

    if (shouldReconnect && connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
      connectionAttempts++;
      logger.warn(
        `Conexão perdida. Tentando reconectar em ${
          RECONNECT_INTERVAL / 1000
        }s... (Tentativa ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})`,
        {
          action: "reconnect_attempt",
          attempt: connectionAttempts,
          maxAttempts: MAX_CONNECTION_ATTEMPTS,
          reason: lastDisconnect?.error?.output?.statusCode || "unknown",
        }
      );
      setTimeout(connectToWhatsApp, RECONNECT_INTERVAL);
    } else if (shouldReconnect) {
      logger.error(
        "❌ Falha ao reconectar após várias tentativas. Reinicie a aplicação.",
        {
          action: "reconnect_failed",
          reason: lastDisconnect?.error?.output?.statusCode || "unknown",
        }
      );
    } else {
      logger.error("❌ Conexão fechada. Motivo:", {
        action: "connection_closed",
        reason: lastDisconnect?.error?.output?.statusCode || "unknown",
        error: lastDisconnect?.error?.message,
      });
    }
  }
  if (connection === "open") {
    logger.info("✅ Conectado com sucesso ao WhatsApp!", {
      action: "connection_open",
    });
    connectionAttempts = 0;
    // Sinaliza ao PM2 que a aplicação está pronta
    if (process.send) {
      process.send("ready");
      logger.info('Sinal de "ready" enviado ao PM2.');
    }
    setInterval(() => {
      const metrics = getSystemMetrics();
      logger.info("System Metrics", metrics);
    }, 60000);

    try {
      const allGroups = await sock.groupFetchAllParticipating();
      for (const group of Object.values(allGroups)) {
        store.groups[group.id] = group;
      }
      store.debouncedWrite("groups");
      logger.info(
        `Metadados de ${
          Object.keys(allGroups).length
        } grupos carregados e salvos.`,
        {
          action: "groups_loaded",
          count: Object.keys(allGroups).length,
        }
      );
    }
    catch (error) {
      logger.error("Erro ao carregar metadados de grupos na conexão:", {
        error: error.message,
        stack: error.stack,
        action: "groups_load_error",
      });
    }
  }
}

async function handleMessageUpdate(updates, sock) {
  for (const { key, update } of updates) {
    if (update.pollUpdates) {
      const pollCreation = await sock.getMessage(key);
      if (pollCreation) {
        const aggregatedVotes = getAggregateVotesInPollMessage({
          message: pollCreation,
          pollUpdates: update.pollUpdates,
        });
        logger.info("Votos da enquete atualizados:", {
          action: "poll_votes_updated",
          key: key,
          aggregatedVotes: aggregatedVotes,
        });
      }
    }
  }
}

async function handleGroupUpdate(updates, sock) {
  for (const event of updates) {
    if (store.groups[event.id]) {
      Object.assign(store.groups[event.id], event);
    } else {
      store.groups[event.id] = event;
    }
    store.debouncedWrite("groups");
    logger.info(`Metadados do grupo ${event.id} atualizados.`, {
      action: "group_metadata_updated",
      groupId: event.id,
    });
  }
}

async function handleGroupParticipantsUpdate(update, sock) {
  try {
    const groupId = update.id;
    const participants = update.participants;
    const action = update.action;

    if (store.groups[groupId]) {
      if (!Array.isArray(store.groups[groupId].participants)) {
        store.groups[groupId].participants = [];
      }

      if (action === "add") {
        for (const participantJid of participants) {
          if (
            !store.groups[groupId].participants.some(
              (p) => p.id === participantJid
            )
          ) {
            store.groups[groupId].participants.push({ id: participantJid });
          }
        }
      } else if (action === "remove") {
        store.groups[groupId].participants = store.groups[
          groupId
        ].participants.filter((p) => !participants.includes(p.id));
      } else if (action === "promote" || action === "demote") {
        for (const participantJid of participants) {
          const participantObj = store.groups[groupId].participants.find(
            (p) => p.id === participantJid
          );
          if (participantObj) {
            participantObj.admin = action === "promote" ? "admin" : null;
          }
        }
      }
      store.debouncedWrite("groups");
      logger.info(`Participantes do grupo ${groupId} atualizados.`, {
        action: "group_participants_updated",
        groupId: groupId,
        participants: participants,
        actionType: action,
      });
    } else {
      logger.warn(
        `Metadados do grupo ${groupId} não encontrados no armazenamento durante a atualização de participantes.`,
        {
          action: "group_participants_update_missing_metadata",
          groupId: groupId,
        }
      );
    }
  }
  catch (error) {
    logger.error(
      `Erro ao processar atualização de participantes do grupo ${update.id}:`,
      {
        error: error.message,
        stack: error.stack,
        groupId: update.id,
        action: "group_participants_update_error",
      }
    );
  }
}

/**
 * Retorna a instância do socket ativo.
 * @returns {import('@whiskeysockets/baileys').WASocket | null}
 */
function getActiveSocket() {
  return activeSocket;
}

/**
 * Força reconexão ao WhatsApp
 */
async function reconnectToWhatsApp() {
  if (activeSocket) {
    logger.info(
      "Forçando o fechamento do socket para acionar a lógica de reconexão..."
    );
    activeSocket.ws.close();
  } else {
    logger.warn(
      "Tentativa de reconectar sem um socket ativo. Iniciando uma nova conexão."
    );
    await connectToWhatsApp();
  }
}

module.exports = {
  connectToWhatsApp,
  reconnectToWhatsApp,
  getActiveSocket,
};

if (require.main === module) {
  logger.info(
    "🔌 Socket Controller executado diretamente. Iniciando conexão..."
  );
  connectToWhatsApp().catch((err) => {
    logger.error(
      "❌ Falha catastrófica ao iniciar a conexão diretamente do Socket Controller.",
      {
        error: err.message,
        stack: err.stack,
      }
    );
    process.exit(1);
  });
}
