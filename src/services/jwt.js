const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, nickname: user.nickname },
    config.jwt.secret,
    { expiresIn: config.jwt.expiration }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiration }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, config.jwt.refreshSecret);
  if (payload.type !== 'refresh') throw new Error('Invalid refresh token');
  return payload;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    first_name: user.first_name,
    last_name: user.last_name,
    avatar_color: user.avatar_color,
    created_at: user.created_at,
  };
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  publicUser,
};
