'use client';
import { useState, useEffect } from 'react';
import { wsHeaders } from '@/lib/store';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function BillsList({ token, full }: { token: string; full?: boolean }) {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/bills`, { headers: wsHeaders(token) })
      .then(r => r.json())
      .then(data => { setBills(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="card shimmer" style={{ height: 200 }} />;

  const shown = full ? bills : bills.slice(0, 6);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{full ? 'Bills' : 'Upcoming Bills'}</div>
      {bills.length === 0 ? (
        <p style={{ color: 'rgba(var(--fg),0.3)', fontSize: 12 }}>No bills configured yet.</p>
      ) : shown.map((bill: any) => (
        <div key={bill.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(var(--fg),0.05)' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: bill.autopay ? 'var(--text)' : 'rgba(var(--fg),0.5)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: 'rgba(var(--fg),0.85)' }}>{bill.name}</span>
          {bill.next_due_date && (
            <span style={{ fontSize: 10, color: 'rgba(var(--fg),0.6)' }}>
              {new Date(bill.next_due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(var(--fg),0.8)' }}>${bill.amount}</span>
          <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: bill.autopay ? 'rgba(22,199,132,0.1)' : 'rgba(245,166,35,0.1)', color: bill.autopay ? 'var(--text)' : 'rgba(var(--fg),0.5)' }}>
            {bill.autopay ? 'AUTO' : 'DUE'}
          </span>
        </div>
      ))}
    </div>
  );
}
