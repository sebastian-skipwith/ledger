import type { Account, FinancialSummary } from './types';

const isRetirement = (subtype: string | null | undefined) =>
  ['401k', 'ira', 'roth'].some((k) => (subtype || '').toLowerCase().includes(k));

// Manual currency formatter — avoids Hermes/Android Intl.NumberFormat quirks and
// matches the web client's behavior (maximumFractionDigits: 0).
export function formatCurrency(n: number, compact = false): string {
  const value = Number(n) || 0;
  const neg = value < 0;
  const abs = Math.abs(value);
  if (compact) {
    if (abs >= 1_000_000) return `${neg ? '-' : ''}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${neg ? '-' : ''}$${Math.round(abs / 1_000)}k`;
  }
  const withCommas = Math.round(abs)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${withCommas}`;
}

// Mirrors frontend/lib/store.ts computeSummary. Prefer server values from
// /api/summary/hud when available; this is the client-side fallback.
export function computeSummary(accounts: Account[]): FinancialSummary {
  const cash = accounts
    .filter((a) => a.type === 'depository')
    .reduce((s, a) => s + (Number(a.current_balance) || 0), 0);

  const investments = accounts
    .filter((a) => a.type === 'investment' && !isRetirement(a.subtype))
    .reduce((s, a) => s + (Number(a.current_balance) || 0), 0);

  const retirement = accounts
    .filter((a) => isRetirement(a.subtype))
    .reduce((s, a) => s + (Number(a.current_balance) || 0), 0);

  const total_debt = accounts
    .filter((a) => ['credit', 'loan'].includes(a.type))
    .reduce((s, a) => s + Math.abs(Number(a.current_balance) || 0), 0);

  return {
    net_worth: cash + investments + retirement - total_debt,
    cash,
    investments,
    retirement,
    total_debt,
    monthly_bills: 0,
  };
}
