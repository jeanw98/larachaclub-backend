const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  await pool.query(`
    ALTER TABLE images ADD COLUMN IF NOT EXISTS media_type VARCHAR(16) NOT NULL DEFAULT 'image';
    ALTER TABLE images ADD COLUMN IF NOT EXISTS duration_seconds REAL;
    ALTER TABLE images ALTER COLUMN url SET DEFAULT '';
  `);

  console.log('Esquema de base de datos aplicado');
}

module.exports = { migrate };
