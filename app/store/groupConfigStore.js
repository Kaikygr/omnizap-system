const { getPool } = require('../../database/mysql');
const logger = require('../utils/logger/loggerModule');

const groupConfigStore = {
  configs: {},

  async loadData() {
    logger.info('Carregando configurações de grupo do banco de dados...');
    const pool = getPool();
    try {
      const [rows] = await pool.query('SELECT * FROM `group_configs`');
      this.configs = rows.reduce((acc, row) => {
        acc[row.group_id] = {
          welcomeMedia: row.welcome_media,
          farewellMedia: row.farewell_media,
          ...JSON.parse(row.config_data || '{}'),
        };
        return acc;
      }, {});
      logger.info('Configurações de grupo carregadas com sucesso.');
    } catch (error) {
      logger.error('Erro ao carregar configurações de grupo do banco de dados:', error);
      this.configs = {};
    }
  },

  getGroupConfig: function (groupId) {
    return this.configs[groupId] || {};
  },

  async updateGroupConfig(groupId, newConfig) {
    this.configs[groupId] = { ...(this.configs[groupId] || {}), ...newConfig };
    const pool = getPool();
    try {
      const { welcomeMedia, farewellMedia, ...configData } = this.configs[groupId];
      await pool.query(
        'INSERT INTO `group_configs` (group_id, welcome_media, farewell_media, config_data) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE welcome_media = VALUES(welcome_media), farewell_media = VALUES(farewell_media), config_data = VALUES(config_data)',
        [groupId, welcomeMedia || null, farewellMedia || null, JSON.stringify(configData)],
      );
      logger.info(`Configuração do grupo ${groupId} atualizada no banco de dados.`);
    } catch (error) {
      logger.error(`Erro ao atualizar a configuração do grupo ${groupId} no banco de dados:`, error);
    }
  },
};

module.exports = groupConfigStore;