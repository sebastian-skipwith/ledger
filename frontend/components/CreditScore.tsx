'use client';
import { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from 'recharts';
import { apiCall } from '@/lib/store';

function band(score: number) {
  if (score >= 800) return { label: 'Excellent', color: '#16a34a' };
  if (score >= 740) return { label: 'Very Good', color: '#22c55e' };
  if (score >= 670) return { label: 'Good', color: '#84cc16' };
  if (score >= 580) return { label: 'Fair', color: '#f59e0b' };
  return { label: 'Poor', color: '#ef4444' };
}

export default function CreditScoreCard({ token }: { token: string }) {
  const [hist, setHist] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);

  async function load() {
    try { const d = await apiCall('/api/credit', { token }); setHist(Array.isArray(d) ? d : []); } catch {}
  }
  useEffect(() => { if (token) load(); }, [token]);

  async function save() {
    setErr('');
    const n = parseInt(input, 10);
    if (!Number.isFinite(n) || n < 300 || n > 850) { setErr('Enter a score between 300 and 850.'); return; }
    setBusy(true);
    try {
      await apiCall('/api/credit', { method: 'POST', token, body: JSON.stringify({ score: n, source }) });
      setInput(''); setSource(''); setOpen(false); await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const latest = hist[0];
  const b = latest ? band(Number(latest.score)) : null;
  const prev = hist[1];
  const change = latest && prev ? Number(latest.score) - Number(prev.score) : null;
  const chartData = [...hist].reverse().map(h => ({ score: Number(h.score) }));

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', background: 'rgba(var(--fg),0.05)',
    border: '1px solid rgba(var(--fg),0.12)', borderRadius: 7, color: 'var(--text)',
    fontSize: 13, fontFamily: 'var(--font-syne)', outline: 'none', marginBottom: 8,
  };

  return (
    <div style={{ border: '1px solid rgba(var(--fg),0.1)', borderRadius: 12, padding: 18, background: 'rgba(var(--fg),0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)' }}>Credit Score</div>
        <button onClick={() => setOpen(o => !o)} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'transparent', border: '1px solid rgba(var(--fg),0.15)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontFamily: 'var(--font-syne)' }}>
          {open ? 'Cancel' : 'Update'}
        </button>
      </div>

      {!open && (
        latest ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 600, color: b!.color, lineHeight: 1 }}>{latest.score}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: b!.color, marginTop: 4 }}>{b!.label}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>
                {change !== null && change !== 0 && (
                  <span style={{ color: change > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {change > 0 ? '▲' : '▼'} {Math.abs(change)} pts&nbsp;
                  </span>
                )}
                of 850
              </div>
            </div>
            <div style={{ flex: 1, height: 70 }}>
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 6, right: 4, bottom: 4, left: 4 }}>
                    <YAxis domain={[300, 850]} hide />
                    <Tooltip formatter={(v: any) => [v, 'Score']} labelFormatter={() => ''} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Line type="monotone" dataKey="score" stroke={b!.color} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', height: '100%' }}>Add another reading to see your trend.</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            No score yet. Credit scores aren't available through bank connections — tap <strong>Update</strong> to record what your bank, Credit Karma, or card issuer shows, and we'll track the trend.
          </div>
        )
      )}

      {open && (
        <div>
          <input style={inp} type="number" inputMode="numeric" placeholder="Your score (300–850)" value={input} onChange={e => setInput(e.target.value)} />
          <input style={inp} placeholder="Source (optional — e.g. Credit Karma, Chase)" value={source} onChange={e => setSource(e.target.value)} />
          {err && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{err}</div>}
          <button onClick={save} disabled={busy} style={{ width: '100%', padding: 9, background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-syne)', cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Saving…' : 'Save score'}
          </button>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
            Plaid doesn't provide credit scores, so this is tracked manually. Automatic pulls would need a dedicated credit-bureau integration.
          </div>
        </div>
      )}
    </div>
  );
}
