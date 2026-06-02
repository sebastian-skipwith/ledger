'use client';
import { useEffect, useState } from 'react';
import { useStore, apiCall, formatCurrency, computeSummary } from '@/lib/store';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import NetWorthChart from '@/components/NetWorthChart';
import AccountCards from '@/components/AccountCards';
import BillsList from '@/components/BillsList';
import AiChat from '@/components/AiChat';
import InsightStrip from '@/components/InsightStrip';
import PlaidLinkButton from '@/components/PlaidLink';

export default function DashboardPage() {
  const { user, accessToken, accounts, summary,
          setAccounts, setSummary, setInsights, insights } = useStore();
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (!accessToken) return; loadData(); }, [accessToken]);
  async function loadData() {
    setLoading(true);
    try {
      const [accts, insightsData] = await Promise.all([
        apiCall('/api/accounts', { token: accessToken! }),
        apiCall('/api/ai/insights', { token: accessToken! }),
      ]);
      setAccounts(accts);
      setSummary({ ...computeSummary(accts), monthly_bills: insightsData?.context?.monthly_bills || 0 });
      setInsights(insightsData?.insights || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }
  if (!user || !accessToken) return <AuthScreen />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar summary={summary} loading={loading} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', marginTop: 52 }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, color: 'var(--white)', marginBottom: 4 }}>
              Good {timeGreeting()}, {user.full_name?.split(' ')[0]}.
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              {summary ? `Net worth ${formatCurrency(summary.net_worth)} — here is your full picture.` : 'Loading your financial data...'}
            </p>
          </div>
          <InsightStrip insights={insights} loading={loading} />
          <NetWorthChart token={accessToken} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <AccountCards accounts={accounts} loading={loading} />
            <BillsList token={accessToken} />
          </div>
          {accounts.length === 0 && !loading && (
            <div style={{ padding: 32, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 12 }}>
              <p style={{ color: 'var(--muted)', marginBottom: 16, fontSize: 14 }}>No accounts linked yet. Connect your bank to get started.</p>
              <PlaidLinkButton token={accessToken} onSuccess={loadData} />
            </div>
          )}
        </main>
        <AiChat token={accessToken} summary={summary} />
      </div>
    </div>
  );
}

function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function AuthScreen() {
  const { setAuth } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!googleClientId) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true; script.defer = true;
    document.body.appendChild(script);
    script.onload = () => {
      (window as any).google?.accounts.id.initialize({ client_id: googleClientId, callback: handleGoogleResponse });
    };
    return () => { document.body.removeChild(script); };
  }, []);

  async function handleGoogleResponse(response: any) {
    setError(''); setLoading(true);
    try {
      const data = await apiCall('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential: response.credential }) });
      setAuth(data.user, data.access, data.refresh);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  function handleGoogleClick() {
    const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!id) { setError('Google sign-in not configured.'); return; }
    if (!(window as any).google) { setError('Google sign-in failed to load.'); return; }
    (window as any).google.accounts.id.prompt();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const body = mode === 'register' ? { email, password, full_name: name } : { email, password };
      const data = await apiCall(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) });
      setAuth(data.user, data.access, data.refresh);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: 'var(--white)', fontSize: 14,
    fontFamily: 'var(--font-syne)', outline: 'none', marginBottom: 10,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--ink)' }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontStyle: 'italic', color: 'var(--gold)', marginBottom: 8 }}>ledger</div>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Your financial cockpit</p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28 }}>
          <button onClick={handleGoogleClick} disabled={loading} style={{
            width: '100%', padding: '11px 0', marginBottom: 16,
            background: '#fff', color: '#1f1f1f', border: 'none',
            borderRadius: 8, fontSize: 14, fontWeight: 600,
            fontFamily: 'var(--font-syne)', cursor: loading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s',
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          </div>
          <div style={{ display: 'flex', marginBottom: 20, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            {(['login','register'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '8px 0', fontSize: 13, fontFamily: 'var(--font-syne)',
                border: 'none', cursor: 'pointer', fontWeight: 500,
                background: mode === m ? 'rgba(212,175,55,0.15)' : 'transparent',
                color: mode === m ? 'var(--gold)' : 'var(--muted)', transition: 'all 0.15s',
              }}>{m === 'login' ? 'Sign In' : 'Create Account'}</button>
            ))}
          </div>
          <form onSubmit={submit}>
            {mode === 'register' && <input style={inp} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required />}
            <input style={inp} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input style={inp} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '11px 0', background: 'var(--gold)', color: '#0a0a0f',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
              fontFamily: 'var(--font-syne)', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>{loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
