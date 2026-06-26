'use client';
import { useEffect, useState } from 'react';
import { apiCall, formatCurrency } from '@/lib/store';

export default function SubscriptionsTile({ token }: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCall('/api/intelligence/subscriptions', { token })
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="card shimmer" style={{ height: 200 }} />;

  const subs = (data && data.subscriptions) || [];

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Services &amp; Subscriptions</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{formatCurrency((data && data.total_monthly) || 0)}/mo</span>
      </div>
      {subs.length === 0 ? (
        <p style={{ color: 'rgba(var(--fg),0.4)', fontSize: 12 }}>No recurring charges detected yet.</p>
      ) : subs.slice(0, 8).map((s: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(var(--fg),0.05)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'rgba(var(--fg),0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.merchant}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{s.cadence} · {s.occurrences}×</div>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'rgba(var(--fg),0.85)', flexShrink: 0 }}>{formatCurrency(s.amount)}</span>
        </div>
      ))}
    </div>
  );
}
