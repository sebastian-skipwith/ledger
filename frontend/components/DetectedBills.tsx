'use client';
import { useEffect, useState } from 'react';
import { formatCurrency, wsHeaders } from '@/lib/store';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Auto-detected bills: reuses the recurring-charge detector, shows the ones you
// aren't already tracking as bills, and lets you add them in one tap.
export default function DetectedBills({ token }: { token: string }) {
  const [detected, setDetected] = useState<any[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/api/intelligence/subscriptions`, { headers: wsHeaders(token) }).then((r) => r.json()).catch(() => ({})),
      fetch(`${API}/api/bills`, { headers: wsHeaders(token) }).then((r) => r.json()).catch(() => []),
    ]).then(([subs, bills]) => {
      setDetected((subs && subs.subscriptions) || []);
      setExisting((Array.isArray(bills) ? bills : []).map((b: any) => String(b.name || '').toLowerCase().trim()));
      setLoading(false);
    });
  }, [token]);

  async function addBill(s: any) {
    setAdded((a) => ({ ...a, [s.merchant]: true }));
    await fetch(`${API}/api/bills`, {
      method: 'POST', headers: wsHeaders(token),
      body: JSON.stringify({ name: s.merchant, amount: s.amount, frequency: s.cadence, autopay: false }),
    }).catch(() => {});
  }

  if (loading) return null;
  const candidates = detected.filter((s) => !existing.includes(String(s.merchant || '').toLowerCase().trim()) && !added[s.merchant]);
  if (!candidates.length) return null;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Detected recurring charges</div>
      <p style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10 }}>Found in your transactions. Add the ones you want to track as bills.</p>
      {candidates.slice(0, 10).map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(var(--fg),0.05)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'rgba(var(--fg),0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.merchant}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{s.cadence} · {formatCurrency(s.amount)}</div>
          </div>
          <button onClick={() => addBill(s)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: 'none', background: 'var(--text)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-syne)', fontWeight: 600, flexShrink: 0 }}>Add</button>
        </div>
      ))}
    </div>
  );
}
