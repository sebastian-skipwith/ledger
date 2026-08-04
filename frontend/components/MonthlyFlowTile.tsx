'use client';
import { useEffect, useState } from 'react';
import { formatCurrency, wsHeaders } from '@/lib/store';
import FlowDrillModal from './FlowDrillModal';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Monthly income OR expenses, auto-detected from this month's transactions (in
// Plaid, a credit/deposit is a negative amount = income; a debit is positive =
// expense). Shows the total + a top-N breakdown (income by source, expense by
// category). Workspace-scoped via wsHeaders.
export default function MonthlyFlowTile({ token, mode }: { token: string; mode: 'income' | 'expenses' }) {
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState(false);
  const isIncome = mode === 'income';

  useEffect(() => {
    const from = new Date(); from.setDate(1);
    const fromStr = from.toISOString().slice(0, 10);
    fetch(`${API}/api/transactions?from=${fromStr}&limit=500`, { headers: wsHeaders(token) })
      .then((r) => r.json())
      .then((d) => { setTxns(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="card shimmer" style={{ height: 200 }} />;

  const rows = txns.filter((t) => (isIncome ? Number(t.amount) < 0 : Number(t.amount) > 0));
  const total = rows.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const groups: Record<string, number> = {};
  for (const t of rows) {
    const key = isIncome
      ? (t.merchant_name || t.name || 'Income')
      : (t.category_custom || (Array.isArray(t.category) ? t.category[0] : t.category) || 'Other');
    groups[key] = (groups[key] || 0) + Math.abs(Number(t.amount) || 0);
  }
  const breakdown = Object.entries(groups).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  const color = isIncome ? '#16a34a' : '#dc2626';

  return (
    <div className="card" style={{ padding: 16 }}>
      {drill && <FlowDrillModal metric={mode} onClose={() => setDrill(false)} />}
      <div onClick={() => setDrill(true)} title="Click for the full breakdown" style={{ cursor: 'pointer' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Monthly {isIncome ? 'Income' : 'Expenses'} <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>· details</span></div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, color, marginBottom: 12 }}>{formatCurrency(total)}</div>
      </div>
      {breakdown.length === 0 ? (
        <p style={{ color: 'rgba(var(--fg),0.4)', fontSize: 12 }}>Nothing detected this month yet.</p>
      ) : breakdown.map((b, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(var(--fg),0.05)' }}>
          <span style={{ fontSize: 12, color: 'rgba(var(--fg),0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(var(--fg),0.85)', flexShrink: 0 }}>{formatCurrency(b.value)}</span>
        </div>
      ))}
    </div>
  );
}
