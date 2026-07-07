const { verifyAccessToken } = require('../services/jwt');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autorización inválida o ausente' });
  }

  try {
    const payload = verifyAccessToken(header.slice(7));
    req.userId = payload.sub;
    req.userNickname = payload.nickname;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(header.slice(7));
      req.userId = payload.sub;
    } catch { /* ignore */ }
  }
  next();
}

module.exports = { authenticate, optionalAuth };
