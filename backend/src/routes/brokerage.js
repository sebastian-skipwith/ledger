const router = require('express').Router();
const { query } = require('../db');
const { encryptSecret, isConfigured } = require('../lib/crypto');
const exec = require('../lib/executor');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function summarizeAccount(a) {
  return {
    status: a.status,
    buying_power: a.buying_power != null ? Number(a.buying_power) : null,
    cash: a.cash != null ? Number(a.cash) : null,
    portfolio_value: a.portfolio_value != null ? Number(a.portfolio_value) : null,
    currency: a.currency || 'USD',
  };
}

// POST /api/brokerage/connect  { env: 'paper'|'live', key_id, secret, ack }
// Stores the USER'S OWN brokerage keys (encrypted) after validating them against
// the broker. Connecting a LIVE account requires accepting the disclosure (ack).
router.post('/connect', async (req, res, next) => {
  try {
    const env = req.body?.env === 'live' ? 'live' : 'paper';
    const key_id = String(req.body?.key_id || '').trim();
    const secret = String(req.body?.secret || '').trim();
    if (!key_id || !secret) return res.status(400).json({ error: 'key_id and secret are required' });
    if (!isConfigured()) {
      return res.status(503).json({ error: 'Encryption is not configured on the server — brokerage keys cannot be stored securely. Set DATA_ENCRYPTION_KEY first.' });
    }
    if (env === 'live' && req.body?.ack !== true) {
      return res.status(400).json({ error: 'To connect a LIVE brokerage you must accept the self-directed trading disclosure (send ack: true). You are trading your own money on your own account; Persistence is a tool, not an adviser.' });
    }
    // Validate the keys by reading the account — never store keys we can't use.
    let account;
    try {
      account = await exec.alpacaRequest({ key_id, secret }, env, 'GET', '/v2/account');
    } catch (e) {
      return res.status(400).json({ error: 'The broker rejected those keys: ' + e.message });
    }
    await query(
      `INSERT INTO broker_credentials (user_id, broker, env, key_id_enc, secret_enc)
       VALUES ($1,'alpaca',$2,$3,$4)
       ON CONFLICT (user_id, broker, env) DO UPDATE SET key_id_enc=$3, secret_enc=$4, created_at=NOW()`,
      [req.user.id, env, encryptSecret(key_id), encryptSecret(secret)]
    );
    res.json({ connected: true, broker: 'alpaca', env, account: summarizeAccount(account) });
  } catch (err) { next(err); }
});

// GET /api/brokerage — connection status (no secrets) + live account summary.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT env, created_at FROM broker_credentials WHERE user_id=$1 AND broker='alpaca' ORDER BY env",
      [req.user.id]
    );
    const connections = [];
    for (const r of rows) {
      const creds = await exec.getUserBrokerCreds(req.user.id, r.env);
      let account = null, error = null;
      if (creds) {
        try { account = summarizeAccount(await exec.alpacaRequest(creds, r.env, 'GET', '/v2/account')); }
        catch (e) { error = e.message; }
      }
      connections.push({ broker: 'alpaca', env: r.env, connected_at: r.created_at, account, error });
    }
    res.json({ self_directed_enabled: exec.selfDirectedEnabled(), connections });
  } catch (err) { next(err); }
});

// DELETE /api/brokerage/:env — disconnect a connected brokerage.
router.delete('/:env', async (req, res, next) => {
  try {
    const env = req.params.env === 'live' ? 'live' : 'paper';
    await query("DELETE FROM broker_credentials WHERE user_id=$1 AND broker='alpaca' AND env=$2", [req.user.id, env]);
    res.json({ disconnected: true, env });
  } catch (err) { next(err); }
});

// POST /api/brokerage/execute/:actionId — SELF-DIRECTED execution on the user's
// OWN connected brokerage. Calling this IS the user's per-trade approval. Gated:
// SELF_DIRECTED_TRADING_ENABLED + the user's own keys + server-side risk limits.
// An atomic claim prevents a double-fill.
router.post('/execute/:actionId', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.actionId)) return res.status(400).json({ error: 'invalid action id' });
    if (!exec.selfDirectedEnabled()) {
      return res.status(403).json({ error: 'Self-directed trading is turned off (SELF_DIRECTED_TRADING_ENABLED).' });
    }
    const a = (await query('SELECT * FROM proposed_actions WHERE id=$1 AND user_id=$2', [req.params.actionId, req.user.id])).rows[0];
    if (!a) return res.status(404).json({ error: 'action not found' });
    if (a.status !== 'proposed') return res.status(409).json({ error: `action is ${a.status}` });

    const env = a.mode === 'live' ? 'live' : 'paper';
    const creds = await exec.getUserBrokerCreds(req.user.id, env);
    if (!creds) return res.status(400).json({ error: `Connect your ${env} brokerage first.` });

    const order = a.payload;
    const risk = await exec.checkRiskLimits(req.user.id, a.account_id, order, { requireAllowlist: false });
    if (!risk.ok) return res.status(403).json({ error: 'blocked', reason: risk.reason });

    // Claim before placing so two concurrent executes can't double-fill.
    const claim = await query(
      "UPDATE proposed_actions SET status='approved', approved_by=$2, approved_at=NOW() WHERE id=$1 AND user_id=$2 AND status='proposed' RETURNING id",
      [a.id, req.user.id]
    );
    if (!claim.rowCount) return res.status(409).json({ error: 'action already being processed' });

    let result, status;
    try {
      const filled = await exec.placeOrderForUser(creds, env, order);
      result = { ...filled, venue: `alpaca_${env}`, self_directed: true };
      status = 'executed';
    } catch (e) {
      result = { error: String(e.message || e) };
      status = 'failed';
    }
    const { rows } = await query(
      `UPDATE proposed_actions SET status=$1, executed_at=CASE WHEN $1='executed' THEN NOW() ELSE executed_at END,
         broker_order_id=$2, result=$3 WHERE id=$4 RETURNING *`,
      [status, result.id || null, JSON.stringify(result), a.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
