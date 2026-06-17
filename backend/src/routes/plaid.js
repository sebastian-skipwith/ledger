const router = require('express').Router();
const { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } = require('plaid');
const { query, getClient } = require('../db');
const { encryptSecret, decryptSecret } = require('../lib/crypto');

// Initialize Plaid client
const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});
const plaid = new PlaidApi(plaidConfig);

// POST /api/plaid/create-link-token
// Returns a link_token to initialize Plaid Link in the frontend
router.post('/create-link-token', async (req, res, next) => {
  try {
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: req.user.id },
      client_name: 'Persistence',
      products: [Products.Transactions, Products.Investments, Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: 'en',
      webhook: `${process.env.API_URL}/api/webhooks/plaid`,
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    next(err);
  }
});

// POST /api/plaid/exchange-token
// Exchange public_token from Plaid Link for access_token, then sync accounts
router.post('/exchange-token', async (req, res, next) => {
  const client = await getClient();
  try {
    const { public_token, institution } = req.body;
    const { data } = await plaid.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = data;

    await client.query('BEGIN');

    // Store Plaid item
    const itemResult = await client.query(
      `INSERT INTO plaid_items (user_id, item_id, access_token, institution_id, institution_name)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (item_id) DO UPDATE SET access_token=$3
       RETURNING id`,
      [req.user.id, item_id, encryptSecret(access_token), institution?.institution_id, institution?.name]
    );
    const plaidItemId = itemResult.rows[0].id;

    // Fetch and store accounts
    const accountsResp = await plaid.accountsGet({ access_token });
    const accounts = accountsResp.data.accounts;

    for (const acct of accounts) {
      await client.query(
        `INSERT INTO accounts
           (user_id, plaid_item_id, plaid_account_id, name, official_name, type, subtype,
            current_balance, available_balance, currency, institution_name, mask)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (plaid_account_id) DO UPDATE SET
           previous_balance=accounts.current_balance, current_balance=$8, available_balance=$9, updated_at=NOW()`,
        [
          req.user.id, plaidItemId, acct.account_id,
          acct.name, acct.official_name, acct.type, acct.subtype,
          acct.balances.current, acct.balances.available, acct.balances.iso_currency_code,
          institution?.name, acct.mask,
        ]
      );
    }

    await client.query('COMMIT');

    // Kick off async transaction sync (don't await — returns immediately)
    syncTransactions(req.user.id, plaidItemId, access_token).catch(console.error);

    res.json({ success: true, accounts_synced: accounts.length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/plaid/sync
// Manually trigger a sync for all user items
router.post('/sync', async (req, res, next) => {
  try {
    const { rows: items } = await query(
      'SELECT * FROM plaid_items WHERE user_id = $1', [req.user.id]
    );
    for (const item of items) {
      syncTransactions(req.user.id, item.id, decryptSecret(item.access_token)).catch(console.error);
    }
    res.json({ message: `Syncing ${items.length} institution(s) in background` });
  } catch (err) {
    next(err);
  }
});

// GET /api/plaid/items
router.get('/items', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, institution_name, last_synced_at, created_at FROM plaid_items WHERE user_id = $1',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/plaid/items/:id
router.delete('/items/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT access_token FROM plaid_items WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });
    // Best-effort revoke at Plaid; tolerate failures (e.g. a leftover sandbox
    // token under a production key, or an already-invalid item) so local
    // cleanup still proceeds.
    try { await plaid.itemRemove({ access_token: decryptSecret(rows[0].access_token) }); }
    catch (e) { console.warn('itemRemove failed (continuing with local delete):', e?.response?.data?.error_code || e.message); }
    // Remove local data explicitly (transactions -> accounts -> item), then re-snapshot.
    await query('DELETE FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE plaid_item_id=$1)', [req.params.id]);
    await query('DELETE FROM accounts WHERE plaid_item_id=$1', [req.params.id]);
    await query('DELETE FROM plaid_items WHERE id=$1', [req.params.id]);
    await snapshotNetWorth(req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

async function syncTransactions(userId, plaidItemId, accessToken) {
  let cursor = null;
  const { rows } = await query('SELECT cursor FROM plaid_items WHERE id=$1', [plaidItemId]);
  cursor = rows[0]?.cursor || null;

  let hasMore = true;
  let added = 0, modified = 0, removed = 0;

  while (hasMore) {
    const resp = await plaid.transactionsSync({
      access_token: accessToken,
      cursor: cursor || undefined,
    });
    const data = resp.data;

    // Get account_id → local UUID map
    const { rows: accts } = await query(
      'SELECT id, plaid_account_id FROM accounts WHERE plaid_item_id=$1', [plaidItemId]
    );
    const acctMap = Object.fromEntries(accts.map(a => [a.plaid_account_id, a.id]));

    for (const txn of data.added) {
      const localAcctId = acctMap[txn.account_id];
      if (!localAcctId) continue;
      await query(
        `INSERT INTO transactions
           (user_id, account_id, plaid_txn_id, amount, date, name, merchant_name, category, pending)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (plaid_txn_id) DO NOTHING`,
        [userId, localAcctId, txn.transaction_id, txn.amount, txn.date,
         txn.name, txn.merchant_name, txn.category, txn.pending]
      );
      added++;
    }

    for (const txn of data.modified) {
      await query(
        `UPDATE transactions SET amount=$1, pending=$2, name=$3
         WHERE plaid_txn_id=$4 AND user_id=$5`,
        [txn.amount, txn.pending, txn.name, txn.transaction_id, userId]
      );
      modified++;
    }

    for (const txn of data.removed) {
      await query('DELETE FROM transactions WHERE plaid_txn_id=$1', [txn.transaction_id]);
      removed++;
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  // Save cursor + last_synced_at
  await query(
    'UPDATE plaid_items SET cursor=$1, last_synced_at=NOW() WHERE id=$2',
    [cursor, plaidItemId]
  );

  // Refresh account balances
  const { rows: items } = await query('SELECT access_token FROM plaid_items WHERE id=$1', [plaidItemId]);
  if (items.length) {
    const balResp = await plaid.accountsGet({ access_token: decryptSecret(items[0].access_token) });
    for (const acct of balResp.data.accounts) {
      await query(
        `UPDATE accounts SET previous_balance=current_balance, current_balance=$1, available_balance=$2, updated_at=NOW()
         WHERE plaid_account_id=$3`,
        [acct.balances.current, acct.balances.available, acct.account_id]
      );
    }
  }

  // Snapshot net worth
  await snapshotNetWorth(userId);

  console.log(`Sync complete for item ${plaidItemId}: +${added} ~${modified} -${removed}`);
}

async function snapshotNetWorth(userId) {
  // Pull every account so we can compute per-metric breakdown, not just totals.
  const { rows: accts } = await query(
    `SELECT type, subtype, current_balance
     FROM accounts WHERE user_id=$1 AND is_hidden=false`, [userId]
  );

  const num = (v) => parseFloat(v) || 0;
  const isRetirement = (a) => ['401k','ira','roth'].some(k => (a.subtype || '').toLowerCase().includes(k));

  const cash = accts.filter(a => a.type === 'depository').reduce((t,a)=>t+num(a.current_balance),0);
  const investments = accts.filter(a => a.type === 'investment' && !isRetirement(a)).reduce((t,a)=>t+num(a.current_balance),0);
  const retirement = accts.filter(a => a.type === 'investment' && isRetirement(a)).reduce((t,a)=>t+num(a.current_balance),0);
  const debt = accts.filter(a => ['credit','loan'].includes(a.type)).reduce((t,a)=>t+Math.abs(num(a.current_balance)),0);

  let assets = 0, liabilities = 0;
  for (const a of accts) {
    const val = num(a.current_balance);
    if (['credit','loan'].includes(a.type)) liabilities += Math.abs(val);
    else assets += val;
  }

  const breakdown = { cash, investments, retirement, debt, net_worth: assets - liabilities };

  await query(
    `INSERT INTO net_worth_snapshots (user_id, snapshot_date, total_assets, total_liabilities, net_worth, breakdown)
     VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
     ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
       total_assets=$2, total_liabilities=$3, net_worth=$4, breakdown=$5`,
    [userId, assets, liabilities, assets - liabilities, JSON.stringify(breakdown)]
  );
}

module.exports = router;
module.exports.syncTransactions = syncTransactions;
module.exports.plaid = plaid; // used by routes/webhooks.js for signature verification
