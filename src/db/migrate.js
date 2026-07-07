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
    ALTER TABLE comments ALTER COLUMN rating DROP NOT NULL;
    ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_rating_check;
    ALTER TABLE comments ADD CONSTRAINT comments_rating_check
      CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_one_rating_per_user_pin
      ON comments (pin_id, user_id) WHERE rating IS NOT NULL;
  `);

  console.log('Esquema de base de datos aplicado');
}

module.exports = { migrate };
