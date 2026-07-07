const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/leaderboard', async (_req, res, next) => {
  try {
    const { getLeaderboard } = require('../services/leaderboard');
    const entries = await getLeaderboard();
    res.json(entries.map((e) => ({
      id: e.id,
      nickname: e.nickname,
      cool_name: e.nickname,
      first_name: e.first_name,
      last_name: e.last_name,
      avatar_color: e.avatar_color,
      pin_count: parseInt(e.pin_count, 10),
      funny_reactions: parseInt(e.funny_reactions, 10),
      total_score: parseInt(e.total_score, 10),
      rank_position: e.rank_position,
    })));
  } catch (err) {
    next(err);
  }
});

router.get('/search', authenticate, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q?.trim()) return res.json([]);
    const { rows } = await pool.query(
      `SELECT id, nickname, first_name, last_name, avatar_color
       FROM users WHERE nickname ILIKE $1 AND id != $2 LIMIT 20`,
      [`%${q.trim()}%`, req.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/rank', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ur.*, u.nickname, u.avatar_color
       FROM user_ranks ur JOIN users u ON u.id = ur.user_id
       WHERE ur.user_id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Rank not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
