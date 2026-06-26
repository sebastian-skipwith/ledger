'use client';
import type { ReactNode } from 'react';
import NetWorthChart from './NetWorthChart';
import AccountCards from './AccountCards';
import BillsList from './BillsList';
import GoalsView from './GoalsView';
import TransactionsView from './TransactionsView';
import Analytics from './Analytics';
import CashFlowTile from './CashFlowTile';
import SubscriptionsTile from './SubscriptionsTile';

export interface TileCtx { token: string; accounts: any[]; loading: boolean; }

export interface TileDef {
  key: string;
  label: string;
  defaultW: number;
  defaultH: number;
  render: (ctx: TileCtx) => ReactNode;
}

// Single source of truth: registry key -> existing component. Analytics ships as
// ONE tile (the whole component) in v1 — do not decompose its charts yet.
export const TILE_REGISTRY: Record<string, TileDef> = {
  networth:     { key: 'networth',     label: 'Net Worth',    defaultW: 12, defaultH: 4, render: (c) => <NetWorthChart token={c.token} /> },
  accounts:     { key: 'accounts',     label: 'Accounts',     defaultW: 6,  defaultH: 5, render: (c) => <AccountCards accounts={c.accounts} loading={c.loading} /> },
  bills:        { key: 'bills',        label: 'Bills',        defaultW: 6,  defaultH: 5, render: (c) => <BillsList token={c.token} full /> },
  goals:        { key: 'goals',        label: 'Goals',        defaultW: 6,  defaultH: 5, render: (c) => <GoalsView token={c.token} /> },
  transactions: { key: 'transactions', label: 'Transactions', defaultW: 12, defaultH: 6, render: (c) => <TransactionsView token={c.token} accounts={c.accounts} /> },
  analytics:    { key: 'analytics',    label: 'Analytics',    defaultW: 12, defaultH: 7, render: (c) => <Analytics token={c.token} accounts={c.accounts} /> },
  cashflow:     { key: 'cashflow',     label: 'Cash Flow',    defaultW: 6,  defaultH: 5, render: (c) => <CashFlowTile token={c.token} /> },
  subscriptions:{ key: 'subscriptions', label: 'Services & Subscriptions', defaultW: 6, defaultH: 6, render: (c) => <SubscriptionsTile token={c.token} /> },
};

// Built-in layout for users with no saved layout (must never render blank).
export const DEFAULT_TILES = [
  { key: 'networth', x: 0, y: 0, w: 12, h: 4, visible: true, theme: null },
  { key: 'accounts', x: 0, y: 4, w: 6,  h: 5, visible: true, theme: null },
  { key: 'bills',    x: 6, y: 4, w: 6,  h: 5, visible: true, theme: null },
];
