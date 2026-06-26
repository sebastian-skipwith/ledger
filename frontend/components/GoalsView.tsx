'use client';
import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { formatCurrency, wsHeaders } from '@/lib/store';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const input: CSSProperties = {
  background: 'rgba(var(--fg),0.05)', border: '1px solid rgba(var(--fg),0.1)',
  borderRadius: 7, padding: '7px 10px', color: 'var(--white)', fontSize: 12,
  outline: 'none', fontFamily: 'var(--font-syne)',
};
const btn: CSSProperties = {
  background: 'rgba(var(--fg),0.06)', border: '1px solid rgba(var(--fg),0.12)',
  borderRadius: 7, padding: '7px 12px', color: 'rgba(var(--fg),0.85)', fontSize: 11.5,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-syne)',
};

export default function GoalsView({ token }: { token: string }) {
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');

  function load() {
    setLoading(true);
    fetch(`${API}/api/goals`, { headers: wsHeaders(token) })
      .then(r => r.json())
      .then(d => { setGoals(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, [token]);

  async function createGoal() {
    if (!name.trim() || !Number(target)) return;
    await fetch(`${API}/api/goals`, {
      method: 'POST',
      headers: wsHeaders(token),
      body: JSON.stringify({ name: name.trim(), type: 'savings', target_amount: Number(target) }),
    });
    setName(''); setTarget(''); setAdding(false); load();
  }
  async function removeGoal(id: string) {
    await fetch(`${API}/api/goals/${id}`, { method: 'DELETE', headers: wsHeaders(token) });
    load();
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Goals</div>
        <button onClick={() => setAdding(v => !v)} style={btn}>{adding ? 'Cancel' : '+ New goal'}</button>
      </div>

      {adding && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Goal name" style={{ ...input, flex: 1, minWidth: 160 }} />
          <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Target $" type="number" style={{ ...input, width: 120 }} />
          <button onClick={createGoal} style={{ ...btn, background: 'var(--text)', color: 'var(--ink)', border: 'none' }}>Save</button>
        </div>
      )}

      {loading ? (
        <div className="shimmer" style={{ height: 160, borderRadius: 8 }} />
      ) : goals.length === 0 ? (
        <p style={{ color: 'rgba(var(--fg),0.4)', fontSize: 13, padding: '8px 0' }}>No goals yet. Create one to start tracking.</p>
      ) : goals.map(g => {
        const cur = Number(g.current_amount) || 0;
        const tgt = Number(g.target_amount) || 0;
        const pct = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
        return (
          <div key={g.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(var(--fg),0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'rgba(var(--fg),0.9)' }}>{g.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(var(--fg),0.7)' }}>{formatCurrency(cur)} / {formatCurrency(tgt)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--fg),0.08)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--text)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              <span style={{ fontSize: 10.5, color: 'rgba(var(--fg),0.5)' }}>
                {pct}%{g.target_date ? ` · by ${new Date(g.target_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}
              </span>
              <button onClick={() => removeGoal(g.id)} style={{ background: 'transparent', border: 'none', color: 'rgba(220,38,38,0.6)', fontSize: 10.5, cursor: 'pointer' }}>Remove</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
