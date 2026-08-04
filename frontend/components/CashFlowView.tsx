'use client';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { formatCurrency, wsHeaders } from '@/lib/store';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Role colors: income/savings are status-good green; the pool uses the app accent.
const INCOME = '#16a34a';
const SAVED = '#16a34a';
// Categorical palette for expense destinations — validated (dataviz six checks,
// light + dark surfaces): fixed order, never cycled; identity also via direct labels.
const CAT_COLORS = ['#3b7dff', '#d97706', '#a855f7', '#0891b2', '#ec4899', '#65a30d'];
const OTHER_COLOR = '#64748b';

const RANGES = [
  { key: 30, label: '30D' },
  { key: 90, label: '90D' },
  { key: 180, label: '180D' },
];

interface Node { id: string; name: string; value: number; color: string; side: 'in' | 'out'; }

function groupTop(rows: any[], keyOf: (t: any) => string, topN: number): { name: string; value: number }[] {
  const g: Record<string, number> = {};
  for (const t of rows) {
    const k = keyOf(t) || 'Other';
    g[k] = (g[k] || 0) + Math.abs(Number(t.amount) || 0);
  }
  const sorted = Object.entries(g).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  if (sorted.length <= topN) return sorted;
  const head = sorted.slice(0, topN);
  const rest = sorted.slice(topN).reduce((s, x) => s + x.value, 0);
  return [...head, { name: 'Other', value: rest }];
}

