const router = require('express').Router();
const { query } = require('../db');

// ─────────────────────────────────────────────────────────────────────────
// Era-style proactive money intelligence. All heuristic/SQL except the
// AI categorizer, so it's fast and cheap enough to run on demand.
// ─────────────────────────────────────────────────────────────────────────

// GET /api/intelligence/subscriptions
// Detect recurring charges: a merchant billed >= 2 times at a near-constant
// amount on a roughly monthly/weekly/annual cadence.
router.get('/subscriptions', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT COALESCE(merchant_name, name) AS merchant, amount, date
       FROM transactions
       WHERE user_id = $1 AND amount > 0 AND date >= CURRENT_DATE - 400
       ORDER BY merchant, date`,
      [req.user.id]
    );

    // Group by merchant + rounded amount (subscriptions are stable in price).
    const groups = {};
    for (const t of rows) {
      const amt = Math.round(parseFloat(t.amount));
      const key = (t.merchant || 'Unknown').toLowerCase().trim() + '|' + amt;
      (groups[key] ||= { merchant: t.merchant, amount: amt, dates: [] }).dates.push(new Date(t.date));
    }

    const subs = [];
    for (const g of Object.values(groups)) {
      if (g.dates.length < 2) continue;
      g.dates.sort((a, b) => a - b);
      const gaps = [];
      for (let i = 1; i < g.dates.length; i++) {
        gaps.push((g.dates[i] - g.dates[i - 1]) / 86400000);
      }
      const avgGap = gaps.reduce((s, x) => s + x, 0) / gaps.length;
      let cadence = null;
      if (avgGap >= 5 && avgGap <= 9) cadence = 'weekly';
      else if (avgGap >= 25 && avgGap <= 35) cadence = 'monthly';
      else if (avgGap >= 84 && avgGap <= 98) cadence = 'quarterly';
      else if (avgGap >= 350 && avgGap <= 380) cadence = 'yearly';
      if (!cadence) continue;
      const monthly = cadence === 'weekly' ? g.amount * 4.33
        : cadence === 'monthly' ? g.amount
        : cadence === 'quarterly' ? g.amount / 3
        : g.amount / 12;
      subs.push({
        merchant: g.merchant,
        amount: g.amount,
        cadence,
        monthly_equivalent: Math.round(monthly),
        occurrences: g.dates.length,
        last_charged: g.dates[g.dates.length - 1].toISOString().slice(0, 10),
      });
    }
    subs.sort((a, b) => b.monthly_equivalent - a.monthly_equivalent);
    res.json({
      subscriptions: subs,
      total_monthly: Math.round(subs.reduce((s, x) => s + x.monthly_equivalent, 0)),
      count: subs.length,
    });
  } catch (err) { next(err); }
});

// GET /api/intelligence/cash-flow?days=30
// Project the cash balance forward using recurring income (negative txns) and
// upcoming bills, so users see a shortfall before it happens.
router.get('/cash-flow', async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days || '30', 10), 90);

    const [accts, bills, income] = await Promise.all([
      query(`SELECT COALESCE(SUM(current_balance),0) AS cash FROM accounts
             WHERE user_id=$1 AND type='depository' AND is_hidden=false`, [req.user.id]),
      query(`SELECT name, amount, next_due_date FROM bills
             WHERE user_id=$1 AND active=true AND next_due_date IS NOT NULL
               AND next_due_date <= CURRENT_DATE + $2`, [req.user.id, days]),
      // Average monthly income from the last 90 days of credits.
      query(`SELECT COALESCE(SUM(ABS(amount)),0) AS total FROM transactions
             WHERE user_id=$1 AND amount < 0 AND date >= CURRENT_DATE - 90`, [req.user.id]),
    ]);

    let balance = parseFloat(accts.rows[0].cash);
    const startBalance = balance;
    const dailyIncome = parseFloat(income.rows[0].total) / 90;
    const billsByDate = {};
    for (const b of bills.rows) {
      const d = new Date(b.next_due_date).toISOString().slice(0, 10);
      (billsByDate[d] ||= []).push({ name: b.name, amount: parseFloat(b.amount) });
    }

    const series = [];
    let lowest = { date: null, balance: balance };
    const today = new Date();
    for (let i = 1; i <= days; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      balance += dailyIncome;
      for (const b of (billsByDate[iso] || [])) balance -= b.amount;
      series.push({ date: iso, balance: Math.round(balance) });
      if (balance < lowest.balance) lowest = { date: iso, balance: Math.round(balance) };
    }

    res.json({
      start_balance: Math.round(startBalance),
      projected_end_balance: Math.round(balance),
      lowest_point: lowest,
      will_go_negative: lowest.balance < 0,
      estimated_monthly_income: Math.round(dailyIncome * 30),
      series,
    });
  } catch (err) { next(err); }
});

// POST /api/intelligence/categorize
// AI-clean up to 40 uncategorized transactions into tidy spending buckets.
router.post('/categorize', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, COALESCE(merchant_name, name) AS label, amount FROM transactions
       WHERE user_id=$1 AND category_custom IS NULL
         AND (category IS NULL OR array_length(category,1) IS NULL)
       ORDER BY date DESC LIMIT 40`,
      [req.user.id]
    );
    if (!rows.length) return res.json({ categorized: 0, message: 'Everything is already categorized.' });

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'AI categorization is not configured' });
    }
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const CATS = ['Groceries', 'Dining', 'Transport', 'Shopping', 'Utilities', 'Housing',
      'Entertainment', 'Health', 'Travel', 'Subscriptions', 'Income', 'Transfer', 'Other'];

    const prompt = `Categorize each transaction into exactly one of: ${CATS.join(', ')}.
Return ONLY a JSON array of {"id":"...","category":"..."}.
Transactions:
${rows.map(r => `${r.id}: "${r.label}" $${r.amount}`).join('\n')}`;

    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    let mapping = [];
    try {
      const text = resp.content[0].text;
      mapping = JSON.parse(text.match(/\[[\s\S]*\]/)[0]);
    } catch { return res.status(502).json({ error: 'Could not parse AI response' }); }

    let n = 0;
    for (const m of mapping) {
      if (!CATS.includes(m.category)) continue;
      const r = await query(
        'UPDATE transactions SET category_custom=$1 WHERE id=$2 AND user_id=$3',
        [m.category, m.id, req.user.id]
      );
      n += r.rowCount;
    }
    res.json({ categorized: n });
  } catch (err) { next(err); }
});

