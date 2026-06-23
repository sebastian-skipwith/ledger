import { Text, View } from 'react-native';
import type { CreditReading } from '@/lib/analytics';
import { fonts, theme } from '@/lib/theme';
import { EmptyNote } from '@/components/Card';

function band(score: number): string {
  if (score >= 800) return 'Exceptional';
  if (score >= 740) return 'Very Good';
  if (score >= 670) return 'Good';
  if (score >= 580) return 'Fair';
  return 'Poor';
}

export function CreditCard({ data }: { data: CreditReading[] }) {
  if (!data.length) {
    return <EmptyNote text="No credit score recorded yet. Add one from the web app." />;
  }
  const latest = data[0];
  const prev = data[1];
  const diff = prev ? latest.score - prev.score : null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <View>
        <Text style={{ color: theme.text, fontSize: 40, fontFamily: fonts.mono, fontWeight: '700' }}>{latest.score}</Text>
        <Text style={{ color: theme.subtle, fontSize: 13, marginTop: 2 }}>
          {band(latest.score)}
          {latest.source ? ` · ${latest.source}` : ''}
        </Text>
      </View>
      {diff !== null && diff !== 0 && (
        <Text style={{ color: diff > 0 ? theme.green : theme.red, fontSize: 14, fontWeight: '700' }}>
          {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}
        </Text>
      )}
    </View>
  );
}
