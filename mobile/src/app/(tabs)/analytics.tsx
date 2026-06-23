import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type AnalyticsData, fetchAnalytics } from '@/lib/analytics';
import { fonts, theme } from '@/lib/theme';
import { Card } from '@/components/Card';
import { CreditCard } from '@/components/CreditCard';
import { InsightsStrip } from '@/components/InsightsStrip';
import { SubscriptionsCard } from '@/components/SubscriptionsCard';
import { CategoryDonut } from '@/components/charts/CategoryDonut';
import { IncomeExpensesChart } from '@/components/charts/IncomeExpensesChart';
import { NetWorthChart } from '@/components/charts/NetWorthChart';

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchAnalytics());
    } catch {
      // keep last data; per-call guards already null out failures
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.ink }}
      contentContainerStyle={{ padding: 18, paddingTop: insets.top + 12, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />}
    >
      <Text style={{ color: theme.text, fontSize: 26, fontFamily: fonts.serif }}>Analytics</Text>

      {loading || !data ? (
        <View style={{ paddingVertical: 80, alignItems: 'center' }}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <>
          <InsightsStrip insights={data.insights} />

          <NetWorthChart data={data.netWorth} />

          <Card title="Spending by Category">
            <CategoryDonut data={data.categories} total={data.spendTotal} />
          </Card>

          <IncomeExpensesChart data={data.flows} />

          <Card title="Credit Score">
            <CreditCard data={data.credit} />
          </Card>

          <Card title="Subscriptions">
            <SubscriptionsCard data={data.subscriptions} />
          </Card>
        </>
      )}
    </ScrollView>
  );
}
