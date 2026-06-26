const router = require('express').Router();
const { query } = require('../db');
const { activeWorkspaceId, resolveWriteWorkspace } = require('../lib/workspace');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM bills WHERE user_id=$1 AND active=true AND workspace_id IS NOT DISTINCT FROM $2 ORDER BY next_due_date ASC NULLS LAST`,
      [req.user.id, activeWorkspaceId(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, amount, frequency, next_due_date, autopay, category, color } = req.body;
    const ws = await resolveWriteWorkspace(req);
    const { rows } = await query(
      `INSERT INTO bills (user_id, name, amount, frequency, next_due_date, autopay, category, color, workspace_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, name, amount, frequency, next_due_date, autopay, category, color, ws]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { name, amount, next_due_date, autopay, active } = req.body;
    const { rows } = await query(
      `UPDATE bills SET
         name=COALESCE($1,name), amount=COALESCE($2,amount),
         next_due_date=COALESCE($3,next_due_date), autopay=COALESCE($4,autopay),
         active=COALESCE($5,active)
       WHERE id=$6 AND user_id=$7 RETURNING *`,
      [name, amount, next_due_date, autopay, active, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Bill not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await query('UPDATE bills SET active=false WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
