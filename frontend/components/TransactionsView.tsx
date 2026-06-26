'use client';
import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { formatCurrency, wsHeaders } from '@/lib/store';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const ctrl: CSSProperties = {
  background: 'rgba(var(--fg),0.05)', border: '1px solid rgba(var(--fg),0.1)',
  borderRadius: 7, padding: '6px 10px', color: 'var(--white)', fontSize: 12,
  outline: 'none', fontFamily: 'var(--font-syne)',
};

export default function TransactionsView({ token, accounts }: { token: string; accounts?: any[] }) {
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (account) params.set('account_id', account);
    fetch(`${API}/api/transactions?${params.toString()}`, { headers: wsHeaders(token) })
      .then(r => r.json())
      .then(data => { setTxns(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token, account]);

  const filtered = txns.filter(t => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    const cat = t.category_custom || (Array.isArray(t.category) ? t.category[0] : t.category) || '';
    return (t.merchant_name || t.name || '').toLowerCase().includes(s) || String(cat).toLowerCase().includes(s);
  });

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Transactions</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={ctrl} />
          <select value={account} onChange={e => setAccount(e.target.value)} style={ctrl}>
            <option value="">All accounts</option>
            {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="shimmer" style={{ height: 240, borderRadius: 8 }} />
      ) : filtered.length === 0 ? (
        <p style={{ color: 'rgba(var(--fg),0.4)', fontSize: 13, padding: '8px 0' }}>No transactions found.</p>
      ) : filtered.map(t => {
        const amt = Number(t.amount) || 0;
        const out = amt > 0; // positive = money out (expense)
        const cat = t.category_custom || (Array.isArray(t.category) ? t.category[0] : t.category) || t.account_name;
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(var(--fg),0.05)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'rgba(var(--fg),0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.merchant_name || t.name}
              </div>
              <div style={{ fontSize: 10.5, color: 'rgba(var(--fg),0.45)' }}>
                {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {cat}
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: out ? 'rgba(var(--fg),0.9)' : '#16a34a' }}>
              {out ? '-' : '+'}{formatCurrency(Math.abs(amt))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
