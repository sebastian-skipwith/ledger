const router = require('express').Router();
const { query } = require('../db');
const { requireTier } = require('../middleware/auth');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('id', (req, res, next, id) => (UUID.test(id) ? next() : res.status(400).json({ error: 'invalid id' })));

// GET /api/workspaces — synthetic "Personal" (id null) + the user's business workspaces.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, type, created_at FROM workspaces WHERE user_id=$1 ORDER BY created_at',
      [req.user.id]
    );
    res.json([{ id: null, name: 'Personal', type: 'personal' }, ...rows]);
  } catch (err) { next(err); }
});

// POST /api/workspaces — create a business workspace (paid feature).
router.post('/', requireTier('pro', 'wealth', 'business'), async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      "INSERT INTO workspaces (user_id, name, type) VALUES ($1,$2,'business') RETURNING id, name, type, created_at",
      [req.user.id, name]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      'UPDATE workspaces SET name=$1 WHERE id=$2 AND user_id=$3 RETURNING id, name, type',
      [name, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'workspace not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/workspaces/:id — its accounts/bills/goals revert to Personal
// automatically (workspace_id FK is ON DELETE SET NULL).
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM workspaces WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'workspace not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
