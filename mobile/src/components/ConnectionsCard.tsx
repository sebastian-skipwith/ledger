import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { apiCall } from '@/lib/api';
import { refreshFinances } from '@/lib/finances';
import { fonts, radius, theme } from '@/lib/theme';
import { PlaidLinkButton } from './PlaidLinkButton';

interface Item {
  id: string;
  institution_name: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export function ConnectionsCard() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const data = (await apiCall('/api/plaid/items')) as Item[];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // leave whatever we had
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadItems();
      setLoading(false);
    })();
  }, [loadItems]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await apiCall('/api/plaid/sync', { method: 'POST' });
      // Sync runs in the background server-side; re-pull after a moment.
      setTimeout(async () => {
        await Promise.all([refreshFinances().catch(() => {}), loadItems()]);
        setSyncing(false);
      }, 3500);
    } catch {
      setSyncing(false);
    }
  }, [loadItems]);

  const disconnect = useCallback(
    (item: Item) => {
      const name = item.institution_name || 'this bank';
      Alert.alert('Disconnect ' + name + '?', 'This removes its accounts and transactions from Persistence.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setBusyId(item.id);
            try {
              await apiCall('/api/plaid/items/' + item.id, { method: 'DELETE' });
              await Promise.all([refreshFinances().catch(() => {}), loadItems()]);
            } catch {
              // ignore; list stays as-is
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [loadItems]
  );

  return (
    <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: radius.lg, padding: 18, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Connected Banks
        </Text>
        {items.length > 0 && (
          <Pressable onPress={syncNow} disabled={syncing} hitSlop={8}>
            <Text style={{ color: theme.subtle, fontSize: 12.5, fontWeight: '600' }}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.text} style={{ paddingVertical: 8 }} />
      ) : items.length === 0 ? (
        <Text style={{ color: theme.muted, fontSize: 13 }}>No banks connected yet.</Text>
      ) : (
        <View style={{ gap: 6 }}>
          {items.map((it) => (
            <View
              key={it.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: theme.borderSoft,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ color: theme.text, fontSize: 14 }}>{it.institution_name || 'Bank'}</Text>
                <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>{lastSynced(it.last_synced_at)}</Text>
              </View>
              {busyId === it.id ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <Pressable onPress={() => disconnect(it)} hitSlop={8}>
                  <Text style={{ color: theme.red, fontSize: 12.5, fontWeight: '600' }}>Disconnect</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      <PlaidLinkButton
        label={items.length === 0 ? 'Link a bank' : 'Link another bank'}
        variant={items.length === 0 ? 'primary' : 'secondary'}
        onLinked={loadItems}
      />
    </View>
  );
}

function lastSynced(ts: string | null): string {
  if (!ts) return 'Not synced yet';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return 'Connected';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Synced just now';
  if (mins < 60) return `Synced ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Synced ${hrs}h ago`;
  return `Synced ${Math.floor(hrs / 24)}d ago`;
}
