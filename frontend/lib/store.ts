// lib/store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface User {
  id: string;
  email: string;
  full_name: string;
  tier: 'free' | 'pro' | 'wealth';
}

interface Account {
  id: string;
  name: string;
  type: string;
  subtype: string;
  current_balance: number;
  institution_name: string;
  mask: string;
  color: string;
}

interface FinancialSummary {
  net_worth: number;
  cash: number;
  investments: number;
  retirement: number;
  total_debt: number;
  monthly_bills: number;
}

interface AppState {
  // Auth
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: User, access: string, refresh: string) => void;
  logout: () => void;

  // Financial data
  accounts: Account[];
  summary: FinancialSummary | null;
  insights: any[];
  setAccounts: (accounts: Account[]) => void;
  setSummary: (summary: FinancialSummary) => void;
  setInsights: (insights: any[]) => void;

  // UI state
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  activeSection: string;
  setActiveSection: (section: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) => set({ user, accessToken, refreshToken }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null }),

      accounts: [],
      summary: null,
      insights: [],
      setAccounts: (accounts) => set({ accounts }),
      setSummary: (summary) => set({ summary }),
      setInsights: (insights) => set({ insights }),

      sidebarOpen: true,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      activeSection: 'dashboard',
      setActiveSection: (activeSection) => set({ activeSection }),
    }),
    {
      name: 'ledger-store',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

// ─────────────────────────────────────────────
// API CLIENT (with automatic access-token refresh)
// ─────────────────────────────────────────────

// De-dupe concurrent refreshes so a burst of 401s triggers only one refresh call.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = useStore.getState();
  if (!refreshToken) return null;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: refreshToken }),
        });
        if (!res.ok) {
          // Refresh token is gone/expired — force a clean re-login.
          useStore.getState().logout();
          return null;
        }
        const data = await res.json(); // { access, refresh }
        const user = useStore.getState().user;
        if (user) useStore.getState().setAuth(user, data.access, data.refresh);
        return data.access as string;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function apiCall(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<any> {
  const { token, ...rest } = options;

  const send = (bearer?: string) =>
    fetch(`${API}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(rest.headers || {}),
      },
      body: rest.body,
    });

  // Use the explicitly-passed token, falling back to the stored access token.
  const bearer = token ?? useStore.getState().accessToken ?? undefined;
  let res = await send(bearer);

  // If the access token is expired/invalid, refresh once and retry.
  if (res.status === 401 && useStore.getState().refreshToken) {
    const fresh = await refreshAccessToken();
    if (fresh) res = await send(fresh);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

// Compute summary from accounts array
export function computeSummary(accounts: Account[]): FinancialSummary {
  const cash = accounts
    .filter(a => a.type === 'depository')
    .reduce((s, a) => s + (a.current_balance || 0), 0);

  const investments = accounts
    .filter(a => a.type === 'investment' && !['401k','ira','roth'].some(k => a.subtype?.toLowerCase().includes(k)))
    .reduce((s, a) => s + (a.current_balance || 0), 0);

  const retirement = accounts
    .filter(a => ['401k','ira','roth'].some(k => a.subtype?.toLowerCase().includes(k)))
    .reduce((s, a) => s + (a.current_balance || 0), 0);

  const total_debt = accounts
    .filter(a => ['credit','loan'].includes(a.type))
    .reduce((s, a) => s + Math.abs(a.current_balance || 0), 0);

  return {
    net_worth: cash + investments + retirement - total_debt,
    cash,
    investments,
    retirement,
    total_debt,
    monthly_bills: 0, // fetched from bills endpoint
  };
}

export function formatCurrency(n: number, compact = false): string {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
