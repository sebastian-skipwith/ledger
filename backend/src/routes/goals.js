const router = require('express').Router();
const { query } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM goals WHERE user_id=$1 ORDER BY created_at', [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, type, target_amount, target_date, linked_account_id, monthly_contribution, notes } = req.body;
    const { rows } = await query(
      `INSERT INTO goals (user_id,name,type,target_amount,target_date,linked_account_id,monthly_contribution,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, name, type, target_amount, target_date, linked_account_id, monthly_contribution, notes]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const fields = ['name','target_amount','current_amount','target_date','monthly_contribution','completed'];
    const updates = [];
    const params = [];
    let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f}=$${i++}`); params.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id, req.user.id);
    const { rows } = await query(
      `UPDATE goals SET ${updates.join(',')} WHERE id=$${i++} AND user_id=$${i++} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Goal not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM goals WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
