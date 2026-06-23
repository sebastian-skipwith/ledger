import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '@/lib/api';
import { useStore } from '@/lib/store';
import { fonts, radius, theme } from '@/lib/theme';
import { ConnectionsCard } from '@/components/ConnectionsCard';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);

  function signOut() {
    logout();
    router.replace('/login');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.ink }} contentContainerStyle={{ padding: 18, paddingTop: insets.top + 12, gap: 18 }}>
      <Text style={{ color: theme.text, fontSize: 26, fontFamily: fonts.serif }}>Settings</Text>

      <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: radius.lg, padding: 18 }}>
        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Signed in as
        </Text>
        <Text style={{ color: theme.text, fontSize: 16, marginTop: 6 }}>{user?.full_name || '—'}</Text>
        <Text style={{ color: theme.subtle, fontSize: 13, marginTop: 2 }}>{user?.email}</Text>
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 8, textTransform: 'capitalize' }}>
          {user?.tier || 'free'} plan
        </Text>
      </View>

      <ConnectionsCard />

      <Pressable
        onPress={signOut}
        style={({ pressed }) => ({
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingVertical: 13,
          alignItems: 'center',
          backgroundColor: pressed ? 'rgba(255,255,255,0.06)' : 'transparent',
        })}
      >
        <Text style={{ color: theme.red, fontSize: 14.5, fontWeight: '600' }}>Sign Out</Text>
      </Pressable>

      <Text style={{ color: theme.muted, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
        Persistence • connected to {API_URL.replace(/^https?:\/\//, '')}
      </Text>
    </ScrollView>
  );
}
