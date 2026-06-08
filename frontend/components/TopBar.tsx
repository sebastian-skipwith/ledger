'use client';
import { formatCurrency } from '@/lib/store';

interface TopBarProps {
  summary: any;
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

export default function TopBar({ summary, loading, deltas, period = 'day', onPeriodChange }: TopBarProps) {
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
        {tiles.map(tile => (
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
        <button onClick={() => { const el=document.documentElement; const n=el.dataset.theme==='dark'?'light':'dark'; el.dataset.theme=n; try{localStorage.setItem('persistence-theme',n)}catch(e){} }} title="Toggle light/dark" style={{ background:'transparent', border:'none', color:'var(--text)', cursor:'pointer', fontSize:15, opacity:0.65, padding:'2px 4px' }}>â—</button>
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
          Ask AI â†—
        </button>
      </div>
    </div>
  );
}
