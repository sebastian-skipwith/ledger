const router = require('express').Router();
const { query } = require('../db');

// GET /api/summary/hud
// Lightweight, no-AI summary for the desktop HUD (and anything else that wants
// fast numbers). One round trip, pure SQL — unlike /api/ai/insights which calls
// Claude and is too slow/expensive for a 5-minute refresh loop.
router.get('/hud', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // "until Friday" = upcoming Friday (today if it IS Friday)
    const now = new Date();
    const friday = new Date(now);
    friday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7));
    const fridayStr = friday.toISOString().slice(0, 10);

    const [accounts, bills7d, billsToFriday, creditWeek, goals] = await Promise.all([
      query(`SELECT type, subtype, current_balance FROM accounts
             WHERE user_id=$1 AND is_hidden=false`, [userId]),
      query(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM bills
             WHERE user_id=$1 AND active=true
               AND next_due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`, [userId]),
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM bills
             WHERE user_id=$1 AND active=true
               AND next_due_date BETWEEN CURRENT_DATE AND $2::date`, [userId, fridayStr]),
      query(`SELECT COALESCE(SUM(t.amount),0) AS spent FROM transactions t
             JOIN accounts a ON t.account_id=a.id
             WHERE t.user_id=$1 AND a.type='credit'
               AND t.date >= CURRENT_DATE - 7`, [userId]),
      query(`SELECT target_amount, current_amount, target_date, monthly_contribution, created_at
             FROM goals WHERE user_id=$1 AND completed=false`, [userId]),
    ]);

    // Same bucketing as buildFinancialContext in routes/ai.js — keep in sync.
    const accts = accounts.rows;
    const cash = accts.filter(a => a.type === 'depository').reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
    const investments = accts.filter(a => a.type === 'investment').reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
    const retirement = accts.filter(a => ['401k','ira','roth'].some(k => (a.subtype||'').toLowerCase().includes(k))).reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
    const debt = accts.filter(a => ['credit','loan'].includes(a.type)).reduce((s, a) => s + Math.abs(parseFloat(a.current_balance || 0)), 0);

    const { rows: billRows } = await query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM bills WHERE user_id=$1 AND active=true`, [userId]);
    const monthlyBills = parseFloat(billRows[0].total);

    // Goal pacing: expected progress is linear from created_at to target_date
    // (or monthly_contribution × months elapsed when there's no target date).
    let goalDiff = 0;
    let pacedGoals = 0;
    for (const g of goals.rows) {
      const target = parseFloat(g.target_amount || 0);
      const current = parseFloat(g.current_amount || 0);
      let expected = null;
      if (g.target_date) {
        const start = new Date(g.created_at).getTime();
        const end = new Date(g.target_date).getTime();
        if (end > start) {
          const frac = Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
          expected = target * frac;
        }
      } else if (g.monthly_contribution) {
        const months = (Date.now() - new Date(g.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
        expected = Math.min(target, parseFloat(g.monthly_contribution) * months);
      }
      if (expected !== null) { goalDiff += current - expected; pacedGoals++; }
    }

    res.json({
      net_worth: Math.round(cash + investments - debt),
      cash: Math.round(cash),
      investments: Math.round(investments),
      retirement: Math.round(retirement),
      total_debt: Math.round(debt),
      monthly_bills: Math.round(monthlyBills),
      safe_to_spend: {
        amount: Math.round(cash - parseFloat(billsToFriday.rows[0].total)),
        until: fridayStr,
      },
      credit_week: { spent: Math.round(parseFloat(creditWeek.rows[0].spent)) },
      bills_7d: {
        total: Math.round(parseFloat(bills7d.rows[0].total)),
        count: parseInt(bills7d.rows[0].count, 10),
      },
      goal_progress: {
        diff: Math.round(goalDiff),
        goals_count: pacedGoals,
        status: pacedGoals === 0 ? 'none' : goalDiff < -1 ? 'behind' : goalDiff > 1 ? 'ahead' : 'on_track',
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
