'use client';
import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/store';

interface TopBarProps {
  summary: any;
  hud?: any; // /api/summary/hud payload: safe_to_spend, credit_week, bills_7d, goal_progress
  loading: boolean;
  deltas?: any;
  period?: 'day'|'week'|'month';
  onPeriodChange?: (p: 'day'|'week'|'month') => void;
}

const tiles = [
  { key: 'net_worth',    label: 'Net Worth',    color: 'var(--text)', prefix: '' },
  { key: 'total_debt',   label: 'CC / Debt',    color: 'rgba(var(--fg),0.6)', prefix: '' },
  { key: 'monthly_bills',label: 'Monthly Bills',color: 'rgba(var(--fg),0.5)', prefix: '' },
  { key: 'cash',         label: 'Cash',         color: 'var(--text)', prefix: '' },
  { key: 'investments',  label: 'Investments',  color: 'rgba(var(--fg),0.5)', prefix: '' },
  { key: 'retirement',   label: 'Retirement',   color: 'rgba(var(--fg),0.5)', prefix: '' },
];

const METRIC_LABELS: Record<string, string> = {
  net_worth: 'Net Worth', total_debt: 'CC / Debt', monthly_bills: 'Monthly Bills',
  cash: 'Cash', investments: 'Investments', retirement: 'Retirement',
  safe_to_spend: 'Safe to Spend', credit_week: 'Credit Cards (week)',
  bills_7d: 'Bills Next 7 Days', goal_progress: 'Goal Progress',
};
const VIS_KEY = 'persistence-web-metrics';

function loadVisibility(): Record<string, boolean> {
  const all: Record<string, boolean> = {};
  for (const k of Object.keys(METRIC_LABELS)) all[k] = true;
  try {
    const saved = JSON.parse(localStorage.getItem(VIS_KEY) || '{}');
    return { ...all, ...saved };
  } catch { return all; }
}

function weekdayShort(iso: string): string {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }); }
  catch { return ''; }
}

