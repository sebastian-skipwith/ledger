const router = require('express').Router();
const { query } = require('../db');
const { syncTransactions } = require('./plaid');

// POST /api/webhooks/plaid
// Plaid fires these when account data changes
router.post('/plaid', async (req, res) => {
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
        await syncTransactions(item.user_id, item.id, item.access_token);
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
