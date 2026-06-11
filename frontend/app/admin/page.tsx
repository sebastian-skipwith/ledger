'use client';
import { useEffect, useState } from 'react';
import { useStore, apiCall } from '@/lib/store';

// Founder/admin metrics dashboard. Access is controlled server-side by the
// ADMIN_EMAILS env var on the backend — non-admins get a 403.
export default function AdminPage() {
  const { user, accessToken } = useStore();
  const [metrics, setMetrics] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) { setLoading(false); return; }
    apiCall('/api/admin/metrics', { token: accessToken })
      .then(setMetrics)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const card: React.CSSProperties = {
    border: '1px solid rgba(var(--fg),0.1)', borderRadius: 12, padding: '16px 18px',
    background: 'rgba(var(--fg),0.02)',
  };
  const num: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 600, color: 'var(--text)' };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.4)', marginBottom: 6 };

  function Stat({ label, value }: { label: string; value: any }) {
    return (<div style={card}><div style={lbl}>{label}</div><div style={num}>{value ?? '—'}</div></div>);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ink)', color: 'var(--text)', padding: '40px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 400, marginBottom: 4 }}>Admin</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 28 }}>
        Business &amp; usage metrics{metrics ? ` — generated ${new Date(metrics.generated_at).toLocaleString()}` : ''}
      </p>

      {!accessToken && !loading && (
        <p style={{ color: 'var(--muted)' }}>Sign in on the <a href="/" style={{ textDecoration: 'underline', color: 'var(--text)' }}>dashboard</a> first, then come back to /admin.</p>
      )}
      {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error} {error.includes('Admin') ? `(signed in as ${user?.email} — add this email to ADMIN_EMAILS on Railway)` : ''}</p>}

      {metrics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <section>
            <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)', marginBottom: 12 }}>Users</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              <Stat label="Total users" value={metrics.users.total} />
              <Stat label="New (7 days)" value={metrics.users.new_last_7d} />
              <Stat label="New (30 days)" value={metrics.users.new_last_30d} />
              <Stat label="Active AI users (7d)" value={metrics.users.active_ai_users_7d} />
              {metrics.users.by_tier.map((t: any) => (
                <Stat key={t.tier} label={`Tier: ${t.tier}`} value={t.count} />
              ))}
            </div>
          </section>
          <section>
            <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)', marginBottom: 12 }}>Bank connections</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              <Stat label="Linked institutions" value={metrics.plaid.linked_institutions} />
              <Stat label="Users with a bank" value={metrics.plaid.users_with_linked_bank} />
              <Stat label="Visible accounts" value={metrics.plaid.visible_accounts} />
            </div>
          </section>
          <section>
            <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)', marginBottom: 12 }}>Activity</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              <Stat label="Transactions (all time)" value={metrics.activity.transactions_total} />
              <Stat label="Transactions (7d)" value={metrics.activity.transactions_last_7d} />
              <Stat label="AI messages (all time)" value={metrics.activity.ai_messages_total} />
              <Stat label="AI messages (7d)" value={metrics.activity.ai_messages_last_7d} />
              <Stat label="Snapshots today" value={metrics.activity.net_worth_snapshots_today} />
              <Stat label="Active bills" value={metrics.content.active_bills} />
              <Stat label="Open goals" value={metrics.content.open_goals} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
