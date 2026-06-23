import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useStore } from './store';

// Optional biometric app-lock. Gates the app on cold start and whenever it
// returns from background, as a full-screen overlay mounted in the root layout.
export function useAppLock() {
  const biometricLock = useStore((s) => s.biometricLock);
  const hasHydrated = useStore((s) => s.hasHydrated);
  const signedIn = useStore((s) => !!s.accessToken);

  const [locked, setLocked] = useState(false);
  const [authing, setAuthing] = useState(false);
  const appState = useRef(AppState.currentState);
  const didColdStart = useRef(false);
  const authingRef = useRef(false); // re-entrancy guard for the biometric prompt

  // A lock only applies when the toggle is on, the user is signed in, and the
  // device actually has enrolled biometrics — otherwise we never gate.
  const lockEnabled = useCallback(async () => {
    if (!biometricLock || !signedIn) return false;
    const [hw, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hw && enrolled;
  }, [biometricLock, signedIn]);

  const authenticate = useCallback(async () => {
    // Guard via a ref (the AppState closure would capture a stale `authing`),
    // so rapid foreground transitions can't stack two system prompts.
    if (authingRef.current) return;
    authingRef.current = true;
    setAuthing(true);
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Persistence',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false, // allow device PIN fallback
      });
      if (res.success) setLocked(false);
      // Any failure/cancel keeps locked=true; the lock screen offers a retry.
    } finally {
      authingRef.current = false;
      setAuthing(false);
    }
  }, []);

  // Cold start — runs once after the store rehydrates.
  useEffect(() => {
    if (!hasHydrated || didColdStart.current) return;
    didColdStart.current = true;
    if (biometricLock && signedIn) setLocked(true); // optimistic cover
    (async () => {
      if (await lockEnabled()) {
        setLocked(true);
        authenticate();
      } else {
        setLocked(false);
      }
    })();
  }, [hasHydrated, biometricLock, signedIn, lockEnabled, authenticate]);

  // Lock on the way to background (covers the app-switcher snapshot); re-prompt
  // on return to foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (/inactive|background/.test(next)) {
        if (await lockEnabled()) setLocked(true);
      } else if (next === 'active' && /inactive|background/.test(prev)) {
        if (await lockEnabled()) {
          setLocked(true); // re-assert the cover before prompting
          authenticate();
        } else {
          setLocked(false);
        }
      }
    });
    return () => sub.remove();
  }, [lockEnabled, authenticate]);

  return { locked, authing, retry: authenticate };
}
