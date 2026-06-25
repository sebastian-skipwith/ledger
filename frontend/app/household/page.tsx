'use client';
import { useCallback, useEffect, useState } from 'react';
import { useStore, apiCall, formatCurrency } from '@/lib/store';

// Shared household view: members keep their own accounts; an active member sees
// the combined net worth of all members' non-hidden accounts. Authorization is
// enforced server-side (you only see a household you're an active member of).
export default function HouseholdPage() {
  const { user, accessToken } = useStore();
  const [households, setHouseholds] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [view, setView] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const opts = useCallback(() => ({ token: accessToken! }), [accessToken]);

  const loadLists = useCallback(async () => {
    const [hs, inv] = await Promise.all([
      apiCall('/api/household', opts()),
      apiCall('/api/household/invites', opts()).catch(() => []),
    ]);
    setHouseholds(hs || []);
    setInvites(inv || []);
    return hs || [];
  }, [opts]);

  const loadView = useCallback(async (id: string) => {
    setSelectedId(id);
    try { setView(await apiCall(`/api/household/${id}`, opts())); }
    catch (e: any) { setError(e.message); }
  }, [opts]);

  useEffect(() => {
    if (!accessToken) { setLoading(false); return; }
    (async () => {
      try {
        const hs = await loadLists();
        if (hs.length) await loadView(hs[0].id);
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [accessToken, loadLists, loadView]);

  async function act(fn: () => Promise<any>) {
    setError('');
    try {
      await fn();
      const hs = await loadLists();
      if (selectedId && hs.some((h: any) => h.id === selectedId)) await loadView(selectedId);
      else if (hs.length) await loadView(hs[0].id);
      else { setView(null); setSelectedId(null); }
    } catch (e: any) { setError(e.message); }
  }

  const card: React.CSSProperties = { border: '1px solid rgba(var(--fg),0.1)', borderRadius: 12, padding: '16px 18px', background: 'rgba(var(--fg),0.02)' };
  const num: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, color: 'var(--text)' };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.4)', marginBottom: 6 };
  const h2: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)', marginBottom: 12 };
  const inp: React.CSSProperties = { background: 'rgba(var(--fg),0.05)', border: '1px solid rgba(var(--fg),0.12)', borderRadius: 8, color: 'var(--text)', fontSize: 13, padding: '8px 12px', outline: 'none' };
  const btn: React.CSSProperties = { background: 'var(--text)', color: 'var(--ink)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, padding: '8px 16px', cursor: 'pointer' };
  const ghost: React.CSSProperties = { background: 'transparent', color: 'var(--muted)', border: '1px solid rgba(var(--fg),0.2)', borderRadius: 8, fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ink)', color: 'var(--text)', padding: '40px 32px', maxWidth: 880, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 400, marginBottom: 4 }}>Household</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 28 }}>Share a combined view with a partner — without sharing logins. Hidden accounts stay private.</p>

      {!accessToken && !loading && (
        <p style={{ color: 'var(--muted)' }}>Sign in on the <a href="/" style={{ textDecoration: 'underline', color: 'var(--text)' }}>dashboard</a> first.</p>
      )}
      {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</p>}

      {accessToken && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {invites.length > 0 && (
            <section>
              <h2 style={h2}>Pending invitations</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {invites.map((iv) => (
                  <div key={iv.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14 }}><strong>{iv.household_name}</strong>{iv.invited_by ? ` · from ${iv.invited_by}` : ''}</span>
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button style={btn} onClick={() => act(() => apiCall(`/api/household/invites/${iv.id}/accept`, { ...opts(), method: 'POST' }))}>Accept</button>
                      <button style={ghost} onClick={() => act(() => apiCall(`/api/household/invites/${iv.id}/decline`, { ...opts(), method: 'POST' }))}>Decline</button>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {households.length === 0 && (
            <section style={card}>
              <h2 style={h2}>Create a household</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...inp, flex: 1 }} placeholder="Household name (e.g. Home)" value={name} onChange={(e) => setName(e.target.value)} />
                <button style={btn} disabled={!name.trim()} onClick={() => act(async () => { await apiCall('/api/household', { ...opts(), method: 'POST', body: JSON.stringify({ name }) }); setName(''); })}>Create</button>
              </div>
            </section>
          )}

          {households.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {households.map((h) => (
                <button key={h.id} style={h.id === selectedId ? btn : ghost} onClick={() => loadView(h.id)}>{h.name}</button>
              ))}
            </div>
          )}

          {view && (
            <>
              <section>
                <h2 style={h2}>{view.name} · combined</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                  <div style={card}><div style={lbl}>Net worth</div><div style={num}>{formatCurrency(view.net_worth)}</div></div>
                  <div style={card}><div style={lbl}>Cash</div><div style={num}>{formatCurrency(view.cash)}</div></div>
                  <div style={card}><div style={lbl}>Investments</div><div style={num}>{formatCurrency(view.investments)}</div></div>
                  <div style={card}><div style={lbl}>Debt</div><div style={num}>{formatCurrency(view.total_debt)}</div></div>
                </div>
              </section>

              <section>
                <h2 style={h2}>Members</h2>
                <div style={{ ...card, padding: 0 }}>
                  {view.members.map((m: any, i: number) => (
                    <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: i ? '1px solid rgba(var(--fg),0.07)' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 14 }}>{m.name || m.email}{m.is_you ? ' (you)' : ''} {m.role === 'owner' && <span style={{ fontSize: 10, color: 'var(--muted)' }}>· owner</span>}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.email}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{formatCurrency(m.net_worth)}</span>
                        {((view.my_role === 'owner' && !m.is_you) || (m.is_you && m.role !== 'owner')) && (
                          <button style={ghost} onClick={() => act(() => apiCall(`/api/household/${view.id}/members/${m.user_id}`, { ...opts(), method: 'DELETE' }))}>{m.is_you ? 'Leave' : 'Remove'}</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {view.my_role === 'owner' && (
                <section style={card}>
                  <h2 style={h2}>Invite a partner</h2>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...inp, flex: 1 }} placeholder="partner@email.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                    <button style={btn} disabled={!inviteEmail.includes('@')} onClick={() => act(async () => { await apiCall(`/api/household/${view.id}/invite`, { ...opts(), method: 'POST', body: JSON.stringify({ email: inviteEmail }) }); setInviteEmail(''); })}>Invite</button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>They&apos;ll see the invite here on their own Household page when they sign in.</p>
                </section>
              )}

              {view.my_role === 'owner' && (
                <button style={{ ...ghost, color: '#dc2626', borderColor: 'rgba(220,38,38,0.4)', alignSelf: 'flex-start' }}
                  onClick={() => { if (confirm('Delete this household for everyone?')) act(() => apiCall(`/api/household/${view.id}`, { ...opts(), method: 'DELETE' })); }}>
                  Delete household
                </button>
              )}

              <section>
                <h2 style={h2}>Accounts</h2>
                <div style={{ ...card, padding: 0 }}>
                  {view.accounts.length === 0 && <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>No shared accounts yet.</div>}
                  {view.accounts.map((a: any, i: number) => {
                    const liability = ['credit', 'loan'].includes(a.type);
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: i ? '1px solid rgba(var(--fg),0.07)' : 'none' }}>
                        <div>
                          <div style={{ fontSize: 14 }}>{a.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.institution_name || a.subtype || a.type}{a.mask ? ` ••${a.mask}` : ''}</div>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: liability ? '#dc2626' : 'var(--text)' }}>{liability ? '-' : ''}{formatCurrency(Math.abs(a.current_balance))}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
