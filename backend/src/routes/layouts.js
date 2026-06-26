const router = require('express').Router();
const { query } = require('../db');

// Per-user dashboard tile layouts. `tiles` is a self-contained JSON array of
// tile configs ([{ key, x, y, w, h, visible, theme }]); the server stores/returns
// it as-is (the client owns the tile schema). workspace_id is reserved for the
// future business-workspaces feature — NULL means the user's personal dashboard.

const MAX_TILES = 40;
const MAX_BYTES = 32 * 1024;

function validateTiles(tiles) {
  if (!Array.isArray(tiles)) return 'tiles must be an array';
  if (tiles.length > MAX_TILES) return `too many tiles (max ${MAX_TILES})`;
  if (Buffer.byteLength(JSON.stringify(tiles), 'utf8') > MAX_BYTES) return 'layout too large';
  return null;
}

// GET /api/layouts — list the user's saved layouts (metadata only)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, workspace_id, updated_at FROM dashboard_layouts WHERE user_id=$1 ORDER BY updated_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/layouts/default — the personal default dashboard layout (or null)
router.get('/default', async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT id, name, tiles, updated_at FROM dashboard_layouts WHERE user_id=$1 AND workspace_id IS NULL AND name='default'",
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

// PUT /api/layouts/default — upsert the personal default layout's tiles
router.put('/default', async (req, res, next) => {
  try {
    const tiles = req.body?.tiles;
    const err = validateTiles(tiles);
    if (err) return res.status(400).json({ error: err });
    const payload = JSON.stringify(tiles);
    const upd = await query(
      "UPDATE dashboard_layouts SET tiles=$2, updated_at=NOW() WHERE user_id=$1 AND workspace_id IS NULL AND name='default' RETURNING id, name, tiles, updated_at",
      [req.user.id, payload]
    );
    if (upd.rows.length) return res.json(upd.rows[0]);
    const ins = await query(
      "INSERT INTO dashboard_layouts (user_id, name, tiles) VALUES ($1,'default',$2) RETURNING id, name, tiles, updated_at",
      [req.user.id, payload]
    );
    res.json(ins.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/layouts/:id — remove a saved (non-default) layout
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query(
      "DELETE FROM dashboard_layouts WHERE id=$1 AND user_id=$2 AND name <> 'default'",
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'layout not found (or it is the default)' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
