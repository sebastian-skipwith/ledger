const router = require('express').Router();
const { query } = require('../db');
const { decryptSecret } = require('../lib/crypto');

// GET /api/account/export — everything we hold about the user, as a JSON download.
router.get('/export', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [accounts, transactions, bills, goals, snapshots, conversations, items] = await Promise.all([
      query(`SELECT name, official_name, type, subtype, current_balance, available_balance,
                    currency, institution_name, mask, created_at
             FROM accounts WHERE user_id=$1`, [userId]),
      query(`SELECT t.date, t.name, t.merchant_name, t.amount, t.category, t.category_custom,
                    t.pending, t.notes, a.name AS account_name
             FROM transactions t JOIN accounts a ON t.account_id=a.id
             WHERE t.user_id=$1 ORDER BY t.date DESC`, [userId]),
      query(`SELECT name, amount, frequency, next_due_date, autopay, category, active, created_at
             FROM bills WHERE user_id=$1`, [userId]),
      query(`SELECT name, type, target_amount, current_amount, target_date,
                    monthly_contribution, notes, completed, created_at
             FROM goals WHERE user_id=$1`, [userId]),
      query(`SELECT snapshot_date, total_assets, total_liabilities, net_worth, breakdown
             FROM net_worth_snapshots WHERE user_id=$1 ORDER BY snapshot_date`, [userId]),
      query(`SELECT session_id, role, content, created_at
             FROM ai_conversations WHERE user_id=$1 ORDER BY created_at`, [userId]),
      query(`SELECT institution_name, last_synced_at, created_at FROM plaid_items WHERE user_id=$1`, [userId]),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      user: { email: req.user.email, full_name: req.user.full_name, tier: req.user.tier },
      linked_institutions: items.rows,
      accounts: accounts.rows,
      transactions: transactions.rows,
      bills: bills.rows,
      goals: goals.rows,
      net_worth_history: snapshots.rows,
      ai_conversations: conversations.rows,
    };

    res.setHeader('Content-Disposition', 'attachment; filename="persistence-export.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err) { next(err); }
});

// DELETE /api/account — revoke bank connections at Plaid, then erase everything.
// users CASCADE wipes accounts, transactions, plaid_items, bills, goals,
// snapshots, conversations, alerts, rules.
router.delete('/', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Best-effort: kill the Plaid access tokens server-side so they're dead
    // even if anything were ever recovered from a backup.
    const { rows: items } = await query('SELECT access_token FROM plaid_items WHERE user_id=$1', [userId]);
    if (items.length) {
      const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');
      const plaid = new PlaidApi(new Configuration({
        basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
        baseOptions: { headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        } },
      }));
      for (const item of items) {
        try { await plaid.itemRemove({ access_token: decryptSecret(item.access_token) }); }
        catch (e) { console.error('plaid itemRemove during account deletion:', e.message); }
      }
    }

    await query('DELETE FROM users WHERE id=$1', [userId]);
    res.json({ success: true, message: 'Account and all associated data deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
