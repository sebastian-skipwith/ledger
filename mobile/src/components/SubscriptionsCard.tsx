import { Text, View } from 'react-native';
import type { SubscriptionsData } from '@/lib/analytics';
import { formatCurrency } from '@/lib/format';
import { fonts, theme } from '@/lib/theme';
import { EmptyNote } from '@/components/Card';

export function SubscriptionsCard({ data }: { data: SubscriptionsData | null }) {
  if (!data || data.subscriptions.length === 0) {
    return <EmptyNote text="No recurring subscriptions detected yet." />;
  }

  return (
    <View>
      <Text style={{ color: theme.subtle, fontSize: 13, marginBottom: 10 }}>
        <Text style={{ color: theme.text, fontWeight: '700' }}>~{formatCurrency(data.total_monthly)}</Text>/mo across {data.count}{' '}
        {data.count === 1 ? 'subscription' : 'subscriptions'}
      </Text>
      <View style={{ gap: 4 }}>
        {data.subscriptions.slice(0, 6).map((s, i) => (
          <View
            key={`${s.merchant}-${i}`}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 8,
              borderBottomWidth: i < Math.min(5, data.subscriptions.length - 1) ? 1 : 0,
              borderBottomColor: theme.borderSoft,
            }}
          >
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13.5 }}>
                {s.merchant}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 11, marginTop: 1, textTransform: 'capitalize' }}>{s.cadence}</Text>
            </View>
            <Text style={{ color: theme.text, fontSize: 13, fontFamily: fonts.mono }}>{formatCurrency(s.amount)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
