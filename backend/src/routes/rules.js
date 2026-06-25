const router = require('express').Router();
const { query } = require('../db');
const { CATS } = require('../lib/categories');
const { applyRules } = require('../lib/rules');

const FIELDS = ['merchant', 'name', 'amount'];
const OPS = ['contains', 'equals', 'gt', 'lt'];
const ACTIONS = ['set_category', 'set_tag'];

// GET /api/rules — list the user's automation rules
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM transaction_rules WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/rules — create a rule, then apply it to existing history
router.post('/', async (req, res, next) => {
  try {
    const { match_field, match_op, match_value, action, action_value } = req.body || {};
    if (!FIELDS.includes(match_field)) return res.status(400).json({ error: 'Invalid match_field' });
    if (!OPS.includes(match_op)) return res.status(400).json({ error: 'Invalid match_op' });
    if (!ACTIONS.includes(action)) return res.status(400).json({ error: 'Invalid action' });
    if (match_value === undefined || match_value === '' || !action_value) {
      return res.status(400).json({ error: 'match_value and action_value are required' });
    }
    if (action === 'set_category' && !CATS.includes(action_value)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    const { rows } = await query(
      `INSERT INTO transaction_rules (user_id, match_field, match_op, match_value, action, action_value)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, match_field, match_op, String(match_value), action, String(action_value)]
    );
    applyRules(req.user.id).catch(() => {}); // backfill existing transactions
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/rules/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'DELETE FROM transaction_rules WHERE id=$1 AND user_id=$2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Rule not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/rules/apply — re-run all rules over the user's transactions
router.post('/apply', async (req, res, next) => {
  try {
    const applied = await applyRules(req.user.id);
    res.json({ applied_rules: applied });
  } catch (err) { next(err); }
});

module.exports = router;
