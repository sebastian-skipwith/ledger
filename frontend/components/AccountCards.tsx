'use client';
import { formatCurrency } from '@/lib/store';

export default function AccountCards({ accounts, loading }: { accounts: any[]; loading: boolean }) {
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3].map(i => <div key={i} className="card shimmer" style={{ height: 80 }} />)}
    </div>
  );

  const groups = [
    { type: 'depository', label: 'Cash & Savings', color: '#f0f0f8' },
    { type: 'investment',  label: 'Investments',   color: '#cccccc' },
    { type: 'credit',      label: 'Credit Cards',  color: '#b3b3b3' },
    { type: 'loan',        label: 'Loans',         color: '#b3b3b3' },
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
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>{group.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: group.color }}>{formatCurrency(total)}</span>
            </div>
            {accts.map(acct => (
              <div key={acct.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: 12, color: 'rgba(180,180,200,0.8)' }}>{acct.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{formatCurrency(Math.abs(acct.current_balance))}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
