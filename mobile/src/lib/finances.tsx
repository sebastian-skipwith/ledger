import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { apiCall } from './api';
import { useStore } from './store';
import type { Account, Hud } from './types';
import { formatWidgetView, writeWidgetData } from './widget-data';
import { NetWorthWidget } from '@/widgets/NetWorthWidget';

// Fetch accounts + HUD and write them into the store. Any screen reading
// `accounts`/`hud` from the store re-renders automatically, so this is the one
// refresh path used after login, pull-to-refresh, linking, and disconnecting.
// It also keeps the home-screen widget's cached values fresh.
export async function refreshFinances(): Promise<void> {
  const [accts, hud] = await Promise.all([
    apiCall('/api/accounts') as Promise<Account[]>,
    apiCall('/api/summary/hud').catch(() => null) as Promise<Hud | null>,
  ]);
  useStore.getState().setAccounts(Array.isArray(accts) ? accts : []);
  useStore.getState().setHud(hud);
  await syncWidget(hud);
}

// Persist the latest net-worth / safe-to-spend for the widget, and ask any
// placed widget to redraw immediately (Android only).
async function syncWidget(hud: Hud | null): Promise<void> {
  if (!hud) return;
  const data = {
    netWorth: hud.net_worth,
    safeToSpend: hud.safe_to_spend?.amount ?? 0,
    updatedAt: Date.now(),
  };
  await writeWidgetData(data);
  if (Platform.OS !== 'android') return;
  try {
    const view = formatWidgetView(data);
    requestWidgetUpdate({
      widgetName: 'NetWorth',
      renderWidget: () => <NetWorthWidget {...view} />,
      widgetNotFound: () => {}, // no widget placed — safe no-op
    });
  } catch {
    // widget native module unavailable (e.g. before a rebuild) — non-fatal
  }
}
