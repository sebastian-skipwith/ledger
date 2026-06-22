'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, AreaChart, Area, Sankey,
} from 'recharts';
import { apiCall, formatCurrency } from '@/lib/store';
import CreditScoreCard from './CreditScore';

const PALETTE = ['#3b7dff', '#16a34a', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#ef4444', '#84cc16', '#6366f1', '#f97316', '#14b8a6', '#eab308'];
const AXIS = 'rgba(150,150,160,0.55)';

function Card({ title, sub, span, children }: { title: string; sub?: string; span?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid rgba(var(--fg),0.1)', borderRadius: 12, padding: 18, background: 'rgba(var(--fg),0.02)', gridColumn: span ? '1 / -1' : undefined, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)' }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

function Empty({ h = 200, label }: { h?: number; label: string }) {
  return <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', padding: 12 }}>{label}</div>;
}

const num = (v: any) => Number(v) || 0;
const tip = { contentStyle: { fontSize: 12, borderRadius: 8, border: '1px solid rgba(150,150,160,0.3)' } as React.CSSProperties };
const money = (v: any) => formatCurrency(num(v), true);

export default function Analytics({ token, accounts }: { token: string; accounts: any[] }) {
  const [history, setHistory] = useState<any[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    const from = new Date(); from.setDate(from.getDate() - 120);
    const fromStr = from.toISOString().slice(0, 10);
    apiCall('/api/net-worth?days=180', { token }).then(d => setHistory(Array.isArray(d) ? d : [])).catch(() => {});
    apiCall(`/api/transactions?from=${fromStr}&limit=1000`, { token }).then(d => setTxns(Array.isArray(d) ? d : [])).catch(() => {});
    apiCall('/api/transactions/summary?months=6', { token }).then(d => setMonthly(Array.isArray(d) ? d : [])).catch(() => {});
  }, [token]);

  // Asset allocation (positive holdings only)
  const allocation = useMemo(() => {
    let cash = 0, inv = 0, ret = 0;
    for (const a of accounts) {
      const v = num(a.current_balance);
      const sub = (a.subtype || '').toLowerCase();
      const isRet = ['401k', 'ira', 'roth'].some(k => sub.includes(k));
      if (a.type === 'depository') cash += v;
      else if (a.type === 'investment' && isRet) ret += v;
      else if (a.type === 'investment') inv += v;
    }
    return [
      { name: 'Cash', value: cash },
      { name: 'Investments', value: inv },
      { name: 'Retirement', value: ret },
    ].filter(d => d.value > 0);
  }, [accounts]);

  // Net-worth composition over time
  const composition = useMemo(() => history
    .slice()
    .sort((a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime())
    .map(h => {
      const b = h.breakdown || {};
      return {
        date: new Date(h.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        Cash: num(b.cash), Investments: num(b.investments), Retirement: num(b.retirement),
      };
    }), [history]);

  // Spending by category (expenses = positive amount in Plaid)
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of txns) {
      const amt = num(t.amount);
      if (amt <= 0) continue;
      const cat = (Array.isArray(t.category) && t.category[0]) || t.category || 'Other';
      m[cat] = (m[cat] || 0) + amt;
    }
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [txns]);

  // Top merchants
  const byMerchant = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of txns) {
      const amt = num(t.amount);
      if (amt <= 0) continue;
      const name = t.merchant_name || t.name || 'Unknown';
      m[name] = (m[name] || 0) + amt;
    }
    return Object.entries(m).map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 21) + '…' : name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [txns]);

  // Monthly income vs expenses
  const monthlyData = useMemo(() => monthly.slice().reverse().map(m => ({
    month: m.month, Income: num(m.income), Expenses: num(m.expenses),
  })), [monthly]);

  // Account balances
  const balances = useMemo(() => accounts
    .map(a => ({ name: (a.name || '').length > 20 ? a.name.slice(0, 19) + '…' : a.name, value: Math.abs(num(a.current_balance)), liability: ['credit', 'loan'].includes(a.type) }))
    .filter(a => a.value > 0).sort((a, b) => b.value - a.value).slice(0, 12), [accounts]);

  // Sankey: income -> spending categories (+ leftover)
  const sankey = useMemo(() => {
    const income = txns.reduce((s, t) => s + (num(t.amount) < 0 ? Math.abs(num(t.amount)) : 0), 0);
    const cats = byCategory.slice(0, 6);
    const totalSpend = cats.reduce((s, c) => s + c.value, 0);
    // Need at least two spending categories with real spend so the diagram
    // actually branches — otherwise recharts renders a degenerate empty block.
    if (cats.length < 2 || totalSpend <= 0) return null;
    const rootName = income > 0 ? 'Income' : 'Spending';
    const nodes = [{ name: rootName }, ...cats.map(c => ({ name: c.name }))];
    const links = cats.map((c, i) => ({ source: 0, target: i + 1, value: Math.max(1, Math.round(c.value)) }));
    if (income > totalSpend) {
      nodes.push({ name: 'Saved / Leftover' });
      links.push({ source: 0, target: nodes.length - 1, value: Math.round(income - totalSpend) });
    }
    return { nodes, links };
  }, [txns, byCategory]);

  const hasData = accounts.length > 0 || txns.length > 0;

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 400, color: 'var(--white)', marginBottom: 4 }}>Analytics</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        A full read on your money — allocation, cash flow, spending, and trends.{!hasData && ' Link an account to populate these.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        <CreditScoreCard token={token} />

        <Card title="Asset Allocation" sub="Where your money sits today">
          {allocation.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={52} outerRadius={86} paddingAngle={2}>
                  {allocation.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any, n: any) => [formatCurrency(num(v)), n]} {...tip} />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty h={220} label="No asset accounts yet." />}
        </Card>

        <Card title="Net Worth Composition" sub="Assets over time">
          {composition.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={composition} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,160,0.12)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: AXIS }} minTickGap={28} />
                <YAxis tick={{ fontSize: 10, fill: AXIS }} tickFormatter={money} width={42} />
                <Tooltip formatter={(v: any, n: any) => [formatCurrency(num(v)), n]} {...tip} />
                <Area type="monotone" dataKey="Cash" stackId="1" stroke={PALETTE[0]} fill={PALETTE[0]} fillOpacity={0.5} />
                <Area type="monotone" dataKey="Investments" stackId="1" stroke={PALETTE[1]} fill={PALETTE[1]} fillOpacity={0.5} />
                <Area type="monotone" dataKey="Retirement" stackId="1" stroke={PALETTE[2]} fill={PALETTE[2]} fillOpacity={0.5} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty h={220} label="Net-worth history builds up day by day once linked." />}
        </Card>

        <Card title="Spending by Category" sub="Last ~120 days">
          {byCategory.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byCategory} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: AXIS }} tickFormatter={money} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: AXIS }} width={96} />
                <Tooltip formatter={(v: any) => formatCurrency(num(v))} {...tip} cursor={{ fill: 'rgba(150,150,160,0.08)' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {byCategory.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty h={220} label="No transactions yet." />}
        </Card>

        <Card title="Income vs Expenses" sub="Monthly">
          {monthlyData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,160,0.12)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: AXIS }} />
                <YAxis tick={{ fontSize: 10, fill: AXIS }} tickFormatter={money} width={42} />
                <Tooltip formatter={(v: any, n: any) => [formatCurrency(num(v)), n]} {...tip} cursor={{ fill: 'rgba(150,150,160,0.08)' }} />
                <Bar dataKey="Income" fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Expenses" fill="#dc2626" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty h={220} label="No transactions yet." />}
        </Card>

        <Card title="Top Merchants" sub="Where it goes">
          {byMerchant.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byMerchant} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: AXIS }} tickFormatter={money} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: AXIS }} width={110} />
                <Tooltip formatter={(v: any) => formatCurrency(num(v))} {...tip} cursor={{ fill: 'rgba(150,150,160,0.08)' }} />
                <Bar dataKey="value" fill={PALETTE[4]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty h={220} label="No transactions yet." />}
        </Card>

        <Card title="Account Balances" sub="Largest first">
          {balances.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={balances} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: AXIS }} tickFormatter={money} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: AXIS }} width={104} />
                <Tooltip formatter={(v: any) => formatCurrency(num(v))} {...tip} cursor={{ fill: 'rgba(150,150,160,0.08)' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {balances.map((b, i) => <Cell key={i} fill={b.liability ? '#dc2626' : '#16a34a'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty h={220} label="No accounts yet." />}
        </Card>

        <Card title="Cash Flow" sub="Income flowing into your spending" span>
          {sankey ? (
            <ResponsiveContainer width="100%" height={300}>
              <Sankey
                data={sankey}
                nodePadding={26}
                nodeWidth={12}
                margin={{ top: 10, right: 140, bottom: 10, left: 10 }}
                link={{ stroke: 'rgba(59,125,255,0.25)' }}
                node={{ stroke: 'none', fill: PALETTE[0] }}
              >
                <Tooltip formatter={(v: any) => formatCurrency(num(v))} {...tip} />
              </Sankey>
            </ResponsiveContainer>
          ) : <Empty h={300} label="Once transactions sync, you'll see income flow into spending categories here (Monarch-style)." />}
        </Card>
      </div>
    </div>
  );
}
