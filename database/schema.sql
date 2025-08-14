-- Tabela para armazenar informações de chats
CREATE TABLE IF NOT EXISTS chats (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    isGroup BOOLEAN,
    unreadCount INT,
    lastMessageTimestamp BIGINT,
    metadata JSON
);

-- Tabela para armazenar informações de contatos
CREATE TABLE IF NOT EXISTS contacts (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    pushName VARCHAR(255),
    isBusiness BOOLEAN,
    raw_data JSON
);

-- Tabela para armazenar mensagens
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(255) PRIMARY KEY,
    remoteJid VARCHAR(255),
    fromMe BOOLEAN,
    participant VARCHAR(255),
    pushName VARCHAR(255),
    messageTimestamp BIGINT,
    messageType VARCHAR(50),
    messageContent TEXT,
    mediaUrl VARCHAR(255),
    mediaMimeType VARCHAR(100),
    mediaSha256 VARCHAR(64),
    reactions JSON,
    userReceipts JSON,
    full_message_data JSON,
    FOREIGN KEY (remoteJid) REFERENCES chats(id) ON DELETE CASCADE
);

-- Tabela para armazenar mensagens raw (brutas)
CREATE TABLE IF NOT EXISTS raw_messages (
    id VARCHAR(255) PRIMARY KEY,
    remoteJid VARCHAR(255),
    full_raw_message_data JSON,
    FOREIGN KEY (remoteJid) REFERENCES chats(id) ON DELETE CASCADE
);

-- Tabela para armazenar informações de grupos
CREATE TABLE IF NOT EXISTS `groups` (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    creation BIGINT,
    owner VARCHAR(255),
    description TEXT,
    descriptionId VARCHAR(255),
    restricted BOOLEAN,
    announce BOOLEAN,
    size INT
);

-- Tabela para armazenar participantes de grupos
CREATE TABLE IF NOT EXISTS `group_participants` (
    group_id VARCHAR(255),
    participant_jid VARCHAR(255),
    is_admin BOOLEAN,
    PRIMARY KEY (group_id, participant_jid),
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_jid) REFERENCES `contacts`(id) ON DELETE CASCADE
);

-- Tabela para armazenar a lista de bloqueio
CREATE TABLE IF NOT EXISTS blocklist (
    jid VARCHAR(255) PRIMARY KEY
);

-- Tabela para armazenar informações de labels
CREATE TABLE IF NOT EXISTS labels (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    color INT,
    deleted BOOLEAN,
    raw_data JSON
);

-- Tabela para armazenar associações de labels com JIDs
CREATE TABLE IF NOT EXISTS label_associations (
    label_id VARCHAR(255),
    associated_jid VARCHAR(255),
    PRIMARY KEY (label_id, associated_jid),
    FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
);

-- Tabela para armazenar informações de presença
CREATE TABLE IF NOT EXISTS presences (
    jid VARCHAR(255) PRIMARY KEY,
    presence_data JSON
);

-- Tabela para armazenar informações de chamadas
CREATE TABLE IF NOT EXISTS `calls` (
    id VARCHAR(255) PRIMARY KEY,
    fromJid VARCHAR(255),
    toJid VARCHAR(255),
    status VARCHAR(50),
    timestamp BIGINT,
    call_data JSON
);

-- Tabela para armazenar informações de newsletters
CREATE TABLE IF NOT EXISTS newsletters (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255),
    description TEXT,
    creation_timestamp BIGINT,
    settings JSON,
    raw_data JSON
);

-- Tabela para armazenar reações de newsletters
CREATE TABLE IF NOT EXISTS newsletter_reactions (
    newsletter_id VARCHAR(255),
    server_id VARCHAR(255),
    user_jid VARCHAR(255),
    reaction_text VARCHAR(50),
    timestamp BIGINT,
    PRIMARY KEY (newsletter_id, server_id),
    FOREIGN KEY (newsletter_id) REFERENCES newsletters(id) ON DELETE CASCADE
);

-- Tabela para armazenar visualizações de newsletters
CREATE TABLE IF NOT EXISTS newsletter_views (
    newsletter_id VARCHAR(255),
    user_jid VARCHAR(255),
    view_timestamp BIGINT,
    PRIMARY KEY (newsletter_id, user_jid),
    FOREIGN KEY (newsletter_id) REFERENCES newsletters(id) ON DELETE CASCADE
);

-- Tabela para armazenar participantes de newsletters
CREATE TABLE IF NOT EXISTS newsletter_participants (
    newsletter_id VARCHAR(255),
    user_jid VARCHAR(255),
    role VARCHAR(50),
    PRIMARY KEY (newsletter_id, user_jid),
    FOREIGN KEY (newsletter_id) REFERENCES newsletters(id) ON DELETE CASCADE
);

-- Tabela para armazenar configurações de grupos
CREATE TABLE IF NOT EXISTS `group_configs` (
    group_id VARCHAR(255) PRIMARY KEY,
    welcome_media VARCHAR(255),
    farewell_media VARCHAR(255),
    config_data JSON,
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE
);