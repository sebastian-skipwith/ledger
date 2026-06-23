import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from './secure-storage';
import type { Account, FinancialSummary, Hud, User } from './types';

interface AppState {
  // Auth (persisted)
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: User, access: string, refresh: string) => void;
  logout: () => void;

  // Financial data (in-memory only)
  accounts: Account[];
  summary: FinancialSummary | null;
  hud: Hud | null;
  insights: any[];
  setAccounts: (accounts: Account[]) => void;
  setSummary: (summary: FinancialSummary | null) => void;
  setHud: (hud: Hud | null) => void;
  setInsights: (insights: any[]) => void;

  // Hydration gate — true once persisted auth has loaded from SecureStore.
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) => set({ user, accessToken, refreshToken }),
      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          accounts: [],
          summary: null,
          hud: null,
          insights: [],
        }),

      accounts: [],
      summary: null,
      hud: null,
      insights: [],
      setAccounts: (accounts) => set({ accounts }),
      setSummary: (summary) => set({ summary }),
      setHud: (hud) => set({ hud }),
      setInsights: (insights) => set({ insights }),

      hasHydrated: false,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'persistence-auth',
      storage: createJSONStorage(() => secureStorage),
      // Only the auth slice is persisted (keeps the SecureStore value tiny).
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
