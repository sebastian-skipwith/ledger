'use client';
import { useEffect, useState } from 'react';
import { apiCall, formatCurrency } from '@/lib/store';

// Era-style "money intelligence": subscriptions, cash-flow forecast, alerts.
export default function IntelligencePanel({ token }: { token: string }) {
  const [subs, setSubs] = useState<any>(null);
  const [flow, setFlow] = useState<any>(null);
  const [alerts, setAlerts] = useState<any>(null);
  const [catMsg, setCatMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    apiCall('/api/intelligence/subscriptions', { token }).then(setSubs).catch(() => {});
    apiCall('/api/intelligence/cash-flow', { token }).then(setFlow).catch(() => {});
    apiCall('/api/intelligence/alerts', { token }).then(setAlerts).catch(() => {});
  }, [token]);

  async function categorize() {
    setCatMsg('Categorizing…');
    try { const r = await apiCall('/api/intelligence/categorize', { method: 'POST', token }); setCatMsg(r.message || `Categorized ${r.categorized} transactions.`); }
    catch (e: any) { setCatMsg(e.message); }
  }

  const card: React.CSSProperties = { border: '1px solid rgba(var(--fg),0.1)', borderRadius: 12, padding: 16, background: 'rgba(var(--fg),0.02)' };
  const title: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)', marginBottom: 12 };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Subscriptions */}
      <div style={card}>
        <div style={title}>Subscriptions {subs && `· ${formatCurrency(subs.total_monthly, true)}/mo`}</div>
        {!subs && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Scanning…</div>}
        {subs && subs.subscriptions.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>No recurring charges detected yet.</div>}
        {subs && subs.subscriptions.slice(0, 6).map((s: any, i: number) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(var(--fg),0.06)' }}>
            <span>{s.merchant} <span style={{ color: 'rgba(var(--fg),0.4)', fontSize: 11 }}>· {s.cadence}</span></span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(s.amount, true)}</span>
          </div>
        ))}
      </div>

      {/* Cash-flow forecast */}
      <div style={card}>
        <div style={title}>Cash-flow forecast · next 30 days</div>
        {!flow && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Projecting…</div>}
        {flow && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
              <span style={{ color: 'var(--muted)' }}>Today</span><span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(flow.start_balance, true)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
              <span style={{ color: 'var(--muted)' }}>In 30 days</span><span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(flow.projected_end_balance, true)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
              <span style={{ color: 'var(--muted)' }}>Lowest point</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: flow.will_go_negative ? '#dc2626' : 'var(--text)' }}>
                {formatCurrency(flow.lowest_point.balance, true)}{flow.lowest_point.date ? ' · ' + new Date(flow.lowest_point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
              </span>
            </div>
            {flow.will_go_negative && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>Projected to dip below $0 — add funds or move a bill.</div>}
          </div>
        )}
      </div>

      {/* Alerts */}
      <div style={card}>
        <div style={title}>Alerts {alerts && alerts.unread > 0 && `· ${alerts.unread} new`}</div>
        {!alerts && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Checking…</div>}
        {alerts && alerts.alerts.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Nothing needs your attention.</div>}
        {alerts && alerts.alerts.slice(0, 5).map((a: any) => (
          <div key={a.id} style={{ fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid rgba(var(--fg),0.06)' }}>
            <div style={{ fontWeight: 600 }}>{a.title}</div>
            <div style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{a.body}</div>
          </div>
        ))}
      </div>

      {/* Auto-categorize */}
      <div style={card}>
        <div style={title}>Auto-categorize</div>
        <p style={{ fontSize: 12.5, color: 'var(--subtle)', lineHeight: 1.6, marginBottom: 12 }}>
          Let AI sort messy transaction labels into clean spending categories.
        </p>
        <button onClick={categorize} style={{ padding: '8px 16px', background: 'var(--text)', color: 'var(--ink)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Run categorizer</button>
        {catMsg && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>{catMsg}</div>}
      </div>
    </div>
  );
}
