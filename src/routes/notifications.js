const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      (
        SELECT
          'comment-' || c.id::text AS id,
          'comment' AS type,
          c.created_at,
          c.text AS body,
          c.rating,
          NULL::varchar AS reaction_type,
          u.id AS actor_id,
          u.nickname AS actor_nickname,
          u.avatar_color AS actor_avatar_color,
          p.id AS pin_id,
          p.lat,
          p.lng,
          p.caption AS pin_caption,
          p.place_name,
          i.media_type
        FROM comments c
        JOIN pins p ON p.id = c.pin_id
        JOIN images i ON i.id = p.image_id
        JOIN users u ON u.id = c.user_id
        WHERE p.user_id = $1 AND c.user_id != $1
      )
      UNION ALL
      (
        SELECT
          'reaction-' || r.id::text,
          'reaction',
          r.created_at,
          NULL,
          NULL,
          r.type,
          u.id,
          u.nickname,
          u.avatar_color,
          p.id,
          p.lat,
          p.lng,
          p.caption,
          p.place_name,
          i.media_type
        FROM reactions r
        JOIN pins p ON p.id = r.pin_id
        JOIN images i ON i.id = p.image_id
        JOIN users u ON u.id = r.user_id
        WHERE p.user_id = $1 AND r.user_id != $1
      )
      ORDER BY created_at DESC
      LIMIT 50
    `, [req.user.id]);

    res.json(rows.map((row) => ({
      id: row.id,
      type: row.type,
      created_at: row.created_at,
      body: row.body,
      rating: row.rating != null ? parseInt(row.rating, 10) : null,
      reaction_type: row.reaction_type,
      actor: {
        id: row.actor_id,
        nickname: row.actor_nickname,
        avatar_color: row.actor_avatar_color,
      },
      pin: {
        id: row.pin_id,
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
        caption: row.pin_caption,
        place_name: row.place_name,
        media_type: row.media_type || 'image',
      },
    })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
