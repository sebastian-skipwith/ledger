/**
 * Ledger MCP Server
 *
 * Exposes your personal finances as MCP tools so Claude, ChatGPT, or any
 * MCP-compatible AI assistant can read balances, analyze spending, set goals,
 * and (with confirmation) propose transfers.
 *
 * Add to Claude Desktop claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "ledger": {
 *       "command": "node",
 *       "args": ["/path/to/ledger/mcp-server/src/index.js"],
 *       "env": { "LEDGER_API_URL": "http://localhost:3001", "LEDGER_USER_TOKEN": "..." }
 *     }
 *   }
 * }
 */

import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = process.env.LEDGER_API_URL || 'http://localhost:3001';
const TOKEN = process.env.LEDGER_USER_TOKEN;

if (!TOKEN) {
  console.error('LEDGER_USER_TOKEN is required. Get it from your Ledger profile settings.');
  process.exit(1);
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API error ${res.status}: ${err.error || res.statusText}`);
  }
  return res.json();
}

const server = new McpServer({
  name: 'ledger',
  version: '1.0.0',
});

// ─────────────────────────────────────────────
// TOOLS
// ─────────────────────────────────────────────

server.tool(
  'get_financial_summary',
  'Get a complete financial snapshot: net worth, cash, investments, retirement, debt, and this month\'s cash flow.',
  {},
  async () => {
    const [accounts, insights] = await Promise.all([
      api('/api/accounts'),
      api('/api/ai/insights'),
    ]);

    const accts = accounts;
    const cash = accts.filter(a => a.type === 'depository').reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
    const investments = accts.filter(a => a.type === 'investment').reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
    const debt = accts.filter(a => ['credit', 'loan'].includes(a.type)).reduce((s, a) => s + Math.abs(parseFloat(a.current_balance || 0)), 0);

    const summary = insights.context;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          net_worth: summary.net_worth,
          cash: Math.round(cash),
          investments: Math.round(investments),
          retirement: summary.retirement,
          total_debt: Math.round(debt),
          monthly_bills: summary.monthly_bills,
          accounts: accts.map(a => ({
            name: a.name,
            type: a.type,
            subtype: a.subtype,
            balance: parseFloat(a.current_balance),
            institution: a.institution_name,
          })),
          ai_insights: insights.insights,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'get_transactions',
  'Fetch recent transactions. Filter by date range, account, or spending category.',
  {
    days: z.number().optional().describe('How many days back to look (default 30)'),
    account_name: z.string().optional().describe('Filter to a specific account by name'),
    category: z.string().optional().describe('Filter by spending category'),
    limit: z.number().optional().describe('Max results (default 50)'),
  },
  async ({ days = 30, account_name, category, limit = 50 }) => {
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    let accounts;
    if (account_name) {
      const all = await api('/api/accounts');
      accounts = all.filter(a => a.name.toLowerCase().includes(account_name.toLowerCase()));
    }

    const params = new URLSearchParams({ from, limit });
    if (category) params.set('category', category);
    if (accounts?.length === 1) params.set('account_id', accounts[0].id);

    const txns = await api(`/api/transactions?${params}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: txns.length,
          date_range: { from, to: new Date().toISOString().split('T')[0] },
          transactions: txns.map(t => ({
            date: t.date,
            name: t.merchant_name || t.name,
            amount: parseFloat(t.amount),
            category: t.category_custom || t.category?.[0],
            account: t.account_name,
          })),
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'get_spending_summary',
  'Get spending totals by category for the last N months.',
  {
    months: z.number().optional().describe('Number of months (default 3)'),
  },
  async ({ months = 3 }) => {
    const data = await api(`/api/transactions/summary?months=${months}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(data, null, 2),
      }],
    };
  }
);

server.tool(
  'get_net_worth_history',
  'Fetch net worth trend over time (up to 1 year of daily snapshots).',
  {
    days: z.number().optional().describe('Days of history (default 90)'),
  },
  async ({ days = 90 }) => {
    const data = await api(`/api/net-worth?days=${days}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(data, null, 2),
      }],
    };
  }
);

