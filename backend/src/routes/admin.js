const router = require('express').Router();
const { query } = require('../db');

// Admin gate: comma-separated allowlist in ADMIN_EMAILS (Railway env var).
// Example: ADMIN_EMAILS=sebastian@example.com
function requireAdmin(req, res, next) {
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.length || !admins.includes((req.user.email || '').toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// GET /api/admin/metrics — business + usage dashboard numbers, pure SQL.
router.get('/metrics', requireAdmin, async (req, res, next) => {
  try {
    const [
      users, usersByTier, newUsers, items, accounts, txns,
      activeUsers, aiMessages, billsGoals, snapshotsToday,
    ] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM users`),
      query(`SELECT tier, COUNT(*)::int AS count FROM users GROUP BY tier ORDER BY tier`),
      query(`SELECT
               COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int  AS last_7d,
               COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last_30d
             FROM users`),
      query(`SELECT COUNT(*)::int AS total, COUNT(DISTINCT user_id)::int AS users FROM plaid_items`),
      query(`SELECT COUNT(*)::int AS total FROM accounts WHERE is_hidden=false`),
      query(`SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE date >= CURRENT_DATE - 7)::int AS last_7d
             FROM transactions`),
      query(`SELECT COUNT(DISTINCT user_id)::int AS ai_7d FROM ai_conversations
             WHERE created_at >= NOW() - INTERVAL '7 days'`),
      query(`SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7d
             FROM ai_conversations WHERE role='user'`),
      query(`SELECT
               (SELECT COUNT(*)::int FROM bills WHERE active=true) AS bills,
               (SELECT COUNT(*)::int FROM goals WHERE completed=false) AS goals`),
      query(`SELECT COUNT(*)::int AS today FROM net_worth_snapshots WHERE snapshot_date=CURRENT_DATE`),
    ]);

    res.json({
      generated_at: new Date().toISOString(),
      users: {
        total: users.rows[0].total,
        new_last_7d: newUsers.rows[0].last_7d,
        new_last_30d: newUsers.rows[0].last_30d,
        by_tier: usersByTier.rows,
        active_ai_users_7d: activeUsers.rows[0].ai_7d,
      },
      plaid: {
        linked_institutions: items.rows[0].total,
        users_with_linked_bank: items.rows[0].users,
        visible_accounts: accounts.rows[0].total,
      },
      activity: {
        transactions_total: txns.rows[0].total,
        transactions_last_7d: txns.rows[0].last_7d,
        ai_messages_total: aiMessages.rows[0].total,
        ai_messages_last_7d: aiMessages.rows[0].last_7d,
        net_worth_snapshots_today: snapshotsToday.rows[0].today,
      },
      content: {
        active_bills: billsGoals.rows[0].bills,
        open_goals: billsGoals.rows[0].goals,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
