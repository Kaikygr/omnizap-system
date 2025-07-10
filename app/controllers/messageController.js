/**
 * OmniZap Message Controller
 *
 * Controlador responsável pelo processamento e tratamento de mensagens
 * recebidas através do WhatsApp via tecnologia Baileys
 *
 * @version 1.0.5
 * @author OmniZap Team
 * @license MIT
 */

require('dotenv').config();
const { databaseManager } = require('../database/databaseManager');
const { preProcessMessage, isCommand, getExpiration } = require('../utils/baileys/messageHelper');
const { sendOmniZapMessage, sendTextMessage, sendStickerMessage, sendReaction, formatErrorMessage } = require('../utils/messageUtils');
const { COMMAND_PREFIX } = require('../utils/constants');
const logger = require('../utils/logger/loggerModule');

// Importar funções do groupGlobalUtils
const { isGroupJid, isUserAdmin, isBotAdmin, isUserInGroup, isUserBanned, getGroupMetadata, updateGroupStats, logGroupActivity, cleanJid, getBotJid, initializeDirectories } = require('../utils/groupGlobalUtils');

/**
 * Função utilitária para obter informações de expiração de mensagens
 *
 * @param {Object} messageInfo - Informações da mensagem
 * @returns {*} Configuração de expiração ou undefined
 */
const getMessageExpiration = (messageInfo) => {
  return getExpiration(messageInfo);
};

/**
 * Valida se o usuário e o bot têm permissões administrativas
 *
 * @param {Object} omniZapClient - Cliente WhatsApp
 * @param {String} groupJid - JID do grupo
 * @param {String} senderJid - JID do remetente
 * @param {String} targetJid - JID de destino para resposta
 * @param {Object} messageInfo - Informações da mensagem
 * @param {String} actionName - Nome da ação (para mensagens de erro)
 * @returns {Promise<Object>} - Resultado da validação
 */
const validateAdminPermissions = async (omniZapClient, groupJid, senderJid, targetJid, messageInfo, actionName = 'executar esta ação') => {
  try {
    const senderIsAdmin = await isUserAdmin(omniZapClient, groupJid, senderJid);
    const botIsAdmin = await isBotAdmin(omniZapClient, groupJid);

    if (!senderIsAdmin) {
      await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);
      await sendTextMessage(omniZapClient, targetJid, formatErrorMessage('Permissão negada', 'Apenas administradores do grupo podem usar este comando.', '👮‍♂️ *Status:* Você não é administrador deste grupo'), {
        originalMessage: messageInfo,
      });
      return { valid: false, reason: 'user_not_admin' };
    }

    if (!botIsAdmin) {
      await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);
      await sendTextMessage(omniZapClient, targetJid, formatErrorMessage('Bot sem permissão', `O bot precisa ser administrador do grupo para ${actionName}.`, '🤖 *Status:* Bot não é administrador deste grupo'), {
        originalMessage: messageInfo,
      });
      return { valid: false, reason: 'bot_not_admin' };
    }

    return { valid: true };
  } catch (error) {
    logger.error('Erro ao validar permissões administrativas', {
      error: error.message,
      groupJid,
      senderJid,
    });
    return { valid: false, reason: 'validation_error', error: error.message };
  }
};

/**
 * Verifica se um comando requer contexto de grupo
 *
 * @param {String} command - Nome do comando
 * @returns {Boolean} - True se o comando requer grupo
 */
const isGroupOnlyCommand = (command) => {
  const groupOnlyCommands = ['ban', 'add', 'promote', 'demote', 'setname', 'setdesc', 'group', 'link', 'ephemeral', 'temp', 'addmode', 'groupinfo', 'infogrupo', 'banlist'];
  return groupOnlyCommands.includes(command.toLowerCase());
};

/**
 * Valida contexto de grupo para comandos específicos
 *
 * @param {String} command - Nome do comando
 * @param {Boolean} isGroupMessage - Se a mensagem é de grupo
 * @param {String} targetJid - JID de destino para resposta
 * @param {Object} messageInfo - Informações da mensagem
 * @param {Object} omniZapClient - Cliente WhatsApp
 * @returns {Promise<Boolean>} - True se o contexto é válido
 */
