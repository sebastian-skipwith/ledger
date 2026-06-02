const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../db');
const { v4: uuidv4 } = require('uuid');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Build financial context for the AI from live DB data
async function buildFinancialContext(userId) {
  const [accounts, recentTxns, netWorthHistory, bills, goals] = await Promise.all([
    query(`SELECT name, type, subtype, current_balance, institution_name, mask
           FROM accounts WHERE user_id=$1 AND is_hidden=false ORDER BY type`, [userId]),
    query(`SELECT t.date, t.name, t.merchant_name, t.amount, t.category, a.name as account_name
           FROM transactions t JOIN accounts a ON t.account_id=a.id
           WHERE t.user_id=$1 AND t.date >= CURRENT_DATE - 30
           ORDER BY t.date DESC LIMIT 100`, [userId]),
    query(`SELECT snapshot_date, net_worth, total_assets, total_liabilities
           FROM net_worth_snapshots WHERE user_id=$1
           ORDER BY snapshot_date DESC LIMIT 180`, [userId]),
    query(`SELECT name, amount, frequency, next_due_date, autopay FROM bills WHERE user_id=$1 AND active=true`, [userId]),
    query(`SELECT name, type, target_amount, current_amount, target_date, monthly_contribution FROM goals WHERE user_id=$1`, [userId]),
  ]);

  const accts = accounts.rows;
  const cash = accts.filter(a => a.type === 'depository').reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
  const investments = accts.filter(a => a.type === 'investment').reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
  const retirement = accts.filter(a => ['401k','ira','roth'].some(k => (a.subtype||'').toLowerCase().includes(k))).reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
  const debt = accts.filter(a => ['credit','loan'].includes(a.type)).reduce((s, a) => s + Math.abs(parseFloat(a.current_balance || 0)), 0);
  const netWorth = (netWorthHistory.rows[0]?.net_worth) || (cash + investments - debt);
  const monthlyBills = bills.rows.reduce((s, b) => s + parseFloat(b.amount || 0), 0);

  // Spending by category (last 30 days)
  const categorySpend = {};
  for (const t of recentTxns.rows) {
    if (t.amount > 0 && t.category?.length) {
      const cat = t.category[0];
      categorySpend[cat] = (categorySpend[cat] || 0) + parseFloat(t.amount);
    }
  }

  return {
    summary: {
      net_worth: Math.round(netWorth),
      cash,
      investments,
      retirement,
      total_debt: debt,
      monthly_bills: Math.round(monthlyBills),
    },
    accounts: accts,
    recent_transactions: recentTxns.rows.slice(0, 30),
    net_worth_trend: netWorthHistory.rows.slice(0, 30),
    bills: bills.rows,
    goals: goals.rows,
    spending_by_category: categorySpend,
  };
}

// POST /api/ai/chat
// Stream a response from Claude with full financial context
router.post('/chat', async (req, res, next) => {
  try {
    const { message, session_id } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const sid = session_id || uuidv4();
    const context = await buildFinancialContext(req.user.id);

    // Fetch conversation history (last 20 turns)
    const { rows: history } = await query(
      `SELECT role, content FROM ai_conversations
       WHERE user_id=$1 AND session_id=$2
       ORDER BY created_at ASC LIMIT 20`,
      [req.user.id, sid]
    );

    // Save user message
    await query(
      'INSERT INTO ai_conversations (user_id, session_id, role, content) VALUES ($1,$2,$3,$4)',
      [req.user.id, sid, 'user', message]
    );

    const systemPrompt = `You are Ledger AI, a brilliant, concise personal financial advisor embedded in the Ledger app.
You have real-time access to the user's complete financial picture. Always ground your answers in their actual data.

FINANCIAL SNAPSHOT (live data as of today):
${JSON.stringify(context.summary, null, 2)}

ACCOUNTS:
${context.accounts.map(a => `  ${a.name} (${a.type}/${a.subtype}): $${parseFloat(a.current_balance||0).toLocaleString()}`).join('\n')}

RECENT SPENDING (last 30 days by category):
${Object.entries(context.spending_by_category).map(([k,v]) => `  ${k}: $${Math.round(v)}`).join('\n')}

BILLS (monthly total: $${context.summary.monthly_bills}):
${context.bills.map(b => `  ${b.name}: $${b.amount} — due ${b.next_due_date || 'recurring'}`).join('\n')}

GOALS:
${context.goals.map(g => `  ${g.name}: $${g.current_amount}/$${g.target_amount}`).join('\n') || '  None set yet'}

GUIDELINES:
- Be direct and specific — use their actual numbers, never generic advice
- When suggesting actions, be concrete (exact amounts, timelines)
- Flag anomalies or risks proactively
- You can propose automation rules, but always ask for confirmation before executing
- Keep responses focused — use bullet points sparingly, prefer flowing sentences
- If you recommend moving money, specify exact amounts and accounts
- Do NOT give licensed investment or tax advice — note when to see a CPA or CFP`;

    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    // Stream response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', sid);

    let fullResponse = '';

    const stream = await anthropic.messages.stream({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text;
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, session_id: sid })}\n\n`);
    res.end();

    // Save assistant response
    await query(
      'INSERT INTO ai_conversations (user_id, session_id, role, content) VALUES ($1,$2,$3,$4)',
      [req.user.id, sid, 'assistant', fullResponse]
    );

  } catch (err) {
    next(err);
  }
});

// GET /api/ai/insights
// Daily proactive insights — called on dashboard load
router.get('/insights', async (req, res, next) => {
  try {
    const context = await buildFinancialContext(req.user.id);
    const prompt = `Based on this financial data, generate exactly 3 short, specific, actionable insights for today.
Each insight must be 1-2 sentences. Return as JSON array: [{"type":"alert|opportunity|info","title":"...","body":"..."}]

Data: ${JSON.stringify(context.summary)}
Spending: ${JSON.stringify(context.spending_by_category)}
Bills: ${JSON.stringify(context.bills.slice(0,5))}`;

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    let insights;
    try {
      const text = response.content[0].text;
      const match = text.match(/\[[\s\S]*\]/);
      insights = JSON.parse(match ? match[0] : text);
    } catch {
      insights = [{ type: 'info', title: 'Looking good', body: 'Your finances are on track today.' }];
    }

    res.json({ insights, context: context.summary });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/sessions
router.get('/sessions', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT session_id, MIN(created_at) as started_at, COUNT(*) as message_count
       FROM ai_conversations WHERE user_id=$1
       GROUP BY session_id ORDER BY started_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/sessions/:sessionId
router.get('/sessions/:sessionId', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT role, content, created_at FROM ai_conversations
       WHERE user_id=$1 AND session_id=$2 ORDER BY created_at ASC`,
      [req.user.id, req.params.sessionId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.buildFinancialContext = buildFinancialContext;
