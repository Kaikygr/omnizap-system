/**
 * OmniZap Sticker Sub-Commands Module
 *
 * Módulo responsável pelos sub-comandos de gerenciamento de sticker packs
 *
 * @version 1.0.0
 * @author OmniZap Team
 * @license MIT
 */

const logger = require('../utils/logger/loggerModule');
const { listUserPacks, getPackDetails, deletePack, renamePack, getUserStats, generateWhatsAppPack, getUserId, STICKERS_PER_PACK } = require('./stickerPackManager');

/**
 * Processa sub-comandos do sticker
 */
async function processStickerSubCommand(subCommand, args, omniZapClient, messageInfo, senderJid, targetJid) {
  const userId = getUserId(senderJid, messageInfo);

  switch (subCommand.toLowerCase()) {
    case 'packs':
    case 'list':
      return await listPacks(userId);

    case 'stats':
    case 'status':
      return await showStats(userId);

    case 'info':
      return await showPackInfo(userId, args);

    case 'delete':
    case 'del':
      return await deletePackCommand(userId, args);

    case 'rename':
      return await renamePackCommand(userId, args);

    case 'send':
    case 'share':
      return await sendPackCommand(userId, args, omniZapClient, targetJid, messageInfo);

    case 'help':
      return showStickerHelp();

    default:
      return {
        success: false,
        message: `❓ *Sub-comando desconhecido: ${subCommand}*\n\nUse \`/s help\` para ver todos os comandos disponíveis.`,
      };
  }
}

/**
 * Lista todos os packs do usuário
 */
async function listPacks(userId) {
  try {
    const packs = await listUserPacks(userId);

    if (packs.length === 0) {
      return {
        success: true,
        message: `📦 *Seus Sticker Packs*\n\n❌ Você ainda não possui nenhum pack de stickers.\n\n💡 *Como criar:*\nEnvie uma imagem ou vídeo com o comando \`/s\` para começar seu primeiro pack!`,
      };
    }

    let message = `📦 *Seus Sticker Packs* (${packs.length} pack${packs.length > 1 ? 's' : ''})\n\n`;

    packs.forEach((pack, index) => {
      const status = pack.isComplete ? '✅ Completo' : `⏳ ${pack.stickerCount}/${STICKERS_PER_PACK}`;
      const date = new Date(pack.createdAt).toLocaleDateString('pt-BR');

      message += `${index + 1}. **${pack.name}**\n`;
      message += `   👤 ${pack.author}\n`;
      message += `   📊 ${status}\n`;
      message += `   📅 ${date}\n\n`;
    });

    message += `💡 *Comandos úteis:*\n`;
    message += `• \`/s info [número]\` - Ver detalhes\n`;
    message += `• \`/s send [número]\` - Enviar pack\n`;
    message += `• \`/s stats\` - Ver estatísticas`;

    return {
      success: true,
      message: message,
    };
  } catch (error) {
    logger.error('[StickerSubCommands] Erro ao listar packs:', error);
    return {
      success: false,
      message: '❌ Erro ao carregar seus packs. Tente novamente.',
    };
  }
}

/**
 * Mostra estatísticas do usuário
 */
async function showStats(userId) {
  try {
    const stats = await getUserStats(userId);

    const createdDate = new Date(stats.createdAt).toLocaleDateString('pt-BR');
    const updatedDate = new Date(stats.lastUpdated).toLocaleDateString('pt-BR');

    let message = `📊 *Suas Estatísticas de Stickers*\n\n`;
    message += `🎯 **Total de Stickers:** ${stats.totalStickers}\n`;
    message += `📦 **Total de Packs:** ${stats.totalPacks}\n`;
    message += `✅ **Packs Completos:** ${stats.completePacks}\n`;
    message += `⏳ **Packs Incompletos:** ${stats.incompletePacks}\n\n`;

    if (stats.totalPacks > 0) {
      message += `🔄 **Pack Atual:** Pack ${stats.currentPackIndex + 1}\n`;
      message += `📈 **Progresso:** ${stats.currentPackStickers}/${STICKERS_PER_PACK} stickers\n`;
      message += `🎯 **Restam:** ${stats.stickerSlotsRemaining} slots\n\n`;
    }

    message += `📅 **Criado em:** ${createdDate}\n`;
    message += `🔄 **Atualizado em:** ${updatedDate}`;

    return {
      success: true,
      message: message,
    };
  } catch (error) {
    logger.error('[StickerSubCommands] Erro ao obter stats:', error);
    return {
      success: false,
      message: '❌ Erro ao carregar estatísticas. Tente novamente.',
    };
  }
}

/**
 * Mostra informações de um pack específico
 */
