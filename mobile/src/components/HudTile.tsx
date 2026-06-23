import { Text, View } from 'react-native';
import { fonts, radius, theme } from '@/lib/theme';

export function HudTile({
  label,
  value,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '47%',
        backgroundColor: theme.card,
        borderColor: theme.borderSoft,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: 14,
      }}
    >
      <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ color: theme.text, fontSize: 21, fontWeight: '600', fontFamily: fonts.mono, marginTop: 6 }}>
        {value}
      </Text>
      {!!sub && (
        <Text style={{ color: subColor || theme.muted, fontSize: 11.5, marginTop: 3, fontFamily: fonts.sans }}>{sub}</Text>
      )}
    </View>
  );
}
