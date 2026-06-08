'use client';
import { useStore, formatCurrency } from '@/lib/store';

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────
export function Sidebar() {
  const { accounts, activeSection, setActiveSection } = useStore();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
    { id: 'networth',  label: 'Net Worth',  icon: '↗' },
    { id: 'transactions', label: 'Transactions', icon: '≡' },
    { id: 'bills',    label: 'Bills',       icon: '◷' },
    { id: 'goals',    label: 'Goals',       icon: '◎' },
    { id: 'ai',       label: 'AI Chat',     icon: '✦' },
  ];

  const acctTypeColors: Record<string, string> = {
    depository: 'var(--text)',
    investment: 'rgba(var(--fg),0.5)',
    credit: 'rgba(var(--fg),0.6)',
    loan: 'rgba(var(--fg),0.6)',
  };

  return (
    <div style={{
      width: 220, flexShrink: 0,
      borderRight: '1px solid rgba(var(--fg),0.07)',
      padding: '20px 0', overflowY: 'auto',
      background: 'rgba(var(--fg),0.015)',
    }}>
      {/* Nav */}
      <div style={{ padding: '0 12px', marginBottom: 20 }}>
        <div style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.25)', padding: '0 8px', marginBottom: 6 }}>
          Overview
        </div>
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

      {/* Accounts */}
      <div style={{ padding: '0 12px' }}>
        <div style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.25)', padding: '0 8px', marginBottom: 6 }}>
          Accounts
        </div>
        {accounts.map(acct => (
          <div key={acct.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 8px', borderRadius: 7, cursor: 'pointer',
            marginBottom: 2, transition: 'background 0.12s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--fg),0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: acctTypeColors[acct.type] || '#666',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(var(--fg),0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acct.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: ['credit','loan'].includes(acct.type) ? 'rgba(var(--fg),0.6)' : 'rgba(var(--fg),0.7)' }}>
                {['credit','loan'].includes(acct.type) ? '-' : ''}{formatCurrency(Math.abs(acct.current_balance), true)}
              </div>
            </div>
          </div>
        ))}

        <button style={{
          display: 'block', width: '100%', marginTop: 8,
          background: 'rgba(59,125,255,0.08)',
          border: '1px dashed rgba(59,125,255,0.25)',
          color: 'rgba(59,125,255,0.7)',
          borderRadius: 7, padding: 9,
          textAlign: 'center', fontSize: 11,
          fontWeight: 600, cursor: 'pointer',
          fontFamily: 'var(--font-syne)', letterSpacing: '0.3px',
        }}>
          + Link Account
        </button>
      </div>
    </div>
  );
}

export default Sidebar;

// ─────────────────────────────────────────────
// ACCOUNT CARDS
// ─────────────────────────────────────────────
export function AccountCards({ accounts, loading }: { accounts: any[]; loading: boolean }) {
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3,4].map(i => (
        <div key={i} className="card shimmer" style={{ height: 80 }} />
      ))}
    </div>
  );

  const groups = [
    { type: 'depository', label: 'Cash & Savings', color: 'var(--text)' },
    { type: 'investment', label: 'Investments',    color: 'rgba(var(--fg),0.5)' },
    { type: 'credit',     label: 'Credit',         color: 'rgba(var(--fg),0.6)' },
    { type: 'loan',       label: 'Loans',          color: 'rgba(var(--fg),0.6)' },
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

// ─────────────────────────────────────────────
// BILLS LIST
// ─────────────────────────────────────────────
export function BillsList({ token }: { token: string }) {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    fetch(`${API}/api/bills`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setBills(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="card shimmer" style={{ height: 200 }} />;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Upcoming Bills</div>
      {bills.length === 0 ? (
        <p style={{ color: 'rgba(var(--fg),0.3)', fontSize: 12 }}>No bills configured yet.</p>
      ) : bills.slice(0, 6).map(bill => (
        <div key={bill.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 0', borderBottom: '1px solid rgba(var(--fg),0.05)',
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: bill.autopay ? 'var(--text)' : 'rgba(var(--fg),0.5)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: 'rgba(var(--fg),0.85)' }}>{bill.name}</span>
          {bill.next_due_date && (
            <span style={{ fontSize: 10, color: 'rgba(var(--fg),0.6)' }}>
              {new Date(bill.next_due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(var(--fg),0.8)' }}>${bill.amount}</span>
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
            background: bill.autopay ? 'rgba(22,199,132,0.1)' : 'rgba(245,166,35,0.1)',
            color: bill.autopay ? 'var(--text)' : 'rgba(var(--fg),0.5)',
          }}>
            {bill.autopay ? 'AUTO' : 'DUE'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// INSIGHT STRIP
// ─────────────────────────────────────────────
export function InsightStrip({ insights, loading }: { insights: any[]; loading: boolean }) {
  const typeColors: Record<string, string> = { alert: 'rgba(var(--fg),0.6)', opportunity: 'var(--text)', info: 'rgba(var(--fg),0.5)' };
  const typeIcons: Record<string, string> = { alert: '⚡', opportunity: '↑', info: '◎' };

  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
      {[1,2,3].map(i => <div key={i} className="card shimmer" style={{ height: 72 }} />)}
    </div>
  );

  if (!insights.length) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
      {insights.map((ins, i) => (
        <div key={i} className="card" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 13 }}>{typeIcons[ins.type] || '◎'}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: typeColors[ins.type] || 'var(--text)' }}>{ins.title}</span>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(var(--fg),0.85)', lineHeight: 1.5 }}>{ins.body}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// PLAID LINK BUTTON
// ─────────────────────────────────────────────
export function PlaidLinkButton({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  async function openPlaid() {
    try {
      const res = await fetch(`${API}/api/plaid/create-link-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      // Initialize Plaid Link — in real implementation use react-plaid-link
      // This triggers the Plaid Link modal
      console.log('Plaid link token:', data.link_token);
      alert(`Plaid Link token obtained: ${data.link_token}\n\nIn production, this opens the Plaid Link modal.`);
    } catch (err) {
      console.error('Plaid link error:', err);
    }
  }

  return (
    <button onClick={openPlaid} style={{
      background: '#3b7dff',
      color: 'white',
      border: 'none',
      borderRadius: 8,
      padding: '10px 20px',
      fontSize: 13, fontWeight: 600,
      fontFamily: 'var(--font-syne)',
      cursor: 'pointer',
      transition: 'opacity 0.15s',
    }}>
      Connect Bank Account (via Plaid)
    </button>
  );
}

// Re-export for tree-shaking
function useState<T>(init: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] {
  return (require('react') as any).useState(init);
}
function useEffect(cb: () => void | (() => void), deps?: any[]) {
  return (require('react') as any).useEffect(cb, deps);
}