async function showPackInfo(userId, args) {
  if (!args || !args.trim()) {
    return {
      success: false,
      message: '❌ *Número do pack não informado*\n\nUso: `/s info [número]`\n\nExemplo: `/s info 1`',
    };
  }

  const packNumber = parseInt(args.trim()) - 1;

  if (isNaN(packNumber) || packNumber < 0) {
    return {
      success: false,
      message: '❌ *Número inválido*\n\nInforme um número válido do pack.\n\nUse `/s packs` para ver todos os seus packs.',
    };
  }

  try {
    const pack = await getPackDetails(userId, packNumber);

    if (!pack) {
      return {
        success: false,
        message: `❌ *Pack ${packNumber + 1} não encontrado*\n\nUse \`/s packs\` para ver seus packs disponíveis.`,
      };
    }

    const createdDate = new Date(pack.createdAt).toLocaleDateString('pt-BR');
    const status = pack.isComplete ? '✅ Completo' : `⏳ Em progresso (${pack.stickers.length}/${STICKERS_PER_PACK})`;

    let message = `📦 *Detalhes do Pack ${packNumber + 1}*\n\n`;
    message += `📛 **Nome:** ${pack.name}\n`;
    message += `👤 **Autor:** ${pack.author}\n`;
    message += `🔢 **ID:** ${pack.packId}\n`;
    message += `📊 **Status:** ${status}\n`;
    message += `🎯 **Stickers:** ${pack.stickers.length}/${STICKERS_PER_PACK}\n`;
    message += `📅 **Criado:** ${createdDate}\n\n`;

    if (pack.isComplete) {
      message += `✅ **Pack completo e pronto!**\n`;
      message += `Use \`/s send ${packNumber + 1}\` para compartilhar\n\n`;
    } else {
      const remaining = STICKERS_PER_PACK - pack.stickers.length;
      message += `⏳ **Pack em progresso (${remaining} slots livres)**\n`;
      message += `Você pode enviar mesmo assim ou continuar adicionando stickers\n\n`;
    }

    message += `🛠️ **Comandos úteis:**\n`;
    message += `• \`/s send ${packNumber + 1}\` - Enviar pack ${pack.isComplete ? '(completo)' : '(incompleto)'}\n`;
    message += `• \`/s rename ${packNumber + 1} [novo nome]\` - Renomear\n`;
    message += `• \`/s delete ${packNumber + 1}\` - Deletar pack`;

    return {
      success: true,
      message: message,
    };
  } catch (error) {
    logger.error('[StickerSubCommands] Erro ao obter info do pack:', error);
    return {
      success: false,
      message: '❌ Erro ao carregar informações do pack. Tente novamente.',
    };
  }
}

/**
 * Deleta um pack
 */
async function deletePackCommand(userId, args) {
  if (!args || !args.trim()) {
    return {
      success: false,
      message: '❌ *Número do pack não informado*\n\nUso: `/s delete [número]`\n\nExemplo: `/s delete 2`',
    };
  }

  const packNumber = parseInt(args.trim()) - 1;

  if (isNaN(packNumber) || packNumber < 0) {
    return {
      success: false,
      message: '❌ *Número inválido*\n\nInforme um número válido do pack.',
    };
  }

  try {
    const pack = await getPackDetails(userId, packNumber);

    if (!pack) {
      return {
        success: false,
        message: `❌ *Pack ${packNumber + 1} não encontrado*`,
      };
    }

    const deleted = await deletePack(userId, packNumber);

    if (deleted) {
      return {
        success: true,
        message: `✅ *Pack deletado com sucesso!*\n\n📦 **"${pack.name}"** foi removido\n🗑️ ${pack.stickers.length} stickers deletados`,
      };
    } else {
      return {
        success: false,
        message: '❌ Erro ao deletar o pack. Tente novamente.',
      };
    }
  } catch (error) {
    logger.error('[StickerSubCommands] Erro ao deletar pack:', error);
    return {
      success: false,
      message: '❌ Erro ao deletar pack. Tente novamente.',
    };
  }
}

/**
 * Renomeia um pack
 */