export default function TopBar({ summary, hud, loading, deltas, period = 'day', onPeriodChange }: TopBarProps) {
  const [vis, setVis] = useState<Record<string, boolean>>(() => {
    const all: Record<string, boolean> = {};
    for (const k of Object.keys(METRIC_LABELS)) all[k] = true;
    return all;
  });
  const [custOpen, setCustOpen] = useState(false);
  const custRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setVis(loadVisibility()); }, []);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (custRef.current && !custRef.current.contains(e.target as Node)) setCustOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function toggleMetric(k: string) {
    setVis(v => {
      const next = { ...v, [k]: !v[k] };
      try { localStorage.setItem(VIS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // The 4 metrics added 2026-06-10, served by /api/summary/hud
  const extraTiles: { key: string; label: string; value: string; sub: string; color: string }[] = [];
  if (hud) {
    if (vis.safe_to_spend && hud.safe_to_spend) {
      const a = Math.round(Number(hud.safe_to_spend.amount) || 0);
      extraTiles.push({
        key: 'safe_to_spend', label: 'Safe to Spend',
        value: formatCurrency(a, true), sub: 'until ' + weekdayShort(hud.safe_to_spend.until),
        color: a < 0 ? '#dc2626' : '#16a34a',
      });
    }
    if (vis.credit_week && hud.credit_week) {
      const v = Math.round(Number(hud.credit_week.spent) || 0);
      extraTiles.push({
        key: 'credit_week', label: 'Credit Cards',
        value: (v > 0 ? '+' : '') + formatCurrency(v, true), sub: 'this week',
        color: v > 0 ? '#dc2626' : v < 0 ? '#16a34a' : 'var(--text)',
      });
    }
    if (vis.bills_7d && hud.bills_7d) {
      extraTiles.push({
        key: 'bills_7d', label: 'Bills 7 Days',
        value: formatCurrency(Math.round(Number(hud.bills_7d.total) || 0), true),
        sub: (hud.bills_7d.count || 0) + ' due', color: 'var(--text)',
      });
    }
    if (vis.goal_progress && hud.goal_progress && hud.goal_progress.status !== 'none') {
      const g = hud.goal_progress;
      extraTiles.push({
        key: 'goal_progress', label: 'Goals',
        value: g.status === 'behind' ? 'Behind ' + formatCurrency(Math.abs(g.diff), true)
             : g.status === 'ahead' ? 'Ahead ' + formatCurrency(g.diff, true) : 'On track',
        sub: g.goals_count + ' tracked',
        color: g.status === 'behind' ? '#dc2626' : '#16a34a',
      });
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: 52,
      background: 'var(--bar-bg)',
      borderBottom: '1px solid rgba(var(--fg),0.07)',
      backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center',
      padding: '0 20px', gap: 0,
    }}>
      {/* Brand */}
      <img className="plogo" src="/logo.png" alt="Persistence" style={{ height: 22, width: 'auto', marginRight: 28, flexShrink: 0 }} />

      {/* Metric tiles */}
      <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
        {tiles.filter(t => vis[t.key]).map(tile => (
          <div key={tile.key} style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '0 16px',
            borderRight: '1px solid rgba(var(--fg),0.07)',
            cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--fg),0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.35)', marginBottom: 1 }}>
              {tile.label}
            </div>
            {(() => {
              const d = deltas ? deltas[tile.key] : undefined;
              const goodUp = tile.key !== 'total_debt';
              let color = 'var(--text)';
              let chip = null;
              if (!loading && d && d.diff !== 0) {
                const up = d.diff > 0;
                const positive = goodUp ? up : !up;
                color = positive ? '#16a34a' : '#dc2626';
                const arrow = up ? '\u25b2' : '\u25bc';
                const pctTxt = (d.pct === null || !isFinite(d.pct)) ? '' : ' ' + Math.abs(d.pct).toFixed(1) + '%';
                chip = (<div style={{ fontSize: 8, fontWeight: 600, color, marginTop: 1 }}>{arrow}{pctTxt}</div>);
              }
              return (<>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 500, color: loading ? 'rgba(var(--fg),0.15)' : color }}>
                  {loading ? '\u2014\u2014\u2014' : formatCurrency(summary?.[tile.key] || 0, true)}
                </div>
                {chip}
              </>);
            })()}
          </div>
        ))}
        {!loading && extraTiles.map(t => (
          <div key={t.key} style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '0 16px',
            borderRight: '1px solid rgba(var(--fg),0.07)',
            cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--fg),0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.35)', marginBottom: 1 }}>
              {t.label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 500, color: t.color }}>
              {t.value}
            </div>
            <div style={{ fontSize: 8, fontWeight: 600, color: 'rgba(var(--fg),0.35)', marginTop: 1 }}>{t.sub}</div>
          </div>
        ))}
      </div>

      {/* Right side */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(var(--fg),0.06)', borderRadius: 6, padding: 2 }}>
          {(['day','week','month'] as const).map(pk => (
            <button key={pk} onClick={() => onPeriodChange && onPeriodChange(pk)} style={{
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-syne)',
              fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.5px',
              background: period === pk ? 'var(--accent)' : 'transparent',
              color: period === pk ? 'var(--accent-fg)' : 'rgba(var(--fg),0.5)',
            }}>{pk === 'day' ? '1D' : pk === 'week' ? '1W' : '1M'}</button>
          ))}
        </div>

        {/* Metric customizer */}
        <div ref={custRef} style={{ position: 'relative' }}>
          <button onClick={() => setCustOpen(o => !o)} title="Choose which metrics to show"
            style={{ background:'transparent', border:'none', color:'var(--text)', cursor:'pointer', fontSize:15, opacity:0.65, padding:'2px 4px' }}>
            {'\u2699'}
          </button>
          {custOpen && (
            <div style={{
              position: 'absolute', top: 32, right: 0, width: 200,
              background: 'var(--bar-bg)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(var(--fg),0.15)', borderRadius: 8,
              padding: '10px 12px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)', marginBottom: 8 }}>
                Metrics shown
              </div>
              {Object.keys(METRIC_LABELS).map(k => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', cursor: 'pointer', color: 'var(--text)' }}>
                  <span>{METRIC_LABELS[k]}</span>
                  <input type="checkbox" checked={!!vis[k]} onChange={() => toggleMetric(k)} style={{ accentColor: 'var(--text)' }} />
                </label>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => { const el=document.documentElement; const n=el.dataset.theme==='dark'?'light':'dark'; el.dataset.theme=n; try{localStorage.setItem('persistence-theme',n)}catch(e){} }} title="Toggle light/dark" style={{ background:'transparent', border:'none', color:'var(--text)', cursor:'pointer', fontSize:15, opacity:0.65, padding:'2px 4px' }}>{'\u25D0'}</button>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(var(--fg),0.3)' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
        <button style={{
          background: 'rgba(var(--fg),0.15)',
          border: '1px solid rgba(var(--fg),0.3)',
          color: 'var(--text)', borderRadius: 6,
          padding: '5px 12px', fontSize: 12,
          fontWeight: 600, fontFamily: 'var(--font-syne)',
          cursor: 'pointer',
        }}>
          Ask AI {'\u2197'}
        </button>
      </div>
    </div>
  );
}
