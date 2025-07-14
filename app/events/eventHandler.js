/**
 * OmniZap Event Handler - Versão com Dados Permanentes
 *
 * Módulo responsável pelo processamento independente de eventos
 * Usa persistência direta em JSON com dados permanentes
 * Integração bidirecional com socketController
 *
 * @version 2.3.0
 * @author OmniZap Team
 * @license MIT
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger/loggerModule');

/**
 * Função local para validar participantes (evita importação circular)
 * @param {Array} participants - Array de participantes
 * @returns {Array} - Array de participantes válidos
 */
function getValidParticipants(participants) {
  if (!Array.isArray(participants)) return [];
  return participants.filter((p) => p && p.id && typeof p.id === 'string');
}

/**
 * Classe principal do processador de eventos com persistência direta
 */
class EventHandler {
  constructor() {
    this.initialized = false;
    this.omniZapClient = null;
    this.socketController = null;
    this.dataDir = path.join(__dirname, '../../temp/data');
    this.isSaving = false; // Lock para escrita concorrente

    // Dados em memória para acesso rápido
    this.messageData = new Map();
    this.groupData = new Map();
    this.contactData = new Map();
    this.chatData = new Map();
    this.eventData = new Map();

    // Sistema de callbacks para comunicação bidirecional
    this.eventCallbacks = new Map();
    this.connectionState = {
      isConnected: false,
      lastConnection: null,
      connectionCount: 0,
      lastDisconnection: null,
    };

    // Estatísticas de performance
    this.stats = {
      totalMessages: 0,
      totalGroups: 0,
      totalContacts: 0,
      totalChats: 0,
      totalEvents: 0,
      processedEvents: 0,
      lastReset: Date.now(),
    };

    this.init();
  }

  /**
   * Inicializa o processador de eventos e dados permanentes
   */
  init() {
    try {
      // Cria diretório se não existir (síncrono, pois é parte da inicialização)
      const { mkdirSync, existsSync } = require('fs');
      if (!existsSync(this.dataDir)) {
        mkdirSync(this.dataDir, { recursive: true });
        logger.info(`📁 Dados: Diretório criado: ${this.dataDir}`);
      }

      // Carrega dados persistentes de forma assíncrona
      this.loadPersistedData().catch((error) => {
        logger.error('❌ Erro inicial ao carregar dados persistentes:', error.message);
      });

      // Configura auto-save periódico
      this.setupAutoSave();

      logger.info('🎯 OmniZap Events: Sistema de dados permanentes inicializado');
      this.initialized = true;
    } catch (error) {
      logger.error('❌ Erro ao inicializar sistema de dados:', error.message);
    }
  }

  /**
   * Define o controlador de socket para comunicação bidirecional
   * @param {Object} controller - Referência ao socketController
   */
  setSocketController(controller) {
    this.socketController = controller;
    logger.info('🔗 Events: SocketController configurado para comunicação bidirecional');
  }

