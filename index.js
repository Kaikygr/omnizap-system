require('dotenv').config();
const logger = require('./app/utils/logger/loggerModule');
const { connectToWhatsApp, getActiveSocket } = require('./app/connection/socketController');

async function startApp() {
  try {
    logger.info('Iniciando OmniZap System...');
    await connectToWhatsApp();
    logger.info('OmniZap System iniciado com sucesso.');
    if (process.send) {
      process.send('ready');
    }
  } catch (err) {
    logger.error('Falha ao iniciar o OmniZap System:', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

startApp();

process.on('SIGINT', async () => {
  logger.warn('SIGINT recebido. Iniciando desligamento gracioso...');
  const sock = getActiveSocket();
  if (sock) {
    try {
      await sock.end();
      logger.info('Conexão do WhatsApp encerrada.');
    } catch (e) {
      logger.error('Erro ao encerrar a conexão do WhatsApp:', { error: e.message, stack: e.stack });
    }
  }
  logger.info('OmniZap System desligado.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.warn('SIGTERM recebido. Iniciando desligamento gracioso...');
  const sock = getActiveSocket();
  if (sock) {
    try {
      await sock.end();
      logger.info('Conexão do WhatsApp encerrada.');
    } catch (e) {
      logger.error('Erro ao encerrar a conexão do WhatsApp:', { error: e.message, stack: e.stack });
    }
  }
  logger.info('OmniZap System desligado.');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('Exceção não capturada:', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Rejeição de promessa não tratada:', { reason: reason, promise: promise });
  process.exit(1);
});
