'use client';

const typeColors: Record<string, string> = { alert: '#f04f54', opportunity: '#16c784', info: '#f5a623' };
const typeIcons: Record<string, string> = { alert: '⚡', opportunity: '↑', info: '◎' };

export default function InsightStrip({ insights, loading }: { insights: any[]; loading: boolean }) {
  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
      {[1,2,3].map(i => <div key={i} className="card shimmer" style={{ height: 72 }} />)}
    </div>
  );
  if (!insights.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
      {insights.map((ins: any, i: number) => (
        <div key={i} className="card" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 13 }}>{typeIcons[ins.type] || '◎'}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: typeColors[ins.type] || '#f0f0f8' }}>{ins.title}</span>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(160,160,180,0.85)', lineHeight: 1.5 }}>{ins.body}</p>
        </div>
      ))}
    </div>
  );
}
