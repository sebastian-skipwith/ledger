import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { radius, theme } from '@/lib/theme';

export function Card({
  title,
  headerRight,
  children,
}: {
  title?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: radius.lg, padding: 16 }}>
      {(title || headerRight) && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          {title ? (
            <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {title}
            </Text>
          ) : (
            <View />
          )}
          {headerRight}
        </View>
      )}
      {children}
    </View>
  );
}

export function EmptyNote({ text }: { text: string }) {
  return <Text style={{ color: theme.muted, fontSize: 13, paddingVertical: 10 }}>{text}</Text>;
}
