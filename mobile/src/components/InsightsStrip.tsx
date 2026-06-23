import { ScrollView, Text, View } from 'react-native';
import type { Insight } from '@/lib/analytics';
import { radius, theme } from '@/lib/theme';

const TONE: Record<Insight['type'], string> = {
  alert: theme.red,
  opportunity: theme.green,
  info: '#7c5cff',
};

// Horizontal strip of the 3 AI insights from GET /api/ai/insights.
export function InsightsStrip({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
      {insights.map((it, i) => (
        <View
          key={i}
          style={{
            width: 230,
            backgroundColor: theme.card,
            borderColor: theme.border,
            borderWidth: 1,
            borderLeftColor: TONE[it.type] || TONE.info,
            borderLeftWidth: 3,
            borderRadius: radius.md,
            padding: 14,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: '700', marginBottom: 4 }} numberOfLines={2}>
            {it.title}
          </Text>
          <Text style={{ color: theme.subtle, fontSize: 12, lineHeight: 17 }} numberOfLines={4}>
            {it.body}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
