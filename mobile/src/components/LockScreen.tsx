import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, theme } from '@/lib/theme';
import { Wordmark } from './Wordmark';

// Opaque full-screen overlay shown while the app is locked. It paints over the
// navigator (no sensitive data visible) and the Unlock button re-invokes the
// biometric prompt for when the first system prompt was dismissed.
export function LockScreen({ authing, onUnlock }: { authing: boolean; onUnlock: () => void }) {
  return (
    <View style={styles.fill}>
      <Wordmark height={52} />
      <Text style={styles.title}>Unlock Persistence</Text>
      <Pressable
        onPress={onUnlock}
        disabled={authing}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
      >
        {authing ? (
          <ActivityIndicator color={theme.accentFg} />
        ) : (
          <Text style={styles.buttonText}>Unlock</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 1000,
  },
  title: {
    color: theme.text,
    fontSize: 20,
    fontFamily: fonts.serif,
    marginTop: 28,
    marginBottom: 28,
  },
  button: {
    backgroundColor: theme.accent,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 44,
    minWidth: 180,
    alignItems: 'center',
  },
  buttonText: { color: theme.accentFg, fontSize: 15, fontWeight: '700', fontFamily: fonts.sans },
});
