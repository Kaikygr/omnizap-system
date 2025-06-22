/**
 * OmniZap Message Controller
 *
 * Controlador responsável pelo processamento e tratamento de mensagens
 * recebidas através do WhatsApp via tecnologia Baileys
 *
 * @version 1.0.4
 * @author OmniZap Team
 * @license MIT
 */

require('dotenv').config();
const { str, cleanEnv } = require('envalid');
const { cacheManager } = require('../cache/cacheManager');
const { preProcessMessage, isCommand, getExpiration } = require('../utils/baileys/messageHelper');
const logger = require('../utils/logger/loggerModule');

const env = cleanEnv(process.env, {
  COMMAND_PREFIX: str({ default: '/', desc: 'Prefixo para comandos no chat' }),
});

const COMMAND_PREFIX = env.COMMAND_PREFIX;

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
  });

  try {
    for (const messageInfo of messageUpdate?.messages || []) {
      const isGroupMessage = messageInfo.key.remoteJid.endsWith('@g.us');
      const { type, body: messageText, isMedia } = preProcessMessage(messageInfo);

      const commandInfo = isCommand(messageText);
      const groupJid = isGroupMessage ? messageInfo.key.remoteJid : null;

      const senderJid = isGroupMessage ? messageInfo.key.participant || messageInfo.key.remoteJid : messageInfo.key.remoteJid;

      if (messageInfo.key.fromMe) {
        logger.debug('Mensagem própria ignorada', { messageType: 'own-message' });
        continue;
      }

      try {
        if (commandInfo.isCommand) {
          try {
            const { command, args } = commandInfo;
            const targetJid = isGroupMessage ? groupJid : senderJid;

            const getGroupInfo = async (groupJid) => {
              try {
                if (!groupJid || !groupJid.endsWith('@g.us')) {
                  return null;
                }

                return await cacheManager.getGroupMetadata(groupJid);
              } catch (error) {
                logger.error('Erro ao obter informações do grupo', {
                  error: error.message,
                  stack: error.stack,
                  groupJid,
                });
                return null;
              }
            };

            switch (command.toLowerCase()) {
              case 't':
                await omniZapClient.sendMessage(targetJid, {
                  text: JSON.stringify(messageInfo, null, 2),
                });
                break;

              case 'sticker':
              case 's':
                try {
                  const { processSticker, extractMediaDetails } = require('../commandModules/stickerCommand');

                  logger.info('Comando sticker executado', {
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                  });

                  const mediaDetails = extractMediaDetails(messageInfo);

                  if (!mediaDetails) {
                    await omniZapClient.sendMessage(targetJid, {
                      react: { text: '❌', key: messageInfo.key },
                    });

                    await omniZapClient.sendMessage(
                      targetJid,
                      {
                        text: `❌ *Nenhuma mídia encontrada*\n\n📋 *Como usar o comando sticker:*\n\n1️⃣ *Envie uma imagem/vídeo com legenda:*\n   ${COMMAND_PREFIX}s Nome do Pacote | Nome do Autor\n\n2️⃣ *Ou responda a uma mídia com:*\n   ${COMMAND_PREFIX}s Nome do Pacote | Nome do Autor\n\n📝 *Personalização avançada:*\nVocê pode usar as seguintes variáveis nos nomes:\n• #nome - Será substituído pelo seu nome\n• #id - Será substituído pelo seu número\n• #data - Será substituído pela data atual\n\nExemplo: ${COMMAND_PREFIX}s Stickers de #nome | Criado em #data`,
                      },
                      {
                        quoted: messageInfo,
                        ephemeralExpiration: getMessageExpiration(messageInfo),
                      },
                    );
                    break;
                  }

                  await omniZapClient.sendMessage(targetJid, {
                    react: { text: '⏳', key: messageInfo.key },
                  });

                  const result = await processSticker(omniZapClient, messageInfo, senderJid, targetJid, args);

                  if (result.success) {
                    await omniZapClient.sendMessage(targetJid, {
                      react: { text: '✅', key: messageInfo.key },
                    });

                    await omniZapClient.sendMessage(
                      targetJid,
                      {
                        sticker: { url: result.stickerPath },
                      },
                      {
                        quoted: messageInfo,
                        ephemeralExpiration: getMessageExpiration(messageInfo),
                      },
                    );

                    try {
                      const fs = require('fs').promises;
                      await fs.unlink(result.stickerPath);
                    } catch (cleanupError) {
                      logger.warn('Erro ao limpar arquivo de sticker', {
                        error: cleanupError.message,
                      });
                    }
                  } else {
                    await omniZapClient.sendMessage(targetJid, {
                      react: { text: '❌', key: messageInfo.key },
                    });

                    await omniZapClient.sendMessage(
                      targetJid,
                      {
                        text: result.message,
                      },
                      {
                        quoted: messageInfo,
                        ephemeralExpiration: getMessageExpiration(messageInfo),
                      },
                    );
                  }
                } catch (error) {
                  await omniZapClient.sendMessage(targetJid, {
                    react: { text: '❌', key: messageInfo.key },
                  });

                  logger.error('Erro ao executar comando sticker', {
                    error: error.message,
                    stack: error.stack,
                    command,
                    args,
                    senderJid,
                    isGroupMessage,
                  });

                  await omniZapClient.sendMessage(
                    targetJid,
                    {
                      text: `❌ *Erro ao criar sticker*\n\nOcorreu um problema durante o processamento: ${error.message}\n\n📋 *Possíveis soluções:*\n• Verifique se a mídia é uma imagem ou vídeo válido\n• Tente enviar a mídia novamente com tamanho menor\n• Tente com outro formato de arquivo\n• Se o erro persistir, tente mais tarde`,
                    },
                    { quoted: messageInfo },
                  );
                }
                break;
              default:
                const contextInfo = isGroupMessage ? `\n\n👥 *Contexto:* Grupo\n👤 *Solicitante:* ${senderJid}` : `\n\n👤 *Contexto:* Mensagem direta`;

                const unknownText = `❓ *Comando Desconhecido*

🚫 **Comando:** ${COMMAND_PREFIX}${command}

💡 **Dica:** Use ${COMMAND_PREFIX}help para ver todos os comandos disponíveis${contextInfo}`;

                await omniZapClient.sendMessage(targetJid, { text: unknownText });
                logger.info('Comando desconhecido recebido', {
                  command,
                  args,
                  senderJid,
                  isGroupMessage: isGroupMessage ? 'true' : 'false',
                });
                break;
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

            await omniZapClient.sendMessage(targetJid, {
              text: `❌ *Erro interno*\n\nOcorreu um erro ao processar seu comando. Tente novamente.${contextInfo}`,
            });
          }
        } else {
          if (isGroupMessage) {
            logger.info('Mensagem normal de grupo processada', {
              type: 'group-message',
              messageType: type,
              isMedia,
              groupJid,
            });
          } else {
            logger.info('Mensagem normal processada', {
              type: 'private-message',
              messageType: type,
              isMedia,
              senderJid,
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

  logger.info('Processamento de mensagens concluído');
};

module.exports = OmniZapMessageProcessor;
