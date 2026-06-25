'use client';
import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useStore, apiCall } from '@/lib/store';

// Founder/admin dashboard. Access is controlled server-side by the ADMIN_EMAILS
// env var on the backend — non-admins get a 403.
export default function AdminPage() {
  const { user, accessToken } = useStore();
  const [metrics, setMetrics] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) { setLoading(false); return; }
    Promise.all([
      apiCall('/api/admin/metrics', { token: accessToken }),
      apiCall('/api/admin/stats', { token: accessToken }).catch(() => null),
      apiCall('/api/admin/users?limit=200', { token: accessToken }).catch(() => ({ users: [] })),
    ])
      .then(([m, s, u]) => { setMetrics(m); setStats(s); setUsers(u?.users || []); })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => (u.email || '').toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  const card: React.CSSProperties = {
    border: '1px solid rgba(var(--fg),0.1)', borderRadius: 12, padding: '16px 18px', background: 'rgba(var(--fg),0.02)',
  };
  const num: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 600, color: 'var(--text)' };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.4)', marginBottom: 6 };
  const h2: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)', marginBottom: 12 };
  const tip = { background: 'var(--ink)', border: '1px solid rgba(var(--fg),0.15)', borderRadius: 8, fontSize: 12 } as React.CSSProperties;
  const td: React.CSSProperties = { padding: '10px 8px', fontSize: 13, borderBottom: '1px solid rgba(var(--fg),0.07)' };

  function Stat({ label, value }: { label: string; value: any }) {
    return (<div style={card}><div style={lbl}>{label}</div><div style={num}>{value ?? '—'}</div></div>);
  }

  const signups = (stats?.signups_daily_30d || []).map((r: any) => ({
    day: new Date(r.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    count: r.count,
  }));

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ink)', color: 'var(--text)', padding: '40px 32px', maxWidth: 1040, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 400, marginBottom: 4 }}>Admin</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 28 }}>
        Users &amp; usage{metrics ? ` — generated ${new Date(metrics.generated_at).toLocaleString()}` : ''}
      </p>

      {!accessToken && !loading && (
        <p style={{ color: 'var(--muted)' }}>Sign in on the <a href="/" style={{ textDecoration: 'underline', color: 'var(--text)' }}>dashboard</a> first, then come back to /admin.</p>
      )}
      {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error} {error.includes('Admin') ? `(signed in as ${user?.email} — add this email to ADMIN_EMAILS on Railway)` : ''}</p>}

      {metrics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <section>
            <h2 style={h2}>Users</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              <Stat label="Total users" value={metrics.users.total} />
              <Stat label="New (7 days)" value={metrics.users.new_last_7d} />
              <Stat label="New (30 days)" value={metrics.users.new_last_30d} />
              {stats?.engagement && <Stat label="Active (24h)" value={stats.engagement.active_1d} />}
              {stats?.engagement && <Stat label="Active (7d)" value={stats.engagement.active_7d} />}
              <Stat label="Users with a bank" value={metrics.plaid.users_with_linked_bank} />
              {metrics.users.by_tier.map((t: any) => (
                <Stat key={t.tier} label={`Tier: ${t.tier}`} value={t.count} />
              ))}
            </div>
          </section>

          {signups.length > 1 && (
            <section>
              <h2 style={h2}>Signups (last 30 days)</h2>
              <div style={{ ...card, padding: '16px 12px 8px' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={signups} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(150,150,160,0.12)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: 'rgba(150,150,160,0.55)', fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'rgba(150,150,160,0.55)', fontSize: 11 }} allowDecimals={false} width={28} />
                    <Tooltip contentStyle={tip} cursor={{ stroke: 'rgba(150,150,160,0.3)' }} />
                    <Area type="monotone" dataKey="count" name="Signups" stroke="#3b7dff" fill="#3b7dff" fillOpacity={0.18} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ ...h2, marginBottom: 0 }}>Users ({filtered.length})</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email or name…"
                style={{ background: 'rgba(var(--fg),0.05)', border: '1px solid rgba(var(--fg),0.12)', borderRadius: 8, color: 'var(--text)', fontSize: 13, padding: '8px 12px', minWidth: 220, outline: 'none' }}
              />
            </div>
            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    {['Email', 'Name', 'Tier', 'Banks', 'Accounts', 'Joined', 'Last active'].map((h) => (
                      <th key={h} style={{ ...lbl, textAlign: 'left', padding: '12px 8px', marginBottom: 0 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td style={{ ...td, color: 'var(--muted)' }} colSpan={7}>No users.</td></tr>
                  )}
                  {filtered.map((u) => (
                    <tr key={u.id}>
                      <td style={{ ...td, color: 'var(--text)' }}>{u.email}</td>
                      <td style={{ ...td, color: 'var(--muted)' }}>{u.full_name || '—'}</td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize', padding: '2px 8px', borderRadius: 20, background: u.tier === 'free' ? 'rgba(var(--fg),0.08)' : 'rgba(59,125,255,0.18)', color: u.tier === 'free' ? 'var(--muted)' : '#3b7dff' }}>{u.tier}</span>
                      </td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{u.linked_banks}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{u.account_count}</td>
                      <td style={{ ...td, color: 'var(--muted)' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td style={{ ...td, color: 'var(--muted)' }}>{u.last_active ? new Date(u.last_active).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 style={h2}>Activity</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              <Stat label="Transactions (all time)" value={metrics.activity.transactions_total} />
              <Stat label="Transactions (7d)" value={metrics.activity.transactions_last_7d} />
              <Stat label="AI messages (all time)" value={metrics.activity.ai_messages_total} />
              <Stat label="AI messages (7d)" value={metrics.activity.ai_messages_last_7d} />
              <Stat label="Linked institutions" value={metrics.plaid.linked_institutions} />
              <Stat label="Active bills" value={metrics.content.active_bills} />
              <Stat label="Open goals" value={metrics.content.open_goals} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
