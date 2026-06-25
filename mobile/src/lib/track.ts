import PostHog from 'posthog-react-native';

// Privacy-safe product analytics. We use the bare client (NOT PostHogProvider)
// so there is ZERO touch/screen autocapture — only the explicit events below are
// sent, and we never attach financial data or PII (balances, account names,
// amounts, email). Identify by opaque user id only. No-ops until a key is set.
const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;

const client = KEY
  ? new PostHog(KEY, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      enableSessionReplay: false,
    })
  : null;

export const analyticsEnabled = !!client;

// Behavioral events only. `props` must contain non-identifying metadata
// (counts/enums/booleans) — never balances, amounts, names, or emails.
export function track(event: string, props?: Record<string, string | number | boolean>) {
  client?.capture(event, props);
}

export function identifyUser(userId: string) {
  client?.identify(userId); // id only — no email/name/financial props
}

export function resetUser() {
  client?.reset();
}
