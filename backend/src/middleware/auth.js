const jwt = require('jsonwebtoken');
const { query } = require('../db');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Attach user to request
    const { rows } = await query(
      'SELECT id, email, full_name, tier FROM users WHERE id = $1',
      [payload.userId]
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireTier(...tiers) {
  return (req, res, next) => {
    if (!tiers.includes(req.user?.tier)) {
      return res.status(403).json({
        error: `This feature requires a ${tiers.join(' or ')} plan`,
        upgrade_url: '/pricing',
      });
    }
    next();
  };
}

module.exports = { authenticate, requireTier };
