'use client';
import { useEffect, useState } from 'react';
import { apiCall, formatCurrency } from '@/lib/store';

function Row({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'rgba(var(--fg),0.8)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color }}>{formatCurrency(value)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--fg),0.08)', overflow: 'hidden' }}>
        <div style={{ width: '100%', height: '100%', background: color, transformOrigin: 'left' }} />
      </div>
    </div>
  );
}

export default function CashFlowTile({ token }: { token: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCall('/api/transactions/summary?months=6', { token })
      .then((d) => { setData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="card shimmer" style={{ height: 180 }} />;

  const cur = data[0] || {}; // summary is ordered month DESC
  const income = Number(cur.income) || 0;
  const expenses = Number(cur.expenses) || 0;
  const net = income - expenses;
  const max = Math.max(income, expenses, 1);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Cash Flow — this month</div>
      {/* bar widths scaled to the larger of the two */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: 'rgba(var(--fg),0.8)' }}>Money in</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: '#16a34a' }}>{formatCurrency(income)}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--fg),0.08)', overflow: 'hidden' }}>
          <div style={{ width: `${(income / max) * 100}%`, height: '100%', background: '#16a34a' }} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: 'rgba(var(--fg),0.8)' }}>Money out</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: '#dc2626' }}>{formatCurrency(expenses)}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--fg),0.08)', overflow: 'hidden' }}>
          <div style={{ width: `${(expenses / max) * 100}%`, height: '100%', background: '#dc2626' }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(var(--fg),0.07)' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Net</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: net >= 0 ? '#16a34a' : '#dc2626' }}>
          {net >= 0 ? '+' : ''}{formatCurrency(net)}
        </span>
      </div>
    </div>
  );
}
