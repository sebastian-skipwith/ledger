'use client';
import { useEffect, useState } from 'react';
import { useStore, apiCall } from '@/lib/store';
import AuthScreen from '@/components/AuthScreen';

// OAuth consent screen. Claude (or any MCP client) sends the user here via
// /oauth/authorize. If logged out we show the normal sign-in; once signed in,
// the user grants read-only access and we POST the approval, which mints the
// authorization code and redirects back to the client.
export default function ConsentPage() {
  const { user, accessToken } = useStore();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('request');
    setRequestId(r);
    if (!r) { setError('Missing authorization request.'); return; }
    apiCall('/oauth/authorization/' + encodeURIComponent(r))
      .then(setInfo)
      .catch(() => setError('This authorization request has expired or is invalid — start again from your AI client.'));
  }, []);

  async function decide(approve: boolean) {
    if (!requestId) return;
    setBusy(true); setError('');
    try {
      const opts: any = { method: 'POST', body: JSON.stringify({ request: requestId }) };
      if (approve) opts.token = accessToken!;
      const { redirect } = await apiCall(approve ? '/oauth/consent/approve' : '/oauth/consent/deny', opts);
      if (redirect) { window.location.href = redirect; return; }
      setError('Could not complete the request.'); setBusy(false);
    } catch (e: any) { setError(e.message || 'Something went wrong.'); setBusy(false); }
  }

  if (!user || !accessToken) return <AuthScreen heading="Sign in to connect your AI assistant" />;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--ink)', padding: 20 }}>
      <div style={{ width: 420, maxWidth: '100%', background: 'rgba(var(--fg),0.03)', border: '1px solid rgba(var(--fg),0.1)', borderRadius: 16, padding: 28 }}>
        <img className="plogo" src="/logo.png" alt="Persistence" style={{ height: 36, margin: '0 auto 18px', display: 'block' }} />
        {error ? (
          <p style={{ color: 'var(--red)', fontSize: 14, textAlign: 'center', lineHeight: 1.6 }}>{error}</p>
        ) : !info ? (
          <p style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center' }}>Loading…</p>
        ) : (
          <>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 400, color: 'var(--white)', textAlign: 'center', marginBottom: 8 }}>
              Connect to {info.client_name}
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>
              <strong style={{ color: 'var(--text)' }}>{info.client_name}</strong> is requesting access to your Persistence finances for <strong style={{ color: 'var(--text)' }}>{user.email}</strong>.
            </p>
            <div style={{ background: 'rgba(var(--fg),0.04)', border: '1px solid rgba(var(--fg),0.08)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)', marginBottom: 8 }}>It can read</div>
              <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13, color: 'var(--subtle)', lineHeight: 1.9 }}>
                <li>Your financial summary &amp; net worth</li>
                <li>Recent transactions</li>
                <li>Subscriptions, bills &amp; goals</li>
              </ul>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)', marginBottom: 8 }}>It can change</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--subtle)', lineHeight: 1.9 }}>
                <li>Recategorize your transactions</li>
                <li>Create &amp; update savings/debt goals</li>
                <li>Add bills &amp; recurring expenses</li>
                <li>Log credit scores &amp; remember preferences you tell it</li>
              </ul>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>It <strong>cannot</strong> move money, make payments, transfer funds, or trade — it can only organize and annotate your data. You can revoke access anytime.</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => decide(false)} disabled={busy} style={{ flex: 1, padding: '11px 0', background: 'transparent', color: 'var(--text)', border: '1px solid rgba(var(--fg),0.2)', borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-syne)', cursor: 'pointer' }}>Deny</button>
              <button onClick={() => decide(true)} disabled={busy} style={{ flex: 1, padding: '11px 0', background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-syne)', cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Connecting…' : 'Allow'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
