'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function BillsList({ token }: { token: string }) {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/bills`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setBills(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="card shimmer" style={{ height: 200 }} />;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Upcoming Bills</div>
      {bills.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>No bills configured yet.</p>
      ) : bills.slice(0, 6).map((bill: any) => (
        <div key={bill.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: bill.autopay ? '#f0f0f8' : '#cccccc', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: 'rgba(180,180,200,0.85)' }}>{bill.name}</span>
          {bill.next_due_date && (
            <span style={{ fontSize: 10, color: 'rgba(150,150,170,0.6)' }}>
              {new Date(bill.next_due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>${bill.amount}</span>
          <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: bill.autopay ? 'rgba(22,199,132,0.1)' : 'rgba(245,166,35,0.1)', color: bill.autopay ? '#f0f0f8' : '#cccccc' }}>
            {bill.autopay ? 'AUTO' : 'DUE'}
          </span>
        </div>
      ))}
    </div>
  );
}
