const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { query } = require('../db');
const { sendWelcomeEmail } = require('../lib/email');

const googleClient = new OAuth2Client();

function signTokens(userId) {
  const access = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refresh = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  return { access, refresh };
}

router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential required' });

    // Cryptographically verify the token against Google's public keys.
    // (An unverified decode would let anyone forge a token for any email.)
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (e) {
      return res.status(401).json({ error: 'Invalid Google token' });
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
      sendWelcomeEmail(user.email, user.full_name).catch(e => console.error('welcome email:', e.message));
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
