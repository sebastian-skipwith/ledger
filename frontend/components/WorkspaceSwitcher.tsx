'use client';
import { useState, useEffect, useRef } from 'react';
import { useStore, apiCall } from '@/lib/store';

export default function WorkspaceSwitcher() {
  const { activeWorkspace, setActiveWorkspace, workspaces, setWorkspaces } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { apiCall('/api/workspaces').then(setWorkspaces).catch(() => {}); }, []);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(ws: any) {
    setActiveWorkspace({ id: ws.id ?? null, name: ws.name });
    setOpen(false);
    // Full reload so every panel re-fetches with the new workspace header.
    window.location.reload();
  }

  async function createWorkspace() {
    const name = prompt('Name your business workspace (e.g. "Acme LLC"):');
    if (!name || !name.trim()) return;
    try {
      const ws = await apiCall('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      setWorkspaces(await apiCall('/api/workspaces'));
      pick(ws);
    } catch (e: any) {
      alert((e.message || '').includes('plan') ? 'Business workspaces require a Pro or Wealth plan.' : (e.message || 'Could not create workspace'));
    }
  }

  const current = activeWorkspace || { id: null, name: 'Personal' };
  const list = (workspaces && workspaces.length) ? workspaces : [{ id: null, name: 'Personal', type: 'personal' }];

  return (
    <div ref={ref} style={{ position: 'relative', marginRight: 20, flexShrink: 0 }}>
      <button onClick={() => setOpen((o) => !o)} title="Switch workspace" style={{
        display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(var(--fg),0.06)',
        border: '1px solid rgba(var(--fg),0.12)', borderRadius: 7, padding: '5px 10px',
        color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-syne)', maxWidth: 170,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: current.id ? '#3b7dff' : 'var(--text)', flexShrink: 0 }} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current.name}</span>
        <span style={{ opacity: 0.5, fontSize: 9 }}>{'▼'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '120%', left: 0, zIndex: 120, minWidth: 210,
          background: 'var(--bar-bg)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(var(--fg),0.15)', borderRadius: 8, padding: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)', padding: '4px 8px' }}>Workspaces</div>
          {list.map((ws: any) => (
            <button key={ws.id || 'personal'} onClick={() => pick(ws)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              background: current.id === (ws.id ?? null) ? 'rgba(var(--fg),0.08)' : 'transparent',
              border: 'none', borderRadius: 6, padding: '7px 8px', cursor: 'pointer',
              color: 'var(--text)', fontSize: 12.5, fontFamily: 'var(--font-syne)',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: ws.id ? '#3b7dff' : 'var(--text)', flexShrink: 0 }} />
              {ws.name}
            </button>
          ))}
          <div style={{ height: 1, background: 'rgba(var(--fg),0.08)', margin: '5px 0' }} />
          <button onClick={createWorkspace} style={{
            width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
            borderRadius: 6, padding: '7px 8px', cursor: 'pointer', color: 'rgba(59,125,255,0.85)',
            fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-syne)',
          }}>+ New business workspace</button>
        </div>
      )}
    </div>
  );
}
