import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { create, dismissLink, LinkLogLevel, open } from 'react-native-plaid-link-sdk';
import type { LinkExit, LinkSuccess } from 'react-native-plaid-link-sdk';
import { apiCall } from '@/lib/api';
import { refreshFinances } from '@/lib/finances';
import { track } from '@/lib/track';
import { fonts, radius, theme } from '@/lib/theme';

type Status = 'idle' | 'starting' | 'finishing';

export function PlaidLinkButton({
  label = 'Link a bank',
  variant = 'primary',
  onLinked,
}: {
  label?: string;
  variant?: 'primary' | 'secondary';
  onLinked?: () => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const launch = useCallback(async () => {
    setError('');
    setStatus('starting');
    track('bank_link_started');
    try {
      // 1. Mint a fresh, single-use link_token. Tell the backend we're Android so
      //    it attaches android_package_name (required for OAuth banks).
      const { link_token } = await apiCall('/api/plaid/create-link-token', {
        method: 'POST',
        body: JSON.stringify({ platform: Platform.OS }),
      });

      // 2. Preload the Link session, then present it.
      create({ token: link_token });
      open({
        onSuccess: async (success: LinkSuccess) => {
          setStatus('finishing');
          try {
            const inst = success.metadata.institution;
            await apiCall('/api/plaid/exchange-token', {
              method: 'POST',
              body: JSON.stringify({
                // success.publicToken is camelCase in v12.
                public_token: success.publicToken,
                // Backend reads institution.institution_id / .name; SDK gives id / name.
                institution: inst ? { institution_id: inst.id, name: inst.name } : undefined,
              }),
            });
            track('bank_linked');
            await refreshFinances();
            onLinked?.();
            // Transactions sync asynchronously on the server — re-pull shortly.
            setTimeout(() => {
              refreshFinances().catch(() => {});
            }, 4000);
          } catch (e: any) {
            setError(e?.message || 'Could not finish linking your bank.');
          } finally {
            setStatus('idle');
          }
        },
        onExit: (exit: LinkExit) => {
          // No error object => the user simply cancelled. Don't surface anything.
          if (exit.error) {
            setError(exit.error.displayMessage || exit.error.errorMessage || 'Could not connect your bank.');
          }
          dismissLink();
          setStatus('idle');
        },
        logLevel: LinkLogLevel.ERROR,
      });
    } catch (e: any) {
      setError(e?.message || 'Could not start Plaid Link.');
    } finally {
      // The native modal is now presented (or we failed before it opened); either
      // way the button shouldn't keep its initial spinner. onSuccess uses its own.
      setStatus((s) => (s === 'starting' ? 'idle' : s));
    }
  }, [onLinked]);

  const busy = status !== 'idle';
  const primary = variant === 'primary';
  const text = status === 'starting' ? 'Opening…' : status === 'finishing' ? 'Finishing…' : label;

  return (
    <View>
      <Pressable
        onPress={launch}
        disabled={busy}
        style={({ pressed }) => ({
          backgroundColor: primary ? theme.accent : pressed ? 'rgba(255,255,255,0.06)' : 'transparent',
          borderWidth: primary ? 0 : 1,
          borderColor: theme.border,
          opacity: busy ? 0.75 : pressed ? 0.9 : 1,
          paddingVertical: primary ? 13 : 9,
          paddingHorizontal: 16,
          borderRadius: radius.sm,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
        })}
      >
        {busy && <ActivityIndicator size="small" color={primary ? theme.accentFg : theme.text} />}
        <Text
          style={{
            color: primary ? theme.accentFg : theme.text,
            fontSize: primary ? 14.5 : 13,
            fontWeight: primary ? '700' : '600',
            fontFamily: fonts.sans,
          }}
        >
          {text}
        </Text>
      </Pressable>
      {!!error && <Text style={{ color: theme.red, fontSize: 12.5, marginTop: 8, fontFamily: fonts.sans }}>{error}</Text>}
    </View>
  );
}