export default function CashFlowView({ token }: { token: string }) {
  const [days, setDays] = useState(30);
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<Node | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    setLoading(true); setSelected(null);
    const from = new Date(); from.setDate(from.getDate() - days);
    fetch(`${API}/api/transactions?from=${from.toISOString().slice(0, 10)}&limit=1000`, { headers: wsHeaders(token) })
      .then((r) => r.json())
      .then((d) => { setTxns(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token, days]);

  const model = useMemo(() => {
    const incomeRows = txns.filter((t) => Number(t.amount) < 0);
    const expenseRows = txns.filter((t) => Number(t.amount) > 0);
    const catOf = (t: any) => t.category_custom || (Array.isArray(t.category) ? t.category[0] : t.category) || 'Other';
    const srcOf = (t: any) => t.merchant_name || t.name || 'Income';

    const inGroups = groupTop(incomeRows, srcOf, 5);
    const outGroups = groupTop(expenseRows, catOf, 6);
    const totalIn = inGroups.reduce((s, x) => s + x.value, 0);
    const totalOut = outGroups.reduce((s, x) => s + x.value, 0);
    const saved = totalIn - totalOut;

    const inNodes: Node[] = inGroups.map((g, i) => ({ id: `in:${g.name}`, name: g.name, value: g.value, color: INCOME, side: 'in' }));
    const outNodes: Node[] = outGroups.map((g, i) => ({
      id: `out:${g.name}`, name: g.name, value: g.value,
      color: g.name === 'Other' ? OTHER_COLOR : CAT_COLORS[i % CAT_COLORS.length], side: 'out',
    }));
    if (saved > 1) outNodes.push({ id: 'out:Saved', name: 'Saved / Leftover', value: saved, color: SAVED, side: 'out' });
    return { inNodes, outNodes, totalIn, totalOut, saved, incomeRows, expenseRows, catOf, srcOf };
  }, [txns]);

  const { inNodes, outNodes, totalIn, totalOut, saved } = model;
  const hasData = totalIn > 0 || totalOut > 0;

  // ── Layout math (SVG viewBox coordinates) ──
  const W = 960;
  const rowsMax = Math.max(inNodes.length, outNodes.length);
  const H = Math.max(430, rowsMax * 84 + 90);
  const IX = 150, PX = W / 2, OX = W - 150; // column x centers
  const PY = H / 2;
  const flowBase = Math.max(totalIn, totalOut, 1);
  const radius = (v: number) => Math.max(15, Math.min(44, Math.sqrt(v / flowBase) * 52));
  const linkW = (v: number) => Math.max(2.5, (v / flowBase) * 54);

  function stack(nodes: Node[]): number[] {
    const gap = 26;
    const heights = nodes.map((n) => radius(n.value) * 2 + gap);
    const total = heights.reduce((s, h) => s + h, 0) - gap;
    let y = PY - total / 2;
    return nodes.map((n, i) => { const cy = y + radius(n.value); y += heights[i]; return cy; });
  }
  const inYs = stack(inNodes);
  const outYs = stack(outNodes);
  const poolR = Math.max(34, Math.min(56, Math.sqrt(1) * 56));

  const dim = (id: string) => hover !== null && hover !== id;
  const pct = (v: number) => (totalIn > 0 ? `${Math.round((v / totalIn) * 100)}% of income` : '');

  function onEnter(n: Node, e: React.MouseEvent) {
    setHover(n.id);
    setTip({ x: e.clientX, y: e.clientY, text: `${n.name} — ${formatCurrency(n.value)}${totalIn > 0 ? ` · ${pct(n.value)}` : ''}` });
  }

  const selRows = useMemo(() => {
    if (!selected) return [];
    const src = selected.side === 'in' ? model.incomeRows : model.expenseRows;
    const keyOf = selected.side === 'in' ? model.srcOf : model.catOf;
    const rows = selected.name === 'Other'
      ? src.filter((t) => { const names = (selected.side === 'in' ? inNodes : outNodes).filter((n) => n.name !== 'Other').map((n) => n.name); return !names.includes(keyOf(t)); })
      : selected.name === 'Saved / Leftover' ? []
      : src.filter((t) => keyOf(t) === selected.name);
    return rows.sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount))).slice(0, 25);
  }, [selected, model, inNodes, outNodes]);

  const btn: CSSProperties = { fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(var(--fg),0.15)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font-syne)', fontWeight: 600 };
  const label = (x: number, y: number, anchor: 'start' | 'end' | 'middle', name: string, value: number) => (
    <>
      <text x={x} y={y - 4} textAnchor={anchor} style={{ fontSize: 12.5, fontWeight: 600, fill: 'rgba(var(--fg),0.88)', fontFamily: 'var(--font-syne)' }}>
        {name.length > 20 ? name.slice(0, 19) + '…' : name}
      </text>
      <text x={x} y={y + 11} textAnchor={anchor} style={{ fontSize: 11, fill: 'rgba(var(--fg),0.55)', fontFamily: 'var(--font-mono)' }}>
        {formatCurrency(value)}
      </text>
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 400, color: 'var(--white)' }}>Cash Flow</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Where your money comes from, and where it goes. Hover for detail, click a bubble to see its transactions.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setDays(r.key)} style={{ ...btn, background: days === r.key ? 'var(--text)' : 'transparent', color: days === r.key ? 'var(--ink)' : 'var(--muted)', border: days === r.key ? 'none' : btn.border }}>{r.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="shimmer" style={{ height: 380, borderRadius: 12 }} />
      ) : !hasData ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No transactions in this range yet — link an account or widen the range.</div>
      ) : (
        <div className="card" style={{ padding: '10px 6px', position: 'relative' }} onMouseLeave={() => { setHover(null); setTip(null); }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Cash flow diagram: income sources flowing into your income pool, then out to spending categories">
            {/* Links: income -> pool */}
            {inNodes.map((n, i) => {
              const y = inYs[i], r = radius(n.value), w = linkW(n.value);
              const d = `M ${IX + r} ${y} C ${(IX + PX) / 2} ${y}, ${(IX + PX) / 2} ${PY}, ${PX - poolR} ${PY}`;
              return (
                <g key={n.id}>
                  <path d={d} fill="none" stroke={n.color} strokeWidth={w} strokeLinecap="round" opacity={dim(n.id) ? 0.12 : 0.32} style={{ transition: 'opacity 0.15s' }} />
                  <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(w + 12, 18)}
                    onMouseEnter={(e) => onEnter(n, e)} onMouseMove={(e) => setTip((t) => t && { ...t, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => { setHover(null); setTip(null); }} onClick={() => setSelected(n)} style={{ cursor: 'pointer' }} />
                </g>
              );
            })}
            {/* Links: pool -> out */}
            {outNodes.map((n, i) => {
              const y = outYs[i], r = radius(n.value), w = linkW(n.value);
              const d = `M ${PX + poolR} ${PY} C ${(PX + OX) / 2} ${PY}, ${(PX + OX) / 2} ${y}, ${OX - r} ${y}`;
              return (
                <g key={n.id}>
                  <path d={d} fill="none" stroke={n.color} strokeWidth={w} strokeLinecap="round" opacity={dim(n.id) ? 0.12 : 0.32} style={{ transition: 'opacity 0.15s' }} />
                  <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(w + 12, 18)}
                    onMouseEnter={(e) => onEnter(n, e)} onMouseMove={(e) => setTip((t) => t && { ...t, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => { setHover(null); setTip(null); }} onClick={() => setSelected(n)} style={{ cursor: 'pointer' }} />
                </g>
              );
            })}

            {/* Income bubbles */}
            {inNodes.map((n, i) => {
              const y = inYs[i], r = radius(n.value);
              return (
                <g key={n.id} onMouseEnter={(e) => onEnter(n, e)} onMouseMove={(e) => setTip((t) => t && { ...t, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => { setHover(null); setTip(null); }} onClick={() => setSelected(n)} style={{ cursor: 'pointer' }}>
                  <circle cx={IX} cy={y} r={r} fill={n.color} opacity={dim(n.id) ? 0.25 : 0.85} stroke="var(--ink)" strokeWidth={2} style={{ transition: 'opacity 0.15s' }} />
                  {label(IX - r - 10, y, 'end', n.name, n.value)}
                </g>
              );
            })}

            {/* Pool */}
            <g>
              <circle cx={PX} cy={PY} r={poolR} fill="none" stroke={INCOME} strokeWidth={2.5} opacity={0.9} />
              <text x={PX} y={PY - 6} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', fill: 'rgba(var(--fg),0.55)', textTransform: 'uppercase', fontFamily: 'var(--font-syne)' }}>Income</text>
              <text x={PX} y={PY + 12} textAnchor="middle" style={{ fontSize: 13.5, fontWeight: 600, fill: 'rgba(var(--fg),0.9)', fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalIn)}</text>
            </g>

            {/* Out bubbles */}
            {outNodes.map((n, i) => {
              const y = outYs[i], r = radius(n.value);
              const isSaved = n.id === 'out:Saved';
              return (
                <g key={n.id} onMouseEnter={(e) => onEnter(n, e)} onMouseMove={(e) => setTip((t) => t && { ...t, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => { setHover(null); setTip(null); }} onClick={() => setSelected(n)} style={{ cursor: 'pointer' }}>
                  {isSaved
                    ? <circle cx={OX} cy={y} r={r} fill="none" stroke={n.color} strokeWidth={2.5} strokeDasharray="5 4" opacity={dim(n.id) ? 0.3 : 0.95} style={{ transition: 'opacity 0.15s' }} />
                    : <circle cx={OX} cy={y} r={r} fill={n.color} opacity={dim(n.id) ? 0.25 : 0.85} stroke="var(--ink)" strokeWidth={2} style={{ transition: 'opacity 0.15s' }} />}
                  {label(OX + r + 10, y, 'start', n.name, n.value)}
                </g>
              );
            })}
          </svg>

          {/* Summary strip */}
          <div style={{ display: 'flex', gap: 18, justifyContent: 'center', padding: '6px 0 8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>In <strong style={{ color: INCOME, fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalIn)}</strong></span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Out <strong style={{ color: '#dc2626', fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalOut)}</strong></span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{saved >= 0 ? 'Saved' : 'Overspent'} <strong style={{ color: saved >= 0 ? SAVED : '#dc2626', fontFamily: 'var(--font-mono)' }}>{formatCurrency(Math.abs(saved))}</strong></span>
          </div>

          {tip && (
            <div style={{ position: 'fixed', left: tip.x + 14, top: tip.y + 10, zIndex: 300, pointerEvents: 'none', background: 'var(--ink)', border: '1px solid rgba(var(--fg),0.2)', borderRadius: 8, padding: '7px 10px', fontSize: 12, color: 'var(--text)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', maxWidth: 280 }}>
              {tip.text}
            </div>
          )}
        </div>
      )}

      {/* Detail panel (also the accessible table view) */}
      {selected && (
        <div className="card" style={{ padding: 16, marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: selected.color, marginRight: 8 }} />
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>{selected.name}</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 10 }}>{formatCurrency(selected.value)}{totalIn > 0 ? ` · ${pct(selected.value)}` : ''}</span>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer' }}>×</button>
          </div>
          {selected.id === 'out:Saved' ? (
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>What's left of your income after all spending in this range — money you kept.</p>
          ) : selRows.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>No individual transactions to show.</p>
          ) : selRows.map((t: any) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid rgba(var(--fg),0.05)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: 'rgba(var(--fg),0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.merchant_name || t.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {t.account_name}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: selected.side === 'in' ? INCOME : 'rgba(var(--fg),0.85)', flexShrink: 0 }}>{formatCurrency(Math.abs(Number(t.amount) || 0))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
