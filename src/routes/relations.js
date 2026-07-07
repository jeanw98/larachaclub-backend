const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/friends', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.nickname, u.first_name, u.last_name, u.avatar_color, ur.created_at AS friends_since
      FROM user_relations rel
      JOIN users u ON u.id = CASE
        WHEN rel.requester_id = $1 THEN rel.addressee_id
        ELSE rel.requester_id END
      JOIN user_relations ur ON ur.id = rel.id
      WHERE rel.status = 'accepted'
        AND (rel.requester_id = $1 OR rel.addressee_id = $1)
      ORDER BY ur.updated_at DESC
    `, [req.userId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/pending', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT rel.id, rel.created_at, u.id AS user_id, u.nickname, u.first_name, u.last_name, u.avatar_color
      FROM user_relations rel
      JOIN users u ON u.id = rel.requester_id
      WHERE rel.addressee_id = $1 AND rel.status = 'pending'
      ORDER BY rel.created_at DESC
    `, [req.userId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/request', authenticate, async (req, res, next) => {
  try {
    const { nickname, user_id } = req.body;
    let targetId = user_id;

    if (!targetId && nickname) {
      const { rows } = await pool.query('SELECT id FROM users WHERE nickname = $1', [nickname.trim()]);
      if (!rows.length) return res.status(404).json({ error: 'User not found' });
      targetId = rows[0].id;
    }

    if (!targetId) return res.status(400).json({ error: 'nickname or user_id required' });
    if (targetId === req.userId) return res.status(400).json({ error: 'Cannot add yourself' });

    const existing = await pool.query(
      `SELECT id, status FROM user_relations
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)`,
      [req.userId, targetId]
    );

    if (existing.rows.length) {
      const rel = existing.rows[0];
      if (rel.status === 'accepted') return res.status(409).json({ error: 'Already friends' });
      if (rel.status === 'pending') return res.status(409).json({ error: 'Request already pending' });
      if (rel.status === 'blocked') return res.status(403).json({ error: 'Cannot send request' });
    }

    const { rows } = await pool.query(
      `INSERT INTO user_relations (requester_id, addressee_id, status)
       VALUES ($1, $2, 'pending') RETURNING *`,
      [req.userId, targetId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/accept', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE user_relations SET status = 'accepted', updated_at = NOW()
       WHERE id = $1 AND addressee_id = $2 AND status = 'pending' RETURNING *`,
      [req.params.id, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM user_relations WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
      [req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Request not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
