// Camada de banco para Postgres (Supabase ou qualquer Postgres gerenciado),
// usando o driver oficial "pg". Mantém a mesma sintaxe "?" nas queries do
// resto do código — converte para $1, $2... internamente — para minimizar
// o quanto o SQL precisou mudar em relação à versão original (SQLite).
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[db] Faltou a variável de ambiente DATABASE_URL (connection string do Postgres/Supabase).');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
});

function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** Executa uma query com placeholders "?" e retorna as linhas (array). */
async function all(sql, params = []) {
  const res = await pool.query(toPositional(sql), params);
  return res.rows;
}
/** Executa uma query e retorna a primeira linha (ou undefined). */
async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0];
}
/** Executa um INSERT/UPDATE/DELETE. Retorna { rowCount, rows }. */
async function run(sql, params = []) {
  const res = await pool.query(toPositional(sql), params);
  return { rowCount: res.rowCount, rows: res.rows };
}
async function exec(sql) {
  await pool.query(sql);
}
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wrapped = {
      all: async (sql, params = []) => (await client.query(toPositional(sql), params)).rows,
      get: async (sql, params = []) => (await client.query(toPositional(sql), params)).rows[0],
      run: async (sql, params = []) => {
        const r = await client.query(toPositional(sql), params);
        return { rowCount: r.rowCount, rows: r.rows };
      },
    };
    const result = await fn(wrapped);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function ensureSchema() {
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await exec(schemaSql);
}

module.exports = { pool, all, get, run, exec, transaction, ensureSchema };
