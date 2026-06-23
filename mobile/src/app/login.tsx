import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { loginWithEmail, loginWithGoogle, registerWithEmail } from '@/lib/auth';
import { googleConfigured } from '@/lib/google';
import { useStore } from '@/lib/store';
import { fonts, radius, theme } from '@/lib/theme';
import { Wordmark } from '@/components/Wordmark';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const token = useStore((s) => s.accessToken);
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (token) return <Redirect href="/home" />;

  async function submit() {
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') await registerWithEmail(email.trim(), password, name.trim());
      else await loginWithEmail(email.trim(), password);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (e: any) {
      if (e?.code !== 'SIGN_IN_CANCELLED') setError(e?.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.ink }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <Wordmark height={44} />
          <Text style={{ color: theme.muted, fontSize: 13, marginTop: 10, fontFamily: fonts.sans }}>
            Your financial command center
          </Text>
        </View>

        <View
          style={{
            backgroundColor: theme.card,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: radius.lg,
            padding: 22,
          }}
        >
          {googleConfigured && (
            <>
              <Pressable
                onPress={google}
                disabled={loading}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  paddingVertical: 12,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: pressed ? 'rgba(255,255,255,0.06)' : 'transparent',
                  marginBottom: 16,
                })}
              >
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', fontFamily: fonts.sans }}>
                  Continue with Google
                </Text>
              </Pressable>
              <Divider />
            </>
          )}

          <View style={{ flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: theme.border, marginBottom: 18 }}>
            {(['login', 'register'] as Mode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={{ flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: mode === m ? 'rgba(255,255,255,0.12)' : 'transparent' }}
              >
                <Text style={{ color: mode === m ? theme.text : theme.muted, fontSize: 13, fontWeight: '600', fontFamily: fonts.sans }}>
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === 'register' && (
            <Field placeholder="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
          )}
          <Field placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Field placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />

          {!!error && <Text style={{ color: theme.red, fontSize: 12.5, marginBottom: 10, fontFamily: fonts.sans }}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={loading}
            style={({ pressed }) => ({
              backgroundColor: theme.accent,
              opacity: loading ? 0.7 : pressed ? 0.9 : 1,
              paddingVertical: 13,
              borderRadius: radius.sm,
              alignItems: 'center',
            })}
          >
            {loading ? (
              <ActivityIndicator color={theme.accentFg} />
            ) : (
              <Text style={{ color: theme.accentFg, fontSize: 14.5, fontWeight: '700', fontFamily: fonts.sans }}>
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Divider() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
      <Text style={{ color: theme.muted, fontSize: 11 }}>or</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={theme.muted}
      {...props}
      style={{
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: radius.sm,
        color: theme.text,
        fontSize: 15,
        paddingHorizontal: 14,
        paddingVertical: 11,
        marginBottom: 10,
        fontFamily: fonts.sans,
      }}
    />
  );
}
