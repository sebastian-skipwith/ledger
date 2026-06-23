import { Text, View } from 'react-native';
import { Pie, PolarChart } from 'victory-native';
import type { CategorySlice } from '@/lib/analytics';
import { formatCurrency } from '@/lib/format';
import { fonts, theme } from '@/lib/theme';
import { EmptyNote } from '@/components/Card';

export function CategoryDonut({ data, total }: { data: CategorySlice[]; total: number }) {
  if (!data.length) {
    return <EmptyNote text="No spending categorized yet — link a bank or wait for transactions to sync." />;
  }

  return (
    <View>
      <View style={{ height: 220 }}>
        <PolarChart data={data} valueKey="value" colorKey="color" labelKey="label">
          <Pie.Chart innerRadius="62%" />
        </PolarChart>
        {/* center label */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
          <Text style={{ color: theme.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Spending</Text>
          <Text style={{ color: theme.text, fontSize: 20, fontFamily: fonts.mono, fontWeight: '700' }}>{formatCurrency(total)}</Text>
        </View>
      </View>

      <View style={{ marginTop: 14, gap: 8 }}>
        {data.map((s) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 10 }}>
              <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: s.color }} />
              <Text numberOfLines={1} style={{ color: theme.subtle, fontSize: 13, flex: 1 }}>
                {s.label}
              </Text>
            </View>
            <Text style={{ color: theme.text, fontSize: 13, fontFamily: fonts.mono }}>{formatCurrency(s.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
