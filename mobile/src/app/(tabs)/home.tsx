import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { computeSummary, formatCurrency } from '@/lib/format';
import { refreshFinances } from '@/lib/finances';
import { useStore } from '@/lib/store';
import { fonts, theme } from '@/lib/theme';
import type { Account } from '@/lib/types';
import { HudTile } from '@/components/HudTile';
import { PlaidLinkButton } from '@/components/PlaidLinkButton';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const user = useStore((s) => s.user);
  const accounts = useStore((s) => s.accounts);
  const hud = useStore((s) => s.hud);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      await refreshFinances();
    } catch (e: any) {
      setError(e?.message || 'Could not load your finances.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Prefer server HUD numbers; fall back to a client-side rollup of accounts.
  const s = hud ?? { ...computeSummary(accounts), safe_to_spend: null as any };
  const greeting = timeGreeting();
  const firstName = user?.full_name?.split(' ')[0] || 'there';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.ink }}
      contentContainerStyle={{ padding: 18, paddingTop: insets.top + 12, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />}
    >
      <View>
        <Text style={{ color: theme.text, fontSize: 26, fontFamily: fonts.serif }}>
          Good {greeting}, {firstName}.
        </Text>
        <Text style={{ color: theme.muted, fontSize: 13, marginTop: 2 }}>
          Net worth {formatCurrency(s.net_worth)}
        </Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <>
          {/* Hero net-worth card */}
          <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 20 }}>
            <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Net Worth
            </Text>
            <Text style={{ color: theme.text, fontSize: 38, fontWeight: '700', fontFamily: fonts.mono, marginTop: 6 }}>
              {formatCurrency(s.net_worth)}
            </Text>
            {hud?.safe_to_spend && (
              <Text style={{ color: theme.subtle, fontSize: 12.5, marginTop: 8 }}>
                Safe to spend{' '}
                <Text style={{ color: theme.green, fontWeight: '700' }}>{formatCurrency(hud.safe_to_spend.amount)}</Text>
                {hud.safe_to_spend.until ? ` until ${hud.safe_to_spend.until}` : ''}
              </Text>
            )}
          </View>

          {/* Tiles */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <HudTile label="Cash" value={formatCurrency(s.cash)} />
            <HudTile label="Investments" value={formatCurrency(s.investments)} />
            <HudTile label="Retirement" value={formatCurrency(s.retirement)} />
            <HudTile label="Debt" value={formatCurrency(s.total_debt)} subColor={theme.red} />
            {hud && <HudTile label="Monthly Bills" value={formatCurrency(hud.monthly_bills)} />}
            {hud && <HudTile label="Spent This Week" value={formatCurrency(hud.credit_week?.spent || 0)} />}
          </View>

          {!!error && <Text style={{ color: theme.red, fontSize: 13 }}>{error}</Text>}

          {/* Accounts */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ color: theme.text, fontSize: 17, fontFamily: fonts.serif }}>Accounts</Text>
            {accounts.length > 0 && <PlaidLinkButton label="+ Link" variant="secondary" />}
          </View>

          {accounts.length === 0 ? (
            <View style={{ borderColor: theme.border, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 24, alignItems: 'center', gap: 14 }}>
              <Text style={{ color: theme.muted, fontSize: 13, textAlign: 'center' }}>
                No accounts linked yet. Connect a bank to see your full picture.
              </Text>
              <PlaidLinkButton label="Link a bank" />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {accounts.map((a) => (
                <AccountRow key={a.id} account={a} />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function AccountRow({ account: a }: { account: Account }) {
  const liability = ['credit', 'loan'].includes(a.type);
  const bal = Number(a.current_balance) || 0;
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: theme.card,
        borderColor: theme.borderSoft,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14 }}>
          {a.name}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
          {a.linked_institution || a.institution_name || a.subtype || a.type}
          {a.mask ? ` ••${a.mask}` : ''}
        </Text>
      </View>
      <Text style={{ color: liability ? theme.red : theme.text, fontSize: 14, fontFamily: fonts.mono }}>
        {liability ? '-' : ''}
        {formatCurrency(Math.abs(bal))}
      </Text>
    </View>
  );
}

function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
