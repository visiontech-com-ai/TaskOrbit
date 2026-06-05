const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'licenses.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Helper wrapper for db.run (inserts, updates, deletes)
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// Helper wrapper for db.get (select single row)
const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Helper wrapper for db.all (select multiple rows)
const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize schema
async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS licenses (
      key TEXT PRIMARY KEY,
      tier TEXT DEFAULT 'PRO',
      status TEXT DEFAULT 'active', -- active, revoked
      email TEXT,
      name TEXT,
      created_at INTEGER,
      expires_at INTEGER
    )
  `);

  // Migrations for existing database schemas
  try {
    await run(`ALTER TABLE licenses ADD COLUMN email TEXT`);
  } catch (err) {
    // Column already exists
  }
  try {
    await run(`ALTER TABLE licenses ADD COLUMN name TEXT`);
  } catch (err) {
    // Column already exists
  }

  console.log('Database schema initialized successfully.');
}

module.exports = {
  initDb,
  run,
  get,
  all,
  close: () => new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  })
};
