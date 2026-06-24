import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import { fonts, radius } from '@/lib/theme';
import { Wordmark } from '@/components/Wordmark';

type Mode = 'login' | 'register';

// The sign-in screen uses a LIGHT palette (white bg, black text/buttons, black
// logo) — distinct from the dark app behind it.
const c = {
  bg: '#ffffff',
  ink: '#14141f', // near-black text + primary buttons + logo
  muted: '#6b6b80',
  border: 'rgba(0,0,0,0.12)',
  field: 'rgba(0,0,0,0.04)',
  toggleOn: 'rgba(0,0,0,0.08)',
  red: '#dc2626',
  onInk: '#ffffff',
};

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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <Wordmark height={48} tintColor={c.ink} />
          <Text style={{ color: c.muted, fontSize: 13, marginTop: 12, fontFamily: fonts.sans }}>
            Your financial command center
          </Text>
        </View>

        <View
          style={{
            backgroundColor: c.bg,
            borderColor: c.border,
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
                  borderColor: c.border,
                  backgroundColor: pressed ? 'rgba(0,0,0,0.04)' : c.bg,
                  marginBottom: 16,
                })}
              >
                <GoogleG />
                <Text style={{ color: c.ink, fontSize: 14, fontWeight: '600', fontFamily: fonts.sans }}>
                  Continue with Google
                </Text>
              </Pressable>
              <Divider />
            </>
          )}

          <View style={{ flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: c.border, marginBottom: 18 }}>
            {(['login', 'register'] as Mode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={{ flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: mode === m ? c.toggleOn : 'transparent' }}
              >
                <Text style={{ color: mode === m ? c.ink : c.muted, fontSize: 13, fontWeight: '600', fontFamily: fonts.sans }}>
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === 'register' && <Field placeholder="Full name" value={name} onChangeText={setName} autoCapitalize="words" />}
          <Field placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Field placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />

          {!!error && <Text style={{ color: c.red, fontSize: 12.5, marginBottom: 10, fontFamily: fonts.sans }}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={loading}
            style={({ pressed }) => ({
              backgroundColor: c.ink,
              opacity: loading ? 0.7 : pressed ? 0.9 : 1,
              paddingVertical: 13,
              borderRadius: radius.sm,
              alignItems: 'center',
            })}
          >
            {loading ? (
              <ActivityIndicator color={c.onInk} />
            ) : (
              <Text style={{ color: c.onInk, fontSize: 14.5, fontWeight: '700', fontFamily: fonts.sans }}>
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
      <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
      <Text style={{ color: c.muted, fontSize: 11 }}>or</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
    </View>
  );
}

// Google "G" mark in its brand colors.
function GoogleG() {
  return (
    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: '#4285F4' }}>G</Text>
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...props}
      style={{
        backgroundColor: c.field,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: radius.sm,
        color: c.ink,
        fontSize: 15,
        paddingHorizontal: 14,
        paddingVertical: 11,
        marginBottom: 10,
        fontFamily: fonts.sans,
      }}
    />
  );
}
