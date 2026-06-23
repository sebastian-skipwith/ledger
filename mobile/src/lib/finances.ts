import { apiCall } from './api';
import { useStore } from './store';
import type { Account, Hud } from './types';

// Fetch accounts + HUD and write them into the store. Any screen reading
// `accounts`/`hud` from the store re-renders automatically, so this is the one
// refresh path used after login, pull-to-refresh, linking, and disconnecting.
export async function refreshFinances(): Promise<void> {
  const [accts, hud] = await Promise.all([
    apiCall('/api/accounts') as Promise<Account[]>,
    apiCall('/api/summary/hud').catch(() => null) as Promise<Hud | null>,
  ]);
  useStore.getState().setAccounts(Array.isArray(accts) ? accts : []);
  useStore.getState().setHud(hud);
}
