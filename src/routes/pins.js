const express = require('express');
const multer = require('multer');
const pool = require('../db/pool');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { uploadMedia, isImage, isVideo } = require('../services/s3');
const { validateMediaLocation } = require('../services/mediaValidation');
const { signKey } = require('../services/s3');
const { reverseGeocode } = require('../services/google');
const { recomputeUserRank, recomputePinOwner } = require('../services/leaderboard');

const router = express.Router();
const MAX_VIDEO_SECONDS = 30;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isImage(file.mimetype) || isVideo(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes o videos'));
  },
});

async function enrichPin(pin, userId = null) {
  const [reactions, comments, userReaction, userRating, signedUrl] = await Promise.all([
    pool.query('SELECT type, COUNT(*)::int AS count FROM reactions WHERE pin_id = $1 GROUP BY type', [pin.id]),
    pool.query(`
      SELECT COUNT(*)::int AS count, AVG(rating) AS avg_rating
      FROM comments WHERE pin_id = $1 AND rating IS NOT NULL
    `, [pin.id]),
    userId
      ? pool.query('SELECT type FROM reactions WHERE pin_id = $1 AND user_id = $2', [pin.id, userId])
      : Promise.resolve({ rows: [] }),
    userId
      ? pool.query(
        'SELECT rating FROM comments WHERE pin_id = $1 AND user_id = $2 AND rating IS NOT NULL LIMIT 1',
        [pin.id, userId]
      )
      : Promise.resolve({ rows: [] }),
    signKey(pin.s3_key),
  ]);

  const reactionMap = {};
  reactions.rows.forEach((r) => { reactionMap[r.type] = r.count; });

  return {
    id: pin.id,
    user_id: pin.user_id,
    lat: parseFloat(pin.lat),
    lng: parseFloat(pin.lng),
    caption: pin.caption,
    image_url: signedUrl,
    media_url: signedUrl,
    media_type: pin.media_type || 'image',
    mime_type: pin.mime_type,
    duration_seconds: pin.duration_seconds ? parseFloat(pin.duration_seconds) : null,
    google_place_id: pin.google_place_id,
    place_name: pin.place_name,
    formatted_address: pin.formatted_address,
    created_at: pin.created_at,
    user_name: pin.nickname,
    avatar_color: pin.avatar_color,
    reactions: reactionMap,
    comment_count: comments.rows[0]?.count || 0,
    avg_rating: comments.rows[0]?.avg_rating
      ? Math.round(parseFloat(comments.rows[0].avg_rating) * 10) / 10
      : null,
    user_reaction: userReaction.rows[0]?.type || null,
    user_has_rated: !!userRating.rows[0],
    user_rating: userRating.rows[0]?.rating != null
      ? parseInt(userRating.rows[0].rating, 10)
      : null,
  };
}

