import { Text, View } from 'react-native';
import { LinearGradient, useFont, vec } from '@shopify/react-native-skia';
import { BarGroup, CartesianChart } from 'victory-native';
import type { MonthFlow } from '@/lib/analytics';
import { chartFontSource } from '@/lib/fonts';
import { theme } from '@/lib/theme';
import { Card, EmptyNote } from '@/components/Card';

function shortMonth(ym: string): string {
  // 'YYYY-MM' -> 'Jun'
  const d = new Date(`${ym}-01T00:00:00`);
  return isNaN(d.getTime()) ? ym : d.toLocaleDateString(undefined, { month: 'short' });
}

export function IncomeExpensesChart({ data }: { data: MonthFlow[] }) {
  const font = useFont(chartFontSource, 11);

  if (data.length < 1) {
    return (
      <Card title="Income vs Expenses">
        <EmptyNote text="No monthly cash-flow data yet." />
      </Card>
    );
  }

  return (
    <Card title="Income vs Expenses">
      <View style={{ flexDirection: 'row', gap: 14, marginBottom: 10 }}>
        <Legend color="#34d399" label="Income" />
        <Legend color="#fb7185" label="Expenses" />
      </View>
      <View style={{ height: 240 }}>
        <CartesianChart
          data={data}
          xKey="month"
          yKeys={['income', 'expenses']}
          domain={{ y: [0] }}
          padding={{ left: 8, right: 8, top: 12, bottom: 4 }}
          domainPadding={{ left: 36, right: 36, top: 24 }}
          axisOptions={{
            font,
            tickCount: { y: 4, x: data.length },
            formatXLabel: (m) => shortMonth(String(m)),
            formatYLabel: (v) => `$${Math.round(v / 1000)}k`,
            lineColor: 'rgba(255,255,255,0.08)',
            labelColor: theme.muted,
          }}
        >
          {({ points, chartBounds }) => (
            <BarGroup
              chartBounds={chartBounds}
              betweenGroupPadding={0.4}
              withinGroupPadding={0.1}
              roundedCorners={{ topLeft: 5, topRight: 5 }}
            >
              <BarGroup.Bar points={points.income} animate={{ type: 'timing' }}>
                <LinearGradient start={vec(0, 0)} end={vec(0, chartBounds.bottom)} colors={['#34d399', '#05966990']} />
              </BarGroup.Bar>
              <BarGroup.Bar points={points.expenses} animate={{ type: 'timing' }}>
                <LinearGradient start={vec(0, 0)} end={vec(0, chartBounds.bottom)} colors={['#fb7185', '#e11d4890']} />
              </BarGroup.Bar>
            </BarGroup>
          )}
        </CartesianChart>
      </View>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ color: theme.subtle, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
