import { useState } from 'react';
import { Text, View } from 'react-native';
import { Circle, LinearGradient, useFont, vec } from '@shopify/react-native-skia';
import { runOnJS, type SharedValue, useAnimatedReaction } from 'react-native-reanimated';
import { Area, CartesianChart, Line, useChartPressState } from 'victory-native';
import type { NetWorthPoint } from '@/lib/analytics';
import { chartFontSource } from '@/lib/fonts';
import { formatCurrency } from '@/lib/format';
import { fonts, theme } from '@/lib/theme';
import { Card, EmptyNote } from '@/components/Card';

const ACCENT = '#7c5cff';

export function NetWorthChart({ data }: { data: NetWorthPoint[] }) {
  const font = useFont(chartFontSource, 11);
  const { state, isActive } = useChartPressState({ x: 0, y: { value: 0 } });
  const [active, setActive] = useState<{ v: number; t: number } | null>(null);

  // Surface the scrubbed value/date to JS so we can show it in the header.
  useAnimatedReaction(
    () => ({ v: state.y.value.value.value, t: state.x.value.value }),
    (cur) => {
      runOnJS(setActive)(cur);
    }
  );

  if (data.length < 2) {
    return (
      <Card title="Net Worth">
        <EmptyNote text="Your net-worth history builds up day by day — check back soon." />
      </Card>
    );
  }

  const latest = data[data.length - 1].value;
  const shown = isActive && active ? active.v : latest;
  const dateLabel =
    isActive && active
      ? new Date(active.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : 'Now';

  return (
    <Card title="Net Worth" headerRight={<Text style={{ color: theme.muted, fontSize: 11 }}>{dateLabel}</Text>}>
      <Text style={{ color: theme.text, fontSize: 28, fontFamily: fonts.mono, fontWeight: '700', marginBottom: 10 }}>
        {formatCurrency(shown)}
      </Text>
      <View style={{ height: 200 }}>
        <CartesianChart
          data={data}
          xKey="date"
          yKeys={['value']}
          padding={{ left: 6, right: 6, top: 8, bottom: 4 }}
          domainPadding={{ top: 20, bottom: 14 }}
          chartPressState={state}
          axisOptions={{
            font,
            tickCount: { x: 4, y: 4 },
            formatXLabel: (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short' }),
            formatYLabel: (v) => `$${Math.round(v / 1000)}k`,
            lineColor: 'rgba(255,255,255,0.08)',
            labelColor: theme.muted,
          }}
        >
          {({ points, chartBounds }) => (
            <>
              <Area points={points.value} y0={chartBounds.bottom} curveType="natural" animate={{ type: 'timing', duration: 300 }}>
                <LinearGradient start={vec(0, 0)} end={vec(0, chartBounds.bottom)} colors={[`${ACCENT}aa`, `${ACCENT}05`]} />
              </Area>
              <Line points={points.value} color={ACCENT} strokeWidth={2} curveType="natural" animate={{ type: 'timing', duration: 300 }} />
              {isActive && <Scrubber x={state.x.position} y={state.y.value.position} />}
            </>
          )}
        </CartesianChart>
      </View>
    </Card>
  );
}

function Scrubber({ x, y }: { x: SharedValue<number>; y: SharedValue<number> }) {
  return (
    <>
      <Circle cx={x} cy={y} r={8} color={ACCENT} opacity={0.25} />
      <Circle cx={x} cy={y} r={4} color={ACCENT} />
    </>
  );
}
