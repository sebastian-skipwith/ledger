import { useStore } from './store';

// Base URL of the Express backend (Railway). Override per-environment via the
// EXPO_PUBLIC_API_URL env var (inlined at build time by Expo).
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://ledger-production-5649.up.railway.app';

// ─────────────────────────────────────────────────────────────
// API client with automatic access-token refresh.
// Ported from frontend/lib/store.ts — same refresh-once-then-retry contract.
// ─────────────────────────────────────────────────────────────

// De-dupe concurrent refreshes so a burst of 401s triggers only one refresh.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = useStore.getState();
  if (!refreshToken) return null;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // NOTE: backend expects body key `refresh` (not `refresh_token`)
          body: JSON.stringify({ refresh: refreshToken }),
        });
        if (!res.ok) {
          // Refresh token gone/expired — force a clean re-login.
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
    fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(rest.headers || {}),
      },
    });

  const bearer = token ?? useStore.getState().accessToken ?? undefined;
  let res = await send(bearer);

  // If the access token is expired/invalid, refresh once and retry.
  if (res.status === 401 && useStore.getState().refreshToken) {
    const fresh = await refreshAccessToken();
    if (fresh) res = await send(fresh);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err?.error)
      ? err.error.map((e: any) => e.message).join(', ')
      : err?.error;
    throw new Error(msg || `API error ${res.status}`);
  }
  // Some endpoints (rare) return empty bodies.
  return res.json().catch(() => ({}));
}
