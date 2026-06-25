const router = require('express').Router();
const { query } = require('../db');
const { STRATEGIES } = require('../lib/strategies');
const exec = require('../lib/executor');
const { getPortfolioForUser } = require('./investments');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('id', (req, res, next, id) => (UUID.test(id) ? next() : res.status(400).json({ error: 'invalid id' })));

// Build the (pure) evaluation context from the user's live portfolio.
async function buildContext(userId, params) {
  const pf = await getPortfolioForUser(userId);
  const positions = (pf.positions || []).map((p) => ({ ticker: p.ticker, quantity: p.quantity, price: p.price, value: p.value }));
  const prices = {};
  for (const p of positions) if (p.ticker) prices[p.ticker] = p.price;
  return { ctx: { positions, cash: 0, params: params || {} }, prices, total: pf.total_value };
}

// Run a strategy's evaluator and stamp a current price onto each proposed order.
function evaluateStrategy(strategyKey, ctx, prices) {
  const def = STRATEGIES[strategyKey];
  if (!def) throw Object.assign(new Error('unknown strategy'), { status: 400 });
  const orders = def.evaluate(ctx) || [];
  return orders.map((o) => ({ ...o, price: prices[o.ticker] ?? null }));
}

// ── Catalog + the user's configured strategies ──
router.get('/', async (req, res, next) => {
  try {
    const catalog = Object.values(STRATEGIES).map((s) => ({ key: s.key, label: s.label, paramSchema: s.paramSchema }));
    const { rows } = await query(
      'SELECT id, strategy_key, params, mode, enabled, account_id, last_run_at, created_at FROM strategies WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ catalog, strategies: rows });
  } catch (err) { next(err); }
});

// ── Approval queue (define BEFORE /:id routes so "actions" isn't read as an id) ──
router.get('/actions', async (req, res, next) => {
  try {
    const status = req.query.status || 'proposed';
    const { rows } = await query(
      `SELECT id, account_id, strategy_id, source, type, mode, payload, rationale, status,
              approved_at, executed_at, result, created_at
       FROM proposed_actions WHERE user_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT 200`,
      [req.user.id, status]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// THE real-money chokepoint. Human-only (never an MCP tool). Paper actions are
// already executed, so this is the LIVE path: re-check every gate + risk limit
// at approve time, then place the order. Any failure → 403, nothing executes.
router.post('/actions/:id/approve', async (req, res, next) => {
  try {
    const a = (await query('SELECT * FROM proposed_actions WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!a) return res.status(404).json({ error: 'action not found' });
    if (a.status !== 'proposed') return res.status(409).json({ error: `action is ${a.status}` });
    if (a.mode !== 'live') return res.status(400).json({ error: 'only live actions require approval; paper actions auto-execute' });

    const account = (await query('SELECT * FROM accounts WHERE id=$1 AND user_id=$2', [a.account_id, req.user.id])).rows[0];
    const user = (await query('SELECT id, email, trading_halted FROM users WHERE id=$1', [req.user.id])).rows[0];

    const gate = await exec.checkGates(account, user);
    if (!gate.ok) return res.status(403).json({ error: 'blocked', reason: gate.reason });
    const order = a.payload;
    const risk = await exec.checkRiskLimits(req.user.id, a.account_id, order);
    if (!risk.ok) return res.status(403).json({ error: 'blocked', reason: risk.reason });

    // Atomically claim the action BEFORE placing the order, so two concurrent
    // approvals of the same action can never both reach the broker (double-fill).
    const claim = await query(
      "UPDATE proposed_actions SET status='approved', approved_by=$2, approved_at=NOW() WHERE id=$1 AND user_id=$2 AND status='proposed' RETURNING id",
      [a.id, req.user.id]
    );
    if (!claim.rowCount) return res.status(409).json({ error: 'action already being processed' });

    let result, status;
    try {
      const filled = await exec.placeLiveOrder(order);
      result = { ...filled, notional: order.notional };
      status = 'executed';
    } catch (e) {
      result = { error: String(e.message || e) };
      status = 'failed';
    }
    const { rows } = await query(
      `UPDATE proposed_actions SET status=$1,
         executed_at=CASE WHEN $1='executed' THEN NOW() ELSE executed_at END,
         broker_order_id=$2, result=$3 WHERE id=$4 RETURNING *`,
      [status, result.id || null, JSON.stringify(result), a.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/actions/:id/reject', async (req, res, next) => {
  try {
    const { rows } = await query(
      "UPDATE proposed_actions SET status='rejected' WHERE id=$1 AND user_id=$2 AND status='proposed' RETURNING id, status",
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'no proposed action with that id' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Create / update / delete a strategy ──
router.post('/', async (req, res, next) => {
  try {
    const { strategy_key, params, mode, account_id } = req.body || {};
    if (!STRATEGIES[strategy_key]) return res.status(400).json({ error: 'unknown strategy_key', valid: Object.keys(STRATEGIES) });
    if (params && (typeof params !== 'object' || Array.isArray(params))) return res.status(400).json({ error: 'params must be an object' });
    const m = mode === 'live' ? 'live' : 'paper';
    const { rows } = await query(
      `INSERT INTO strategies (user_id, strategy_key, params, mode, account_id, enabled)
       VALUES ($1,$2,$3,$4,$5,false) RETURNING id, strategy_key, params, mode, enabled, account_id, created_at`,
      [req.user.id, strategy_key, JSON.stringify(params || {}), m, account_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { params, mode, enabled, account_id } = req.body || {};
    const sets = [], vals = [];
    if (params !== undefined) { if (typeof params !== 'object' || Array.isArray(params)) return res.status(400).json({ error: 'params must be an object' }); sets.push(`params=$${sets.length + 1}`); vals.push(JSON.stringify(params)); }
    if (mode !== undefined) { sets.push(`mode=$${sets.length + 1}`); vals.push(mode === 'live' ? 'live' : 'paper'); }
    if (enabled !== undefined) { sets.push(`enabled=$${sets.length + 1}`); vals.push(!!enabled); }
    if (account_id !== undefined) { sets.push(`account_id=$${sets.length + 1}`); vals.push(account_id || null); }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    vals.push(req.params.id, req.user.id);
    const { rows } = await query(
      `UPDATE strategies SET ${sets.join(', ')} WHERE id=$${vals.length - 1} AND user_id=$${vals.length} RETURNING id, strategy_key, params, mode, enabled, account_id`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'strategy not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM strategies WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'strategy not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Preview: run the evaluator now, return proposed orders, persist NOTHING ──
router.post('/:id/preview', async (req, res, next) => {
  try {
    const s = (await query('SELECT * FROM strategies WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!s) return res.status(404).json({ error: 'strategy not found' });
    const { ctx, prices } = await buildContext(req.user.id, s.params);
    res.json({ strategy_key: s.strategy_key, mode: s.mode, orders: evaluateStrategy(s.strategy_key, ctx, prices) });
  } catch (err) { next(err); }
});

// ── Run: evaluate → persist proposed_actions. Paper auto-executes (simulated).
// Live stays 'proposed' awaiting human approval. NEVER moves real money here.
router.post('/:id/run', async (req, res, next) => {
  try {
    const s = (await query('SELECT * FROM strategies WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!s) return res.status(404).json({ error: 'strategy not found' });
    const { ctx, prices } = await buildContext(req.user.id, s.params);
    const orders = evaluateStrategy(s.strategy_key, ctx, prices);

    const created = [];
    for (const order of orders) {
      let status = 'proposed', result = null;
      if (s.mode === 'paper') { result = exec.executePaper(order); status = 'executed'; }
      const { rows } = await query(
        `INSERT INTO proposed_actions (user_id, account_id, strategy_id, source, type, mode, payload, rationale, status, result, executed_at)
         VALUES ($1,$2,$3,'strategy','trade',$4,$5,$6,$7,$8,CASE WHEN $7='executed' THEN NOW() ELSE NULL END)
         RETURNING id, type, mode, payload, rationale, status, result, created_at`,
        [req.user.id, s.account_id || null, s.id, s.mode, JSON.stringify(order), order.reason || null, status, result ? JSON.stringify(result) : null]
      );
      created.push(rows[0]);
    }
    await query('UPDATE strategies SET last_run_at=NOW() WHERE id=$1', [s.id]);
    res.json({ mode: s.mode, count: created.length, actions: created, note: s.mode === 'live' ? 'Live orders are PROPOSED — approve each in the queue to execute.' : 'Paper orders executed in simulation (no real money).' });
  } catch (err) { next(err); }
});

module.exports = router;
