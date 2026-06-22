'use client';
import { useStore, formatCurrency, apiCall } from '@/lib/store';
import PlaidLinkButton from '@/components/PlaidLink';

export default function Sidebar() {
  const { accounts, activeSection, setActiveSection, user, accessToken, logout } = useStore();

  async function exportData() {
    try {
      const data = await apiCall('/api/account/export', { token: accessToken! });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'persistence-export.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { alert('Export failed: ' + e.message); }
  }

  async function deleteAccount() {
    const phrase = prompt(
      'This permanently deletes your account, revokes your bank connections, and erases all your data. This cannot be undone.\n\nType DELETE to confirm.'
    );
    if (phrase !== 'DELETE') return;
    try {
      await apiCall('/api/account', { method: 'DELETE', token: accessToken! });
      logout();
      location.reload();
    } catch (e: any) { alert('Deletion failed: ' + e.message); }
  }

  async function disconnectAllBanks() {
    if (!confirm('Disconnect ALL linked banks and remove their accounts & transactions?\n\nUse this to clear leftover sandbox/test data before linking real accounts. This cannot be undone.')) return;
    try {
      const items = await apiCall('/api/plaid/items', { token: accessToken! });
      for (const it of items) {
        await apiCall(`/api/plaid/items/${it.id}`, { method: 'DELETE', token: accessToken! });
      }
      location.reload();
    } catch (e: any) { alert('Could not disconnect: ' + e.message); }
  }

  async function renameAccount(acct: any) {
    const name = prompt('Rename this account:', acct.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === acct.name) return;
    try {
      await apiCall(`/api/accounts/${acct.id}`, { method: 'PATCH', token: accessToken!, body: JSON.stringify({ name: trimmed }) });
      location.reload();
    } catch (e: any) { alert('Rename failed: ' + e.message); }
  }

  async function upgrade(tier: 'pro' | 'wealth') {
    try {
      const { url } = await apiCall('/api/billing/checkout', {
        method: 'POST', token: accessToken!, body: JSON.stringify({ tier }),
      });
      window.location.href = url;
    } catch (e: any) {
      alert(e.message.includes('configured') ? 'Subscriptions are coming soon.' : e.message);
    }
  }

  async function manageBilling() {
    try {
      const { url } = await apiCall('/api/billing/portal', { method: 'POST', token: accessToken! });
      window.location.href = url;
    } catch (e: any) { alert(e.message); }
  }

  const navItems = [
    { id: 'dashboard',    label: 'Dashboard',    icon: '⊞' },
    { id: 'analytics',    label: 'Analytics',    icon: '◔' },
    { id: 'intelligence', label: 'Intelligence', icon: '✦' },
    { id: 'networth',     label: 'Net Worth',    icon: '↗' },
    { id: 'transactions', label: 'Transactions', icon: '≡' },
    { id: 'bills',        label: 'Bills',        icon: '◷' },
    { id: 'goals',        label: 'Goals',        icon: '◎' },
    { id: 'ai',           label: 'AI Chat',      icon: '◇' },
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
            <button onClick={() => renameAccount(acct)} title="Rename account"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(var(--fg),0.3)', fontSize: 12, padding: '2px 4px', flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(var(--fg),0.75)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(var(--fg),0.3)')}
            >{'✎'}</button>
          </div>
        ))}
        {accessToken && (
          <PlaidLinkButton
            token={accessToken}
            onSuccess={() => window.location.reload()}
            label="+ Link Account"
            style={{
              display: 'block', width: '100%', marginTop: 8,
              background: 'rgba(59,125,255,0.08)', border: '1px dashed rgba(59,125,255,0.25)',
              color: 'rgba(59,125,255,0.7)', borderRadius: 7, padding: 9,
              textAlign: 'center', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-syne)', letterSpacing: '0.3px',
            }}
          />
        )}
      </div>

      <div style={{ height: 1, background: 'rgba(var(--fg),0.07)', margin: '16px 12px' }} />

      <div style={{ padding: '0 12px' }}>
        {user?.tier === 'free' ? (
          <button onClick={() => upgrade('pro')} style={{
            display: 'block', width: '100%',
            background: 'var(--text)', border: 'none',
            color: 'var(--ink)', borderRadius: 7, padding: 10,
            textAlign: 'center', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'var(--font-syne)', letterSpacing: '0.4px',
          }}>Upgrade to Pro — $9/mo</button>
        ) : (
          <button onClick={manageBilling} style={{
            display: 'block', width: '100%',
            background: 'transparent', border: '1px solid rgba(var(--fg),0.2)',
            color: 'rgba(var(--fg),0.7)', borderRadius: 7, padding: 9,
            textAlign: 'center', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-syne)', letterSpacing: '0.3px',
          }}>Manage subscription ({user?.tier})</button>
        )}
      </div>

      <div style={{ padding: '14px 12px 4px' }}>
        <div style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.25)', padding: '0 8px', marginBottom: 4 }}>Account</div>
        {[
          { label: 'Developers / API', fn: () => { window.location.href = '/developers'; } },
          { label: 'Export my data', fn: exportData },
          { label: 'Disconnect all banks', fn: disconnectAllBanks },
          { label: 'Contact support', fn: () => { window.location.href = 'mailto:support@persistence.finance'; } },
        ].map(item => (
          <button key={item.label} onClick={item.fn} style={{
            display: 'block', width: '100%', padding: '6px 8px', borderRadius: 6,
            border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left',
            color: 'rgba(var(--fg),0.55)', fontSize: 11.5, fontFamily: 'var(--font-syne)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--fg),0.05)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >{item.label}</button>
        ))}
        <button onClick={deleteAccount} style={{
          display: 'block', width: '100%', padding: '6px 8px', borderRadius: 6,
          border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left',
          color: 'rgba(220,38,38,0.65)', fontSize: 11.5, fontFamily: 'var(--font-syne)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.08)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >Delete account…</button>
      </div>
    </div>
  );
}
