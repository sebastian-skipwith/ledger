const router = require('express').Router();
const { query } = require('../db');
const { projectCashFlow, detectAnomalies } = require('./intelligence');
const { applyRules } = require('../lib/rules');
const { snapshotNetWorth } = require('./plaid');
const { getHouseholdView } = require('./household');
const { getPortfolioForUser } = require('./investments');

// Categories the agent may assign (shared taxonomy with the AI categorizer).
const WRITE_CATS = ['Groceries', 'Dining', 'Transport', 'Shopping', 'Utilities', 'Housing', 'Entertainment', 'Health', 'Travel', 'Subscriptions', 'Income', 'Transfer', 'Other'];

// Tools that mutate data — read-only developer API keys (scopes without 'write')
// are blocked from these in the POST handler. NONE of these move money.
const WRITE_TOOLS = new Set(['set_transaction_category', 'create_goal', 'update_goal', 'create_bill', 'add_credit_score', 'remember_fact', 'forget_fact', 'create_rule', 'add_manual_account']);

// ─────────────────────────────────────────────────────────────────────────
// Remote MCP endpoint (JSON-RPC over HTTP). Lets ANY MCP client connect with
// just a URL + API key — no local Node install or config file needed.
//   URL:  https://<api>/api/mcp
//   Auth: Authorization: Bearer sk_live_...  (a developer API key)
// Mounted behind `authenticate`, so req.user is the key's owner.
// Implements the subset of MCP that read-only finance clients need:
// initialize, tools/list, tools/call.
// ─────────────────────────────────────────────────────────────────────────

