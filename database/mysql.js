const mysql = require('mysql2/promise');
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
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados MySQL:', error);
  }
}

// Teste a conexão na inicialização
testConnection();

module.exports = pool;
