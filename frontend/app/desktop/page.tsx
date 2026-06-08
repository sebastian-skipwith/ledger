'use client';

import { useEffect, useState } from 'react';

export default function DesktopAuthPage() {
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'none' | 'error'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ledger-store');
      if (!raw) { setStatus('none'); return; }
      const parsed = JSON.parse(raw);
      const refresh = parsed && parsed.state ? parsed.state.refreshToken : null;
      if (refresh && typeof refresh === 'string') {
        setCode(refresh);
        setStatus('ready');
      } else {
        setStatus('none');
      }
    } catch {
      setStatus('error');
    }
  }, []);

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked - user can select manually */
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', padding: 24 }}>
      <div style={{ width: 420, maxWidth: '100%', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 64, lineHeight: 1 }}>P</div>
        <div style={{ fontSize: 13, letterSpacing: 5, textTransform: 'uppercase', marginTop: 8, marginBottom: 28 }}>Persistence</div>

        {status === 'loading' && <p style={{ fontSize: 14 }}>Loading...</p>}

        {status === 'ready' && (
          <div>
            <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>Copy this code and paste it into the Persistence desktop app.</p>
            <textarea readOnly value={code || ''} onFocus={(e) => e.currentTarget.select()} style={{ width: '100%', height: 90, padding: 12, border: '1px solid #000', background: '#fff', color: '#000', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', resize: 'none', boxSizing: 'border-box' }} />
            <div>
              <button onClick={copy} style={{ marginTop: 14, padding: '12px 28px', border: '1px solid #000', background: '#000', color: '#fff', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>{copied ? 'Copied' : 'Copy code'}</button>
            </div>
            <p style={{ fontSize: 11, color: '#666', marginTop: 22, lineHeight: 1.5 }}>This code lets the desktop app sign in as you. Keep it private.</p>
          </div>
        )}

        {status === 'none' && (
          <div>
            <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>You are not signed in. Open the dashboard, sign in with Google, then return to this page.</p>
            <a href="/" style={{ display: 'inline-block', padding: '12px 28px', border: '1px solid #000', background: '#000', color: '#fff', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', textDecoration: 'none', fontFamily: 'Georgia, serif' }}>Go to dashboard</a>
          </div>
        )}

        {status === 'error' && <p style={{ fontSize: 14 }}>Could not read your session. Try signing in again.</p>}
      </div>
    </div>
  );
}
