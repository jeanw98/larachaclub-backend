const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { generateCoolName, randomColor } = require('../utils/names');
const {
  signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, publicUser,
} = require('../services/jwt');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

async function uniqueNickname(base) {
  let nickname = base;
  let attempts = 0;
  while (attempts < 20) {
    const { rows } = await pool.query('SELECT id FROM users WHERE nickname = $1', [nickname]);
    if (!rows.length) return nickname;
    nickname = generateCoolName();
    attempts++;
  }
  return `${base}${Date.now().toString(36)}`;
}

router.post('/register', async (req, res, next) => {
  try {
    const { nickname, first_name, last_name, password } = req.body;

    if (!first_name?.trim() || !last_name?.trim()) {
      return res.status(400).json({ error: 'Nombre y apellido son obligatorios' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    let nick = nickname?.trim();
    if (nick) {
      const { rows } = await pool.query('SELECT id FROM users WHERE nickname = $1', [nick]);
      if (rows.length) return res.status(409).json({ error: 'Ese apodo ya está en uso' });
    } else {
      nick = await uniqueNickname(generateCoolName());
    }

    const password_hash = await bcrypt.hash(password, 10);
    const avatar_color = randomColor();

    const { rows } = await pool.query(
      `INSERT INTO users (nickname, first_name, last_name, password_hash, avatar_color)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nick, first_name.trim(), last_name.trim(), password_hash, avatar_color]
    );

    const user = rows[0];
    const access_token = signAccessToken(user);
    const refresh_token = signRefreshToken(user);

    await pool.query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [
      hashToken(refresh_token), user.id,
    ]);

    await pool.query(
      'INSERT INTO user_ranks (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [user.id]
    );

    await pool.query(
      `INSERT INTO user_streaks (user_id, activity_type) VALUES ($1, 'coito'), ($1, 'entreno') ON CONFLICT DO NOTHING`,
      [user.id]
    );

    res.status(201).json({ user: publicUser(user), access_token, refresh_token });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { nickname, password } = req.body;
    if (!nickname || !password) {
      return res.status(400).json({ error: 'Apodo y contraseña son obligatorios' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE nickname = $1', [nickname.trim()]);
    if (!rows.length) return res.status(401).json({ error: 'Credenciales inválidas' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

    const access_token = signAccessToken(user);
    const refresh_token = signRefreshToken(user);

    await pool.query('UPDATE users SET refresh_token_hash = $1, updated_at = NOW() WHERE id = $2', [
      hashToken(refresh_token), user.id,
    ]);

    res.json({ user: publicUser(user), access_token, refresh_token });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'Token de actualización requerido' });

    const payload = verifyRefreshToken(refresh_token);
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
    if (!rows.length) return res.status(401).json({ error: 'Usuario no encontrado' });

    const user = rows[0];
    if (user.refresh_token_hash !== hashToken(refresh_token)) {
      return res.status(401).json({ error: 'Token de actualización inválido' });
    }

    const access_token = signAccessToken(user);
    const new_refresh = signRefreshToken(user);

    await pool.query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [
      hashToken(new_refresh), user.id,
    ]);

    res.json({ access_token, refresh_token: new_refresh });
  } catch (err) {
    return res.status(401).json({ error: 'Token expirado o inválido' });
  }
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE users SET refresh_token_hash = NULL WHERE id = $1', [req.userId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(publicUser(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const nickname = req.body.nickname?.trim();
    if (!nickname || nickname.length < 2) {
      return res.status(400).json({ error: 'El apodo debe tener al menos 2 caracteres' });
    }
    if (nickname.length > 32) {
      return res.status(400).json({ error: 'El apodo no puede tener más de 32 caracteres' });
    }

    const { rows: taken } = await pool.query(
      'SELECT id FROM users WHERE nickname = $1 AND id != $2',
      [nickname, req.userId]
    );
    if (taken.length) return res.status(409).json({ error: 'Ese apodo ya está en uso' });

    const { rows } = await pool.query(
      'UPDATE users SET nickname = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [nickname, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json(publicUser(rows[0]));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
