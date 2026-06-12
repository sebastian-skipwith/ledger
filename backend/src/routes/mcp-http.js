const router = require('express').Router();
const { query } = require('../db');

// ─────────────────────────────────────────────────────────────────────────
// Remote MCP endpoint (JSON-RPC over HTTP). Lets ANY MCP client connect with
// just a URL + API key — no local Node install or config file needed.
//   URL:  https://<api>/api/mcp
//   Auth: Authorization: Bearer sk_live_...  (a developer API key)
// Mounted behind `authenticate`, so req.user is the key's owner.
// Implements the subset of MCP that read-only finance clients need:
// initialize, tools/list, tools/call.
// ─────────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_financial_summary',
    description: 'Net worth, cash, investments, retirement, debt and monthly bills.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_transactions',
    description: 'Recent transactions. Optional days (default 30) and limit (default 50).',
    inputSchema: { type: 'object', properties: { days: { type: 'number' }, limit: { type: 'number' } } },
  },
  {
    name: 'get_subscriptions',
    description: 'Detected recurring subscriptions and their total monthly cost.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_bills',
    description: 'Upcoming bills and recurring expenses.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_goals',
    description: 'Financial goals and progress.',
    inputSchema: { type: 'object', properties: {} },
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
      const data = await callTool(req.user.id, params.name, params.arguments || {});
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
