const router = require('express').Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signTokens(userId) {
  const access = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refresh = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  return { access, refresh };
}

router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential required' });
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { email, name, sub: googleId } = payload;
    if (!email) return res.status(400).json({ error: 'No email from Google' });
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
    res.json({ user: safeUser, ...tokens });
  } catch (err) { next(err); }
});

module.exports = router;
