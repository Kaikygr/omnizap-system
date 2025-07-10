/**
 * OmniZap Menu Command
 *
 * Comando para exibir o menu de comandos disponíveis no sistema OmniZap
 *
 * @version 1.0.0
 * @author OmniZap Team
 * @license MIT
 */

const logger = require('../../app/utils/logger/loggerModule');
const { formatSuccessMessage } = require('../../app/utils/messageUtils');
const { COMMAND_PREFIX, EMOJIS } = require('../../app/utils/constants');
const { STICKERS_PER_PACK } = require('../commandModules/stickerModules/stickerPackManager');

/**
 * Processa o comando de menu, exibindo todos os comandos disponíveis
 *
 * @param {Object} omniZapClient - Cliente WhatsApp
 * @param {Object} messageInfo - Informações da mensagem
 * @param {String} senderJid - JID do remetente
 * @param {String} groupJid - JID do grupo (pode ser null)
 * @param {String} args - Argumentos do comando
 * @returns {Promise<Object>} - Resultado da operação
 */
const processMenuCommand = async (omniZapClient, messageInfo, senderJid, groupJid, args) => {
  logger.info('Processando comando menu', { senderJid, groupJid, args });

  try {
    // Verifica argumentos para exibir menus específicos
    const arg = args ? args.trim().toLowerCase() : '';

    switch (arg) {
      case 'admin':
        return {
          success: true,
          message: buildAdminMenu(),
        };
      case 'sticker':
        return {
          success: true,
          message: buildStickerMenu(),
        };
      default:
        return {
          success: true,
          message: buildMainMenu(),
        };
    }
  } catch (error) {
    logger.error('Erro ao processar comando menu', {
      error: error.message,
      stack: error.stack,
      senderJid,
      groupJid,
      args,
    });

    return {
      success: false,
      message: `${EMOJIS.ERROR} *Erro ao exibir menu*\n\nOcorreu um erro ao processar o comando. Por favor, tente novamente mais tarde.`,
    };
  }
};

/**
 * Constrói o menu principal com todos os comandos disponíveis
 *
 * @returns {String} - Mensagem formatada com o menu principal
 */
const buildMainMenu = () => {
  const prefix = COMMAND_PREFIX;

  return formatSuccessMessage(
    '📋 Menu de Comandos OmniZap',
    'Abaixo estão todos os comandos disponíveis no sistema:',
    `*🛡️ Comandos de Administração:*
• \`${prefix}ban\` - Bane usuário do grupo
• \`${prefix}banlist\` - Lista usuários banidos
• \`${prefix}add\` - Adiciona usuário ao grupo
• \`${prefix}promote\` - Promove usuário a admin
• \`${prefix}demote\` - Remove admin de um usuário
• \`${prefix}setname\` - Altera nome do grupo
• \`${prefix}setdesc\` - Altera descrição do grupo
• \`${prefix}group\` - Configurações do grupo
• \`${prefix}ephemeral\` - Mensagens temporárias
• \`${prefix}addmode\` - Configura modo de entrada
• \`${prefix}link\` - Obtém link do grupo
• \`${prefix}groupinfo\` - Informações do grupo

*🎭 Comandos de Stickers:*
• \`${prefix}sticker\` ou \`${prefix}s\` - Cria sticker de imagem/vídeo
• \`${prefix}s <nome> | <autor>\` - Personaliza nome e autor do sticker
• \`${prefix}s packs\` - Lista seus pacotes de stickers
• \`${prefix}s info <número>\` - Ver detalhes de um pack
• \`${prefix}s send <número>\` - Envia pack completo
• \`${prefix}s help\` - Instruções detalhadas

*🔧 Outros Comandos:*
• \`${prefix}menu admin\` - Menu de comandos admin
• \`${prefix}menu sticker\` - Menu de comandos de stickers

_Desenvolvido por OmniZap Team_`,
  );
};

/**
 * Constrói o menu de comandos de administração
 *
 * @returns {String} - Mensagem formatada com o menu de administração
 */