server.tool(
  'get_bills',
  'List all upcoming bills and recurring expenses.',
  {},
  async () => {
    const bills = await api('/api/bills');
    const total = bills.reduce((s, b) => s + parseFloat(b.amount), 0);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ monthly_total: Math.round(total), bills }, null, 2),
      }],
    };
  }
);

server.tool(
  'get_goals',
  'List financial goals and progress.',
  {},
  async () => {
    const goals = await api('/api/goals');
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(goals, null, 2),
      }],
    };
  }
);

server.tool(
  'create_goal',
  'Create a new financial goal (savings, debt payoff, investment target).',
  {
    name: z.string().describe('Goal name, e.g. "Emergency Fund"'),
    type: z.enum(['savings', 'debt_payoff', 'investment']),
    target_amount: z.number().describe('Target dollar amount'),
    target_date: z.string().optional().describe('Target date in YYYY-MM-DD format'),
    monthly_contribution: z.number().optional().describe('Planned monthly contribution'),
    notes: z.string().optional(),
  },
  async (params) => {
    const goal = await api('/api/goals', { method: 'POST', body: params });
    return {
      content: [{
        type: 'text',
        text: `Goal created: "${goal.name}" — target $${goal.target_amount}${goal.target_date ? ` by ${goal.target_date}` : ''}.`,
      }],
    };
  }
);

server.tool(
  'propose_automation_rule',
  'PROPOSE (does not execute) an automation rule for user review. Always use this instead of direct transfers. Returns a summary for the user to confirm.',
  {
    name: z.string().describe('Rule name, e.g. "Auto-transfer to HYSA when checking > $5k"'),
    trigger_type: z.enum(['balance_threshold', 'date', 'spending_category']),
    trigger_description: z.string().describe('Human-readable trigger description'),
    action_description: z.string().describe('Human-readable action description'),
    estimated_monthly_impact: z.number().optional().describe('Estimated monthly $ impact'),
  },
  async (params) => {
    // This only returns a proposal — no money moves without user confirmation in the app
    return {
      content: [{
        type: 'text',
        text: `PROPOSED RULE (not yet active — confirm in Ledger app):

Name: ${params.name}
Trigger: ${params.trigger_description}
Action: ${params.action_description}
${params.estimated_monthly_impact ? `Estimated monthly impact: $${params.estimated_monthly_impact}` : ''}

To activate this rule, open Ledger → Automations → Review Pending Rules.

⚠️ No money has been moved. This is a proposal only.`,
      }],
    };
  }
);

server.tool(
  'analyze_debt_payoff',
  'Calculate optimal debt payoff strategy (avalanche vs snowball) based on current balances.',
  {
    extra_monthly_payment: z.number().optional().describe('Extra monthly amount available for debt ($)'),
    strategy: z.enum(['avalanche', 'snowball', 'compare']).optional(),
  },
  async ({ extra_monthly_payment = 0, strategy = 'compare' }) => {
    const accounts = await api('/api/accounts');
    const debts = accounts.filter(a => ['credit', 'loan'].includes(a.type)).map(a => ({
      name: a.name,
      balance: Math.abs(parseFloat(a.current_balance)),
      // APR would come from Plaid Liabilities product in production
      estimated_apr: a.subtype === 'credit card' ? 24.99 : 6.5,
    }));

    if (!debts.length) {
      return { content: [{ type: 'text', text: 'No debt accounts found — you\'re debt-free!' }] };
    }

    const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
    const minPayments = debts.reduce((s, d) => s + d.balance * 0.02, 0); // estimate
    const available = minPayments + extra_monthly_payment;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total_debt: Math.round(totalDebt),
          monthly_available: Math.round(available),
          extra_payment: extra_monthly_payment,
          debts,
          recommendation: strategy === 'avalanche' || strategy === 'compare'
            ? `Avalanche: Pay minimums on all, put extra $${extra_monthly_payment} toward highest APR (${debts.sort((a,b) => b.estimated_apr - a.estimated_apr)[0]?.name}). Saves most interest.`
            : `Snowball: Pay minimums on all, put extra $${extra_monthly_payment} toward smallest balance first. Best for motivation.`,
          note: 'APR estimates shown — link Plaid Liabilities for exact rates.',
        }, null, 2),
      }],
    };
  }
);

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Ledger MCP server running');