const validateGroupContext = async (command, isGroupMessage, targetJid, messageInfo, omniZapClient) => {
  if (isGroupOnlyCommand(command) && !isGroupMessage) {
    await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);
    await sendTextMessage(omniZapClient, targetJid, formatErrorMessage('Comando apenas para grupos', `O comando \`${command}\` só pode ser usado em grupos do WhatsApp.`, '👥 *Contexto necessário:* Este comando requer que você esteja em um grupo'), {
      originalMessage: messageInfo,
    });
    return false;
  }
  return true;
};

/**
 * Processador de mensagens WhatsApp do OmniZap
 *
 * Processa todas as mensagens recebidas através da conexão WhatsApp,
 * aplicando filtros, validações e executando as ações correspondentes
 *
 * @param {Object} messageUpdate - Objeto contendo as mensagens recebidas
 * @param {Object} omniZapClient - Cliente WhatsApp ativo para interação
 * @param {String} qrCodePath - Caminho para o QR Code se necessário
 * @returns {Promise<void>}
 */
const OmniZapMessageProcessor = async (messageUpdate, omniZapClient) => {
  logger.info('Iniciando processamento de mensagens', {
    messageCount: messageUpdate?.messages?.length || 0,
    botJid: cleanJid(getBotJid(omniZapClient)),
  });

  try {
    // Inicializar diretórios necessários na primeira execução
    await initializeDirectories();
    logger.debug('Diretórios do sistema inicializados');

    for (const messageInfo of messageUpdate?.messages || []) {
      const isGroupMessage = isGroupJid(messageInfo.key.remoteJid);
      const { type, body: messageText, isMedia } = preProcessMessage(messageInfo);

      const commandInfo = isCommand(messageText);
      const groupJid = isGroupMessage ? messageInfo.key.remoteJid : null;
      const senderJid = cleanJid(isGroupMessage ? messageInfo.key.participant || messageInfo.key.remoteJid : messageInfo.key.remoteJid);

      // Verificar se o usuário está banido antes de processar qualquer comando
      if (commandInfo.isCommand) {
        const userBanned = await isUserBanned(senderJid, groupJid);
        if (userBanned) {
          logger.warn('Usuário banido tentou executar comando', {
            senderJid,
            groupJid,
            command: commandInfo.command,
          });

          // Log da tentativa de uso por usuário banido
          if (isGroupMessage) {
            await logGroupActivity(groupJid, 'banned_user_attempt', {
              userJid: senderJid,
              command: commandInfo.command,
              timestamp: Date.now(),
            });
          }

          // Não processar o comando, apenas continuar para a próxima mensagem
          continue;
        }
      }

      try {
        if (commandInfo.isCommand) {
          try {
            const { command, args } = commandInfo;
            const targetJid = isGroupMessage ? groupJid : senderJid;

            // Log da atividade de comando em grupos
            if (isGroupMessage) {
              await logGroupActivity(groupJid, 'command_executed', {
                executorJid: senderJid,
                command,
                args,
                timestamp: Date.now(),
              });

              // Atualizar estatísticas do grupo
              try {
                const groupMetadata = await getGroupMetadata(omniZapClient, groupJid);
                if (groupMetadata) {
                  await updateGroupStats(groupJid, groupMetadata, {
                    activityType: 'command',
                    command,
                  });
                }
              } catch (statsError) {
                logger.warn('Erro ao atualizar estatísticas do grupo', {
                  error: statsError.message,
                  groupJid,
                });
              }
            }

            // Validar contexto de grupo para comandos que exigem
            const isValidContext = await validateGroupContext(command, isGroupMessage, targetJid, messageInfo, omniZapClient);
            if (!isValidContext) {
              continue; // Se o contexto não for válido, pular para a próxima mensagem
            }

            switch (command.toLowerCase()) {
              case 'ban':
                try {
                  const { processBanCommand } = require('../commandModules/adminModules/adminCommands');

                  // Verificações adicionais usando groupGlobalUtils
                  if (isGroupMessage) {
                    const validation = await validateAdminPermissions(omniZapClient, groupJid, senderJid, targetJid, messageInfo, 'banir usuários');
                    if (!validation.valid) {
                      continue;
                    }
                  }

                  logger.info('Comando ban executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processBanCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando ban', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao banir usuário', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Verifique se o bot é administrador do grupo\n• Verifique se você é administrador do grupo\n• Verifique se o número/usuário existe\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'add':
                try {
                  const { processAddCommand } = require('../commandModules/adminModules/adminCommands');

                  // Verificações adicionais usando groupGlobalUtils
                  if (isGroupMessage) {
                    const validation = await validateAdminPermissions(omniZapClient, groupJid, senderJid, targetJid, messageInfo, 'adicionar usuários');
                    if (!validation.valid) {
                      continue;
                    }
                  }

                  logger.info('Comando add executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processAddCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando add', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao adicionar participantes', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Verifique se o bot é administrador do grupo\n• Verifique se você é administrador do grupo\n• Verifique se os números são válidos\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'promote':
                try {
                  const { processPromoteCommand } = require('../commandModules/adminModules/adminCommands');

                  // Verificações adicionais usando groupGlobalUtils
                  if (isGroupMessage) {
                    const validation = await validateAdminPermissions(omniZapClient, groupJid, senderJid, targetJid, messageInfo, 'promover usuários');
                    if (!validation.valid) {
                      continue;
                    }
                  }

                  logger.info('Comando promote executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processPromoteCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando promote', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao promover participante', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Verifique se o bot é administrador do grupo\n• Verifique se você é administrador do grupo\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'demote':
                try {
                  const { processDemoteCommand } = require('../commandModules/adminModules/adminCommands');

                  // Verificações adicionais usando groupGlobalUtils
                  if (isGroupMessage) {
                    const validation = await validateAdminPermissions(omniZapClient, groupJid, senderJid, targetJid, messageInfo, 'rebaixar usuários');
                    if (!validation.valid) {
                      continue;
                    }
                  }

                  logger.info('Comando demote executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processDemoteCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando demote', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao rebaixar participante', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Verifique se o bot é administrador do grupo\n• Verifique se você é administrador do grupo\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'setname':
                try {
                  const { processSetNameCommand } = require('../commandModules/adminModules/adminCommands');

                  // Verificações adicionais usando groupGlobalUtils
                  if (isGroupMessage) {
                    const validation = await validateAdminPermissions(omniZapClient, groupJid, senderJid, targetJid, messageInfo, 'alterar nome do grupo');
                    if (!validation.valid) {
                      continue;
                    }
                  }

                  logger.info('Comando setname executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processSetNameCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando setname', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao alterar nome do grupo', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Verifique se o bot é administrador do grupo\n• Verifique se você é administrador do grupo\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'setdesc':
                try {
                  const { processSetDescCommand } = require('../commandModules/adminModules/adminCommands');

                  // Verificações adicionais usando groupGlobalUtils
                  if (isGroupMessage) {
                    const validation = await validateAdminPermissions(omniZapClient, groupJid, senderJid, targetJid, messageInfo, 'alterar descrição do grupo');
                    if (!validation.valid) {
                      continue;
                    }
                  }

                  logger.info('Comando setdesc executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processSetDescCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando setdesc', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao alterar descrição do grupo', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Verifique se o bot é administrador do grupo\n• Verifique se você é administrador do grupo\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'group':
                try {
                  const { processGroupSettingCommand } = require('../commandModules/adminModules/adminCommands');

                  logger.info('Comando group executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processGroupSettingCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando group', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao alterar configurações do grupo', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Verifique se o bot é administrador do grupo\n• Verifique se você é administrador do grupo\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'link':
                try {
                  const { processLinkCommand } = require('../commandModules/adminModules/adminCommands');

                  logger.info('Comando link executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processLinkCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando link', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao obter link do grupo', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Verifique se o bot é administrador do grupo\n• Verifique se você é administrador do grupo\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'ephemeral':
              case 'temp':
                try {
                  const { processEphemeralCommand } = require('../commandModules/adminModules/adminCommands');

                  logger.info('Comando ephemeral executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processEphemeralCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando ephemeral', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao configurar mensagens temporárias', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Verifique se o bot é administrador do grupo\n• Verifique se você é administrador do grupo\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'addmode':
                try {
                  const { processAddModeCommand } = require('../commandModules/adminModules/adminCommands');

                  logger.info('Comando addmode executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processAddModeCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando addmode', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao configurar modo de adição', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Verifique se o bot é administrador do grupo\n• Verifique se você é administrador do grupo\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'groupinfo':
              case 'infogrupo':
                try {
                  const { processGroupInfoCommand } = require('../commandModules/adminModules/adminCommands');

                  logger.info('Comando groupinfo executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processGroupInfoCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando groupinfo', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao obter informações do grupo', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'banlist':
                try {
                  const { processBanListCommand } = require('../commandModules/adminModules/adminCommands');

                  logger.info('Comando banlist executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processBanListCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando banlist', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao listar banimentos', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Verifique a sintaxe do comando\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'sticker':
              case 's':
                try {
                  const { processSticker, extractMediaDetails } = require('../commandModules/stickerModules/stickerCommand');
                  const { processStickerSubCommand } = require('../commandModules/stickerModules/stickerSubCommands');

                  logger.info('Comando sticker executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                  });

                  const subCommandList = ['packs', 'list', 'stats', 'status', 'info', 'delete', 'del', 'rename', 'send', 'share', 'help'];
                  const firstArg = args.split(' ')[0]?.toLowerCase();

                  if (firstArg && subCommandList.includes(firstArg)) {
                    const subCommandArgs = args.split(' ').slice(1).join(' ');
                    const result = await processStickerSubCommand(firstArg, subCommandArgs, omniZapClient, messageInfo, senderJid, targetJid);

                    const reactionEmoji = result.success ? '✅' : '❌';
                    await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                    await sendTextMessage(omniZapClient, targetJid, result.message, {
                      originalMessage: messageInfo,
                    });
                    break;
                  }

                  const mediaDetails = extractMediaDetails(messageInfo);

                  if (!mediaDetails) {
                    await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                    const errorMsg = formatErrorMessage('Nenhuma mídia encontrada', null, `📋 *Como usar o comando sticker:*\n\n1️⃣ *Envie uma imagem/vídeo com legenda:*\n   ${COMMAND_PREFIX}s Nome do Pacote | Nome do Autor\n\n2️⃣ *Ou responda a uma mídia com:*\n   ${COMMAND_PREFIX}s Nome do Pacote | Nome do Autor\n\n📝 *Comandos de gerenciamento:*\n• ${COMMAND_PREFIX}s packs - Ver seus packs\n• ${COMMAND_PREFIX}s stats - Estatísticas\n• ${COMMAND_PREFIX}s help - Ajuda completa\n\n📦 *Sistema de Packs:*\nCada 30 stickers formam um pack completo!\n\nExemplo: ${COMMAND_PREFIX}s Stickers de #nome | Criado em #data`);

                    await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                      originalMessage: messageInfo,
                    });
                    break;
                  }

                  await sendReaction(omniZapClient, targetJid, '⏳', messageInfo.key);

                  const result = await processSticker(omniZapClient, messageInfo, senderJid, targetJid, args);

                  if (result.success) {
                    await sendReaction(omniZapClient, targetJid, '✅', messageInfo.key);

                    await sendStickerMessage(omniZapClient, targetJid, result.stickerPath, {
                      originalMessage: messageInfo,
                    });

                    await sendTextMessage(omniZapClient, targetJid, result.message, {
                      originalMessage: messageInfo,
                    });

                    try {
                      const fs = require('fs').promises;
                      await fs.unlink(result.stickerPath);
                    } catch (cleanupError) {
                      logger.warn('Erro ao limpar arquivo de sticker', {
                        error: cleanupError.message,
                      });
                    }
                  } else {
                    await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                    await sendTextMessage(omniZapClient, targetJid, result.message, {
                      originalMessage: messageInfo,
                    });
                  }
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando sticker', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                  });

                  const errorMsg = formatErrorMessage('Erro ao criar sticker', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Verifique se a mídia é uma imagem ou vídeo válido\n• Tente enviar a mídia novamente com tamanho menor\n• Tente com outro formato de arquivo\n• Se o erro persistir, tente mais tarde`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              case 'menu':
                try {
                  const { processMenuCommand } = require('../commandModules/menuCommand');

                  logger.info('Comando menu executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const result = await processMenuCommand(omniZapClient, messageInfo, senderJid, groupJid, args);

                  const reactionEmoji = result.success ? '✅' : '❌';
                  await sendReaction(omniZapClient, targetJid, reactionEmoji, messageInfo.key);

                  await sendTextMessage(omniZapClient, targetJid, result.message, {
                    originalMessage: messageInfo,
                  });
                } catch (error) {
                  await sendReaction(omniZapClient, targetJid, '❌', messageInfo.key);

                  logger.error('Erro ao executar comando menu', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                    groupJid,
                  });

                  const errorMsg = formatErrorMessage('Erro ao exibir menu', `Ocorreu um problema durante o processamento: ${error.message}`, `📋 *Possíveis soluções:*\n• Tente novamente mais tarde\n• Se o erro persistir, contate o administrador`);

                  await sendTextMessage(omniZapClient, targetJid, errorMsg, {
                    originalMessage: messageInfo,
                  });
                }
                break;
              default:
            }
          } catch (error) {
            logger.error('Erro ao processar comando', {
              error: error.message,
              stack: error.stack,
              command: commandInfo.command,
              args: commandInfo.args,
              senderJid,
              isGroupMessage,
            });
            const targetJid = isGroupMessage ? groupJid : senderJid;

            const contextInfo = isGroupMessage ? `\n\n👥 *Contexto:* Grupo\n👤 *Solicitante:* ${senderJid}` : `\n\n👤 *Contexto:* Mensagem direta`;

            const errorMsg = formatErrorMessage('Erro interno', `Ocorreu um erro ao processar seu comando. Tente novamente.${contextInfo}`);

            await sendTextMessage(omniZapClient, targetJid, errorMsg);
          }
        } else {
          // Processamento de mensagens não-comando
          if (isGroupMessage) {
            // Log de atividade do grupo para mensagens normais
            try {
              await logGroupActivity(groupJid, 'message_received', {
                senderJid,
                messageType: type,
                isMedia,
                timestamp: Date.now(),
              });

              // Atualizar estatísticas do grupo periodicamente
              try {
                const groupMetadata = await getGroupMetadata(omniZapClient, groupJid);
                if (groupMetadata) {
                  await updateGroupStats(groupJid, groupMetadata, {
                    activityType: 'message',
                    messageType: type,
                  });
                }
              } catch (statsError) {
                logger.warn('Erro ao atualizar estatísticas do grupo para mensagem normal', {
                  error: statsError.message,
                  groupJid,
                });
              }
            } catch (logError) {
              logger.warn('Erro ao registrar atividade do grupo', {
                error: logError.message,
                groupJid,
                senderJid,
              });
            }

            logger.info('Mensagem normal de grupo processada', {
              type: 'group-message',
              messageType: type,
              isMedia,
              groupJid,
              senderJid: cleanJid(senderJid),
            });
          } else {
            logger.info('Mensagem privada processada', {
              type: 'private-message',
              messageType: type,
              isMedia,
              senderJid: cleanJid(senderJid),
            });
          }
        }
      } catch (error) {
        logger.error('Erro ao processar mensagem individual', {
          error: error.message,
          stack: error.stack,
          senderJid,
          isGroupMessage: isGroupMessage ? 'true' : 'false',
        });
      }
    }
  } catch (error) {
    if (error.message && error.message.includes('network')) {
      logger.error('Erro de rede detectado', {
        error: error.message,
        stack: error.stack,
        type: 'network',
      });
    } else if (error.message && error.message.includes('timeout')) {
      logger.error('Timeout detectado', {
        error: error.message,
        stack: error.stack,
        type: 'timeout',
      });
    } else {
      logger.error('Erro geral no processamento', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  logger.info('Processamento de mensagens concluído', {
    messageCount: messageUpdate?.messages?.length || 0,
    botJid: cleanJid(getBotJid(omniZapClient)),
    timestamp: Date.now(),
  });
};

module.exports = OmniZapMessageProcessor;
