'use client';
import { formatCurrency } from '@/lib/store';

interface TopBarProps {
  summary: any;
  loading: boolean;
}

const tiles = [
  { key: 'net_worth',    label: 'Net Worth',    color: 'var(--text)', prefix: '' },
  { key: 'total_debt',   label: 'CC / Debt',    color: 'rgba(var(--fg),0.6)', prefix: '' },
  { key: 'monthly_bills',label: 'Monthly Bills',color: 'rgba(var(--fg),0.5)', prefix: '' },
  { key: 'cash',         label: 'Cash',         color: 'var(--text)', prefix: '' },
  { key: 'investments',  label: 'Investments',  color: 'rgba(var(--fg),0.5)', prefix: '' },
  { key: 'retirement',   label: 'Retirement',   color: 'rgba(var(--fg),0.5)', prefix: '' },
];

export default function TopBar({ summary, loading }: TopBarProps) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: 52,
      background: 'rgba(10,10,15,0.92)',
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
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 500,
              color: loading ? 'rgba(var(--fg),0.15)' : tile.color,
            }}>
              {loading ? '———' : formatCurrency(summary?.[tile.key] || 0, true)}
            </div>
          </div>
        ))}
      </div>

      {/* Right side */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { const el=document.documentElement; const n=el.dataset.theme==='dark'?'light':'dark'; el.dataset.theme=n; try{localStorage.setItem('persistence-theme',n)}catch(e){} }} title="Toggle light/dark" style={{ background:'transparent', border:'none', color:'var(--text)', cursor:'pointer', fontSize:15, opacity:0.65, padding:'2px 4px' }}>◐</button>
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
          Ask AI ↗
        </button>
      </div>
    </div>
  );
}
