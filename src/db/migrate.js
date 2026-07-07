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
  `);

  await pool.query(`
    ALTER TABLE comments ADD CONSTRAINT comments_rating_check
      CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
  `).catch(() => {});

  // Conservar solo la primera calificación por usuario y pin; el resto pasa a comentario sin estrellas
  await pool.query(`
    WITH ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY pin_id, user_id
          ORDER BY created_at ASC
        ) AS rn
      FROM comments
      WHERE rating IS NOT NULL
    )
    UPDATE comments c
    SET rating = NULL
    FROM ranked r
    WHERE c.id = r.id AND r.rn > 1
  `);

  await pool.query(`DROP INDEX IF EXISTS idx_comments_one_rating_per_user_pin`);
  await pool.query(`
    CREATE UNIQUE INDEX idx_comments_one_rating_per_user_pin
      ON comments (pin_id, user_id) WHERE rating IS NOT NULL
  `);

  await pool.query(`
    INSERT INTO user_streaks (user_id, activity_type)
    SELECT u.id, t.type
    FROM users u
    CROSS JOIN (VALUES ('coito'), ('entreno')) AS t(type)
    ON CONFLICT DO NOTHING
  `);

  console.log('Esquema de base de datos aplicado');
}

module.exports = { migrate };
