import { apiCall } from './api';

// NOTE: chart-data shapes are `type` aliases (not interfaces) on purpose —
// victory-native's generics require data assignable to Record<string, unknown>,
// and TS only gives type aliases (not interfaces) an implicit index signature.
export type NetWorthPoint = {
  date: number; // epoch ms (numeric xKey for the time-series chart)
  value: number;
};
export type MonthFlow = {
  month: string; // 'YYYY-MM'
  income: number;
  expenses: number;
};
export type CategorySlice = {
  value: number;
  color: string;
  label: string;
};
export interface CreditReading {
  id: string;
  score: number;
  source: string | null;
  recorded_at: string;
}
export interface Subscription {
  merchant: string;
  amount: number;
  cadence: string;
  monthly_equivalent: number;
  occurrences: number;
  last_charged: string;
}
export interface SubscriptionsData {
  subscriptions: Subscription[];
  total_monthly: number;
  count: number;
}
export interface Insight {
  type: 'alert' | 'opportunity' | 'info';
  title: string;
  body: string;
}

export interface AnalyticsData {
  netWorth: NetWorthPoint[];
  flows: MonthFlow[];
  categories: CategorySlice[];
  spendTotal: number;
  credit: CreditReading[];
  subscriptions: SubscriptionsData | null;
  insights: Insight[];
}

// Distinct, legible slice colors for the spending donut.
const PALETTE = ['#7c5cff', '#34d399', '#fb7185', '#f59e0b', '#38bdf8', '#a78bfa'];
const OTHER_COLOR = '#5b5b6e';

const num = (v: any) => Number(v) || 0;

// category_custom ?? category[0] ?? 'Other' (mirrors the web client).
function displayCategory(t: any): string {
  if (t.category_custom) return t.category_custom;
  if (Array.isArray(t.category) && t.category[0]) return t.category[0];
  return 'Other';
}

export async function fetchAnalytics(): Promise<AnalyticsData> {
  const since = new Date();
  since.setDate(since.getDate() - 120);
  const from = since.toISOString().slice(0, 10);

  // Parallel; each guards itself so one failure doesn't blank the screen.
  // (subscriptions + ai/insights share a 20/min limiter — called once on load.)
  const [nw, summary, txns, credit, subs, insightsRes] = await Promise.all([
    apiCall('/api/net-worth?days=180').catch(() => []),
    apiCall('/api/transactions/summary?months=6').catch(() => []),
    apiCall(`/api/transactions?from=${from}&limit=1000`).catch(() => []),
    apiCall('/api/credit').catch(() => []),
    apiCall('/api/intelligence/subscriptions').catch(() => null),
    apiCall('/api/ai/insights').catch(() => null),
  ]);

  const netWorth: NetWorthPoint[] = (Array.isArray(nw) ? nw : [])
    .map((r: any) => ({ date: new Date(r.snapshot_date).getTime(), value: num(r.net_worth) }))
    .filter((p) => !isNaN(p.date));

  const flows: MonthFlow[] = (Array.isArray(summary) ? summary : [])
    .slice()
    .reverse() // backend returns DESC; charts want chronological
    .map((r: any) => ({ month: r.month, income: num(r.income), expenses: num(r.expenses) }));

  // Aggregate expense transactions (amount > 0) by display category.
  const catMap = new Map<string, number>();
  for (const t of Array.isArray(txns) ? txns : []) {
    const amt = num(t.amount);
    if (amt <= 0) continue;
    const k = displayCategory(t);
    catMap.set(k, (catMap.get(k) || 0) + amt);
  }
  const sorted = [...catMap.entries()].sort((a, b) => b[1] - a[1]);
  const categories: CategorySlice[] = sorted.slice(0, 6).map(([label, value], i) => ({
    label,
    value: Math.round(value),
    color: PALETTE[i % PALETTE.length],
  }));
  const restTotal = sorted.slice(6).reduce((s, [, v]) => s + v, 0);
  if (restTotal > 0) categories.push({ label: 'Other', value: Math.round(restTotal), color: OTHER_COLOR });
  const spendTotal = categories.reduce((s, c) => s + c.value, 0);

  const subscriptions: SubscriptionsData | null =
    subs && Array.isArray(subs.subscriptions) ? subs : null;
  const insights: Insight[] =
    insightsRes && Array.isArray(insightsRes.insights) ? insightsRes.insights : [];

  return {
    netWorth,
    flows,
    categories,
    spendTotal,
    credit: Array.isArray(credit) ? credit : [],
    subscriptions,
    insights,
  };
}
