const pool = require('../db/pool');

const REACTION_SCORE_SQL = `
  CASE r.type
    WHEN 'funny' THEN 3 WHEN 'love' THEN 2 WHEN 'wow' THEN 2
    WHEN 'scare' THEN 1 WHEN 'meh' THEN 0 WHEN 'awful' THEN -1 ELSE 0
  END
`;

async function recomputeUserRank(userId) {
  const stats = await pool.query(`
    SELECT
      u.id AS user_id,
      COALESCE(p.pin_count, 0) AS pin_count,
      COALESCE(r.reaction_score, 0) AS reaction_score,
      COALESCE(c.rating_score, 0) AS rating_score,
      COALESCE(r.funny_count, 0) AS funny_count
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS pin_count FROM pins GROUP BY user_id
    ) p ON p.user_id = u.id
    LEFT JOIN (
      SELECT p.user_id,
        SUM(${REACTION_SCORE_SQL}) AS reaction_score,
        COUNT(*) FILTER (WHERE r.type = 'funny') AS funny_count
      FROM reactions r
      JOIN pins p ON r.pin_id = p.id
      GROUP BY p.user_id
    ) r ON r.user_id = u.id
    LEFT JOIN (
      SELECT p.user_id, SUM(rated.rating) AS rating_score
      FROM (
        SELECT c.pin_id, c.user_id AS rater_id, MAX(c.rating) AS rating
        FROM comments c
        WHERE c.rating IS NOT NULL
        GROUP BY c.pin_id, c.user_id
      ) rated
      JOIN pins p ON p.id = rated.pin_id
      GROUP BY p.user_id
    ) c ON c.user_id = u.id
    WHERE u.id = $1
  `, [userId]);

  const row = stats.rows[0];
  if (!row) return;

  const totalScore = row.pin_count * 2 + parseInt(row.reaction_score, 10) + parseInt(row.rating_score, 10);

  await pool.query(`
    INSERT INTO user_ranks (user_id, total_score, pin_count, reaction_score, rating_score, funny_count, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      total_score = EXCLUDED.total_score,
      pin_count = EXCLUDED.pin_count,
      reaction_score = EXCLUDED.reaction_score,
      rating_score = EXCLUDED.rating_score,
      funny_count = EXCLUDED.funny_count,
      updated_at = NOW()
  `, [userId, totalScore, row.pin_count, row.reaction_score, row.rating_score, row.funny_count]);

  await recomputeAllPositions();
}

async function recomputeAllPositions() {
  await pool.query(`
    WITH ranked AS (
      SELECT user_id, ROW_NUMBER() OVER (ORDER BY total_score DESC, pin_count DESC) AS pos
      FROM user_ranks
    )
    UPDATE user_ranks ur SET rank_position = r.pos, updated_at = NOW()
    FROM ranked r WHERE ur.user_id = r.user_id
  `);
}

async function recomputePinOwner(pinId) {
  const { rows } = await pool.query('SELECT user_id FROM pins WHERE id = $1', [pinId]);
  if (rows[0]) await recomputeUserRank(rows[0].user_id);
}

async function getLeaderboard(limit = 50) {
  const { rows } = await pool.query(`
    SELECT u.id, u.nickname, u.first_name, u.last_name, u.avatar_color,
      COALESCE(ur.pin_count, 0) AS pin_count,
      COALESCE(ur.funny_count, 0) AS funny_reactions,
      COALESCE(ur.total_score, 0) AS total_score,
      ur.rank_position
    FROM users u
    LEFT JOIN user_ranks ur ON ur.user_id = u.id
    ORDER BY COALESCE(ur.total_score, 0) DESC, u.created_at ASC
    LIMIT $1
  `, [limit]);
  return rows;
}

module.exports = { recomputeUserRank, recomputePinOwner, getLeaderboard, recomputeAllPositions };
