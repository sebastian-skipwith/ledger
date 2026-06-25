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

// GET /api/admin/users — paginated user list with per-user rollups.
// Query: ?limit=50&offset=0&q=<email/name search>&tier=<free|pro|wealth>
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const q = (req.query.q || '').trim();
    const tier = req.query.tier;

    const where = [];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
    }
    if (tier) {
      params.push(tier);
      where.push(`u.tier = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // total uses only the filter params; the list query appends limit/offset.
    const totalRes = await query(`SELECT COUNT(*)::int AS total FROM users u ${whereSql}`, params);

    const listParams = params.slice();
    listParams.push(limit);
    const limIdx = listParams.length;
    listParams.push(offset);
    const offIdx = listParams.length;

    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.tier, u.created_at,
              COALESCE(acc.cnt, 0)  AS account_count,
              COALESCE(item.cnt, 0) AS linked_banks,
              COALESCE(txn.cnt, 0)  AS transaction_count,
              GREATEST(u.updated_at, txn.last_txn, ai.last_ai) AS last_active
       FROM users u
       LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM accounts a WHERE a.user_id = u.id AND a.is_hidden = false) acc ON true
       LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM plaid_items p WHERE p.user_id = u.id) item ON true
       LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt, MAX(t.created_at) AS last_txn FROM transactions t WHERE t.user_id = u.id) txn ON true
       LEFT JOIN LATERAL (SELECT MAX(c.created_at) AS last_ai FROM ai_conversations c WHERE c.user_id = u.id) ai ON true
       ${whereSql}
       ORDER BY u.created_at DESC
       LIMIT $${limIdx} OFFSET $${offIdx}`,
      listParams
    );

    res.json({ total: totalRes.rows[0].total, limit, offset, users: rows });
  } catch (err) { next(err); }
});

// GET /api/admin/stats — signups time-series + tier + engagement (for charts).
router.get('/stats', requireAdmin, async (req, res, next) => {
  try {
    const [signupsDaily, signupsWeekly, byTier, totals, active, linkedBanks] = await Promise.all([
      query(`SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS count
             FROM users WHERE created_at >= NOW() - INTERVAL '30 days'
             GROUP BY 1 ORDER BY 1`),
      query(`SELECT date_trunc('week', created_at)::date AS week, COUNT(*)::int AS count
             FROM users WHERE created_at >= NOW() - INTERVAL '12 weeks'
             GROUP BY 1 ORDER BY 1`),
      query(`SELECT tier, COUNT(*)::int AS count FROM users GROUP BY tier ORDER BY tier`),
      query(`SELECT COUNT(*)::int AS total_users,
               COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int  AS new_7d,
               COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_30d
             FROM users`),
      // DAU/WAU proxy from activity (no login table yet).
      query(`SELECT
               COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')::int AS active_1d,
               COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS active_7d
             FROM (SELECT user_id, created_at FROM ai_conversations
                   UNION ALL SELECT user_id, created_at FROM transactions) act`),
      query(`SELECT COUNT(DISTINCT user_id)::int AS users_with_bank FROM plaid_items`),
    ]);

    res.json({
      generated_at: new Date().toISOString(),
      totals: totals.rows[0],
      signups_daily_30d: signupsDaily.rows,
      signups_weekly_12w: signupsWeekly.rows,
      tier_breakdown: byTier.rows,
      engagement: {
        active_1d: active.rows[0].active_1d,
        active_7d: active.rows[0].active_7d,
        users_with_linked_bank: linkedBanks.rows[0].users_with_bank,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
