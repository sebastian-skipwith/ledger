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

  useEffect(() => {
    if (!accessToken) return;
    loadData();
  }, [accessToken]);

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
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
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
              {summary ? `Net worth ${formatCurrency(summary.net_worth)} — here's your full picture.` : 'Loading your financial data…'}
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const body = mode === 'register' ? { email, password, full_name: name } : { email, password };
      const data = await apiCall(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) });
      setAuth(data.user, data.access, data.refresh);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
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
            }}>{loading ? 'Loading…' : mode === 'login' ? 'Sign In' : 'Create Account'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
