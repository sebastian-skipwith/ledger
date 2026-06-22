'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore, apiCall } from '@/lib/store';

// Shared sign-in screen (Google + email/password). Used by the dashboard when
// logged out and by the OAuth consent page.
export default function AuthScreen({ heading }: { heading?: string }) {
  const { setAuth } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!googleClientId) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    script.onload = () => {
      const g = (window as any).google;
      if (!g) return;

      g.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: any) => {
          setError(''); setLoading(true);
          try {
            const data = await apiCall('/api/auth/google', {
              method: 'POST',
              body: JSON.stringify({ credential: response.credential }),
            });
            setAuth(data.user, data.access, data.refresh);
          } catch (err: any) {
            setError(err.message);
          } finally {
            setLoading(false);
          }
        },
        ux_mode: 'popup',
        auto_select: false,
      });

      if (googleBtnRef.current) {
        g.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 304,
        });
      }
    };

    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const body = mode === 'register' ? { email, password, full_name: name } : { email, password };
      const data = await apiCall(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) });
      setAuth(data.user, data.access, data.refresh);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: 'rgba(var(--fg),0.05)', border: '1px solid rgba(var(--fg),0.1)',
    borderRadius: 8, color: 'var(--white)', fontSize: 14,
    fontFamily: 'var(--font-syne)', outline: 'none', marginBottom: 10,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--ink)' }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img className="plogo" src="/logo.png" alt="Persistence" style={{ height: 46, width: 'auto', margin: '0 auto 8px', display: 'block' }} />
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>{heading || 'Your financial command center'}</p>
        </div>
        <div style={{ background: 'rgba(var(--fg),0.03)', border: '1px solid rgba(var(--fg),0.08)', borderRadius: 16, padding: 28 }}>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, minHeight: 44 }}>
            <div ref={googleBtnRef} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(var(--fg),0.08)' }} />
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(var(--fg),0.08)' }} />
          </div>

          <div style={{ display: 'flex', marginBottom: 20, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(var(--fg),0.08)' }}>
            {(['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '8px 0', fontSize: 13, fontFamily: 'var(--font-syne)',
                border: 'none', cursor: 'pointer', fontWeight: 500,
                background: mode === m ? 'rgba(var(--fg),0.15)' : 'transparent',
                color: mode === m ? 'var(--accent)' : 'var(--muted)', transition: 'all 0.15s',
              }}>{m === 'login' ? 'Sign In' : 'Create Account'}</button>
            ))}
          </div>

          <form onSubmit={submit}>
            {mode === 'register' && <input style={inp} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required />}
            <input style={inp} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input style={inp} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '11px 0', background: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
              fontFamily: 'var(--font-syne)', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>{loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
