'use client';
import { formatCurrency } from '@/lib/store';

export default function AccountCards({ accounts, loading }: { accounts: any[]; loading: boolean }) {
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3].map(i => <div key={i} className="card shimmer" style={{ height: 80 }} />)}
    </div>
  );

  const groups = [
    { type: 'depository', label: 'Cash & Savings', color: 'var(--text)' },
    { type: 'investment',  label: 'Investments',   color: 'rgba(var(--fg),0.5)' },
    { type: 'credit',      label: 'Credit Cards',  color: 'rgba(var(--fg),0.6)' },
    { type: 'loan',        label: 'Loans',         color: 'rgba(var(--fg),0.6)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map(group => {
        const accts = accounts.filter(a => a.type === group.type);
        if (!accts.length) return null;
        const total = accts.reduce((s, a) => s + Math.abs(a.current_balance || 0), 0);
        return (
          <div key={group.type} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.35)' }}>{group.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: group.color }}>{formatCurrency(total)}</span>
            </div>
            {accts.map(acct => (
              <div key={acct.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid rgba(var(--fg),0.04)' }}>
                <span style={{ fontSize: 12, color: 'rgba(var(--fg),0.8)' }}>{acct.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(var(--fg),0.7)' }}>{formatCurrency(Math.abs(acct.current_balance))}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
