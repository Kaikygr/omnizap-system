const mysql = require('mysql2/promise');
const fs = require('fs').promises; // Import fs.promises for async file operations
const path = require('path'); // Import path module
require('dotenv').config();

// Crie um pool de conexões para o MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Função para testar a conexão com o banco de dados
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Conectado com sucesso ao banco de dados MySQL.');
    connection.release();
    return true; // Indica sucesso
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados MySQL:', error);
    return false; // Indica falha
  }
}

// Função para aplicar o esquema do banco de dados
async function applySchema() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  try {
    const schemaSql = await fs.readFile(schemaPath, 'utf8');
    // Divide as instruções SQL por ponto e vírgula, filtra strings vazias
    const statements = schemaSql.split(';').map(s => s.trim()).filter(s => s.length > 0);

    const connection = await pool.getConnection();
    try {
      for (const statement of statements) {
        await connection.query(statement);
      }
      console.log('Esquema do banco de dados aplicado com sucesso.');
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Erro ao aplicar o esquema do banco de dados:', error);
    // Dependendo da gravidade, você pode querer relançar ou sair do processo
    process.exit(1); // Sai se a aplicação do esquema falhar criticamente
  }
}

// Inicializa a conexão com o banco de dados e aplica o esquema
async function initializeDatabase() {
  const isConnected = await testConnection();
  if (isConnected) {
    await applySchema();
  } else {
    console.error('Não foi possível inicializar o banco de dados devido a falha na conexão.');
    process.exit(1); // Sai se a conexão falhar
  }
}

initializeDatabase(); // Chama a função de inicialização

module.exports = pool;