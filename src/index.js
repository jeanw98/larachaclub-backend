const express = require('express');
const cors = require('cors');
const { migrate } = require('./db/migrate');
const pool = require('./db/pool');
const authRoutes = require('./routes/auth');
const geoRoutes = require('./routes/geo');
const pinRoutes = require('./routes/pins');
const userRoutes = require('./routes/users');
const relationRoutes = require('./routes/relations');
const storyRoutes = require('./routes/stories');
const config = require('./config/env');

const app = express();
const PORT = config.port;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/pins', pinRoutes);
app.use('/api/users', userRoutes);
app.use('/api/relations', relationRoutes);
app.use('/api/stories', storyRoutes);

app.get('/api/heatmap', async (req, res, next) => {
  try {
    const { mode = 'density' } = req.query;
    const validReactions = ['funny', 'awful', 'scare', 'love', 'wow', 'meh'];

    if (mode === 'density') {
      const { rows } = await pool.query('SELECT lat, lng FROM pins');
      return res.json({ mode, points: rows.map((p) => [parseFloat(p.lat), parseFloat(p.lng), 1]) });
    }
    if (!validReactions.includes(mode)) return res.status(400).json({ error: 'Invalid heatmap mode' });

    const { rows } = await pool.query(`
      SELECT p.lat, p.lng, COUNT(r.id)::int AS intensity
      FROM pins p JOIN reactions r ON r.pin_id = p.id AND r.type = $1
      GROUP BY p.id, p.lat, p.lng
    `, [mode]);
    res.json({ mode, points: rows.map((p) => [parseFloat(p.lat), parseFloat(p.lng), Math.min(p.intensity, 5)]) });
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
});

async function start() {
  await migrate();
  app.listen(PORT, () => {
    console.log(`LaRachaClub API running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
