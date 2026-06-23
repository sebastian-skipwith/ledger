import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useStore } from '@/lib/store';
import { theme } from '@/lib/theme';

export default function RootLayout() {
  // Wait for persisted auth to load from SecureStore before routing, so we
  // don't flash the login screen for an already-signed-in user.
  const hasHydrated = useStore((s) => s.hasHydrated);

  // GestureHandlerRootView is required (outside SafeAreaProvider) for
  // victory-native's chart press/scrubber gestures to work.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {hasHydrated ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.ink },
              animation: 'fade',
            }}
          />
        ) : (
          <View style={{ flex: 1, backgroundColor: theme.ink, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.text} />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