const buildAdminMenu = () => {
  const prefix = COMMAND_PREFIX;

  return formatSuccessMessage(
    '🛡️ Menu de Comandos de Administração',
    'Comandos para gerenciamento de grupos:',
    `*Gerenciamento de Usuários:*
• \`${prefix}ban <número/@menção> [motivo]\` - Bane usuário do grupo
• \`${prefix}banlist\` - Lista usuários banidos
• \`${prefix}banlist grupo\` - Lista banidos do grupo atual
• \`${prefix}banlist user <número>\` - Histórico de bans de um usuário
• \`${prefix}banlist total\` - Estatísticas de banimentos
• \`${prefix}add <número1> [número2...]\` - Adiciona usuários ao grupo
• \`${prefix}promote <@menção>\` - Promove usuário a administrador
• \`${prefix}demote <@menção>\` - Remove privilégios de administrador

*Configurações de Grupo:*
• \`${prefix}setname <nome>\` - Altera o nome do grupo
• \`${prefix}setdesc <descrição>\` - Altera a descrição do grupo
• \`${prefix}group open/close\` - Abre/fecha o grupo
• \`${prefix}ephemeral <off/24h/7d/90d>\` - Configura mensagens temporárias
• \`${prefix}addmode <on/off>\` - Ativa/desativa aprovação de entrada
• \`${prefix}link\` - Obtém o link de convite do grupo
• \`${prefix}groupinfo\` - Exibe informações do grupo

*Observações:*
• Comandos só funcionam para administradores do grupo
• O bot precisa ser administrador para executar a maioria dos comandos

_Use \`${prefix}menu\` para ver todos os comandos disponíveis_`,
  );
};

/**
 * Constrói o menu de comandos de stickers
 *
 * @returns {String} - Mensagem formatada com o menu de stickers
 */
const buildStickerMenu = () => {
  const prefix = COMMAND_PREFIX;

  return formatSuccessMessage(
    '🎭 Menu Completo de Comandos de Stickers',
    'Guia detalhado para criação e gerenciamento de stickers personalizados:',
    `*📸 Criação de Stickers:*
• \`${prefix}sticker\` ou \`${prefix}s\` - Cria sticker da imagem/vídeo enviado ou respondido
• \`${prefix}s <nome> | <autor>\` - Cria sticker com nome de pacote e autor personalizados
  _Exemplo: \`${prefix}s Meus Stickers | João Silva\`_
• Para criar um sticker, envie uma imagem/vídeo e digite \`${prefix}s\` na legenda ou responda com \`${prefix}s\`
• Para criar vários stickers em sequência, envie mídias e use \`${prefix}s\` para cada uma

*📦 Gerenciamento de Pacotes:*
• \`${prefix}s packs\` ou \`${prefix}s list\` - Lista todos os seus pacotes de stickers
• \`${prefix}s info <número>\` - Mostra detalhes completos do pacote específico
  _Exemplo: \`${prefix}s info 1\` mostra detalhes do seu primeiro pack_
• \`${prefix}s rename <número> <nome> | <autor>\` - Renomeia um pacote e seu autor
  _Exemplo: \`${prefix}s rename 2 Animais | Coleção 2025\`_
• \`${prefix}s delete <número>\` - Exclui permanentemente um pacote de stickers
  _Exemplo: \`${prefix}s delete 3\` exclui seu terceiro pack_
• \`${prefix}s stats\` ou \`${prefix}s status\` - Exibe estatísticas detalhadas dos seus stickers
• \`${prefix}s prefs <nome> | <autor>\` - Define preferências padrão para novos stickers
  _Exemplo: \`${prefix}s prefs Meus Stickers | João\` define modelo para novos packs_

*🔄 Compartilhamento de Stickers:*
• \`${prefix}s send <número>\` ou \`${prefix}s share <número>\` - Envia todos os stickers do pacote
  _Exemplo: \`${prefix}s send 1\` envia todos os stickers do primeiro pack_
• Stickers são enviados um a um, em sequência, preservando a qualidade original
• Você pode enviar packs completos ou incompletos para qualquer conversa

*ℹ️ Informações Importantes:*
• Cada pacote comporta até ${STICKERS_PER_PACK} stickers
• Os pacotes são criados e organizados automaticamente
• Quando um pack atinge ${STICKERS_PER_PACK} stickers, um novo é criado automaticamente
• Formatos suportados: JPG, PNG, WEBP para imagens e MP4, GIF para animados
• Para melhor qualidade, envie imagens com resolução adequada
• Stickers de vídeo serão limitados a alguns segundos
• Suas preferências de nome/autor são salvas automaticamente

*🔍 Recursos Avançados:*
• Ao criar stickers, você pode personalizar texto com variáveis especiais:
  → \`#nome\` será substituído pelo seu nome no WhatsApp
  → \`#id\` será substituído pelo seu número
  → \`#data\` será substituído pela data atual
• Os pacotes são salvos individualmente e podem ser recuperados mesmo após reiniciar o bot
• Use \`${prefix}s prefs\` sem argumentos para ver suas configurações atuais

_Para instruções passo a passo, envie \`${prefix}s help\`_`,
  );
};

module.exports = {
  processMenuCommand,
};
