'use client';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { formatCurrency, wsHeaders } from '@/lib/store';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const COLS = [
  { key: 'date', label: 'Date' },
  { key: 'name', label: 'Merchant' },
  { key: 'category', label: 'Category' },
  { key: 'account_name', label: 'Account' },
  { key: 'amount', label: 'Amount' },
];

const th: CSSProperties = { padding: '10px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'rgba(var(--fg),0.5)', cursor: 'pointer', borderBottom: '1px solid rgba(var(--fg),0.12)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--ink)' };
const td: CSSProperties = { padding: '8px 12px', borderBottom: '1px solid rgba(var(--fg),0.05)', whiteSpace: 'nowrap' };

function cellValue(t: any, key: string): any {
  if (key === 'name') return t.merchant_name || t.name || '';
  if (key === 'category') return t.category_custom || (Array.isArray(t.category) ? t.category[0] : t.category) || '';
  if (key === 'amount') return Number(t.amount) || 0;
  return t[key] || '';
}

// "Your financial life in spreadsheet format" — a sortable, exportable grid of
// your transactions (workspace-scoped). MVP = most recent 500; full history +
// pagination is a follow-up.
export default function SpreadsheetView({ token }: { token: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ col: string; dir: number }>({ col: 'date', dir: -1 });

  useEffect(() => {
    fetch(`${API}/api/transactions?limit=500`, { headers: wsHeaders(token) })
      .then((r) => r.json())
      .then((d) => { setRows(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const sorted = [...rows].sort((a, b) => {
    const av = cellValue(a, sort.col), bv = cellValue(b, sort.col);
    if (av < bv) return -sort.dir;
    if (av > bv) return sort.dir;
    return 0;
  });

  function toggleSort(col: string) { setSort((s) => (s.col === col ? { col, dir: -s.dir } : { col, dir: 1 })); }

  function exportCsv() {
    const header = COLS.map((c) => c.label).join(',');
    const body = sorted.map((t) => COLS.map((c) => {
      const v = c.key === 'amount' ? Number(cellValue(t, c.key)) : String(cellValue(t, c.key));
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'persistence-transactions.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 400, color: 'var(--white)' }}>Spreadsheet</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Your financial life as a sortable table. Click a header to sort.</p>
        </div>
        <button onClick={exportCsv} style={{ fontSize: 11, padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(var(--fg),0.15)', background: 'var(--text)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-syne)', fontWeight: 600, flexShrink: 0 }}>Export CSV</button>
      </div>

      {loading ? (
        <div className="shimmer" style={{ height: 320, borderRadius: 10 }} />
      ) : (
        <div style={{ overflow: 'auto', border: '1px solid rgba(var(--fg),0.1)', borderRadius: 10, maxHeight: '70vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)} style={{ ...th, textAlign: c.key === 'amount' ? 'right' : 'left' }}>
                    {c.label}{sort.col === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const out = Number(t.amount) > 0;
                return (
                  <tr key={t.id}>
                    <td style={td}>{new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                    <td style={{ ...td, whiteSpace: 'normal' }}>{t.merchant_name || t.name}</td>
                    <td style={td}>{cellValue(t, 'category')}</td>
                    <td style={td}>{t.account_name}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', color: out ? 'var(--text)' : '#16a34a' }}>
                      {out ? '-' : '+'}{formatCurrency(Math.abs(Number(t.amount) || 0))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
