const router = require('express').Router();
const { query } = require('../db');
const portfolio = require('../lib/portfolio');

// Load a user's holdings joined with security + account info.
async function loadHoldings(userId) {
  const { rows } = await query(
    `SELECT h.quantity, h.institution_price, h.institution_value, h.cost_basis, h.as_of,
            s.ticker_symbol, s.name, s.type, s.close_price, s.is_cash_equivalent,
            a.name AS account_name
     FROM holdings h
     JOIN securities s ON s.security_id = h.security_id
     JOIN accounts a ON a.id = h.account_id
     WHERE h.user_id = $1
     ORDER BY h.institution_value DESC NULLS LAST`,
    [userId]
  );
  return rows;
}

// Full read-only portfolio picture — shared by the API and the MCP read tools.
async function getPortfolioForUser(userId) {
  const rows = await loadHoldings(userId);
  const byTicker = portfolio.allocationByTicker(rows);
  const t = await query('SELECT targets, drift_threshold FROM target_allocations WHERE user_id=$1', [userId]);
  const target = t.rows[0];
  return {
    total_value: Math.round(portfolio.totalValue(rows) * 100) / 100,
    position_count: rows.length,
    positions: portfolio.enrichPositions(rows),
    allocation_by_type: portfolio.allocationByType(rows),
    target: target ? target.targets : null,
    drift: target ? portfolio.drift(byTicker, target.targets, Number(target.drift_threshold)) : null,
  };
}

// GET /api/investments/holdings
router.get('/holdings', async (req, res, next) => {
  try {
    const rows = await loadHoldings(req.user.id);
    res.json({
      total_value: Math.round(portfolio.totalValue(rows) * 100) / 100,
      count: rows.length,
      positions: portfolio.enrichPositions(rows),
    });
  } catch (err) { next(err); }
});

// GET /api/investments/allocation — by type + by ticker + drift vs target
router.get('/allocation', async (req, res, next) => {
  try {
    const rows = await loadHoldings(req.user.id);
    const byTicker = portfolio.allocationByTicker(rows);
    const t = await query('SELECT targets, drift_threshold FROM target_allocations WHERE user_id=$1', [req.user.id]);
    const target = t.rows[0];
    res.json({
      by_type: portfolio.allocationByType(rows),
      by_ticker: byTicker,
      target: target ? target.targets : null,
      drift: target ? portfolio.drift(byTicker, target.targets, Number(target.drift_threshold)) : null,
    });
  } catch (err) { next(err); }
});

// GET /api/investments/performance?days=180 — portfolio value over time
router.get('/performance', async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days || '180', 10) || 180, 730);
    const { rows } = await query(
      `SELECT snapshot_date, total_value, total_cost_basis FROM portfolio_snapshots
       WHERE user_id=$1 AND snapshot_date >= CURRENT_DATE - $2 ORDER BY snapshot_date`,
      [req.user.id, days]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/investments/target — the user's target allocation (or null)
router.get('/target', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT targets, drift_threshold FROM target_allocations WHERE user_id=$1', [req.user.id]);
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

// PUT /api/investments/target — set target weights (fractions summing to <= 1)
router.put('/target', async (req, res, next) => {
  try {
    const { targets, drift_threshold } = req.body || {};
    if (!targets || typeof targets !== 'object' || Array.isArray(targets)) {
      return res.status(400).json({ error: 'targets object required, e.g. {"VTI":0.6,"BND":0.4}' });
    }
    const sum = Object.values(targets).reduce((t, v) => t + (Number(v) || 0), 0);
    if (sum > 1.0001) return res.status(400).json({ error: 'target weights must sum to <= 1.0 (use fractions like 0.6)' });
    const thr = drift_threshold == null ? 0.05 : Number(drift_threshold);
    const { rows } = await query(
      `INSERT INTO target_allocations (user_id, targets, drift_threshold, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (user_id) DO UPDATE SET targets=$2, drift_threshold=$3, updated_at=NOW()
       RETURNING targets, drift_threshold`,
      [req.user.id, JSON.stringify(targets), thr]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.getPortfolioForUser = getPortfolioForUser;
