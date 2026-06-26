'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import TileFrame from './TileFrame';
import { TILE_REGISTRY, DEFAULT_TILES, type TileCtx } from './tileRegistry';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const Grid = WidthProvider(GridLayout);
const LS_KEY = 'persistence-web-tiles-v1';

const btn: CSSProperties = {
  fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(var(--fg),0.15)',
  background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font-syne)', fontWeight: 600,
};

export default function TileGrid({ ctx }: { ctx: TileCtx }) {
  const [tiles, setTiles] = useState<any[] | null>(null);
  const [edit, setEdit] = useState(false);
  const [adding, setAdding] = useState(false);
  const saveTimer = useRef<any>(null);

  // localStorage gives an instant render; the server is the source of truth.
  useEffect(() => {
    let initial: any[] = DEFAULT_TILES;
    try { const ls = localStorage.getItem(LS_KEY); if (ls) { const p = JSON.parse(ls); if (Array.isArray(p) && p.length) initial = p; } } catch {}
    setTiles(initial);
    fetch(`${API}/api/layouts/default`, { headers: { Authorization: `Bearer ${ctx.token}` } })
      .then((r) => r.json())
      .then((d) => { if (d && Array.isArray(d.tiles) && d.tiles.length) setTiles(d.tiles); })
      .catch(() => {});
  }, [ctx.token]);

  const persist = useCallback((next: any[]) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`${API}/api/layouts/default`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.token}` },
        body: JSON.stringify({ tiles: next }),
      }).catch(() => {});
    }, 600);
  }, [ctx.token]);

  if (!tiles) return null; // also avoids SSR/hydration mismatch for the grid

  const visible = tiles.filter((t) => t.visible !== false && TILE_REGISTRY[t.key]);
  const layout = visible.map((t) => ({ i: t.key, x: t.x, y: t.y, w: t.w, h: t.h }));
  const addable = Object.values(TILE_REGISTRY).filter((d) => !visible.find((v) => v.key === d.key));

  function onLayoutChange(newLayout: any[]) {
    const byKey: Record<string, any> = {};
    for (const l of newLayout) byKey[l.i] = l;
    setTiles((prev) => {
      const next = (prev || []).map((t) => (byKey[t.key] ? { ...t, x: byKey[t.key].x, y: byKey[t.key].y, w: byKey[t.key].w, h: byKey[t.key].h } : t));
      persist(next);
      return next;
    });
  }
  function removeTile(key: string) { setTiles((prev) => { const next = (prev || []).map((t) => (t.key === key ? { ...t, visible: false } : t)); persist(next); return next; }); }
  function setTheme(key: string, theme: string | null) { setTiles((prev) => { const next = (prev || []).map((t) => (t.key === key ? { ...t, theme } : t)); persist(next); return next; }); }
  function addTile(key: string) {
    setTiles((prev) => {
      const cur = prev || [];
      const def = TILE_REGISTRY[key];
      const next = cur.find((t) => t.key === key)
        ? cur.map((t) => (t.key === key ? { ...t, visible: true } : t))
        : [...cur, { key, x: 0, y: Infinity, w: def.defaultW, h: def.defaultH, visible: true, theme: null }];
      persist(next);
      return next;
    });
    setAdding(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        {edit && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setAdding((a) => !a)} style={btn}>+ Add tile</button>
            {adding && (
              <div style={{ position: 'absolute', right: 0, top: '115%', zIndex: 50, background: 'var(--ink)', border: '1px solid rgba(var(--fg),0.15)', borderRadius: 8, padding: 6, minWidth: 160, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
                {addable.length === 0
                  ? <div style={{ fontSize: 12, color: 'var(--muted)', padding: 6 }}>All tiles added</div>
                  : addable.map((d) => (
                    <button key={d.key} onClick={() => addTile(d.key)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', color: 'var(--text)', fontSize: 12, cursor: 'pointer', borderRadius: 5 }}>{d.label}</button>
                  ))}
              </div>
            )}
          </div>
        )}
        <button onClick={() => setEdit((e) => !e)} style={{ ...btn, background: edit ? 'var(--text)' : 'transparent', color: edit ? 'var(--ink)' : 'var(--muted)' }}>{edit ? 'Done' : 'Customize'}</button>
      </div>

      <Grid
        className="layout" layout={layout} cols={12} rowHeight={70} margin={[16, 16]}
        isDraggable={edit} isResizable={edit} draggableHandle=".tile-drag"
        onLayoutChange={onLayoutChange} compactType="vertical"
      >
        {visible.map((t) => (
          <div key={t.key} style={{ overflow: 'hidden' }}>
            <TileFrame tile={t} ctx={ctx} editMode={edit} onRemove={removeTile} onTheme={setTheme} />
          </div>
        ))}
      </Grid>
    </div>
  );
}
