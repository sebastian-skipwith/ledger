'use client';
import { useEffect, useState } from 'react';
import { apiCall } from '@/lib/store';

const TABS = [
  { key: '', label: 'All' },
  { key: 'layout', label: 'Layouts' },
  { key: 'prompt', label: 'Prompts' },
  { key: 'strategy', label: 'Strategies' },
];
const KIND_COLOR: Record<string, string> = { layout: '#3b7dff', prompt: '#a855f7', strategy: '#16a34a' };
const LS_TILES = 'persistence-web-tiles-v1';
const LS_PROMPTS = 'persistence-web-prompts';

export default function CommunityPage({ token }: { token: string }) {
  const [tab, setTab] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    setLoading(true);
    apiCall(`/api/community${tab ? `?kind=${tab}` : ''}`, { token })
      .then((d) => { setItems(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, [tab, token]);

  async function like(it: any) {
    try {
      const r = await apiCall(`/api/community/${it.id}/like`, { method: 'POST', token });
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, liked_by_me: r.liked, like_count: x.like_count + (r.liked ? 1 : -1) } : x)));
    } catch {}
  }

  async function install(it: any) {
    setBusy(it.id);
    try {
      const r = await apiCall(`/api/community/${it.id}/install`, { method: 'POST', token });
      if (r.kind === 'strategy') {
        alert(r.note || 'Strategy added as paper + disabled.');
      } else if (r.kind === 'layout') {
        const tiles = (r.payload && r.payload.tiles) || [];
        try { localStorage.setItem(LS_TILES, JSON.stringify(tiles)); } catch {}
        await apiCall('/api/layouts/default', { method: 'PUT', token, body: JSON.stringify({ tiles }) }).catch(() => {});
        alert('Layout applied — open the Dashboard to see it.');
      } else if (r.kind === 'prompt') {
        const text = (r.payload && r.payload.text) || '';
        try { const cur = JSON.parse(localStorage.getItem(LS_PROMPTS) || '[]'); cur.unshift(text); localStorage.setItem(LS_PROMPTS, JSON.stringify(cur.slice(0, 50))); } catch {}
        try { await navigator.clipboard.writeText(text); } catch {}
        alert('Prompt saved + copied to clipboard.');
      }
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, installed_by_me: true, install_count: x.install_count + (it.installed_by_me ? 0 : 1) } : x)));
    } catch (e: any) { alert(e.message || 'Install failed'); }
    setBusy(null);
  }

  async function publish(kind: string, body: any) {
    try { await apiCall('/api/community', { method: 'POST', token, body: JSON.stringify({ kind, ...body }) }); alert('Shared with the community!'); load(); }
    catch (e: any) { alert(e.message || 'Could not share'); }
  }
  async function shareLayout() {
    setShareOpen(false);
    let tiles: any[] = [];
    try { tiles = JSON.parse(localStorage.getItem(LS_TILES) || '[]'); } catch {}
    if (!tiles.length) return alert('Customize your dashboard first (Dashboard → Customize), then share it.');
    const title = prompt('Title for your shared layout:'); if (!title) return;
    publish('layout', { title, description: prompt('Short description (optional):') || '', payload: { tiles } });
  }
  function sharePrompt() {
    setShareOpen(false);
    const text = prompt('Paste the prompt to share:'); if (!text || !text.trim()) return;
    publish('prompt', { title: prompt('Title:') || text.slice(0, 40), payload: { text } });
  }
  async function shareStrategy() {
    setShareOpen(false);
    try {
      const data = await apiCall('/api/strategies', { token });
      const list = (data && data.strategies) || [];
      if (!list.length) return alert('Create a strategy first (Strategies), then share it.');
      const choice = prompt('Which strategy to share? Enter the number:\n' + list.map((s: any, i: number) => `${i + 1}. ${s.strategy_key}`).join('\n'));
      const idx = parseInt(choice || '', 10) - 1;
      if (isNaN(idx) || !list[idx]) return;
      publish('strategy', { source_id: list[idx].id, title: prompt('Title:') || list[idx].strategy_key, description: prompt('Short description (optional):') || '' });
    } catch (e: any) { alert(e.message); }
  }

  const btn: React.CSSProperties = { fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(var(--fg),0.15)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font-syne)', fontWeight: 600 };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 400, color: 'var(--white)' }}>Community</h2>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShareOpen((o) => !o)} style={{ ...btn, background: 'var(--text)', color: 'var(--ink)', border: 'none' }}>+ Share</button>
          {shareOpen && (
            <div style={{ position: 'absolute', right: 0, top: '115%', zIndex: 50, background: 'var(--ink)', border: '1px solid rgba(var(--fg),0.15)', borderRadius: 8, padding: 6, minWidth: 180, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
              {[['Share my dashboard layout', shareLayout], ['Share a prompt', sharePrompt], ['Share a strategy', shareStrategy]].map(([label, fn]: any) => (
                <button key={label} onClick={fn} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 8px', background: 'none', border: 'none', color: 'var(--text)', fontSize: 12, cursor: 'pointer', borderRadius: 5 }}>{label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>Share and discover dashboard layouts, AI prompts, and trading-bot strategies. Imported strategies always arrive as paper + disabled.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ ...btn, background: tab === t.key ? 'rgba(var(--fg),0.12)' : 'transparent', color: tab === t.key ? 'var(--text)' : 'var(--muted)' }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="shimmer" style={{ height: 240, borderRadius: 12 }} />
      ) : items.length === 0 ? (
        <p style={{ color: 'rgba(var(--fg),0.4)', fontSize: 13 }}>Nothing shared here yet — be the first with “+ Share”.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {items.map((it) => (
            <div key={it.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: KIND_COLOR[it.kind] || 'var(--muted)' }}>{it.kind}</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>by {it.author_name || 'Anonymous'}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{it.title}</div>
              {it.description ? <div style={{ fontSize: 12, color: 'rgba(var(--fg),0.7)', lineHeight: 1.5 }}>{it.description}</div> : null}
              {it.kind === 'prompt' && it.payload?.text ? (
                <div style={{ fontSize: 11.5, color: 'rgba(var(--fg),0.6)', background: 'rgba(var(--fg),0.04)', borderRadius: 6, padding: '8px 10px', maxHeight: 90, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{it.payload.text}</div>
              ) : null}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', paddingTop: 6 }}>
                <button onClick={() => like(it)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: it.liked_by_me ? '#ef4444' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {it.liked_by_me ? '♥' : '♡'} {it.like_count}
                </button>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{it.install_count} installs</span>
                <button onClick={() => install(it)} disabled={busy === it.id} style={{ ...btn, marginLeft: 'auto', background: 'var(--text)', color: 'var(--ink)', border: 'none', opacity: busy === it.id ? 0.5 : 1 }}>
                  {it.kind === 'strategy' ? 'Add (paper)' : it.kind === 'layout' ? 'Apply' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
