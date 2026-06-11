const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'marketplace.db');

const db = new sqlite3.Database(dbPath, err => {
  if (err) console.error('Marketplace DB connect error:', err.message);
  else console.log('Connected to marketplace database at:', dbPath);
});

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve({ id: this.lastID, changes: this.changes });
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS workflows (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      author      TEXT DEFAULT 'Anonymous',
      category    TEXT DEFAULT 'General',
      tags        TEXT DEFAULT '[]',
      sites       TEXT DEFAULT '[]',
      step_count  INTEGER DEFAULT 0,
      steps_json  TEXT NOT NULL,
      downloads   INTEGER DEFAULT 0,
      status      TEXT DEFAULT 'approved',
      created_at  INTEGER,
      updated_at  INTEGER
    )
  `);
  console.log('Marketplace schema initialized.');
}

module.exports = {
  initDb, run, get, all,
  close: () => new Promise((resolve, reject) => {
    db.close(err => err ? reject(err) : resolve());
  })
};
