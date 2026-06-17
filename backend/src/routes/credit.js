const router = require('express').Router();
const { query } = require('../db');

// Credit scores are not available through Plaid, so users track them manually
// here (or paste in what their bank/Credit Karma/etc. shows). We store the
// history so the web app can chart the trend over time.

// GET /api/credit — the user's credit-score history, most recent first.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, score, source, recorded_at FROM credit_scores WHERE user_id=$1 ORDER BY recorded_at DESC LIMIT 100',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/credit { score, source? } — record a new credit-score reading.
router.post('/', async (req, res, next) => {
  try {
    const score = parseInt(req.body.score, 10);
    if (!Number.isFinite(score) || score < 300 || score > 850) {
      return res.status(400).json({ error: 'Score must be a whole number between 300 and 850.' });
    }
    const source = (req.body.source || '').toString().trim().slice(0, 60) || null;
    const { rows } = await query(
      'INSERT INTO credit_scores (user_id, score, source) VALUES ($1,$2,$3) RETURNING id, score, source, recorded_at',
      [req.user.id, score, source]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
