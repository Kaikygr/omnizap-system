const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

let pool;

// Função para criar o banco de dados se ele não existir
async function createDatabaseIfNotExists() {
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  let connection;
  try {
    // Conecta ao servidor MySQL sem especificar um banco de dados
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
    });
    // Cria o banco de dados se ele não existir
    await connection.query(`CREATE DATABASE IF NOT EXISTS 
${DB_NAME}
`);
    console.log(`Banco de dados '${DB_NAME}' verificado/criado com sucesso.`);
  } catch (error) {
    console.error('Erro ao criar o banco de dados:', error);
    throw error; // Relança o erro para ser tratado pelo chamador
  } finally {
    if (connection) {
      await connection.end(); // Fecha a conexão
    }
  }
}

// Função para aplicar o esquema do banco de dados
async function applySchema() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  try {
    const schemaSql = await fs.readFile(schemaPath, 'utf8');
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
    process.exit(1);
  }
}

// Inicializa a conexão com o banco de dados e aplica o esquema
async function initializeDatabase() {
  try {
    await createDatabaseIfNotExists();

    // Agora que o DB existe, cria o pool de conexões para ele
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    // Testa a conexão com o pool
    const connection = await pool.getConnection();
    console.log('Conectado com sucesso ao banco de dados MySQL.');
    connection.release();

    // Aplica o schema
    await applySchema();
  } catch (error) {
    console.error('Não foi possível inicializar o banco de dados:', error);
    process.exit(1);
  }
}

function getPool() {
  if (!pool) {
    throw new Error('Pool de conexões não inicializado. Chame initializeDatabase primeiro.');
  }
  return pool;
}

module.exports = { initializeDatabase, getPool };