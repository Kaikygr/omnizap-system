/**
 * OmniZap - Sistema de Automação WhatsApp
 *
 * Sistema profissional para automação e gerenciamento de mensagens WhatsApp
 * Desenvolvido com tecnologia Baileys para máxima compatibilidade
 *
 * @version 1.0.5
 * @author OmniZap Team
 * @license MIT
 */

const OmniZapMessageProcessor = require('./app/controllers/messageController');
const { eventHandler } = require('./app/events/eventHandler');
const logger = require('./app/utils/logger/loggerModule');
const db = require('./app/database/mysql');

/**
 * Processador principal de mensagens do OmniZap
 *
 * @param {Object} messageUpdate - Atualização de mensagens recebidas
 * @param {Object} whatsappClient - Cliente WhatsApp ativo
 * @param {String} qrCodePath - Caminho do QR Code para autenticação (opcional)
 * @param {Object} socketController - Referência ao controlador de socket (opcional)
 * @returns {Promise<void>}
 */
const OmniZapMainHandler = async (messageUpdate, whatsappClient, qrCodePath = null, socketController = null) => {
  try {
    // Registrar início do processamento principal
    logger.info('🎯 OmniZap: Iniciando processamento principal', {
      messageCount: messageUpdate?.messages?.length || 0,
      hasSocketController: !!socketController,
      hasEventHandler: !!eventHandler,
      qrCodePath: qrCodePath || 'não especificado',
    });

    // Garantir que o eventHandler esteja configurado
    if (eventHandler && whatsappClient) {
      eventHandler.setWhatsAppClient(whatsappClient);
    }

    // Processar mensagens com todas as integrações
    await OmniZapMessageProcessor(messageUpdate, whatsappClient, socketController);

    logger.debug('🎯 OmniZap: Processamento principal concluído com sucesso');
  } catch (error) {
    logger.error('❌ OmniZap: Erro no processamento principal:', {
      error: error.message,
      stack: error.stack,
      messageCount: messageUpdate?.messages?.length || 0,
    });

    // Registrar erro no eventHandler
    if (eventHandler) {
      eventHandler.processGenericEvent('main.handler.error', {
        error: error.message,
        timestamp: Date.now(),
        messageCount: messageUpdate?.messages?.length || 0,
      });
    }

    throw error;
  }
};

if (require.main === module) {
  logger.info('🔌 Iniciando OmniZap System...');

  // Registrar início da aplicação no eventHandler
  if (eventHandler) {
    eventHandler.processGenericEvent('application.startup', {
      timestamp: Date.now(),
      version: '1.0.5',
      nodeVersion: process.version,
    });
  }

  db.init()
    .then((initialized) => {
      if (initialized) {
        logger.info('💾 Banco de dados MySQL inicializado com sucesso');

        // Registrar sucesso da inicialização do banco
        if (eventHandler) {
          eventHandler.processGenericEvent('database.initialized', {
            type: 'mysql',
            status: 'success',
            timestamp: Date.now(),
          });
        }
      } else {
        logger.warn('⚠️ Banco de dados MySQL não inicializado. Apenas armazenamento em memória disponível.');

        // Registrar falha na inicialização do banco
        if (eventHandler) {
          eventHandler.processGenericEvent('database.initialization.failed', {
            type: 'mysql',
            fallback: 'memory',
            timestamp: Date.now(),
          });
        }
      }

      // Inicializar socketController
      logger.info('🔗 Iniciando controlador de conexão...');
      require('./app/connection/socketController');
    })
    .catch((error) => {
      logger.error('❌ Erro ao inicializar banco de dados:', {
        error: error.message,
        stack: error.stack,
      });

      // Registrar erro crítico no eventHandler
      if (eventHandler) {
        eventHandler.processGenericEvent('database.critical.error', {
          error: error.message,
          timestamp: Date.now(),
        });
      }

      logger.info('🔄 Iniciando sem banco de dados...');
      require('./app/connection/socketController');
    });
}

module.exports = OmniZapMainHandler;
