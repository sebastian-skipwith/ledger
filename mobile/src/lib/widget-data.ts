import AsyncStorage from '@react-native-async-storage/async-storage';

// Single key the app writes and the headless widget task handler reads.
// AsyncStorage is a process-wide native store shared by both sides.
export const WIDGET_DATA_KEY = 'persistence.widget.networth.v1';

export interface WidgetData {
  netWorth: number;
  safeToSpend: number;
  updatedAt: number; // epoch ms
}

export async function writeWidgetData(data: WidgetData): Promise<void> {
  try {
    await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(data));
  } catch {
    // non-fatal: the widget keeps showing the previous cached values
  }
}

export async function readWidgetData(): Promise<WidgetData | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_DATA_KEY);
    return raw ? (JSON.parse(raw) as WidgetData) : null;
  } catch {
    return null;
  }
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// Always returns renderable strings — never blank, even with no cache yet.
export function formatWidgetView(data: WidgetData | null) {
  if (!data) {
    return { netWorth: '—', safeToSpend: '—', updatedAt: 'Open the app to sync' };
  }
  const t = new Date(data.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return {
    netWorth: money(data.netWorth),
    safeToSpend: money(data.safeToSpend),
    updatedAt: `as of ${t}`,
  };
}