  /**
   * Registra callback para eventos específicos
   * @param {string} eventType - Tipo do evento
   * @param {Function} callback - Função callback
   */
  registerCallback(eventType, callback) {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType).push(callback);
    logger.debug(`📞 Events: Callback registrado para ${eventType}`);
  }

  /**
   * Executa callbacks registrados para um evento
   * @param {string} eventType - Tipo do evento
   * @param {*} data - Dados do evento
   */
  async executeCallbacks(eventType, data) {
    const callbacks = this.eventCallbacks.get(eventType) || [];
    if (callbacks.length > 0) {
      logger.debug(`📞 Events: Executando ${callbacks.length} callback(s) para ${eventType}`);

      for (const callback of callbacks) {
        try {
          await callback(data, this);
        } catch (error) {
          logger.error(`❌ Erro no callback para ${eventType}:`, error.message);
        }
      }
    }
  }

  /**
   * Atualiza estado de conexão
   * @param {boolean} isConnected - Estado da conexão
   * @param {Object} metadata - Metadados da conexão
   */
  updateConnectionState(isConnected, metadata = {}) {
    const previousState = this.connectionState.isConnected;
    this.connectionState.isConnected = isConnected;

    if (isConnected && !previousState) {
      this.connectionState.lastConnection = Date.now();
      this.connectionState.connectionCount++;
      logger.info('🟢 Events: Estado de conexão atualizado - CONECTADO');
    } else if (!isConnected && previousState) {
      this.connectionState.lastDisconnection = Date.now();
      logger.info('🔴 Events: Estado de conexão atualizado - DESCONECTADO');
    }

    // Salva estado atualizado nos dados permanentes
    const eventId = `connection_state_${Date.now()}`;
    this.setEvent(eventId, {
      ...this.connectionState,
      ...metadata,
      _lastUpdate: Date.now(),
    });

    // Executa callbacks de mudança de estado
    this.executeCallbacks('connection.state.change', {
      isConnected,
      previousState,
      metadata,
      connectionState: this.connectionState,
    });
  }

  /**
   * Obtém cliente WhatsApp através do socketController
   */
  getWhatsAppClient() {
    if (this.omniZapClient) {
      return this.omniZapClient;
    }

    if (this.socketController && typeof this.socketController.getActiveSocket === 'function') {
      return this.socketController.getActiveSocket();
    }

    return null;
  }

  /**
   * Define o cliente WhatsApp para uso nos eventos
   * @param {Object} client - Cliente WhatsApp
   */
  setWhatsAppClient(client) {
    this.omniZapClient = client;
    logger.info('🎯 Events: Cliente WhatsApp configurado');
  }

  /**
   * Carrega dados persistentes dos arquivos JSON de forma assíncrona.
   */
  async loadPersistedData() {
    const dataFiles = {
      groups: path.join(this.dataDir, 'groups.json'),
      contacts: path.join(this.dataDir, 'contacts.json'),
      chats: path.join(this.dataDir, 'chats.json'),
      messages: path.join(this.dataDir, 'messages.json'),
      events: path.join(this.dataDir, 'events.json'),
    };

    for (const [type, filePath] of Object.entries(dataFiles)) {
      try {
        const fileContent = await fs.readFile(filePath, 'utf8');

        // Verifica se o conteúdo é válido antes de fazer parse
        if (!fileContent || fileContent.trim() === '') {
          logger.warn(`⚠️ Arquivo ${path.basename(filePath)} está vazio, inicializando dados vazios`);
          continue;
        }

        let data;
        try {
          data = JSON.parse(fileContent);
        } catch (parseError) {
          logger.error(`❌ JSON inválido em ${path.basename(filePath)}, recriando arquivo:`, parseError.message);

          // Backup do arquivo corrompido
          const backupPath = `${filePath}.backup.${Date.now()}`;
          await fs.writeFile(backupPath, fileContent);
          logger.info(`🔄 Backup do arquivo corrompido salvo em: ${path.basename(backupPath)}`);

          // Inicializa com objeto vazio
          data = {};
          await fs.writeFile(filePath, JSON.stringify(data, null, 2));
          logger.info(`✅ Arquivo ${path.basename(filePath)} recriado com dados vazios`);
        }

        const dataMap = this.getDataMapByType(type);
        if (dataMap && data) {
          const keys = Object.keys(data);
          for (const key of keys) {
            dataMap.set(key, data[key]);
          }
          this.stats[`total${type.charAt(0).toUpperCase() + type.slice(1)}`] = keys.length;
          logger.info(`📂 Dados: ${keys.length} ${type} carregados do arquivo ${path.basename(filePath)}`);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          // Ignora erro se o arquivo não existir
          logger.error(`❌ Erro ao carregar ${type} de ${path.basename(filePath)}:`, error.message);

          // Tenta criar um arquivo vazio se houver erro de acesso
          try {
            await fs.writeFile(filePath, JSON.stringify({}, null, 2));
            logger.info(`✅ Arquivo ${path.basename(filePath)} criado com dados vazios após erro`);
          } catch (createError) {
            logger.error(`❌ Não foi possível criar ${path.basename(filePath)}:`, createError.message);
          }
        }
      }
    }
  }

  /**
   * Configura salvamento automático periódico mais frequente.
   */
  setupAutoSave() {
    // Salva dados a cada 2 minutos para garantir persistência
    setInterval(() => {
      this.savePersistedData();
    }, 2 * 60 * 1000);

    const gracefulShutdown = async (signal) => {
      logger.info(`🔄 Recebido ${signal}. Salvando dados antes de encerrar...`);
      await this.savePersistedData();
      process.exit(0);
    };

    // Salva dados ao encerrar aplicação
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  }

  /**
   * Helper para extrair todos os dados de um Map.
   * @param {Map} dataMap - O Map com os dados.
   * @returns {Object} - Um objeto com os dados do Map.
   */
  _getMapDataAsObject(dataMap) {
    const obj = {};
    for (const [key, value] of dataMap.entries()) {
      obj[key] = value;
    }
    return obj;
  }

  /**
   * Salva dados persistentes em arquivos JSON de forma assíncrona.
   */
  async savePersistedData() {
    if (this.isSaving) {
      logger.warn('💾 Dados: Salvamento já está em progresso. Ignorando nova solicitação.');
      return;
    }

    this.isSaving = true;
    logger.debug('💾 Dados: Iniciando salvamento em arquivos JSON...');

    try {
      const dataToSave = {
        groups: this._getMapDataAsObject(this.groupData),
        contacts: this._getMapDataAsObject(this.contactData),
        chats: this._getMapDataAsObject(this.chatData),
        messages: this._getMapDataAsObject(this.messageData),
        events: this._getMapDataAsObject(this.eventData),
        metadata: {
          lastSave: Date.now(),
          totalMessages: this.messageData.size,
          totalGroups: this.groupData.size,
          totalContacts: this.contactData.size,
          totalChats: this.chatData.size,
          totalEvents: this.eventData.size,
          stats: this.stats,
          connectionState: this.connectionState,
        },
      };

      const savePromises = Object.entries(dataToSave).map(async ([type, data]) => {
        const filePath = path.join(this.dataDir, `${type}.json`);
        const tempFilePath = `${filePath}.tmp`;

        try {
          // Salva primeiro em arquivo temporário
          const jsonContent = JSON.stringify(data, null, 2);
          await fs.writeFile(tempFilePath, jsonContent);

          // Move arquivo temporário para o definitivo (operação atômica)
          await fs.rename(tempFilePath, filePath);

          logger.debug(`💾 ${type}.json salvo com sucesso`);
        } catch (err) {
          logger.error(`❌ Erro ao salvar ${type} em ${path.basename(filePath)}:`, err.message);

          // Remove arquivo temporário se existir
          try {
            await fs.unlink(tempFilePath);
          } catch (unlinkError) {
            // Ignora erro se arquivo temporário não existir
          }
        }
      });

      await Promise.all(savePromises);

      logger.debug('💾 Dados: Salvamento concluído.');
    } catch (error) {
      logger.error('❌ Erro geral ao salvar dados:', error.message);
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Retorna o Map apropriado baseado no tipo
   */
  getDataMapByType(type) {
    const dataMap = {
      groups: this.groupData,
      contacts: this.contactData,
      chats: this.chatData,
      messages: this.messageData,
      events: this.eventData,
    };
    return dataMap[type];
  }

  /**
   * Salva dados imediatamente em arquivo
   */
  async saveDataImmediately(type, key, data) {
    try {
      const dataMap = this.getDataMapByType(type);
      if (dataMap) {
        dataMap.set(key, {
          ...data,
          _savedAt: Date.now(),
        });

        // Atualiza estatísticas
        this.stats[`total${type.charAt(0).toUpperCase() + type.slice(1)}`] = dataMap.size;

        // Salva imediatamente
        await this.saveSpecificData(type);

        logger.debug(`💾 ${type} salvo imediatamente: ${key.substring(0, 20)}...`);
      }
    } catch (error) {
      logger.error(`❌ Erro ao salvar ${type} imediatamente:`, error.message);
    }
  }

  /**
   * Salva um tipo específico de dados
   */
  async saveSpecificData(type) {
    const filePath = path.join(this.dataDir, `${type}.json`);
    const tempFilePath = `${filePath}.tmp`;

    try {
      const dataMap = this.getDataMapByType(type);
      const data = this._getMapDataAsObject(dataMap);

      const jsonContent = JSON.stringify(data, null, 2);
      await fs.writeFile(tempFilePath, jsonContent);
      await fs.rename(tempFilePath, filePath);
    } catch (error) {
      logger.error(`❌ Erro ao salvar ${type}:`, error.message);
      try {
        await fs.unlink(tempFilePath);
      } catch (unlinkError) {
        // Ignora erro se arquivo temporário não existir
      }
    }
  }

  /**
   * Métodos públicos para acessar dados permanentes
   */
  getMessage(remoteJid, messageId) {
    const key = `${remoteJid}_${messageId}`;
    const message = this.messageData.get(key);

    if (message) {
      logger.debug(`📱 Dados encontrados para mensagem: ${messageId.substring(0, 10)}...`);
    }

    return message;
  }

  async setMessage(remoteJid, messageId, messageData) {
    const key = `${remoteJid}_${messageId}`;
    await this.saveDataImmediately('messages', key, messageData);
  }

  getGroup(groupJid) {
    const group = this.groupData.get(groupJid);
    return group;
  }

  async setGroup(groupJid, groupData) {
    await this.saveDataImmediately('groups', groupJid, groupData);
  }

  getContact(contactJid) {
    const contact = this.contactData.get(contactJid);
    return contact;
  }

  async setContact(contactJid, contactData) {
    await this.saveDataImmediately('contacts', contactJid, contactData);
  }

  getChat(chatJid) {
    const chat = this.chatData.get(chatJid);
    return chat;
  }

  async setChat(chatJid, chatData) {
    await this.saveDataImmediately('chats', chatJid, chatData);
  }

  async setEvent(eventId, eventData) {
    await this.saveDataImmediately('events', eventId, eventData);
  }

  /**
   * Estatísticas dos dados (alias para getCacheStats)
   */
  getDataStats() {
    return this.getCacheStats();
  }

  /**
   * Obtém estatísticas de conexão completas
   */
  getConnectionStats() {
    const baseStats = this.getCacheStats();
    const connectionStats = this.socketController ? (typeof this.socketController.getConnectionStats === 'function' ? this.socketController.getConnectionStats() : {}) : {};

    return {
      ...baseStats,
      ...connectionStats,
      integrationEnabled: this.socketController !== null,
    };
  }

  /**
   * Envia mensagem através do socketController
   * @param {string} jid - JID do destinatário
   * @param {*} content - Conteúdo da mensagem
   * @param {Object} options - Opções da mensagem
   */
  async sendMessage(jid, content, options = {}) {
    if (!this.socketController) {
      throw new Error('SocketController não configurado');
    }

    if (typeof this.socketController.sendMessage === 'function') {
      return await this.socketController.sendMessage(jid, content, options);
    }

    throw new Error('Método sendMessage não disponível no socketController');
  }

  /**
   * Força reconexão através do socketController
   */
  async forceReconnect() {
    if (this.socketController && typeof this.socketController.forceReconnect === 'function') {
      logger.info('🔄 Events: Solicitando reconexão através do socketController');
      return await this.socketController.forceReconnect();
    }

    logger.warn('⚠️ Events: Método forceReconnect não disponível no socketController');
  }

  /**
   * Processa eventos de mensagens (messages.upsert)
   */
  async processMessagesUpsert(messageUpdate) {
    setImmediate(async () => {
      try {
        this.stats.processedEvents++;
        const messageCount = messageUpdate.messages?.length || 0;
        logger.info(`📨 Events: Processando messages.upsert - ${messageCount} mensagem(ns)`);

        // Salva evento nos dados permanentes
        const eventId = `upsert_${Date.now()}`;
        await this.setEvent(eventId, {
          type: 'messages.upsert',
          data: messageUpdate,
          timestamp: Date.now(),
        });

        const groupJids = new Set();

        if (messageUpdate.messages && Array.isArray(messageUpdate.messages)) {
          let processedCount = 0;

          for (const messageInfo of messageUpdate.messages) {
            try {
              const isGroupMessage = messageInfo.key?.remoteJid?.endsWith('@g.us');
              if (isGroupMessage && messageInfo.key.remoteJid) {
                groupJids.add(messageInfo.key.remoteJid);
              }

              const enhancedMessageInfo = {
                ...messageInfo,
                _receivedAt: Date.now(),
                _updateType: messageUpdate.type || 'notify',
                _batchId: Date.now().toString(),
                _isGroupMessage: isGroupMessage,
                _groupJid: isGroupMessage ? messageInfo.key.remoteJid : null,
                _senderJid: isGroupMessage ? messageInfo.key.participant || messageInfo.key.remoteJid : messageInfo.key.remoteJid,
              };

              // Salva mensagem nos dados permanentes
              const messageKey = `${messageInfo.key.remoteJid}_${messageInfo.key.id}`;
              await this.setMessage(messageInfo.key.remoteJid, messageInfo.key.id, enhancedMessageInfo);
              processedCount++;

              const jid = messageInfo.key?.remoteJid?.substring(0, 20) || 'N/A';
              const messageType = messageInfo.message ? Object.keys(messageInfo.message)[0] : 'unknown';

              if (isGroupMessage) {
                logger.debug(`   ✓ Msg ${processedCount}: ${messageType} | GRUPO ${jid}...`);
              } else {
                logger.debug(`   ✓ Msg ${processedCount}: ${messageType} | ${jid}...`);
              }
            } catch (error) {
              logger.error('Events: Erro ao processar mensagem individual:', error.message);
            }
          }

          // Carrega metadados dos grupos detectados
          if (groupJids.size > 0) {
            logger.info(`Events: Carregando metadados de ${groupJids.size} grupo(s) detectado(s)`);
            await this.loadGroupsMetadata(Array.from(groupJids));
          }

          logger.info(`Events: ✅ ${processedCount}/${messageUpdate.messages.length} mensagens processadas`);
        }

        // Executa callbacks para novas mensagens
        await this.executeCallbacks('messages.received', {
          messages: messageUpdate.messages,
          groupJids: Array.from(groupJids),
          processedCount: messageUpdate.messages?.length || 0,
        });
      } catch (error) {
        logger.error('Events: Erro no processamento de messages.upsert:', error.message);
      }
    });
  }

  /**
   * Carrega metadados de grupos em lote
   * @param {Array} groupJids - Array de JIDs de grupos
   */
  async loadGroupsMetadata(groupJids) {
    if (!Array.isArray(groupJids) || groupJids.length === 0) {
      return;
    }

    const client = this.getWhatsAppClient();
    if (!client) {
      logger.warn('Events: Cliente WhatsApp não disponível para carregar metadados');
      return;
    }

    try {
      logger.info(`Events: Iniciando carregamento de metadados para ${groupJids.length} grupo(s)`);

      const promises = groupJids.map(async (groupJid, index) => {
        try {
          await new Promise((resolve) => setTimeout(resolve, index * 100));

          const metadata = await this.getOrFetchGroupMetadata(groupJid);

          if (metadata) {
            logger.info(`Events: Metadados carregados para "${metadata.subject}" (${metadata._participantCount || 0} participantes)`);
            return { success: true, groupJid, metadata };
          } else {
            logger.warn(`Events: Não foi possível carregar metadados do grupo ${groupJid}`);
            return { success: false, groupJid, error: 'Metadados não encontrados' };
          }
        } catch (error) {
          logger.error(`Events: Erro ao carregar metadados do grupo ${groupJid}:`, error.message);
          return { success: false, groupJid, error: error.message };
        }
      });

      const results = await Promise.allSettled(promises);
      const successful = results.filter((result) => result.status === 'fulfilled' && result.value.success).length;
      const failed = results.length - successful;

      if (successful > 0) {
        logger.info(`Events: ✅ Carregamento concluído - ${successful} sucessos, ${failed} falhas`);
      }

      if (failed > 0) {
        logger.warn(`Events: ⚠️ ${failed} grupo(s) não puderam ter metadados carregados`);
      }
    } catch (error) {
      logger.error('Events: Erro geral no carregamento de metadados:', error.message);
    }
  }

  /**
   * Busca ou obtém metadados de grupo dos dados permanentes
   * @param {string} groupJid - JID do grupo
   * @returns {Object|null} Metadados do grupo
   */
  async getOrFetchGroupMetadata(groupJid) {
    try {
      // Verifica dados primeiro
      let metadata = this.groupData.get(groupJid);

      if (metadata && metadata._cachedAt && Date.now() - metadata._cachedAt < 3600000) {
        logger.debug(`Dados encontrados para grupo: ${groupJid.substring(0, 30)}...`);
        return metadata;
      }

      // Busca da API se não estiver em dados ou estiver expirado
      const client = this.getWhatsAppClient();
      if (!client) {
        logger.warn(`Events: Cliente não disponível para buscar metadados do grupo ${groupJid}`);
        return metadata || null;
      }

      logger.debug(`Buscando metadados do grupo via API: ${groupJid.substring(0, 30)}...`);

      const fetchedMetadata = await client.groupMetadata(groupJid);
      if (fetchedMetadata) {
        try {
          // Usa função local para filtrar participantes válidos
          const validParticipants = getValidParticipants(fetchedMetadata.participants || []);

          // Enriquece com dados calculados
          const enrichedMetadata = {
            ...fetchedMetadata,
            _cachedAt: Date.now(),
            _participantCount: validParticipants.length,
            _adminCount: validParticipants.filter((p) => p.admin === 'admin' || p.admin === 'superadmin').length,
            _lastFetch: Date.now(),
          };

          // Salva nos dados permanentes
          await this.setGroup(groupJid, enrichedMetadata);
          logger.info(`Dados atualizados para grupo: ${enrichedMetadata.subject || 'Sem nome'}`);

          // Executa callbacks de metadados atualizados
          await this.executeCallbacks('group.metadata.updated', {
            groupJid,
            metadata: enrichedMetadata,
            wasFromCache: false,
          });

          return enrichedMetadata;
        } catch (validationError) {
          logger.error(`Events: Erro ao processar participantes do grupo ${groupJid}:`, validationError.message);

          // Retorna metadados básicos sem processamento de participantes
          const basicMetadata = {
            ...fetchedMetadata,
            _cachedAt: Date.now(),
            _participantCount: 0,
            _adminCount: 0,
            _lastFetch: Date.now(),
            _processingError: validationError.message,
          };

          await this.setGroup(groupJid, basicMetadata);
          return basicMetadata;
        }
      }

      logger.warn(`Events: Não foi possível buscar metadados para ${groupJid}`);
      return metadata || null;
    } catch (error) {
      logger.error(`Events: Erro ao buscar metadados do grupo ${groupJid}:`, error.message);
      return this.groupData.get(groupJid) || null;
    }
  }

  /**
   * Processa eventos genéricos
   */
  async processGenericEvent(eventType, eventData) {
    setImmediate(async () => {
      try {
        this.stats.processedEvents++;
        logger.info(`🔄 Events: Processando ${eventType}`);

        const eventId = `${eventType}_${Date.now()}`;
        await this.setEvent(eventId, {
          type: eventType,
          data: eventData,
          timestamp: Date.now(),
        });

        // Executa callbacks para eventos genéricos
        await this.executeCallbacks(eventType, eventData);
      } catch (error) {
        logger.error(`Events: Erro no processamento de ${eventType}:`, error.message);
      }
    });
  }

  /**
   * Limpa dados específicos (apenas da memória, arquivos permanecem)
   */
  clearDataFromMemory(type = 'all') {
    switch (type) {
      case 'messages':
        this.messageData.clear();
        break;
      case 'groups':
        this.groupData.clear();
        break;
      case 'contacts':
        this.contactData.clear();
        break;
      case 'chats':
        this.chatData.clear();
        break;
      case 'events':
        this.eventData.clear();
        break;
      case 'all':
        this.messageData.clear();
        this.groupData.clear();
        this.contactData.clear();
        this.chatData.clear();
        this.eventData.clear();
        break;
    }
    logger.info(`🧹 Dados ${type} removidos da memória (arquivos preservados)`);
  }

  /**
   * Valida se um JID está nos dados
   */
  isJidKnown(jid) {
    return this.contactData.has(jid) || this.groupData.has(jid) || this.chatData.has(jid);
  }

  /**
   * Exporta dados para backup
   */
  exportData() {
    try {
      return {
        timestamp: Date.now(),
        version: '2.2.0',
        data: {
          messages: this.messageData.size,
          groups: this._getMapDataAsObject(this.groupData),
          contacts: this._getMapDataAsObject(this.contactData),
          chats: this._getMapDataAsObject(this.chatData),
          stats: this.getCacheStats(),
        },
      };
    } catch (error) {
      logger.error('Erro ao exportar dados:', error.message);
      return null;
    }
  }

  /**
   * Limpa dados corrompidos e reinicializa arquivos
   */
  async cleanCorruptedData() {
    try {
      logger.info('🧹 Iniciando limpeza de dados corrompidos...');

      const dataFiles = {
        groups: path.join(this.dataDir, 'groups.json'),
        contacts: path.join(this.dataDir, 'contacts.json'),
        chats: path.join(this.dataDir, 'chats.json'),
      };

      let cleanedFiles = 0;

      for (const [type, filePath] of Object.entries(dataFiles)) {
        try {
          const fileContent = await fs.readFile(filePath, 'utf8');

          // Tenta fazer parse para verificar se está válido
          JSON.parse(fileContent);
          logger.debug(`✅ ${path.basename(filePath)} está válido`);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            logger.warn(`🔧 Recriando arquivo corrompido: ${path.basename(filePath)}`);

            // Backup se o arquivo existir mas estiver corrompido
            if (error.code !== 'ENOENT') {
              const backupPath = `${filePath}.corrupted.${Date.now()}`;
              try {
                await fs.rename(filePath, backupPath);
                logger.info(`📦 Backup criado: ${path.basename(backupPath)}`);
              } catch (backupError) {
                logger.warn(`⚠️ Não foi possível criar backup: ${backupError.message}`);
              }
            }

            // Cria arquivo novo
            await fs.writeFile(filePath, JSON.stringify({}, null, 2));
            cleanedFiles++;
          }
        }
      }

      if (cleanedFiles > 0) {
        logger.info(`🧹 Limpeza concluída: ${cleanedFiles} arquivo(s) recriado(s)`);
        // Limpa dados da memória após recriar arquivos
        this.clearDataFromMemory('all');
      } else {
        logger.info(`✅ Nenhum arquivo corrompido encontrado`);
      }

      return { success: true, cleanedFiles };
    } catch (error) {
      logger.error('❌ Erro durante limpeza de dados corrompidos:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// Instância única do EventHandler
const eventHandler = new EventHandler();

module.exports = {
  eventHandler,
  EventHandler,
};
