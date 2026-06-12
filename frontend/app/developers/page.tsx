'use client';
import { useEffect, useState } from 'react';
import { useStore, apiCall } from '@/lib/store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://ledger-production-5649.up.railway.app';

export default function DevelopersPage() {
  const { accessToken } = useStore();
  const [keys, setKeys] = useState<any[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!accessToken) { setLoading(false); return; }
    try { setKeys(await apiCall('/api/developer/keys', { token: accessToken })); }
    catch (e) { /* ignore */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [accessToken]);

  async function create() {
    const res = await apiCall('/api/developer/keys', { method: 'POST', token: accessToken!, body: JSON.stringify({ name: name || 'API key' }) });
    setNewKey(res.key);
    setName('');
    load();
  }
  async function revoke(id: string) {
    if (!confirm('Revoke this key? Integrations using it will stop working.')) return;
    await apiCall(`/api/developer/keys/${id}`, { method: 'DELETE', token: accessToken! });
    load();
  }

  const code: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 12, background: 'rgba(var(--fg),0.05)',
    border: '1px solid rgba(var(--fg),0.1)', borderRadius: 8, padding: '12px 14px',
    whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text)', lineHeight: 1.6,
  };
  const h2: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)', margin: '28px 0 12px' };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ink)', color: 'var(--text)', padding: '40px 32px', maxWidth: 820, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 400, marginBottom: 4 }}>Developers</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        Build custom integrations on your own financial data with the Persistence API and remote MCP server.
      </p>

      {!accessToken && !loading && <p style={{ color: 'var(--muted)' }}>Sign in on the <a href="/" style={{ textDecoration: 'underline', color: 'var(--text)' }}>dashboard</a> first.</p>}

      {accessToken && (
        <>
          <h2 style={h2}>API keys</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Key name (e.g. My Script)"
              style={{ flex: 1, padding: '9px 12px', background: 'rgba(var(--fg),0.05)', border: '1px solid rgba(var(--fg),0.12)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
            <button onClick={create} style={{ padding: '9px 18px', background: 'var(--text)', color: 'var(--ink)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Create key</button>
          </div>

          {newKey && (
            <div style={{ ...code, borderColor: '#16a34a', marginBottom: 14 }}>
              <strong style={{ color: '#16a34a' }}>Copy this key now — it won't be shown again:</strong>{'\n'}{newKey}
            </div>
          )}

          {keys.length === 0 && !loading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No keys yet.</p>}
          {keys.map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(var(--fg),0.07)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: k.revoked ? 'rgba(var(--fg),0.4)' : 'var(--text)' }}>{k.name} {k.revoked && '(revoked)'}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(var(--fg),0.45)' }}>{k.key_prefix} · {k.last_used_at ? 'last used ' + new Date(k.last_used_at).toLocaleDateString() : 'never used'}</div>
              </div>
              {!k.revoked && <button onClick={() => revoke(k.id)} style={{ background: 'transparent', border: '1px solid rgba(220,38,38,0.4)', color: '#dc2626', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer' }}>Revoke</button>}
            </div>
          ))}

          <h2 style={h2}>REST API</h2>
          <p style={{ fontSize: 13, color: 'var(--subtle)', marginBottom: 10, lineHeight: 1.6 }}>
            Authenticate with your key as a bearer token. All read endpoints from the dashboard work with API keys.
          </p>
          <div style={code}>{`curl ${API_BASE}/api/summary/hud \\
  -H "Authorization: Bearer ${newKey || 'sk_live_xxx'}"

# Other endpoints:
GET  /api/accounts
GET  /api/transactions?days=30
GET  /api/intelligence/subscriptions
GET  /api/intelligence/cash-flow
GET  /api/bills
GET  /api/goals`}</div>

          <h2 style={h2}>Remote MCP server</h2>
          <p style={{ fontSize: 13, color: 'var(--subtle)', marginBottom: 10, lineHeight: 1.6 }}>
            Connect any MCP client (Claude Desktop, Claude Code, Cursor, …) to your finances with just a URL and key — no local install.
          </p>
          <div style={code}>{`{
  "mcpServers": {
    "persistence": {
      "url": "${API_BASE}/api/mcp",
      "headers": { "Authorization": "Bearer ${newKey || 'sk_live_xxx'}" }
    }
  }
}`}</div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
            Exposes read-only tools: financial summary, transactions, subscriptions, bills, goals.
          </p>
        </>
      )}
    </div>
  );
}
