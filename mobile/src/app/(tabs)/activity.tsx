import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiCall } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { fonts, theme } from '@/lib/theme';

interface Txn {
  id: string;
  date: string;
  name: string;
  merchant_name: string | null;
  amount: string | number;
  category: string[] | null;
  category_custom: string | null;
  pending: boolean;
  account_name?: string;
}

const PAGE = 50;

function displayCategory(t: Txn): string {
  if (t.category_custom) return t.category_custom;
  if (Array.isArray(t.category) && t.category[0]) return t.category[0];
  return 'Other';
}

function fmtDate(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(async (offset: number): Promise<Txn[]> => {
    const rows = (await apiCall(`/api/transactions?limit=${PAGE}&offset=${offset}`)) as Txn[];
    return Array.isArray(rows) ? rows : [];
  }, []);

  const initialLoad = useCallback(async () => {
    try {
      const rows = await fetchPage(0);
      setTxns(rows);
      setHasMore(rows.length === PAGE);
    } catch {
      setTxns([]);
      setHasMore(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await initialLoad();
      setLoading(false);
    })();
  }, [initialLoad]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await initialLoad();
    setRefreshing(false);
  }, [initialLoad]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const rows = await fetchPage(txns.length);
      setTxns((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loading, loadingMore, txns.length]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.ink, paddingTop: insets.top + 12 }}>
      <Text style={{ color: theme.text, fontSize: 26, fontFamily: fonts.serif, paddingHorizontal: 18, marginBottom: 12 }}>
        Activity
      </Text>
      {loading ? (
        <View style={{ paddingVertical: 80, alignItems: 'center' }}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <FlatList
          data={txns}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.borderSoft }} />}
          ListEmptyComponent={
            <Text style={{ color: theme.muted, fontSize: 13, textAlign: 'center', paddingVertical: 40 }}>
              No transactions yet. Link a bank to see your activity.
            </Text>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={theme.muted} style={{ paddingVertical: 16 }} /> : null
          }
          renderItem={({ item }) => <Row txn={item} />}
        />
      )}
    </View>
  );
}

function Row({ txn }: { txn: Txn }) {
  const amt = Number(txn.amount) || 0;
  const isIncome = amt < 0; // negative = inflow
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14.5 }}>
          {txn.merchant_name || txn.name || 'Transaction'}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 11.5, marginTop: 2 }}>
          {displayCategory(txn)} · {fmtDate(txn.date)}
          {txn.pending ? ' · pending' : ''}
        </Text>
      </View>
      <Text style={{ color: isIncome ? theme.green : theme.text, fontSize: 14, fontFamily: fonts.mono }}>
        {isIncome ? '+' : '-'}
        {formatCurrency(Math.abs(amt))}
      </Text>
    </View>
  );
}