// GET /api/intelligence/alerts — generate + return proactive alerts.
// Idempotent per day: re-running won't duplicate the same alert.
router.get('/alerts', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const newAlerts = [];

    // 1. Low balance
    const cash = await query(
      `SELECT COALESCE(SUM(current_balance),0) AS c FROM accounts
       WHERE user_id=$1 AND type='depository' AND is_hidden=false`, [userId]);
    if (parseFloat(cash.rows[0].c) < 500) {
      newAlerts.push({ type: 'low_balance', title: 'Low cash balance',
        body: `Your combined checking/savings is $${Math.round(parseFloat(cash.rows[0].c))}. Consider moving funds or pausing discretionary spend.` });
    }

    // 2. Bills due in the next 3 days
    const due = await query(
      `SELECT name, amount, next_due_date FROM bills
       WHERE user_id=$1 AND active=true AND next_due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 3`, [userId]);
    for (const b of due.rows) {
      newAlerts.push({ type: 'bill_due', title: `${b.name} due soon`,
        body: `$${b.amount} due ${new Date(b.next_due_date).toISOString().slice(0,10)}.` });
    }

    // 3. Unusual spend: a single charge > 3x the 90-day average expense
    const spend = await query(
      `WITH avg AS (SELECT AVG(amount) a FROM transactions WHERE user_id=$1 AND amount>0 AND date>=CURRENT_DATE-90)
       SELECT COALESCE(merchant_name,name) AS m, amount, date FROM transactions, avg
       WHERE user_id=$1 AND amount > 3*avg.a AND amount > 100 AND date >= CURRENT_DATE - 3`, [userId]);
    for (const s of spend.rows) {
      newAlerts.push({ type: 'unusual_spend', title: 'Unusually large charge',
        body: `$${Math.round(parseFloat(s.amount))} at ${s.m} on ${new Date(s.date).toISOString().slice(0,10)} — well above your usual.` });
    }

    // Persist new alerts, skipping ones already created today (dedupe by title).
    for (const a of newAlerts) {
      await query(
        `INSERT INTO alerts (user_id, type, title, body)
         SELECT $1,$2,$3,$4
         WHERE NOT EXISTS (
           SELECT 1 FROM alerts WHERE user_id=$1 AND title=$3 AND created_at::date = CURRENT_DATE
         )`,
        [userId, a.type, a.title, a.body]
      );
    }

    const { rows } = await query(
      `SELECT id, type, title, body, read, created_at FROM alerts
       WHERE user_id=$1 ORDER BY created_at DESC LIMIT 25`, [userId]);
    res.json({ alerts: rows, unread: rows.filter(r => !r.read).length });
  } catch (err) { next(err); }
});

// POST /api/intelligence/alerts/:id/read
router.post('/alerts/:id/read', async (req, res, next) => {
  try {
    await query('UPDATE alerts SET read=true WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
