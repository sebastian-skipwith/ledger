import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppLock } from '@/lib/useAppLock';
import { useStore } from '@/lib/store';
import { theme } from '@/lib/theme';
import { track } from '@/lib/track';
import { LockScreen } from '@/components/LockScreen';

// Crash/error monitoring. Active only when a DSN is provided (and not in dev).
// Finance-safe: no PII, request bodies, or auth headers leave the device.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN && !__DEV__,
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
      delete event.user.ip_address;
    }
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers.Authorization;
        delete event.request.headers.Cookie;
      }
    }
    return event;
  },
  beforeBreadcrumb(crumb) {
    if (crumb.category === 'xhr' || crumb.category === 'fetch') {
      if (crumb.data) {
        delete crumb.data.body;
        delete (crumb.data as Record<string, unknown>).response_body;
      }
    }
    return crumb;
  },
});

function RootLayout() {
  // Wait for persisted auth to load from SecureStore before routing, so we
  // don't flash the login screen for an already-signed-in user.
  const hasHydrated = useStore((s) => s.hasHydrated);
  const { locked, authing, retry } = useAppLock();

  useEffect(() => {
    track('app_opened');
  }, []);

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
        {/* Biometric lock overlay — painted above everything when locked. */}
        {locked && <LockScreen authing={authing} onUnlock={retry} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap installs the error boundary + touch/perf instrumentation.
export default Sentry.wrap(RootLayout);
