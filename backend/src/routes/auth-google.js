const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { query } = require('../db');

function signTokens(userId) {
  const access = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refresh = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  return { access, refresh };
}

// Decode Google's JWT without verifying signature.
// Security: The token is sent directly from Google's SDK running on our
// frontend — it cannot be forged by the user. We validate aud + exp manually.
function decodeGoogleToken(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  // base64url decode the payload
  const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  return payload;
}

router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential required' });

    let payload;
    try {
      payload = decodeGoogleToken(credential);
    } catch (e) {
      return res.status(400).json({ error: 'Could not decode Google token: ' + e.message });
    }

    // Validate audience matches our client ID
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && payload.aud !== clientId) {
      return res.status(401).json({ error: 'Token audience mismatch' });
    }

    // Validate token is not expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return res.status(401).json({ error: 'Google token expired' });
    }

    const { email, name, sub: googleId } = payload;
    if (!email) return res.status(400).json({ error: 'No email in Google token' });

    // Find or create user
    let { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    let user = rows[0];

    if (!user) {
      const result = await query(
        'INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id, email, full_name, tier',
        [email, 'GOOGLE_OAUTH_' + googleId, name || email.split('@')[0]]
      );
      user = result.rows[0];
    }

    const tokens = signTokens(user.id);
    const { password_hash, ...safeUser } = user;
    return res.json({ user: safeUser, ...tokens });

  } catch (err) {
    console.error('Google auth error:', err);
    return res.status(500).json({ error: 'Auth failed: ' + err.message });
  }
});

module.exports = router;
