const express = require('express');
const { authenticate } = require('../middleware/auth');
const { ACTIVITY_TYPES, formatDate, getUserStreaks, logActivity, getStreakLeaderboard } = require('../services/streaks');

const router = express.Router();

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const today = req.query.date || formatDate(new Date());
    const stats = await getUserStreaks(req.userId, today);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.post('/log', authenticate, async (req, res, next) => {
  try {
    const { type, date } = req.body;
    if (!type || !ACTIVITY_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido (coito o entreno)' });
    }
    const logDate = date || formatDate(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      return res.status(400).json({ error: 'Fecha inválida' });
    }
    const stats = await logActivity(req.userId, type, logDate);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.get('/leaderboard', async (req, res, next) => {
  try {
    const { type, date } = req.query;
    if (!type || !ACTIVITY_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido (coito o entreno)' });
    }
    const today = date || formatDate(new Date());
    const entries = await getStreakLeaderboard(type, today);
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
