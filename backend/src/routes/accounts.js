// accounts.js
const router = require('express').Router();
const { query } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.*, pi.institution_name as linked_institution
       FROM accounts a
       LEFT JOIN plaid_items pi ON a.plaid_item_id = pi.id
       WHERE a.user_id = $1 AND a.is_hidden = false
       ORDER BY a.type, a.current_balance DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { is_hidden, color, name } = req.body;
    const { rows } = await query(
      `UPDATE accounts SET
         is_hidden = COALESCE($1, is_hidden),
         color = COALESCE($2, color),
         name = COALESCE($3, name),
         updated_at = NOW()
       WHERE id=$4 AND user_id=$5 RETURNING *`,
      [is_hidden, color, name, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