const PIN_SELECT = `
  SELECT p.*, i.s3_key, i.mime_type, i.media_type, i.duration_seconds,
    u.nickname, u.avatar_color
  FROM pins p
  JOIN images i ON i.id = p.image_id
  JOIN users u ON u.id = p.user_id
`;

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${PIN_SELECT} ORDER BY p.created_at DESC`);
    const enriched = await Promise.all(rows.map((p) => enrichPin(p, req.userId)));
    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

router.get('/heatmap', async (req, res, next) => {
  try {
    const { mode = 'density' } = req.query;
    const validReactions = ['funny', 'awful', 'scare', 'love', 'wow', 'meh'];

    if (mode === 'density') {
      const { rows } = await pool.query('SELECT lat, lng FROM pins');
      return res.json({ mode, points: rows.map((p) => [parseFloat(p.lat), parseFloat(p.lng), 1]) });
    }

    if (!validReactions.includes(mode)) {
      return res.status(400).json({ error: 'Modo de mapa de calor inválido' });
    }

    const { rows } = await pool.query(`
      SELECT p.lat, p.lng, COUNT(r.id)::int AS intensity
      FROM pins p
      JOIN reactions r ON r.pin_id = p.id AND r.type = $1
      GROUP BY p.id, p.lat, p.lng
    `, [mode]);

    res.json({
      mode,
      points: rows.map((p) => [parseFloat(p.lat), parseFloat(p.lng), Math.min(p.intensity, 5)]),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${PIN_SELECT} WHERE p.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Pin no encontrado' });

    const pin = await enrichPin(rows[0], req.userId);

    const { rows: comments } = await pool.query(`
      SELECT c.*, u.nickname, u.avatar_color
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.pin_id = $1 ORDER BY c.created_at DESC
    `, [req.params.id]);

    res.json({ ...pin, comments });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Se requiere una foto o video' });

    let { lat, lng, caption, google_place_id, place_name, formatted_address, duration, user_lat, user_lng, camera_capture } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: 'Ubicación requerida' });
    if (!user_lat || !user_lng) return res.status(400).json({ error: 'Se requiere tu ubicación actual' });

    if (isVideo(req.file.mimetype)) {
      const dur = parseFloat(duration);
      if (!dur || dur > MAX_VIDEO_SECONDS) {
        return res.status(400).json({ error: `El video debe durar máximo ${MAX_VIDEO_SECONDS} segundos` });
      }
    }

    lat = parseFloat(lat);
    lng = parseFloat(lng);
    const userLat = parseFloat(user_lat);
    const userLng = parseFloat(user_lng);

    const locationCheck = await validateMediaLocation({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      pinLat: lat,
      pinLng: lng,
      userLat,
      userLng,
      cameraCapture: camera_capture === '1' || camera_capture === 'true',
    });

    if (!locationCheck.ok) {
      return res.status(400).json({ error: locationCheck.error });
    }

    if (!google_place_id && !formatted_address) {
      try {
        const geo = await reverseGeocode(lat, lng);
        google_place_id = geo.place_id;
        place_name = place_name || geo.place_name;
        formatted_address = geo.formatted_address;
      } catch { /* geocodificación opcional */ }
    }

    const mediaData = await uploadMedia(req.file, req.userId);
    const durationSeconds = isVideo(req.file.mimetype) ? parseFloat(duration) : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: imgRows } = await client.query(
        `INSERT INTO images (user_id, s3_key, url, mime_type, media_type, duration_seconds, file_size)
         VALUES ($1, $2, '', $3, $4, $5, $6) RETURNING id`,
        [req.userId, mediaData.s3_key, mediaData.mime_type, mediaData.media_type, durationSeconds, mediaData.file_size]
      );

      const { rows: pinRows } = await client.query(
        `INSERT INTO pins (user_id, image_id, lat, lng, google_place_id, place_name, formatted_address, caption)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [req.userId, imgRows[0].id, lat, lng, google_place_id || null, place_name || null, formatted_address || null, caption || '']
      );

      await client.query('COMMIT');

      const { rows } = await pool.query(`${PIN_SELECT} WHERE p.id = $1`, [pinRows[0].id]);
      await recomputeUserRank(req.userId);
      res.status(201).json(await enrichPin(rows[0], req.userId));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/:id/comments', authenticate, async (req, res, next) => {
  try {
    const pinCheck = await pool.query('SELECT id FROM pins WHERE id = $1', [req.params.id]);
    if (!pinCheck.rows.length) return res.status(404).json({ error: 'Pin no encontrado' });

    const { text, rating } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'El comentario es obligatorio' });

    const hasRating = rating != null && rating !== '';
    let ratingValue = null;
    if (hasRating) {
      ratingValue = parseInt(rating, 10);
      if (!ratingValue || ratingValue < 1 || ratingValue > 5) {
        return res.status(400).json({ error: 'La calificación debe ser de 1 a 5' });
      }
      const existing = await pool.query(
        'SELECT id FROM comments WHERE pin_id = $1 AND user_id = $2 AND rating IS NOT NULL',
        [req.params.id, req.userId]
      );
      if (existing.rows.length) {
        return res.status(409).json({ error: 'Ya calificaste esta publicación' });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO comments (pin_id, user_id, text, rating) VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.params.id, req.userId, text.trim(), ratingValue]
    );

    const { rows: comment } = await pool.query(`
      SELECT c.*, u.nickname, u.avatar_color FROM comments c
      JOIN users u ON u.id = c.user_id WHERE c.id = $1
    `, [rows[0].id]);

    await recomputePinOwner(req.params.id);
    res.status(201).json(comment[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reactions', authenticate, async (req, res, next) => {
  try {
    const pinCheck = await pool.query('SELECT id FROM pins WHERE id = $1', [req.params.id]);
    if (!pinCheck.rows.length) return res.status(404).json({ error: 'Pin no encontrado' });

    const { type } = req.body;
    const validTypes = ['funny', 'awful', 'scare', 'love', 'wow', 'meh'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Reacción inválida' });

    const existing = await pool.query(
      'SELECT id, type FROM reactions WHERE pin_id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.type === type) {
        await pool.query('DELETE FROM reactions WHERE id = $1', [row.id]);
        await recomputePinOwner(req.params.id);
        return res.json({ action: 'removed', type });
      }
      await pool.query('UPDATE reactions SET type = $1 WHERE id = $2', [type, row.id]);
      await recomputePinOwner(req.params.id);
      return res.json({ action: 'updated', type });
    }

    await pool.query(
      'INSERT INTO reactions (pin_id, user_id, type) VALUES ($1, $2, $3)',
      [req.params.id, req.userId, type]
    );
    await recomputePinOwner(req.params.id);
    res.status(201).json({ action: 'added', type });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
