# Persistence — Mobile (React Native / Expo)

The Android (and future iOS) app for Persistence. Talks to the same Express backend
as the web app (`https://ledger-production-5649.up.railway.app`).

Stack: Expo SDK 56 · Expo Router · TypeScript · zustand · expo-secure-store ·
(coming) react-native-plaid-link-sdk, victory-native, react-native-android-widget,
expo-notifications, expo-local-authentication.

## ⚠️ This app needs a Development Build (not Expo Go)

Native modules (secure-store, Google Sign-In, Plaid, Skia charts, the home-screen
widget) are not in the Expo Go runtime. Day-to-day you run a **custom dev client**.

### First run

```bash
cd mobile
npm install            # if needed
npx expo install       # ensure native deps are aligned

# One-time: log in + link an EAS project
npm i -g eas-cli
eas login
eas init               # writes projectId into app.json

# Build a development client for a physical Android device (cloud build):
eas build --profile development --platform android
#   → install the resulting APK on your phone, then:
npx expo start --dev-client
```

Local alternative (needs Android Studio + SDK on this Windows machine):

```bash
npx expo run:android   # prebuilds + builds + installs on a connected device/emulator
```

## Configuration

`.env` (already created; `EXPO_PUBLIC_*` vars are inlined at build, not secret):

```
EXPO_PUBLIC_API_URL=https://ledger-production-5649.up.railway.app
```

## What works today (Phases 0–1)

- Secure JWT auth foundation: login / register via email+password against the
  backend, tokens stored in Keychain/Keystore (expo-secure-store), automatic
  refresh-once-then-retry on 401 (ported from the web client).
- Auth-gated routing (Expo Router): `/` → `/login` or `/home`.
- Dashboard (`/home`): net worth + HUD tiles (cash, investments, retirement,
  debt, monthly bills, week spend) and an accounts list, pull-to-refresh, from
  `/api/summary/hud` and `/api/accounts`.
- **Plaid bank linking** (`react-native-plaid-link-sdk` v12, `create()/open()`):
  "Link a bank" on the dashboard + a **Connected Banks** card in Settings
  (link / disconnect / sync now). Mints a token from `/api/plaid/create-link-token`
  (sending `{ platform: 'android' }` so the backend attaches `android_package_name`),
  exchanges `publicToken` at `/api/plaid/exchange-token`, then refreshes.
- Settings: signed-in user, connections, Sign Out.

### Owner actions to make Plaid linking work end-to-end

1. **Deploy the backend change** (`backend/src/routes/plaid.js` now sets
   `android_package_name` when the client sends `{ platform: 'android' }`).
2. **Plaid Dashboard** → Developers → API → **Allowed Android package names**:
   add `finance.persistence.app` (in *each* environment you build against —
   Sandbox for dev builds, Production for release). No SHA-1 needed for Plaid.

## Enable Google Sign-In (next)

The code is wired (`src/lib/google.ts`) but disabled until configured:

1. In Google Cloud Console (same project as the web app), create **three** OAuth
   client IDs: **Web**, **Android**, **iOS**.
   - The **Android** client must include your package name `finance.persistence.app`
     and the **SHA-1 of the EAS signing keystore** (`eas credentials` → Android).
2. Put the **Web** client ID in `.env` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
   (required for a non-null idToken), and the iOS one as `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
3. Re-add the config plugin to `app.json` `plugins`:
   `["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.<IOS_CLIENT_ID>" }]`
4. Rebuild the dev client. The "Continue with Google" button appears automatically
   once `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set.

## Project layout

```
src/
  app/                 Expo Router routes
    _layout.tsx        root: SafeArea + hydration gate
    index.tsx          "/" → redirect to /login or /home
    login.tsx          email/password + (gated) Google sign-in
    (tabs)/
      _layout.tsx      bottom tabs (auth-guarded)
      home.tsx         dashboard / HUD
      settings.tsx     account + sign out
  lib/
    api.ts             apiCall + refresh-once-retry, API_URL
    auth.ts            login/register/google → store
    store.ts           zustand store, SecureStore-persisted auth slice
    secure-storage.ts  SecureStore adapter for zustand persist
    google.ts          native Google Sign-In helper
    format.ts          currency + computeSummary
    theme.ts           brand palette / fonts
    types.ts           API data types
  components/          Wordmark, HudTile
```

## Roadmap

- **Phase 1 ✓** — Plaid Link (`react-native-plaid-link-sdk` v12 `create()`/`open()`),
  link/exchange against `/api/plaid/*`. (Owner: deploy backend + register the
  Android package in the Plaid Dashboard — see above.)
- **Phase 2** — Analytics (victory-native charts), transactions, intelligence, AI chat.
- **Phase 3** — Home-screen net-worth widget (`react-native-android-widget`, cached
  read pattern), push (expo-notifications + FCM v1), biometric app-lock.
- **Phase 4** — EAS production build (`eas build -p android --profile production`
  → `.aab`) and Play Store submission (needs a $25 Google Play Developer account).
