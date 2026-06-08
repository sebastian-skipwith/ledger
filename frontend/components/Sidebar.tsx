'use client';
import { useStore, formatCurrency } from '@/lib/store';

export default function Sidebar() {
  const { accounts, activeSection, setActiveSection } = useStore();

  const navItems = [
    { id: 'dashboard',    label: 'Dashboard',    icon: '⊞' },
    { id: 'networth',     label: 'Net Worth',    icon: '↗' },
    { id: 'transactions', label: 'Transactions', icon: '≡' },
    { id: 'bills',        label: 'Bills',        icon: '◷' },
    { id: 'goals',        label: 'Goals',        icon: '◎' },
    { id: 'ai',           label: 'AI Chat',      icon: '✦' },
  ];

  const acctColors: Record<string, string> = {
    depository: 'var(--text)', investment: 'rgba(var(--fg),0.5)',
    credit: 'rgba(var(--fg),0.6)', loan: 'rgba(var(--fg),0.6)',
  };

  return (
    <div style={{
      width: 220, flexShrink: 0,
      borderRight: '1px solid rgba(var(--fg),0.07)',
      padding: '20px 0', overflowY: 'auto',
      background: 'rgba(var(--fg),0.015)',
    }}>
      <div style={{ padding: '0 12px', marginBottom: 20 }}>
        <div style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.25)', padding: '0 8px', marginBottom: 6 }}>Overview</div>
        {navItems.map(item => (
          <button key={item.id} onClick={() => setActiveSection(item.id)} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            width: '100%', padding: '7px 8px', borderRadius: 7,
            border: 'none', cursor: 'pointer',
            background: activeSection === item.id ? 'rgba(var(--fg),0.1)' : 'transparent',
            color: activeSection === item.id ? 'var(--text)' : 'rgba(var(--fg),0.7)',
            fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-syne)',
            textAlign: 'left', marginBottom: 2, transition: 'all 0.12s',
          }}>
            <span style={{ fontSize: 14, opacity: 0.8 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: 'rgba(var(--fg),0.07)', margin: '4px 12px 16px' }} />

      <div style={{ padding: '0 12px' }}>
        <div style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.25)', padding: '0 8px', marginBottom: 6 }}>Accounts</div>
        {accounts.map(acct => (
          <div key={acct.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 8px', borderRadius: 7, cursor: 'pointer', marginBottom: 2,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--fg),0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: acctColors[acct.type] || '#666' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(var(--fg),0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acct.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: ['credit','loan'].includes(acct.type) ? 'rgba(var(--fg),0.6)' : 'rgba(var(--fg),0.7)' }}>
                {formatCurrency(Math.abs(acct.current_balance), true)}
              </div>
            </div>
          </div>
        ))}
        <button style={{
          display: 'block', width: '100%', marginTop: 8,
          background: 'rgba(59,125,255,0.08)', border: '1px dashed rgba(59,125,255,0.25)',
          color: 'rgba(59,125,255,0.7)', borderRadius: 7, padding: 9,
          textAlign: 'center', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'var(--font-syne)', letterSpacing: '0.3px',
        }}>+ Link Account</button>
      </div>
    </div>
  );
}
