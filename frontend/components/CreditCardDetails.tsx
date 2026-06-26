'use client';
import { formatCurrency } from '@/lib/store';

function Stat({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: alert ? '#dc2626' : 'var(--text)' }}>{value}</div>
      {sub ? <div style={{ fontSize: 10, color: alert ? '#dc2626' : 'var(--muted)' }}>{sub}</div> : null}
    </div>
  );
}

export default function CreditCardDetails({ account }: { account: any }) {
  const bal = Math.abs(Number(account.current_balance) || 0);
  const limit = account.credit_limit != null ? Number(account.credit_limit) : null;
  const avail = account.available_balance != null ? Number(account.available_balance)
    : (limit != null ? limit - bal : null);
  const util = limit && limit > 0 ? Math.min(100, Math.round((bal / limit) * 100)) : null;
  const aprs = Array.isArray(account.aprs) ? account.aprs : [];
  const purchase = aprs.find((a: any) => (a.apr_type || '').includes('purchase')) || aprs[0];
  const apr = purchase ? Number(purchase.apr_percentage) : null;
  const hasDetail = account.minimum_payment_amount != null || account.last_payment_amount != null || apr != null;

  const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid rgba(var(--fg),0.07)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{account.name}</div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{account.linked_institution || account.institution_name || 'Credit card'}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Available to spend</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: avail != null ? '#16a34a' : 'var(--muted)' }}>
            {avail != null ? formatCurrency(avail) : '—'}
          </div>
        </div>
      </div>

      {util != null && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--fg),0.08)', overflow: 'hidden' }}>
            <div style={{ width: `${util}%`, height: '100%', background: util > 70 ? '#dc2626' : util > 30 ? '#f59e0b' : 'var(--text)' }} />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>
            {util}% used · {formatCurrency(bal)} of {limit != null ? formatCurrency(limit) : '—'} limit
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Stat label="Last payment" value={account.last_payment_amount != null ? formatCurrency(Number(account.last_payment_amount)) : '—'} sub={account.last_payment_date ? `on ${fmtDate(account.last_payment_date)}` : ''} />
        <Stat label="Minimum payment" value={account.minimum_payment_amount != null ? formatCurrency(Number(account.minimum_payment_amount)) : '—'} sub={account.next_payment_due_date ? `due ${fmtDate(account.next_payment_due_date)}` : ''} alert={!!account.is_overdue} />
        <Stat label="Purchase APR" value={apr != null ? `${apr.toFixed(2)}%` : '—'} />
        <Stat label="Statement balance" value={account.last_statement_balance != null ? formatCurrency(Number(account.last_statement_balance)) : '—'} />
      </div>

      {!hasDetail && (
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
          Payment &amp; APR details aren&apos;t in yet — hit <strong>Sync</strong> (or wait for the next sync). Some banks don&apos;t share these through Plaid.
        </div>
      )}
    </div>
  );
}
