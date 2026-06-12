const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Accepts EITHER a JWT (web/desktop sessions) OR a developer API key
// (Authorization: Bearer sk_live_... / pk_live_...). API keys are stored only
// as a SHA-256 hash; we look the user up by that hash.
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];
  const raw = apiKeyHeader || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);
  if (!raw) return res.status(401).json({ error: 'Missing or invalid authorization header' });

  try {
    if (raw.startsWith('sk_') || raw.startsWith('pk_')) {
      const { rows } = await query(
        `SELECT u.id, u.email, u.full_name, u.tier, k.id AS key_id, k.scopes
         FROM api_keys k JOIN users u ON u.id = k.user_id
         WHERE k.key_hash = $1 AND k.revoked = false`,
        [sha256(raw)]
      );
      if (!rows.length) return res.status(401).json({ error: 'Invalid API key' });
      req.user = rows[0];
      req.apiKey = { id: rows[0].key_id, scopes: rows[0].scopes };
      query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [rows[0].key_id]).catch(() => {});
      return next();
    }

    const payload = jwt.verify(raw, process.env.JWT_SECRET);
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

module.exports = { authenticate, requireTier, sha256 };
