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
import IntelligencePanel from '@/components/IntelligencePanel';
import Analytics from '@/components/Analytics';
import AuthScreen from '@/components/AuthScreen';
import PlaidLinkButton from '@/components/PlaidLink';

export default function DashboardPage() {
  const { user, accessToken, accounts, summary, activeSection,
          setAccounts, setSummary, setInsights, insights } = useStore();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [hud, setHud] = useState<any>(null);
  const [period, setPeriod] = useState<'day'|'week'|'month'>('day');
  const [drill, setDrill] = useState<string | null>(null);
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
      <TopBar summary={summary} hud={hud} loading={loading} deltas={deltas} period={period} onPeriodChange={setPeriod} onTileClick={setDrill} />
      <DrillModal metric={drill} accounts={accounts} summary={summary} onClose={() => setDrill(null)} />
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
          {activeSection === 'analytics' ? (
            <Analytics token={accessToken} accounts={accounts} />
          ) : (
            <>
              <NetWorthChart token={accessToken} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <AccountCards accounts={accounts} loading={loading} />
                <BillsList token={accessToken} />
              </div>
            </>
          )}
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

const DRILL_LABELS: Record<string, string> = {
  net_worth: 'Net Worth', cash: 'Cash', investments: 'Investments',
  retirement: 'Retirement', total_debt: 'Credit & Debt',
};

function DrillModal({ metric, accounts, summary, onClose }: { metric: string | null; accounts: any[]; summary: any; onClose: () => void }) {
  if (!metric || !DRILL_LABELS[metric]) return null;
  const isRet = (a: any) => ['401k', 'ira', 'roth'].some(k => (a.subtype || '').toLowerCase().includes(k));
  let list = accounts;
  if (metric === 'cash') list = accounts.filter(a => a.type === 'depository');
  else if (metric === 'investments') list = accounts.filter(a => a.type === 'investment' && !isRet(a));
  else if (metric === 'retirement') list = accounts.filter(a => a.type === 'investment' && isRet(a));
  else if (metric === 'total_debt') list = accounts.filter(a => ['credit', 'loan'].includes(a.type));
  const rows = [...list].sort((a, b) => Math.abs(Number(b.current_balance) || 0) - Math.abs(Number(a.current_balance) || 0));
  const total = metric === 'net_worth' && summary
    ? Number(summary.net_worth)
    : rows.reduce((s, a) => s + (['credit', 'loan'].includes(a.type) ? -Math.abs(Number(a.current_balance) || 0) : Number(a.current_balance) || 0), 0);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', maxHeight: '80vh', overflow: 'auto', background: 'var(--ink)', border: '1px solid rgba(var(--fg),0.15)', borderRadius: 14, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)' }}>{DRILL_LABELS[metric]}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500, color: 'var(--white)', marginBottom: 14 }}>{formatCurrency(total)}</div>
        {rows.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>No accounts contributing to this yet.</div>
        ) : rows.map(a => {
          const bal = Number(a.current_balance) || 0;
          const prev = (a.previous_balance === null || a.previous_balance === undefined) ? null : Number(a.previous_balance);
          const change = prev === null ? null : bal - prev;
          const liability = ['credit', 'loan'].includes(a.type);
          const good = (change === null || change === 0) ? null : (liability ? change < 0 : change > 0);
          return (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(var(--fg),0.07)' }}>
              <div style={{ minWidth: 0, marginRight: 12 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{a.linked_institution || a.institution_name || a.subtype || a.type}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: liability ? '#dc2626' : 'var(--text)' }}>{liability ? '-' : ''}{formatCurrency(Math.abs(bal))}</div>
                {change !== null && change !== 0 && (
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: good ? '#16a34a' : '#dc2626' }}>
                    {change > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(change))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 12, lineHeight: 1.5 }}>Change shown is since the last account sync.</div>
      </div>
    </div>
  );
}

