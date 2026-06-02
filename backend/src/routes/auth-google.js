const router = require('express').Router();
const jwt = require('jsonwebtoken');
const https = require('https');
const { query } = require('../db');

function signTokens(userId) {
  const access = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refresh = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  return { access, refresh };
}

// Decode a JWT without verification (we verify via Google's tokeninfo endpoint instead)
function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payload);
}

// Verify token via Google's tokeninfo endpoint (no SSL issues, no library needed)
function verifyWithGoogle(idToken) {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const payload = JSON.parse(data);
          if (payload.error) return reject(new Error(payload.error_description || payload.error));
          if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
            return reject(new Error('Token audience mismatch'));
          }
          resolve(payload);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential required' });

    // Verify token via Google's own endpoint
    let payload;
    try {
      payload = await verifyWithGoogle(credential);
    } catch (verifyErr) {
      console.error('Google verify failed:', verifyErr.message);
      return res.status(401).json({ error: 'Google verification failed: ' + verifyErr.message });
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
