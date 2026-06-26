'use client';
import { TILE_REGISTRY, type TileCtx } from './tileRegistry';

// Curated accent swatches. We only ever override --accent (safe); never --fg,
// whose R,G,B triplet cascades into every border/text inside the tile.
const SWATCHES = ['#d4af37', '#3b7dff', '#16a34a', '#a855f7', '#ef4444', '#14b8a6'];

export default function TileFrame({
  tile, ctx, editMode, onRemove, onTheme,
}: {
  tile: any; ctx: TileCtx; editMode: boolean;
  onRemove: (key: string) => void; onTheme: (key: string, theme: string | null) => void;
}) {
  const def = TILE_REGISTRY[tile.key];
  if (!def) return null;
  const accentVars = tile.theme ? ({ ['--accent' as any]: tile.theme }) : {};

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', ...accentVars }}>
      <div
        className="tile-drag"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: editMode ? 'move' : 'default',
          height: editMode ? 'auto' : 0, overflow: 'hidden',
          padding: editMode ? '2px 2px 6px' : 0, gap: 8,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{def.label}</span>
        {editMode && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {SWATCHES.map((s) => (
              <button key={s} onClick={() => onTheme(tile.key, s)} title="Accent color"
                style={{ width: 12, height: 12, borderRadius: '50%', background: s, border: '1px solid rgba(var(--fg),0.25)', cursor: 'pointer', padding: 0 }} />
            ))}
            <button onClick={() => onTheme(tile.key, null)} title="Reset color"
              style={{ fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>reset</button>
            <button onClick={() => onRemove(tile.key)} title="Remove tile"
              style={{ fontSize: 15, color: 'rgba(220,38,38,0.75)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {def.render(ctx)}
      </div>
    </div>
  );
}
