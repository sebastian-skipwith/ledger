const router = require('express').Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');
const { syncTransactions, plaid } = require('./plaid');
const { decryptSecret } = require('../lib/crypto');

// ── Plaid webhook signature verification ───────────────────────────────
// Plaid signs every webhook with an ES256 JWT in the `plaid-verification`
// header; the JWT carries a SHA-256 of the request body. We verify the
// signature against Plaid's published key (cached per key id) and confirm the
// body hash, so a forged POST can't trigger syncs or inject alerts.
//
// Requires the raw request body — index.js stashes it on req.rawBody via the
// express.json({ verify }) hook.
const keyCache = new Map();
async function getVerificationPem(kid) {
  if (keyCache.has(kid)) return keyCache.get(kid);
  const { data } = await plaid.webhookVerificationKeyGet({ key_id: kid });
  const pem = crypto.createPublicKey({ key: data.key, format: 'jwk' })
    .export({ type: 'spki', format: 'pem' });
  keyCache.set(kid, pem);
  return pem;
}

// Returns { ok, reason }. Throws only on infrastructure errors (e.g. the key
// fetch fails) — the caller fails OPEN on a throw (so a transient Plaid/key
// issue never silently breaks syncing) but fails CLOSED on a bad signature.
async function verifyWebhook(req) {
  const token = req.headers['plaid-verification'];
  if (!token) return { ok: false, reason: 'missing plaid-verification header' };
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || decoded.header.alg !== 'ES256') return { ok: false, reason: 'unexpected JWT alg' };
  const pem = await getVerificationPem(decoded.header.kid); // may throw (infra)
  try {
    const claims = jwt.verify(token, pem, { algorithms: ['ES256'], maxAge: '5m' });
    const bodyHash = crypto.createHash('sha256')
      .update(req.rawBody || Buffer.from('')).digest('hex');
    if (claims.request_body_sha256 !== bodyHash) return { ok: false, reason: 'body hash mismatch' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'signature invalid: ' + e.message };
  }
}

// POST /api/webhooks/plaid
// Plaid fires these when account data changes
router.post('/plaid', async (req, res) => {
  // Reject forged webhooks; fail-open only on an infrastructure error.
  let verified = false, infraError = false;
  try {
    const r = await verifyWebhook(req);
    verified = r.ok;
    if (!r.ok) console.warn('Plaid webhook rejected —', r.reason);
  } catch (err) {
    infraError = true;
    console.error('Plaid webhook verification infrastructure error (processing anyway):', err.message);
  }
  if (!verified && !infraError) return res.status(401).json({ error: 'invalid webhook signature' });

  const { webhook_type, webhook_code, item_id, error } = req.body;

  // Always acknowledge immediately
  res.json({ received: true });

  try {
    if (webhook_type === 'TRANSACTIONS') {
      const { rows } = await query(
        'SELECT id, user_id, access_token FROM plaid_items WHERE item_id=$1',
        [item_id]
      );
      if (!rows.length) return;
      const item = rows[0];

      if (['SYNC_UPDATES_AVAILABLE', 'INITIAL_UPDATE', 'DEFAULT_UPDATE'].includes(webhook_code)) {
        await syncTransactions(item.user_id, item.id, decryptSecret(item.access_token));
        console.log(`Webhook: synced transactions for item ${item_id}`);
      }
    }

    if (webhook_type === 'ITEM' && webhook_code === 'ERROR') {
      const { rows } = await query(
        'SELECT user_id FROM plaid_items WHERE item_id=$1', [item_id]
      );
      if (rows.length) {
        await query(
          `INSERT INTO alerts (user_id, type, title, body, metadata)
           VALUES ($1,'error','Bank connection error','Your connection needs to be re-authenticated.',$2)`,
          [rows[0].user_id, JSON.stringify({ item_id, error })]
        );
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});

module.exports = router;
