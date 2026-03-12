const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'l-europe-secret-key';

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token ausente' });
  }
  const token = header.replace('Bearer ', '').trim();
  if (!token) {
    return res.status(401).json({ erro: 'Token ausente' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ erro: 'Token invalido' });
  }
};

module.exports = {
  requireAuth
};
