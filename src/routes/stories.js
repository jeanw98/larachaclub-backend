const express = require('express');
const pool = require('../db/pool');
const { optionalAuth } = require('../middleware/auth');
const { signKeys } = require('../services/s3');
const { PIN_VISIBLE_WHERE, pinExpiresAt } = require('../services/pinVisibility');

const router = express.Router();

router.get('/', optionalAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.user_id, p.lat, p.lng, p.caption, p.place_name, p.formatted_address,
        p.created_at, p.is_permanent, p.epic_moment_id,
        i.s3_key, i.media_type, i.duration_seconds, u.nickname, u.avatar_color
      FROM pins p
      JOIN images i ON i.id = p.image_id
      JOIN users u ON u.id = p.user_id
      WHERE ${PIN_VISIBLE_WHERE}
      ORDER BY p.created_at DESC
    `);

    const urlMap = await signKeys(rows.map((r) => r.s3_key));
    const grouped = new Map();

    for (const row of rows) {
      if (!grouped.has(row.user_id)) {
        grouped.set(row.user_id, {
          user_id: row.user_id,
          nickname: row.nickname,
          avatar_color: row.avatar_color,
          items: [],
        });
      }
      const expiresAt = pinExpiresAt(row);
      const signedUrl = urlMap[row.s3_key];
      grouped.get(row.user_id).items.push({
        id: row.id,
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
        image_url: signedUrl,
        media_url: signedUrl,
        media_type: row.media_type || 'image',
        duration_seconds: row.duration_seconds ? parseFloat(row.duration_seconds) : null,
        caption: row.caption,
        place_name: row.place_name,
        formatted_address: row.formatted_address,
        created_at: row.created_at,
        expires_at: expiresAt,
        is_permanent: !!row.is_permanent,
        is_epic: !!row.epic_moment_id,
      });
    }

    const stories = Array.from(grouped.values()).map((group) => ({
      ...group,
      items: group.items.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    })).sort(
      (a, b) => new Date(b.items[b.items.length - 1].created_at).getTime()
        - new Date(a.items[a.items.length - 1].created_at).getTime()
    );

    res.json(stories);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
