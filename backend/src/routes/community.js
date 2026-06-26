const router = require('express').Router();
const { query } = require('../db');
const { STRATEGIES } = require('../lib/strategies');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('id', (req, res, next, id) => (UUID.test(id) ? next() : res.status(400).json({ error: 'invalid id' })));

const KINDS = ['layout', 'prompt', 'strategy'];
const clean = (s, max) => Array.from(String(s == null ? '' : s)).filter((c) => { const n = c.charCodeAt(0); return n >= 32 && n !== 127; }).join('').trim().slice(0, max);

// Build a SAFE, self-contained payload from the user's own data — never trust a
// client blob for sensitive fields. Layouts carry only tile geometry (no money);
// strategies carry only a validated strategy_key + params (account_id stripped).
function buildPayload(req, userId) {
  const kind = req.body?.kind;
  if (kind === 'prompt') {
    const text = clean(req.body?.payload?.text ?? req.body?.text, 4000);
    if (!text) throw Object.assign(new Error('prompt text is required'), { status: 400 });
    return { kind, payload: { text } };
  }
  if (kind === 'layout') {
    const tiles = Array.isArray(req.body?.payload?.tiles) ? req.body.payload.tiles : [];
    const safe = tiles.slice(0, 40).map((t) => ({
      key: String(t.key || '').slice(0, 64), x: +t.x || 0, y: +t.y || 0,
      w: +t.w || 3, h: +t.h || 3, theme: t.theme ? String(t.theme).slice(0, 32) : null, visible: t.visible !== false,
    })).filter((t) => t.key);
    if (!safe.length) throw Object.assign(new Error('layout has no tiles'), { status: 400 });
    return { kind, payload: { tiles: safe }, async: false };
  }
  return null; // strategy handled async (needs DB) in the route
}

// GET /api/community — the public feed (the ONLY non-user-scoped read here).
router.get('/', async (req, res, next) => {
  try {
    const kind = KINDS.includes(req.query.kind) ? req.query.kind : null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const params = [req.user.id];
    let where = "s.status='active'";
    if (kind) { params.push(kind); where += ` AND s.kind=$${params.length}`; }
    params.push(limit, offset);
    const { rows } = await query(
      `SELECT s.id, s.author_name, s.kind, s.title, s.description, s.payload,
              s.like_count, s.install_count, s.created_at,
              (l.user_id IS NOT NULL) AS liked_by_me,
              (ins.user_id IS NOT NULL) AS installed_by_me,
              (s.user_id = $1) AS mine
       FROM shared_items s
       LEFT JOIN shared_item_likes l ON l.shared_item_id=s.id AND l.user_id=$1
       LEFT JOIN shared_item_installs ins ON ins.shared_item_id=s.id AND ins.user_id=$1
       WHERE ${where}
       ORDER BY s.like_count DESC, s.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/community/mine — the user's own published items
router.get('/mine', async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT id, kind, title, description, like_count, install_count, status, created_at FROM shared_items WHERE user_id=$1 AND status<>'removed' ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/community — publish a layout / prompt / strategy
router.post('/', async (req, res, next) => {
  try {
    const kind = req.body?.kind;
    if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be layout|prompt|strategy' });
    const title = clean(req.body?.title, 80);
    if (!title) return res.status(400).json({ error: 'title is required' });
    const description = clean(req.body?.description, 500);

    let payload;
    if (kind === 'strategy') {
      let strategy_key, sparams;
      if (req.body?.source_id && UUID.test(req.body.source_id)) {
        const r = await query('SELECT strategy_key, params FROM strategies WHERE id=$1 AND user_id=$2', [req.body.source_id, req.user.id]);
        if (!r.rows.length) return res.status(404).json({ error: 'strategy not found' });
        strategy_key = r.rows[0].strategy_key; sparams = r.rows[0].params || {};
      } else {
        strategy_key = req.body?.payload?.strategy_key;
        sparams = req.body?.payload?.params || {};
      }
      if (!STRATEGIES[strategy_key]) return res.status(400).json({ error: 'unknown strategy_key' });
      if (sparams && typeof sparams === 'object') delete sparams.account_id; // never share account ids
      payload = { strategy_key, params: sparams };
    } else {
      const built = buildPayload(req, req.user.id);
      payload = built.payload;
    }

    const authorName = clean(req.user.full_name, 60) || 'Anonymous';
    const { rows } = await query(
      'INSERT INTO shared_items (user_id, author_name, kind, title, description, payload) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, kind, title, created_at',
      [req.user.id, authorName, kind, title, description, JSON.stringify(payload)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// POST /api/community/:id/like — toggle like
router.post('/:id/like', async (req, res, next) => {
  try {
    const ins = await query('INSERT INTO shared_item_likes (shared_item_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1', [req.params.id, req.user.id]);
    if (ins.rowCount) { await query('UPDATE shared_items SET like_count=like_count+1 WHERE id=$1', [req.params.id]); return res.json({ liked: true }); }
    await query('DELETE FROM shared_item_likes WHERE shared_item_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    await query('UPDATE shared_items SET like_count=GREATEST(0, like_count-1) WHERE id=$1', [req.params.id]);
    res.json({ liked: false });
  } catch (err) { next(err); }
});

// POST /api/community/:id/install — install into the user's account.
// SAFETY: a shared strategy is ALWAYS created paper + disabled; it can never move
// real money on import. Live still requires the human-only approval chokepoint.
router.post('/:id/install', async (req, res, next) => {
  try {
    const item = (await query("SELECT id, kind, payload FROM shared_items WHERE id=$1 AND status='active'", [req.params.id])).rows[0];
    if (!item) return res.status(404).json({ error: 'item not found' });
    const first = await query('INSERT INTO shared_item_installs (shared_item_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1', [item.id, req.user.id]);
    if (first.rowCount) await query('UPDATE shared_items SET install_count=install_count+1 WHERE id=$1', [item.id]);

    if (item.kind === 'strategy') {
      const p = item.payload || {};
      if (!STRATEGIES[p.strategy_key]) return res.status(400).json({ error: 'this strategy is no longer valid' });
      const params = (p.params && typeof p.params === 'object') ? p.params : {};
      delete params.account_id;
      const s = await query(
        "INSERT INTO strategies (user_id, strategy_key, params, mode, enabled) VALUES ($1,$2,$3,'paper',false) RETURNING id, strategy_key, params, mode, enabled",
        [req.user.id, p.strategy_key, JSON.stringify(params)]
      );
      return res.json({ kind: 'strategy', strategy: s.rows[0], note: 'Added as PAPER and disabled. Review and enable it yourself in Strategies — importing can never move real money.' });
    }
    // layout / prompt are applied client-side from the returned payload
    res.json({ kind: item.kind, payload: item.payload });
  } catch (err) { next(err); }
});

// POST /api/community/:id/report — flag; auto-hide after enough distinct reports
router.post('/:id/report', async (req, res, next) => {
  try {
    const ins = await query('INSERT INTO shared_item_reports (shared_item_id, user_id, reason) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1', [req.params.id, req.user.id, clean(req.body?.reason, 200)]);
    if (ins.rowCount) {
      const c = await query('UPDATE shared_items SET report_count=report_count+1 WHERE id=$1 RETURNING report_count', [req.params.id]);
      if (c.rows[0] && c.rows[0].report_count >= 3) await query("UPDATE shared_items SET status='hidden' WHERE id=$1", [req.params.id]);
    }
    res.json({ reported: true });
  } catch (err) { next(err); }
});

// DELETE /api/community/:id — soft-delete your own item
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query("UPDATE shared_items SET status='removed' WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'item not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
