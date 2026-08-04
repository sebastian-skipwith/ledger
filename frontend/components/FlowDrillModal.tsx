'use client';
import { useEffect, useState } from 'react';
import { formatCurrency, wsHeaders } from '@/lib/store';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Breakdown modal for flow metrics: monthly bills (each bill), monthly income
// (by source), expenses (by category), net income (both sides). Fetches its own
// data so it works from any surface (top bar or tiles).
export default function FlowDrillModal({ metric, onClose }: { metric: string | null; onClose: () => void }) {
  const [bills, setBills] = useState<any[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isBills = metric === 'monthly_bills';
  const isIncome = metric === 'income';
  const isExpenses = metric === 'expenses';
  const isNet = metric === 'net_income';

  useEffect(() => {
    if (!metric) return;
    setLoading(true);
    const from = new Date(); from.setDate(1);
    const fromStr = from.toISOString().slice(0, 10);
    const jobs: Promise<any>[] = [];
    jobs.push(isBills ? fetch(`${API}/api/bills`, { headers: wsHeaders() }).then((r) => r.json()).catch(() => []) : Promise.resolve([]));
    jobs.push(!isBills ? fetch(`${API}/api/transactions?from=${fromStr}&limit=500`, { headers: wsHeaders() }).then((r) => r.json()).catch(() => []) : Promise.resolve([]));
    Promise.all(jobs).then(([b, t]) => { setBills(Array.isArray(b) ? b : []); setTxns(Array.isArray(t) ? t : []); setLoading(false); });
  }, [metric]);

  if (!metric || !(isBills || isIncome || isExpenses || isNet)) return null;

  const income = txns.filter((t) => Number(t.amount) < 0);
  const expenses = txns.filter((t) => Number(t.amount) > 0);
  const sum = (xs: any[]) => xs.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

  function grouped(xs: any[], by: 'source' | 'category') {
    const g: Record<string, number> = {};
    for (const t of xs) {
      const k = by === 'source'
        ? (t.merchant_name || t.name || 'Income')
        : (t.category_custom || (Array.isArray(t.category) ? t.category[0] : t.category) || 'Other');
      g[k] = (g[k] || 0) + Math.abs(Number(t.amount) || 0);
    }
    return Object.entries(g).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }

  const title = isBills ? 'Monthly Bills' : isIncome ? 'Monthly Income' : isExpenses ? 'Monthly Expenses' : 'Net Monthly Income';
  const total = isBills
    ? bills.reduce((s, b) => s + (Number(b.amount) || 0), 0)
    : isIncome ? sum(income) : isExpenses ? sum(expenses) : sum(income) - sum(expenses);

  const Section = ({ label, rows, color }: { label?: string; rows: { name: string; value: number }[]; color: string }) => (
    <>
      {label && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.45)', margin: '12px 0 4px' }}>{label}</div>}
      {rows.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 12.5, padding: '8px 0' }}>Nothing this month yet.</div>
      ) : rows.slice(0, 14).map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(var(--fg),0.06)' }}>
          <span style={{ fontSize: 12.5, color: 'rgba(var(--fg),0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color, flexShrink: 0 }}>{formatCurrency(r.value)}</span>
        </div>
      ))}
    </>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', maxHeight: '80vh', overflow: 'auto', background: 'var(--ink)', border: '1px solid rgba(var(--fg),0.15)', borderRadius: 14, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500, color: isNet ? (total >= 0 ? '#16a34a' : '#dc2626') : 'var(--white)', marginBottom: 6 }}>
          {isNet && total > 0 ? '+' : ''}{formatCurrency(total)}
        </div>

        {loading ? (
          <div className="shimmer" style={{ height: 160, borderRadius: 8 }} />
        ) : isBills ? (
          <Section rows={bills.map((b) => ({ name: `${b.name}${b.frequency ? ` · ${b.frequency}` : ''}`, value: Number(b.amount) || 0 }))} color="var(--text)" />
        ) : isIncome ? (
          <Section rows={grouped(income, 'source')} color="#16a34a" />
        ) : isExpenses ? (
          <Section rows={grouped(expenses, 'category')} color="#dc2626" />
        ) : (
          <>
            <Section label={`Income · ${formatCurrency(sum(income))}`} rows={grouped(income, 'source')} color="#16a34a" />
            <Section label={`Expenses · ${formatCurrency(sum(expenses))}`} rows={grouped(expenses, 'category')} color="#dc2626" />
          </>
        )}
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 12 }}>{isBills ? 'Active bills you track (add more from the Bills tab).' : 'This calendar month, from your synced transactions.'}</div>
      </div>
    </div>
  );
}
