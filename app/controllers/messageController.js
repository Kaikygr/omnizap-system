/**
 * OmniZap Message Controller - Otimizado
 *
 * Controlador unificado para processamento de mensagens e roteamento de comandos.
 * Utiliza o eventHandler para uma gestão de dados centralizada e eficiente.
 *
 * @version 2.0.0
 * @author OmniZap Team
 * @license MIT
 */

require('dotenv').config();
const { preProcessMessage, isCommand } = require('../utils/baileys/messageHelper');
const { sendReaction, sendTextMessage, formatErrorMessage } = require('../utils/messageUtils');
const { COMMAND_PREFIX } = require('../utils/constants');
const logger = require('../utils/logger/loggerModule');
const { eventHandler } = require('../events/eventHandler');
const { isUserAdmin, isBotAdmin, isGroupJid, getGroupMetadata, getBotJid, cleanJid } = require('../utils/groupGlobalUtils');

// Mapeamento de comandos para seus módulos e configurações
const commandMap = {
  ban: { module: 'adminModules/adminCommands', needsAdmin: true, groupOnly: true },
  add: { module: 'adminModules/adminCommands', needsAdmin: true, groupOnly: true },
  promote: { module: 'adminModules/adminCommands', needsAdmin: true, groupOnly: true },
  demote: { module: 'adminModules/adminCommands', needsAdmin: true, groupOnly: true },
  setname: { module: 'adminModules/adminCommands', needsAdmin: true, groupOnly: true },
  setdesc: { module: 'adminModules/adminCommands', needsAdmin: true, groupOnly: true },
  group: { module: 'adminModules/adminCommands', needsAdmin: true, groupOnly: true },
  link: { module: 'adminModules/adminCommands', needsAdmin: true, groupOnly: true },
  ephemeral: { module: 'adminModules/adminCommands', needsAdmin: true, groupOnly: true },
  temp: { module: 'adminModules/adminCommands', needsAdmin: true, groupOnly: true }, // Alias para ephemeral
  addmode: { module: 'adminModules/adminCommands', needsAdmin: true, groupOnly: true },
  groupinfo: { module: 'adminModules/adminCommands', groupOnly: true },
  infogrupo: { module: 'adminModules/adminCommands', groupOnly: true }, // Alias para groupinfo
  banlist: { module: 'adminModules/adminCommands', groupOnly: true },
  sticker: { module: 'stickerCommand' },
  s: { module: 'stickerCommand' }, // Alias para sticker
  menu: { module: 'menuCommand' },
};

/**
 * Valida as permissões necessárias para executar um comando.
 * @param {Object} commandConfig - Configuração do comando do commandMap.
 * @param {Object} context - Contexto da mensagem (groupJid, senderJid, etc.).
 * @returns {Promise<{valid: boolean, reason?: string}>} - Resultado da validação.
 */
const validatePermissions = async (commandConfig, context) => {
  const { groupJid, senderJid, omniZapClient } = context;

  if (commandConfig.groupOnly && !context.isGroup) {
    await sendTextMessage(omniZapClient, senderJid, formatErrorMessage('Comando apenas para grupos', `O comando só pode ser usado em grupos.`));
    return { valid: false, reason: 'group_only' };
  }

  if (commandConfig.needsAdmin) {
    const [senderIsAdmin, botIsAdmin] = await Promise.all([
      isUserAdmin(groupJid, senderJid),
      isBotAdmin(groupJid),
    ]);

    if (!senderIsAdmin) {
      await sendTextMessage(omniZapClient, senderJid, formatErrorMessage('Permissão negada', 'Apenas administradores podem usar este comando.'));
      return { valid: false, reason: 'user_not_admin' };
    }
    if (!botIsAdmin) {
      await sendTextMessage(omniZapClient, groupJid, formatErrorMessage('Bot sem permissão', 'O bot precisa ser administrador para executar esta ação.'));
      return { valid: false, reason: 'bot_not_admin' };
    }
  }

  return { valid: true };
};

/**
 * Processa um comando dinamicamente com base no commandMap.
 * @param {string} command - O comando a ser processado.
 * @param {Object} context - O contexto da mensagem.
 */
const processCommand = async (command, context) => {
  const { omniZapClient, messageInfo, senderJid, groupJid, args } = context;
  const targetJid = context.isGroup ? groupJid : senderJid;

  try {
    const commandConfig = commandMap[command.toLowerCase()];
    if (!commandConfig) return; // Comando não reconhecido

    const permissionResult = await validatePermissions(commandConfig, { ...context, omniZapClient });
    if (!permissionResult.valid) {
      await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);
      return;
    }

    // Carrega o módulo de comando dinamicamente
    const commandModule = require(`../commandModules/${commandConfig.module}`);
    const handlerName = `process${command.charAt(0).toUpperCase() + command.slice(1)}Command`;

    // Encontra o handler correto, considerando aliases
    const commandHandler = commandModule[handlerName] || Object.values(commandModule).find(fn => typeof fn === 'function');

    if (commandHandler) {
      await sendReaction(omniZapClient, targetJid, '⏳', messageInfo.key);
      const result = await commandHandler(omniZapClient, messageInfo, senderJid, groupJid, args);

      await sendReaction(omniZapClient, targetJid, result.success ? '✅' : '❌', messageInfo.key);
      if (result.message) {
        await sendTextMessage(omniZapClient, targetJid, result.message, { originalMessage: messageInfo });
      }
    } else {
      logger.warn('Handler de comando não encontrado', { command, module: commandConfig.module });
    }

  } catch (error) {
    logger.error('Erro ao processar comando', { command, error: error.message, stack: error.stack });
    await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);
    await sendTextMessage(omniZapClient, targetJid, formatErrorMessage('Erro interno', `Ocorreu um erro ao processar o comando: ${error.message}`), { originalMessage: messageInfo });
  }
};

/**
 * Processador principal de mensagens do OmniZap.
 * @param {Object} messageUpdate - Atualização de mensagens.
 * @param {Object} omniZapClient - Cliente WhatsApp ativo.
 */
const OmniZapMessageProcessor = async (messageUpdate, omniZapClient) => {
  if (!omniZapClient) {
    logger.error('Cliente WhatsApp não fornecido ao processador de mensagens.');
    return;
  }

  // Sincroniza o cliente com o eventHandler
  eventHandler.setWhatsAppClient(omniZapClient);

  for (const messageInfo of messageUpdate?.messages || []) {
    try {
      const { type, body: messageText, isMedia } = preProcessMessage(messageInfo);
      if (!type || !messageText) continue; // Ignora mensagens sem conteúdo

      const isGroup = isGroupJid(messageInfo.key.remoteJid);
      const senderJid = cleanJid(messageInfo.key.participant || messageInfo.key.remoteJid);
      const groupJid = isGroup ? messageInfo.key.remoteJid : null;

      // Dispara evento de recebimento de mensagem
      eventHandler.executeCallbacks('message.received', { messageInfo, isGroup, senderJid });

      const commandInfo = isCommand(messageText);
      if (commandInfo.isCommand) {
        const context = {
          omniZapClient,
          messageInfo,
          senderJid,
          groupJid,
          isGroup,
          args: commandInfo.args,
        };
        await processCommand(commandInfo.command, context);
      }
    } catch (error) {
      logger.error('Erro fatal ao processar mensagem individual', { error: error.message, stack: error.stack });
    }
  }
};

module.exports = OmniZapMessageProcessor;
