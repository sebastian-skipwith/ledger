const router = require('express').Router();
const { query } = require('../db');
const { activeWorkspaceId } = require('../lib/workspace');

// GET /api/transactions?from=&to=&account_id=&category=&limit=&offset=
router.get('/', async (req, res, next) => {
  try {
    const { from, to, account_id, category, limit = 50, offset = 0 } = req.query;
    let where = ['t.user_id = $1'];
    const params = [req.user.id];
    let i = 2;

    if (from)       { where.push(`t.date >= $${i++}`); params.push(from); }
    if (to)         { where.push(`t.date <= $${i++}`); params.push(to); }
    if (account_id) { where.push(`t.account_id = $${i++}`); params.push(account_id); }
    if (category)   { where.push(`$${i++} = ANY(t.category)`); params.push(category); }
    where.push(`a.workspace_id IS NOT DISTINCT FROM $${i++}`); params.push(activeWorkspaceId(req));

    params.push(parseInt(limit), parseInt(offset));
    const { rows } = await query(
      `SELECT t.*, a.name as account_name, a.institution_name
       FROM transactions t JOIN accounts a ON t.account_id = a.id
       WHERE ${where.join(' AND ')}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/transactions/summary — monthly income/expense totals
router.get('/summary', async (req, res, next) => {
  try {
    const { months = 6 } = req.query;
    const { rows } = await query(
      `SELECT
         TO_CHAR(t.date, 'YYYY-MM') as month,
         SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as expenses,
         SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) as income
       FROM transactions t JOIN accounts a ON t.account_id = a.id
       WHERE t.user_id = $1 AND a.workspace_id IS NOT DISTINCT FROM $2
         AND t.date >= CURRENT_DATE - INTERVAL '${parseInt(months)} months'
       GROUP BY month ORDER BY month DESC`,
      [req.user.id, activeWorkspaceId(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PATCH /api/transactions/:id — update category or notes
router.patch('/:id', async (req, res, next) => {
  try {
    const { category_custom, notes } = req.body;
    const { rows } = await query(
      `UPDATE transactions SET
         category_custom = COALESCE($1, category_custom),
         notes = COALESCE($2, notes)
       WHERE id=$3 AND user_id=$4 RETURNING *`,
      [category_custom, notes, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Transaction not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
