const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { query } = require('../db');

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1).max(100),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function signTokens(userId) {
  const access = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refresh = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  return { access, refresh };
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const existing = await query('SELECT id FROM users WHERE email = $1', [body.email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(body.password, 12);
    const { rows } = await query(
      'INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id, email, full_name, tier',
      [body.email, hash, body.full_name]
    );
    const user = rows[0];
    const tokens = signTokens(user.id);
    res.status(201).json({ user, ...tokens });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body);
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [body.email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const tokens = signTokens(user.id);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, ...tokens });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh } = req.body;
    if (!refresh) return res.status(400).json({ error: 'Refresh token required' });
    const payload = jwt.verify(refresh, process.env.JWT_SECRET);
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' });
    const tokens = signTokens(payload.userId);
    res.json(tokens);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
