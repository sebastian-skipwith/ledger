const { query } = require('../db');

// ─────────────────────────────────────────────────────────────────────────
// Trade executor + SAFETY GATES. Real money cannot move unless EVERY gate
// passes. All gates default CLOSED — a fresh deploy with no config can never
// place a live order. Paper execution is a pure simulation (no broker, no money).
// ─────────────────────────────────────────────────────────────────────────

// Global env flags — both OFF unless explicitly set on Railway.
const liveGloballyEnabled = () => process.env.LIVE_TRADING_ENABLED === 'true';
const usersLiveEnabled = () => process.env.USERS_LIVE_ENABLED === 'true';

const DEFAULT_LIMITS = { max_order_notional: 500, max_daily_notional: 2000, max_position_pct: 0.25, allowlist: [] };

function isOwnerEmail(email) {
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && admins.includes(email.toLowerCase());
}

// The single chokepoint every LIVE order passes through. Returns { ok, reason }.
async function checkGates(account, user) {
  if (!liveGloballyEnabled()) return { ok: false, reason: 'Real-money trading is globally disabled (LIVE_TRADING_ENABLED is off).' };
  // Non-owner users additionally require the users flag — which stays off until
  // RIA registration + a broker/custody partner are in place.
  if (!isOwnerEmail(user.email) && !usersLiveEnabled()) {
    return { ok: false, reason: 'Live trading for users is disabled — requires RIA registration + a broker/custody partner (USERS_LIVE_ENABLED is off).' };
  }
  if (!account) return { ok: false, reason: 'Account not found.' };
  if (!account.live_enabled) return { ok: false, reason: 'This account is not enabled for live trading.' };
  if (account.trading_halted) return { ok: false, reason: 'Trading is halted on this account (kill-switch).' };
  if (user.trading_halted) return { ok: false, reason: 'Trading is halted for this user (kill-switch).' };
  const { rows } = await query("SELECT 1 FROM broker_credentials WHERE user_id=$1 AND env='live' LIMIT 1", [user.id]);
  if (!rows.length) return { ok: false, reason: 'No live broker credentials configured.' };
  return { ok: true };
}

async function getLimits(userId, accountId) {
  const { rows } = await query(
    'SELECT * FROM risk_limits WHERE user_id=$1 AND (account_id=$2 OR account_id IS NULL) ORDER BY account_id NULLS LAST LIMIT 1',
    [userId, accountId]
  );
  return rows[0] || DEFAULT_LIMITS;
}

// Server-side risk limits, re-checked at approve time for LIVE orders.
async function checkRiskLimits(userId, accountId, order) {
  const lim = await getLimits(userId, accountId);
  const notional = Number(order.notional) || 0;
  if (notional <= 0) return { ok: false, reason: 'Order notional must be positive.' };
  if (notional > Number(lim.max_order_notional)) return { ok: false, reason: `Order $${notional} exceeds the per-order cap $${lim.max_order_notional}.` };
  const allow = Array.isArray(lim.allowlist) ? lim.allowlist : [];
  if (!allow.length) return { ok: false, reason: 'No symbol allowlist is set — live trading requires an explicit allowlist.' };
  if (!allow.includes(order.ticker)) return { ok: false, reason: `${order.ticker} is not on the allowlist.` };
  const { rows } = await query(
    `SELECT COALESCE(SUM((result->>'notional')::numeric),0) AS spent FROM proposed_actions
     WHERE user_id=$1 AND mode='live' AND status='executed' AND executed_at::date = CURRENT_DATE`,
    [userId]
  );
  if (Number(rows[0].spent) + notional > Number(lim.max_daily_notional)) {
    return { ok: false, reason: `Daily live cap $${lim.max_daily_notional} would be exceeded.` };
  }
  return { ok: true };
}

// PAPER execution — pure simulation. No broker call, no money, ever.
function executePaper(order) {
  return { simulated: true, status: 'filled', ticker: order.ticker, side: order.side, notional: order.notional || null, fill_price: order.price || null, venue: 'paper' };
}

// LIVE order placement. ONLY reachable after checkGates + checkRiskLimits pass
// (which require LIVE_TRADING_ENABLED + per-account enable + allowlist + live keys
// + a human approval upstream). Inert until the owner configures all of it.
async function placeLiveOrder(order) {
  const base = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';
  const keyId = process.env.ALPACA_LIVE_KEY_ID;
  const secret = process.env.ALPACA_LIVE_SECRET;
  if (!keyId || !secret) throw new Error('Live broker keys are not configured.');
  const res = await fetch(base + '/v2/orders', {
    method: 'POST',
    headers: { 'APCA-API-KEY-ID': keyId, 'APCA-API-SECRET-KEY': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: order.ticker, notional: order.notional, side: order.side, type: 'market', time_in_force: 'day' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Broker error ${res.status}`);
  return { ...data, notional: order.notional };
}

module.exports = {
  checkGates, checkRiskLimits, executePaper, placeLiveOrder, getLimits,
  liveGloballyEnabled, usersLiveEnabled, isOwnerEmail, DEFAULT_LIMITS,
};
