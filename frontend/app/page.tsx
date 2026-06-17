'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore, apiCall, formatCurrency, computeSummary } from '@/lib/store';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import NetWorthChart from '@/components/NetWorthChart';
import AccountCards from '@/components/AccountCards';
import BillsList from '@/components/BillsList';
import AiChat from '@/components/AiChat';
import InsightStrip from '@/components/InsightStrip';
import IntelligencePanel from '@/components/IntelligencePanel';
import PlaidLinkButton from '@/components/PlaidLink';

export default function DashboardPage() {
  const { user, accessToken, accounts, summary, activeSection,
          setAccounts, setSummary, setInsights, insights } = useStore();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [hud, setHud] = useState<any>(null);
  const [period, setPeriod] = useState<'day'|'week'|'month'>('day');
  useEffect(() => { if (!accessToken) return; loadData(); }, [accessToken]);
  async function loadData() {
    setLoading(true);
    try {
      const [accts, insightsData, hudData] = await Promise.all([
        apiCall('/api/accounts', { token: accessToken! }),
        apiCall('/api/ai/insights', { token: accessToken! }),
        apiCall('/api/summary/hud', { token: accessToken! }).catch(() => null),
      ]);
      setAccounts(accts);
      setSummary({ ...computeSummary(accts), monthly_bills: insightsData?.context?.monthly_bills || 0 });
      setInsights(insightsData?.insights || []);
      setHud(hudData);
      try {
        const hist = await apiCall('/api/net-worth?days=120', { token: accessToken! });
        setHistory(Array.isArray(hist) ? hist : []);
      } catch (e) { /* history optional */ }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }
  function computeDeltas() {
    if (!summary || !history || history.length === 0) return null;
    const daysBack = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - daysBack);
    const sorted = [...history].sort((a,b)=> new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime());
    let past = sorted[0];
    for (const row of sorted) { if (new Date(row.snapshot_date) <= cutoff) past = row; }
    const b = past && past.breakdown ? past.breakdown : {};
    const prev: any = { net_worth: Number(past?.net_worth), cash: Number(b.cash), investments: Number(b.investments), retirement: Number(b.retirement), total_debt: Number(b.debt) };
    const out: any = {};
    for (const k of ['net_worth','cash','investments','retirement','total_debt']) {
      const now = Number((summary as any)[k]);
      const was = prev[k];
      if (was === undefined || isNaN(was) || isNaN(now)) { out[k] = null; continue; }
      const diff = now - was;
      const pct = was !== 0 ? (diff / Math.abs(was)) * 100 : null;
      out[k] = { diff, pct };
    }
    return out;
  }

  if (!user || !accessToken) return <AuthScreen />;
  const deltas = computeDeltas();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar summary={summary} hud={hud} loading={loading} deltas={deltas} period={period} onPeriodChange={setPeriod} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', marginTop: 52 }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, color: 'var(--white)', marginBottom: 4 }}>
              Good {timeGreeting()}, {user.full_name?.split(' ')[0]}.
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              {summary ? `Net worth ${formatCurrency(summary.net_worth)}` : 'Loading...'}
            </p>
          </div>
          <InsightStrip insights={insights} loading={loading} />
          {activeSection === 'intelligence' && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, color: 'var(--white)', marginBottom: 12 }}>Money Intelligence</h2>
              <IntelligencePanel token={accessToken} />
            </div>
          )}
          <NetWorthChart token={accessToken} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <AccountCards accounts={accounts} loading={loading} />
            <BillsList token={accessToken} />
          </div>
          {accounts.length === 0 && !loading && (
            <div style={{ padding: 32, textAlign: 'center', border: '1px dashed rgba(var(--fg),0.15)', borderRadius: 12 }}>
              <p style={{ color: 'var(--muted)', marginBottom: 16, fontSize: 14 }}>No accounts linked yet.</p>
              <PlaidLinkButton token={accessToken} onSuccess={loadData} />
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: 'auto', paddingTop: 16 }}>
            <a href="https://persistence.finance" style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'none' }}>← Back to persistence.finance</a>
          </div>
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
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!googleClientId) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    script.onload = () => {
      const g = (window as any).google;
      if (!g) return;

      g.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: any) => {
          setError(''); setLoading(true);
          try {
            const data = await apiCall('/api/auth/google', {
              method: 'POST',
              body: JSON.stringify({ credential: response.credential }),
            });
            setAuth(data.user, data.access, data.refresh);
          } catch (err: any) {
            setError(err.message);
          } finally {
            setLoading(false);
          }
        },
        ux_mode: 'popup',
        auto_select: false,
      });

      // Render the official Google button into our container
      if (googleBtnRef.current) {
        g.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 304,
        });
      }
    };

    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, []);

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
    background: 'rgba(var(--fg),0.05)', border: '1px solid rgba(var(--fg),0.1)',
    borderRadius: 8, color: 'var(--white)', fontSize: 14,
    fontFamily: 'var(--font-syne)', outline: 'none', marginBottom: 10,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--ink)' }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img className="plogo" src="/logo.png" alt="Persistence" style={{ height: 46, width: 'auto', margin: '0 auto 8px', display: 'block' }} />
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Your financial command center</p>
        </div>
        <div style={{ background: 'rgba(var(--fg),0.03)', border: '1px solid rgba(var(--fg),0.08)', borderRadius: 16, padding: 28 }}>

          {/* Google renders its own button here — guaranteed to work */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, minHeight: 44 }}>
            <div ref={googleBtnRef} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(var(--fg),0.08)' }} />
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(var(--fg),0.08)' }} />
          </div>

          <div style={{ display: 'flex', marginBottom: 20, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(var(--fg),0.08)' }}>
            {(['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '8px 0', fontSize: 13, fontFamily: 'var(--font-syne)',
                border: 'none', cursor: 'pointer', fontWeight: 500,
                background: mode === m ? 'rgba(var(--fg),0.15)' : 'transparent',
                color: mode === m ? 'var(--accent)' : 'var(--muted)', transition: 'all 0.15s',
              }}>{m === 'login' ? 'Sign In' : 'Create Account'}</button>
            ))}
          </div>

          <form onSubmit={submit}>
            {mode === 'register' && <input style={inp} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required />}
            <input style={inp} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input style={inp} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '11px 0', background: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
              fontFamily: 'var(--font-syne)', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>{loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