async function renamePackCommand(userId, args) {
  if (!args || !args.trim()) {
    return {
      success: false,
      message: '❌ *Parâmetros não informados*\n\nUso: `/s rename [número] [novo nome] | [novo autor]`\n\nExemplo: `/s rename 1 Meus Stickers | João Silva`',
    };
  }

  const parts = args.trim().split(' ');
  const packNumber = parseInt(parts[0]) - 1;

  if (isNaN(packNumber) || packNumber < 0) {
    return {
      success: false,
      message: '❌ *Número do pack inválido*',
    };
  }

  const restOfArgs = parts.slice(1).join(' ');
  const [newName, newAuthor] = restOfArgs.split('|').map((s) => s.trim());

  if (!newName) {
    return {
      success: false,
      message: '❌ *Novo nome não informado*\n\nUso: `/s rename [número] [novo nome] | [novo autor]`',
    };
  }

  try {
    const pack = await getPackDetails(userId, packNumber);

    if (!pack) {
      return {
        success: false,
        message: `❌ *Pack ${packNumber + 1} não encontrado*`,
      };
    }

    const renamed = await renamePack(userId, packNumber, newName, newAuthor);

    if (renamed) {
      let message = `✅ *Pack renomeado com sucesso!*\n\n`;
      message += `📦 **Pack ${packNumber + 1}**\n`;
      message += `📛 **Novo nome:** ${newName}\n`;
      if (newAuthor) {
        message += `👤 **Novo autor:** ${newAuthor}`;
      }

      return {
        success: true,
        message: message,
      };
    } else {
      return {
        success: false,
        message: '❌ Erro ao renomear o pack. Tente novamente.',
      };
    }
  } catch (error) {
    logger.error('[StickerSubCommands] Erro ao renomear pack:', error);
    return {
      success: false,
      message: '❌ Erro ao renomear pack. Tente novamente.',
    };
  }
}

/**
 * Envia um pack como sticker pack do WhatsApp
 */
async function sendPackCommand(userId, args, omniZapClient, targetJid, messageInfo) {
  if (!args || !args.trim()) {
    return {
      success: false,
      message: '❌ *Número do pack não informado*\n\nUso: `/s send [número]`\n\nExemplo: `/s send 1`',
    };
  }

  const packNumber = parseInt(args.trim()) - 1;

  if (isNaN(packNumber) || packNumber < 0) {
    return {
      success: false,
      message: '❌ *Número inválido*',
    };
  }

  try {
    const pack = await getPackDetails(userId, packNumber);

    if (!pack) {
      return {
        success: false,
        message: `❌ *Pack ${packNumber + 1} não encontrado*`,
      };
    }

    if (pack.stickers.length === 0) {
      return {
        success: false,
        message: `❌ *Pack vazio*\n\n⚠️ O pack "${pack.name}" não possui stickers.\n\n💡 Adicione pelo menos um sticker antes de enviar!`,
      };
    }

    // Determinar status do pack
    const isComplete = pack.isComplete;
    const stickerCount = pack.stickers.length;
    const statusMsg = isComplete ? `✅ Pack completo (${stickerCount}/${STICKERS_PER_PACK} stickers)` : `⏳ Pack incompleto (${stickerCount}/${STICKERS_PER_PACK} stickers)`;

    // TODO: Implementar envio do pack como stickerPackMessage
    // Por enquanto, retorna sucesso com informação
    return {
      success: true,
      message: `📦 *Enviando Pack: ${pack.name}*\n\n${statusMsg}\n\n🚧 **Funcionalidade em desenvolvimento**\n\nEm breve você poderá enviar packs diretamente pelo WhatsApp!\n\n📊 **Pack Info:**\n• ${stickerCount} stickers\n• Criado por: ${pack.author}\n• ID: ${pack.packId}`,
    };
  } catch (error) {
    logger.error('[StickerSubCommands] Erro ao enviar pack:', error);
    return {
      success: false,
      message: '❌ Erro ao enviar pack. Tente novamente.',
    };
  }
}

/**
 * Mostra ajuda dos comandos de sticker
 */
function showStickerHelp() {
  const message = `🎯 *Comandos de Sticker Packs*\n\n` + `**📦 Gerenciar Packs:**\n` + `• \`/s\` - Criar sticker da mídia\n` + `• \`/s packs\` - Listar seus packs\n` + `• \`/s stats\` - Ver estatísticas\n` + `• \`/s info [número]\` - Detalhes do pack\n\n` + `**🛠️ Editar Packs:**\n` + `• \`/s rename [nº] [nome] | [autor]\` - Renomear\n` + `• \`/s delete [número]\` - Deletar pack\n\n` + `**📤 Compartilhar:**\n` + `• \`/s send [número]\` - Enviar pack (completo ou não)\n\n` + `**ℹ️ Informações:**\n` + `• Cada pack comporta até ${STICKERS_PER_PACK} stickers\n` + `• Packs são criados automaticamente\n` + `• Packs podem ser enviados mesmo incompletos\n` + `• Novos packs são criados ao atingir ${STICKERS_PER_PACK} stickers\n\n` + `**💡 Exemplo de uso:**\n` + `1. Envie mídia: \`/s Meu Pack | João\`\n` + `2. Continue adicionando stickers\n` + `3. Envie quando quiser: \`/s send 1\``;

  return {
    success: true,
    message: message,
  };
}

module.exports = {
  processStickerSubCommand,
};