// Read tools plus non-money-movement write tools (categorize, goals, bills,
// credit, memory). NO tool can ever move money, pay, transfer, or trade. The
// annotations make each tool's read/write nature explicit to Claude/users.
const TOOLS = [
  {
    name: 'get_financial_summary',
    description: 'Net worth, cash, investments, retirement, debt and monthly bills.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Get financial summary', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'get_transactions',
    description: 'Recent transactions. Optional days (default 30) and limit (default 50).',
    inputSchema: { type: 'object', properties: { days: { type: 'number' }, limit: { type: 'number' } } },
    annotations: { title: 'Get transactions', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'get_subscriptions',
    description: 'Detected recurring subscriptions and their total monthly cost.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Get subscriptions', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'get_bills',
    description: 'Upcoming bills and recurring expenses.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Get bills', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'get_goals',
    description: 'Financial goals and progress.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Get goals', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  // ── Write tools (non-money-movement) ──
  {
    name: 'set_transaction_category',
    description: 'Set the category for one of your transactions.',
    inputSchema: { type: 'object', required: ['transaction_id', 'category'], properties: { transaction_id: { type: 'string' }, category: { type: 'string', enum: WRITE_CATS } } },
    annotations: { title: 'Set transaction category', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'create_goal',
    description: 'Create a savings, debt-payoff, or investment goal.',
    inputSchema: { type: 'object', required: ['name', 'type', 'target_amount'], properties: { name: { type: 'string' }, type: { type: 'string', enum: ['savings', 'debt_payoff', 'investment'] }, target_amount: { type: 'number' }, target_date: { type: 'string' }, monthly_contribution: { type: 'number' }, notes: { type: 'string' } } },
    annotations: { title: 'Create goal', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'update_goal',
    description: 'Update an existing goal (e.g. current saved amount, target, or mark complete).',
    inputSchema: { type: 'object', required: ['goal_id'], properties: { goal_id: { type: 'string' }, name: { type: 'string' }, target_amount: { type: 'number' }, current_amount: { type: 'number' }, target_date: { type: 'string' }, monthly_contribution: { type: 'number' }, completed: { type: 'boolean' } } },
    annotations: { title: 'Update goal', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'create_bill',
    description: 'Add a recurring bill or expense.',
    inputSchema: { type: 'object', required: ['name', 'amount', 'frequency'], properties: { name: { type: 'string' }, amount: { type: 'number' }, frequency: { type: 'string', enum: ['weekly', 'monthly', 'yearly'] }, next_due_date: { type: 'string' }, category: { type: 'string' } } },
    annotations: { title: 'Create bill', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'add_credit_score',
    description: 'Record a credit-score reading (300-850).',
    inputSchema: { type: 'object', required: ['score'], properties: { score: { type: 'number' }, source: { type: 'string' } } },
    annotations: { title: 'Add credit score', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  // ── Memory (cross-session/cross-client) ──
  {
    name: 'remember_fact',
    description: 'Store a durable fact/preference about the user (e.g. risk tolerance, a savings target) so future chats recall it.',
    inputSchema: { type: 'object', required: ['key', 'value'], properties: { key: { type: 'string' }, value: { type: 'string' } } },
    annotations: { title: 'Remember fact', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_memory',
    description: 'List everything you have remembered about the user.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Get memory', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'forget_fact',
    description: 'Delete a remembered fact by key.',
    inputSchema: { type: 'object', required: ['key'], properties: { key: { type: 'string' } } },
    annotations: { title: 'Forget fact', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  // ── Decision support (read-only) ──
  {
    name: 'can_i_afford',
    description: 'Check whether you can afford a purchase now (or by a date) without going negative or raiding active goals, using your cash-flow forecast.',
    inputSchema: { type: 'object', required: ['amount'], properties: { amount: { type: 'number' }, when: { type: 'string', description: 'ISO date you would spend it; default today' } } },
    annotations: { title: 'Can I afford it', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  // ── Automation + manual accounts ──
  {
    name: 'create_rule',
    description: 'Create an automation rule that categorizes or tags matching transactions (existing and future).',
    inputSchema: { type: 'object', required: ['match_field', 'match_op', 'match_value', 'action', 'action_value'], properties: { match_field: { type: 'string', enum: ['merchant', 'name', 'amount'] }, match_op: { type: 'string', enum: ['contains', 'equals', 'gt', 'lt'] }, match_value: { type: 'string' }, action: { type: 'string', enum: ['set_category', 'set_tag'] }, action_value: { type: 'string' } } },
    annotations: { title: 'Create rule', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'add_manual_account',
    description: 'Add a manual (non-Plaid) account so its balance counts toward net worth.',
    inputSchema: { type: 'object', required: ['name', 'type'], properties: { name: { type: 'string' }, type: { type: 'string', enum: ['depository', 'investment', 'credit', 'loan'] }, subtype: { type: 'string' }, current_balance: { type: 'number' }, institution_name: { type: 'string' } } },
    annotations: { title: 'Add manual account', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'get_anomalies',
    description: 'Detected duplicate charges and subscription price increases.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Get anomalies', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'get_household',
    description: 'Combined household view: net worth and accounts across all members of your shared household (if you are in one).',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Get household', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'get_portfolio',
    description: 'Your investment portfolio: total value, every position (value, weight, unrealized gain), allocation by asset type, and drift vs your target allocation.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Get portfolio', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'get_portfolio_performance',
    description: 'Your portfolio market value over time (daily snapshots). Optional days (default 180).',
    inputSchema: { type: 'object', properties: { days: { type: 'number' } } },
    annotations: { title: 'Get portfolio performance', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
];

async function callTool(userId, name, args = {}) {
  if (name === 'get_financial_summary') {
    const { rows } = await query(`SELECT type, subtype, current_balance FROM accounts WHERE user_id=$1 AND is_hidden=false`, [userId]);
    const cash = rows.filter(a => a.type === 'depository').reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
    const investments = rows.filter(a => a.type === 'investment').reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
    const retirement = rows.filter(a => ['401k', 'ira', 'roth'].some(k => (a.subtype || '').toLowerCase().includes(k))).reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
    const debt = rows.filter(a => ['credit', 'loan'].includes(a.type)).reduce((s, a) => s + Math.abs(parseFloat(a.current_balance || 0)), 0);
    return { net_worth: Math.round(cash + investments - debt), cash: Math.round(cash), investments: Math.round(investments), retirement: Math.round(retirement), total_debt: Math.round(debt) };
  }
  if (name === 'get_transactions') {
    const days = Math.min(args.days || 30, 365), limit = Math.min(args.limit || 50, 200);
    const { rows } = await query(
      `SELECT date, COALESCE(merchant_name,name) AS name, amount, category_custom AS category
       FROM transactions WHERE user_id=$1 AND date >= CURRENT_DATE - $2 ORDER BY date DESC LIMIT $3`,
      [userId, days, limit]);
    return rows;
  }
  if (name === 'get_subscriptions') {
    // Reuse the intelligence heuristic inline (kept simple here).
    const { rows } = await query(
      `SELECT COALESCE(merchant_name,name) AS m, ROUND(amount) AS amt, COUNT(*) AS n
       FROM transactions WHERE user_id=$1 AND amount>0 AND date>=CURRENT_DATE-400
       GROUP BY m, amt HAVING COUNT(*) >= 2 ORDER BY amt DESC`, [userId]);
    return rows.map(r => ({ merchant: r.m, amount: Number(r.amt), occurrences: Number(r.n) }));
  }
  if (name === 'get_bills') {
    const { rows } = await query(`SELECT name, amount, frequency, next_due_date FROM bills WHERE user_id=$1 AND active=true ORDER BY next_due_date NULLS LAST`, [userId]);
    return rows;
  }
  if (name === 'get_goals') {
    const { rows } = await query(`SELECT name, type, target_amount, current_amount, target_date FROM goals WHERE user_id=$1`, [userId]);
    return rows;
  }

  // ── Write tools (all user-scoped; none move money) ──
  if (name === 'set_transaction_category') {
    if (!WRITE_CATS.includes(args.category)) throw new Error('Invalid category');
    const { rows } = await query(
      `UPDATE transactions SET category_custom=$1 WHERE id=$2 AND user_id=$3
       RETURNING id, COALESCE(merchant_name,name) AS name, amount, category_custom`,
      [args.category, args.transaction_id, userId]);
    if (!rows.length) throw new Error('Transaction not found');
    return rows[0];
  }
  if (name === 'create_goal') {
    if (!['savings', 'debt_payoff', 'investment'].includes(args.type)) throw new Error('Invalid goal type');
    if (!(Number(args.target_amount) > 0)) throw new Error('target_amount must be positive');
    const { rows } = await query(
      `INSERT INTO goals (user_id, name, type, target_amount, target_date, monthly_contribution, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [userId, args.name, args.type, args.target_amount, args.target_date || null, args.monthly_contribution || null, args.notes || null]);
    return rows[0];
  }
  if (name === 'update_goal') {
    const allowed = ['name', 'target_amount', 'current_amount', 'target_date', 'monthly_contribution', 'completed'];
    const updates = [], params = [];
    let i = 1;
    for (const f of allowed) if (args[f] !== undefined) { updates.push(`${f}=$${i++}`); params.push(args[f]); }
    if (!updates.length) throw new Error('No fields to update');
    params.push(args.goal_id, userId);
    const { rows } = await query(`UPDATE goals SET ${updates.join(', ')} WHERE id=$${i++} AND user_id=$${i++} RETURNING *`, params);
    if (!rows.length) throw new Error('Goal not found');
    return rows[0];
  }
  if (name === 'create_bill') {
    if (!['weekly', 'monthly', 'yearly'].includes(args.frequency)) throw new Error('Invalid frequency');
    if (!(Number(args.amount) > 0)) throw new Error('amount must be positive');
    const { rows } = await query(
      `INSERT INTO bills (user_id, name, amount, frequency, next_due_date, category)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [userId, args.name, args.amount, args.frequency, args.next_due_date || null, args.category || null]);
    return rows[0];
  }
  if (name === 'add_credit_score') {
    const score = parseInt(args.score, 10);
    if (!Number.isFinite(score) || score < 300 || score > 850) throw new Error('Score must be a whole number between 300 and 850.');
    const source = (args.source || '').toString().trim().slice(0, 60) || null;
    const { rows } = await query(
      `INSERT INTO credit_scores (user_id, score, source) VALUES ($1,$2,$3) RETURNING id, score, source, recorded_at`,
      [userId, score, source]);
    return rows[0];
  }

  // ── Memory ──
  if (name === 'remember_fact') {
    const key = String(args.key || '').trim().slice(0, 120);
    const value = String(args.value || '').trim().slice(0, 2000);
    if (!key || !value) throw new Error('key and value are required');
    const { rows } = await query(
      `INSERT INTO agent_memory (user_id, key, value) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
       RETURNING key, value, updated_at`, [userId, key, value]);
    return rows[0];
  }
  if (name === 'get_memory') {
    const { rows } = await query(`SELECT key, value, updated_at FROM agent_memory WHERE user_id=$1 ORDER BY updated_at DESC`, [userId]);
    return rows;
  }
  if (name === 'forget_fact') {
    const r = await query(`DELETE FROM agent_memory WHERE user_id=$1 AND key=$2`, [userId, String(args.key || '').trim()]);
    return { forgotten: r.rowCount };
  }

  // ── Affordability (read-only; reuses the cash-flow forecast + goals) ──
  if (name === 'can_i_afford') {
    const amount = Number(args.amount);
    if (!(amount > 0)) throw new Error('amount must be positive');
    const when = args.when ? new Date(args.when) : new Date();
    if (isNaN(when)) throw new Error('when must be an ISO date (YYYY-MM-DD)');
    const horizonDays = Math.min(Math.max(Math.ceil((when - new Date()) / 86400000) + 30, 30), 90);
    const proj = await projectCashFlow(userId, horizonDays);
    const goalsRes = await query(`SELECT COALESCE(SUM(monthly_contribution),0) AS reserve FROM goals WHERE user_id=$1 AND completed=false`, [userId]);
    const goalReserve = Number(goalsRes.rows[0].reserve);
    const lowestAfter = proj.lowest_point.balance - amount;
    const affordable = lowestAfter >= goalReserve;
    return {
      amount,
      when: when.toISOString().slice(0, 10),
      affordable,
      projected_lowest_balance_after_purchase: Math.round(lowestAfter),
      current_lowest_point: proj.lowest_point,
      goal_contributions_at_risk: affordable ? 0 : Math.round(Math.max(0, goalReserve - lowestAfter)),
      reason: affordable
        ? 'Your forecasted low point stays above your goal contributions after this purchase.'
        : (lowestAfter < 0
            ? 'This purchase would push your projected balance negative.'
            : 'This purchase would eat into money set aside for your active goals.'),
      forecast: { start_balance: proj.start_balance, projected_end_balance: proj.projected_end_balance },
    };
  }

  // ── Automation + manual accounts ──
  if (name === 'create_rule') {
    if (!['merchant', 'name', 'amount'].includes(args.match_field)) throw new Error('Invalid match_field');
    if (!['contains', 'equals', 'gt', 'lt'].includes(args.match_op)) throw new Error('Invalid match_op');
    if (!['set_category', 'set_tag'].includes(args.action)) throw new Error('Invalid action');
    if (!args.match_value || !args.action_value) throw new Error('match_value and action_value are required');
    if (args.action === 'set_category' && !WRITE_CATS.includes(args.action_value)) throw new Error('Invalid category');
    const { rows } = await query(
      `INSERT INTO transaction_rules (user_id, match_field, match_op, match_value, action, action_value)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [userId, args.match_field, args.match_op, String(args.match_value), args.action, String(args.action_value)]);
    applyRules(userId).catch(() => {});
    return rows[0];
  }
  if (name === 'add_manual_account') {
    if (!args.name || !['depository', 'investment', 'credit', 'loan'].includes(args.type)) {
      throw new Error('name and a valid type (depository|investment|credit|loan) are required');
    }
    const { rows } = await query(
      `INSERT INTO accounts (user_id, name, type, subtype, current_balance, institution_name, source)
       VALUES ($1,$2,$3,$4,$5,$6,'manual') RETURNING id, name, type, subtype, current_balance, institution_name`,
      [userId, args.name, args.type, args.subtype || null, args.current_balance || 0, args.institution_name || null]);
    snapshotNetWorth(userId).catch(() => {});
    return rows[0];
  }
  if (name === 'get_anomalies') {
    return await detectAnomalies(userId);
  }
  if (name === 'get_household') {
    const hm = await query(
      `SELECT household_id FROM household_members WHERE user_id=$1 AND status='active' ORDER BY created_at LIMIT 1`,
      [userId]);
    if (!hm.rows.length) return { household: null, message: 'You are not part of a household yet.' };
    return await getHouseholdView(userId, hm.rows[0].household_id);
  }
  if (name === 'get_portfolio') {
    return await getPortfolioForUser(userId);
  }
  if (name === 'get_portfolio_performance') {
    const days = Math.min(Math.max(parseInt(args.days, 10) || 180, 1), 730);
    const { rows } = await query(
      `SELECT snapshot_date, total_value, total_cost_basis FROM portfolio_snapshots
       WHERE user_id=$1 AND snapshot_date >= CURRENT_DATE - $2 ORDER BY snapshot_date`,
      [userId, days]);
    return rows;
  }

  throw new Error(`Unknown tool: ${name}`);
}

router.post('/', async (req, res) => {
  const { id, method, params } = req.body || {};
  const reply = (result) => res.json({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => res.json({ jsonrpc: '2.0', id, error: { code, message } });

  try {
    if (method === 'initialize') {
      return reply({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'persistence', version: '1.0.0' },
      });
    }
    if (method === 'tools/list') {
      return reply({ tools: TOOLS });
    }
    if (method === 'tools/call') {
      const p = params || {};
      if (!p.name) return fail(-32602, 'Missing params.name');
      // Read-only developer API keys (a scopes array without 'write') can't mutate.
      if (WRITE_TOOLS.has(p.name) && Array.isArray(req.user.scopes) && !req.user.scopes.includes('write')) {
        return fail(-32003, 'This credential is read-only (missing write scope).');
      }
      const data = await callTool(req.user.id, p.name, p.arguments || {});
      return reply({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
    }
    if (method === 'notifications/initialized' || method === 'ping') {
      return reply({});
    }
    return fail(-32601, `Method not found: ${method}`);
  } catch (err) {
    return fail(-32000, err.message);
  }
});

// GET for discovery / health
router.get('/', (req, res) => res.json({ server: 'persistence-mcp', tools: TOOLS.map(t => t.name) }));

module.exports = router;
