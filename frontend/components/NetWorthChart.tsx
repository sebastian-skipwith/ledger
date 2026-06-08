'use client';
// NetWorthChart.tsx
import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function NetWorthChart({ token }: { token: string }) {
  const [data, setData] = useState<any[]>([]);
  const [range, setRange] = useState(90);

  useEffect(() => {
    fetch(`${API}/api/net-worth?days=${range}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(rows => setData(rows.map((r: any) => ({
        date: new Date(r.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: Math.round(parseFloat(r.net_worth)),
      }))))
      .catch(() => {});
  }, [range, token]);

  const fmt = (v: number) => `$${Math.round(v / 1000)}k`;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Net Worth Trend</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[30, 90, 180, 365].map(d => (
            <button key={d} onClick={() => setRange(d)} style={{
              fontSize: 10, padding: '3px 9px', borderRadius: 5,
              border: '1px solid rgba(var(--fg),0.1)',
              background: range === d ? 'var(--text)' : 'transparent',
              color: range === d ? 'var(--accent-fg)' : 'rgba(var(--fg),0.4)',
              cursor: 'pointer', fontFamily: 'var(--font-syne)', fontWeight: 600,
            }}>
              {d === 365 ? '1Y' : `${d}D`}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--text)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--text)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={fmt} tick={{ fill: 'var(--muted)', fontSize: 9 }} tickLine={false} axisLine={false} width={42} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid rgba(var(--fg),0.1)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted)' }}
              formatter={(v: any) => [`$${v.toLocaleString()}`, 'Net Worth']}
            />
            <Area type="monotone" dataKey="value" stroke="var(--text)" strokeWidth={2} fill="url(#goldGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default NetWorthChart;
