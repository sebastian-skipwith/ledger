const router = require('express').Router();
const crypto = require('crypto');
const { query } = require('../db');
const { sha256 } = require('../middleware/auth');

// Developer API keys. The plaintext key is shown ONCE at creation; we store
// only its SHA-256 hash. Format: sk_live_<32 hex bytes>.
function generateKey() {
  return 'sk_live_' + crypto.randomBytes(24).toString('hex');
}

// GET /api/developer/keys — list (masked)
router.get('/keys', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, key_prefix, scopes, last_used_at, created_at, revoked
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/developer/keys { name } -> { key } (shown once)
router.post('/keys', async (req, res, next) => {
  try {
    const name = (req.body.name || 'API key').slice(0, 60);
    const key = generateKey();
    const prefix = key.slice(0, 12) + '...';
    const { rows } = await query(
      `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, scopes)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, key_prefix, created_at`,
      [req.user.id, name, sha256(key), prefix, ['read']]
    );
    // Plaintext returned only here, never stored or shown again.
    res.status(201).json({ ...rows[0], key });
  } catch (err) { next(err); }
});

// DELETE /api/developer/keys/:id — revoke
router.delete('/keys/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query(
      'UPDATE api_keys SET revoked = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Key not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
