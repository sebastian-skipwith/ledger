// accounts.js
const router = require('express').Router();
const { query } = require('../db');
const { snapshotNetWorth } = require('./plaid');
const { activeWorkspaceId, resolveWriteWorkspace } = require('../lib/workspace');

const MANUAL_TYPES = ['depository', 'investment', 'credit', 'loan'];

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.*, pi.institution_name as linked_institution
       FROM accounts a
       LEFT JOIN plaid_items pi ON a.plaid_item_id = pi.id
       WHERE a.user_id = $1 AND a.is_hidden = false AND a.workspace_id IS NOT DISTINCT FROM $2
       ORDER BY a.type, a.current_balance DESC`,
      [req.user.id, activeWorkspaceId(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/accounts — create a manual (non-Plaid) account
router.post('/', async (req, res, next) => {
  try {
    const { name, type, subtype, current_balance, institution_name, mask, color } = req.body || {};
    if (!name || !MANUAL_TYPES.includes(type)) {
      return res.status(400).json({ error: 'name and a valid type (depository|investment|credit|loan) are required' });
    }
    const ws = await resolveWriteWorkspace(req);
    const { rows } = await query(
      `INSERT INTO accounts (user_id, name, type, subtype, current_balance, institution_name, mask, color, source, workspace_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'#888888'),'manual',$9) RETURNING *`,
      [req.user.id, name, type, subtype || null, current_balance || 0, institution_name || null, mask || null, color || null, ws]
    );
    snapshotNetWorth(req.user.id).catch(() => {});
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { is_hidden, color, name, current_balance } = req.body;
    const { rows } = await query(
      `UPDATE accounts SET
         is_hidden = COALESCE($1, is_hidden),
         color = COALESCE($2, color),
         name = COALESCE($3, name),
         current_balance = COALESCE($4, current_balance),
         updated_at = NOW()
       WHERE id=$5 AND user_id=$6 RETURNING *`,
      [is_hidden, color, name, current_balance, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    if (current_balance !== undefined) snapshotNetWorth(req.user.id).catch(() => {});
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/accounts/:id — manual accounts only (Plaid accounts are removed
// via DELETE /api/plaid/items/:id).
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      "DELETE FROM accounts WHERE id=$1 AND user_id=$2 AND source='manual' RETURNING id",
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Manual account not found' });
    snapshotNetWorth(req.user.id).catch(() => {});
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
