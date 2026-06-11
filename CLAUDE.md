# CLAUDE.md — Persistence

Context file for Claude Code. Read this first every session.

> **Owner:** Sebastian. Prefers concise, action-oriented help ("just do it" over lots of
> clarifying questions). New-ish to dev tooling, so explain terminal/git steps when they're
> non-obvious, but don't over-explain the code.

> **⚠ Repo location:** the working git repo is **`C:\Users\sebas\ledger`** — do all edits,
> builds, and commits there. `C:\Users\sebas\OneDrive\Desktop\Ledger` is NOT the repo: it only
> holds one-shot `apply-*.ps1` patch scripts from earlier sessions (mostly already applied —
> check git log before running any).

---

## 1. What this is

**Persistence** is a personal-finance desktop HUD + web dashboard. It was formerly called
**"Ledger"** — the product is fully rebranded to Persistence in all user-facing copy, but
**several internal identifiers still say "ledger" on purpose** (see "DO NOT CHANGE" below).

Three parts:
- **Frontend** — Next.js dashboard, deployed on **Vercel**.
- **Backend** — Express API, deployed on **Railway**, with **PostgreSQL** + **Plaid** + Google OAuth.
- **Desktop bar** — a **Tauri v2** always-on-top HUD (Rust + a WebView2 HTML/JS UI) that shows
  net worth / cash / investments / retirement / debt / bills.

---

## 2. Repo layout

```
backend/          Express API (routes in backend/src/routes/)
frontend/         Next.js app (App Router: frontend/app/, components in frontend/components/)
desktop-bar/      Tauri v2 desktop HUD
  src-tauri/      Rust side (main.rs = window + commands)
  ui/             WebView assets: index.html, login.js, logo.png  (this is frontendDist)
mcp-server/        (MCP integration — not actively worked on)
widgets/           (misc)
docs/
```

---

## 3. Live deployments & URLs

| Thing | URL |
|---|---|
| Web app (Vercel) | https://ledger-theta-puce.vercel.app |
| Landing page (static) | https://ledger-theta-puce.vercel.app/landing.html |
| Desktop OAuth handoff | https://ledger-theta-puce.vercel.app/desktop |
| Backend API (Railway) | https://ledger-production-5649.up.railway.app |
| GitHub repo | https://github.com/sebastian-skipwith/ledger (branch: `main`) |
| Latest release | https://github.com/sebastian-skipwith/ledger/releases/tag/v1.0.0 |

- **Vercel auto-deploys** on push to `main` (static `public/` files deploy in ~1 min; the
  Next.js app a bit slower).
- **Railway auto-deploys** the backend on push.
- Backend CORS is `origin: true` (reflects any origin).

---

## 4. DO NOT CHANGE (these break existing users/sessions)

- **Keyring service name = `"ledger"`** (in `desktop-bar/src-tauri/src/main.rs`, the `kc()` helper).
  Tokens are stored under this service; renaming it logs everyone out / orphans stored tokens.
- **localStorage key `ledger-store`** (web app state) — renaming wipes saved sessions/state.
- **Deployment URLs** still contain "ledger" (`ledger-theta-puce`, `ledger-production-5649`).
  Renaming the Vercel/Railway projects changes these URLs and breaks the desktop app's
  hardcoded `API_BASE` + OAuth handoff. Leave them unless doing a coordinated migration.
- **Theme localStorage key = `persistence-theme`** (this one is correct as-is; don't "fix" it to ledger).
- **Updater signing keypair** — the pubkey in `desktop-bar/src-tauri/tauri.conf.json` pairs with the
  private key at `C:\Users\sebas\.tauri\persistence-updater.key` (empty password). NEVER commit the
  private key, never regenerate the pair: shipped apps only accept updates signed by this exact key.
  If it's lost, every installed copy needs a manual reinstall.

Everything *user-facing* should say **Persistence**. Everything in the list above stays "ledger".

---

## 5. Desktop bar (Tauri) specifics — the tricky part

### Auth / keychain
- `keyring` crate MUST keep the backend feature: `keyring = { version = "3", features = ["windows-native"] }`.
  Without `windows-native`, keyring v3 silently uses an **in-memory mock store** — writes return
  Ok() but never persist, so the user appears logged out on every restart. This was a real bug; do not regress it.
- `is_authenticated` checks `auth_token` OR `refresh_token`.
- `set_session` validates the code against `/api/auth/refresh` BEFORE storing it (so a bad paste can't wipe a good token).

### CORS workaround
- The WebView can't call the API directly from the `tauri://` origin (CORS). So data is fetched
  **Rust-side** via `reqwest` commands that read the token from the keychain:
  - `fetch_summary` → GET `/api/summary/hud` (light, no-AI endpoint purpose-built for the HUD:
    summary numbers + safe_to_spend + credit_week + bills_7d + goal_progress in one round trip).
    It used to hit `/api/ai/insights`, which calls Claude — too slow/expensive for the refresh loop.
  - `fetch_history` → GET `/api/net-worth?days=120`, returns the snapshot array (incl. `breakdown`).
- If you need new data in the HUD, add a Rust command in the same pattern — don't fetch from JS.

### Hotkeys / click-through / settings (added 2026-06-10)
- Global hotkeys (registered Rust-side via `tauri-plugin-global-shortcut`):
  **Ctrl+Shift+H** = show/hide HUD, **Ctrl+Shift+P** = toggle click-through ("ghost") mode.
- Click-through = `set_ignore_cursor_events(true)`; HUD stays visible but mouse passes through.
  While ON you cannot click the bar at all — only the hotkey or tray menu can turn it off
  (the UI shows a small GHOST badge). State lives in the `PASSTHROUGH` AtomicBool;
  Rust emits `passthrough-changed` events to the webview.
- Settings panel (gear icon or tray → Settings, which emits `open-settings`): bar opacity
  (`--bar-alpha` CSS var), per-metric show/hide, refresh interval, launch-at-startup, dark theme,
  sign out. Persisted in localStorage key `persistence-hud-settings`. The panel reuses the
  `size_for_login`/`restore_bar` window resize pattern.
- Autostart is no longer force-enabled in `setup()` — the UI syncs it from saved settings on
  boot via the `set_autostart` command (default: enabled).
- Bar buttons: minimize (−) hides to tray (`hide_bar`), × quits (`quit_app`).
- `capabilities/default.json` now grants `core:window:allow-start-resize-dragging` — this was
  missing and is why the JS resize handles silently failed before.

### Window / build
- Window is created in **`main.rs`** (the `tauri.conf.json` `windows` array is empty). It's
  frameless (`decorations(false)`), transparent, always-on-top, `withGlobalTauri: true`.
- Frameless windows get **no native resize borders on Windows** — resize is done with custom
  handle divs in `index.html` calling `getCurrentWindow().startResizeDragging(dir)`.
- The HUD UI scales all content to fit any window size/shape via a JS `fit()` function
  (measures `#content`, applies `transform: scale(...)`), and reflows row↔grid by aspect ratio.
- `frontendDist` = `../ui`. Keep web assets in `desktop-bar/ui/` only (do NOT put node_modules
  or build output under the dir Tauri scans, or the build fails).
- Build: `cd desktop-bar && npm run tauri build` → installers in
  `desktop-bar/src-tauri/target/release/bundle/{nsis,msi}/`.
- Internal names: Cargo package + `[[bin]]` = `persistence`; productName "Persistence";
  identifier `com.persistence.desktop`. (Keyring service still "ledger" per above.)
- Installers are **unsigned** (no Authenticode) → Windows SmartScreen warning is expected
  (More info → Run anyway). Code signing (~$100–400/yr) is deferred. This is separate from
  updater signing (minisign), which IS in place.

### Auto-updater + release process (added 2026-06-10, v1.1.0)
- `tauri-plugin-updater`: HUD checks `https://github.com/sebastian-skipwith/ledger/releases/latest/download/latest.json`
  on boot + every 4h. If newer, a pulsing "Update to vX.Y.Z - restarts app" button appears on the
  bar; one click = download, verify signature, install (NSIS passive mode), restart. Rust commands:
  `check_update`, `install_update`.
- v1.0.0 installs predate the updater and can NOT auto-update — those users reinstall manually once.
- **Shipping a release (all local — CI release.yml is manual-only because it lacks the signing key):**
  1. Bump `version` in `desktop-bar/src-tauri/tauri.conf.json` AND `Cargo.toml`.
  2. Build with signing env (use bash; PowerShell drops empty env strings). NOTE: the bundler
     only reads `TAURI_SIGNING_PRIVATE_KEY` (content, not path — the `_PATH` variant is ignored):
     `export TAURI_SIGNING_PRIVATE_KEY="$(cat /c/Users/sebas/.tauri/persistence-updater.key)"`
     `export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""`
     `cd desktop-bar && npm run tauri build`
  3. Write `latest.json`: `{ "version": "X.Y.Z", "pub_date": "<ISO8601>", "notes": "...",
     "platforms": { "windows-x86_64": { "signature": "<contents of the .sig file>",
     "url": "https://github.com/sebastian-skipwith/ledger/releases/download/vX.Y.Z/Persistence_X.Y.Z_x64-setup.exe" } } }`
  4. `gh release create vX.Y.Z <setup.exe> <setup.exe.sig> latest.json --title "Persistence X.Y.Z" --notes "..."`
     — must be a PUBLISHED release (drafts are invisible to `releases/latest/download`).
  5. Update the download link in `frontend/public/landing.html` to the new asset URL.

---

## 6. Backend / data model notes

- Daily `net_worth_snapshots` row per user: `net_worth`, `total_assets`, `total_liabilities`,
  and a `breakdown` JSONB (`{cash, investments, retirement, debt, net_worth}`).
- `breakdown` was historically DEFINED but never populated; `snapshotNetWorth` in
  `backend/src/routes/plaid.js` now computes + stores it. **Per-metric history only accrues
  from the day that shipped forward — there is no backfill.** So Net Worth deltas work
  immediately (top-level column has history), but cash/investments/retirement/debt deltas
  stay blank until enough daily snapshots accumulate.
- `/api/net-worth?days=N` returns snapshots ascending, including `breakdown`.
- `GET /api/summary/hud` (`backend/src/routes/summary.js`) — fast no-AI summary for the desktop
  HUD: summary numbers (same account-bucketing math as `buildFinancialContext` in `routes/ai.js`
  — keep them in sync), plus:
  - `safe_to_spend`: cash − bills due through the upcoming Friday (`until` = that date)
  - `credit_week.spent`: net new charges on `type='credit'` accounts in the last 7 days
  - `bills_7d`: total + count of active bills with `next_due_date` within 7 days
  - `goal_progress`: actual vs linear expected pace across incomplete goals
    (target_date-based, falling back to monthly_contribution × months elapsed);
    `status` = ahead | behind | on_track | none

---

## 6b. Security posture (hardened 2026-06-10)

- **Plaid access tokens are encrypted at the application level** (AES-256-GCM,
  `backend/src/lib/crypto.js`, stored as `enc:v1:...`). `DATA_ENCRYPTION_KEY` is **set and
  LIVE in prod since 2026-06-11** (boot log: "Token encryption active"); malformed/missing
  keys degrade to a loud warning, never a crash. Existing plaintext rows auto-encrypt at boot.
  NEVER change/lose that key — rows become undecryptable (re-link banks to recover).
- Rotations completed 2026-06-11: Plaid secret rotated, stale `ledger-deploy` GitHub PAT
  deleted (authorized OAuth apps verified clean: only Git Credential Manager + GitHub CLI).
- Repo scan 2026-06-10: **no real secrets in git history** (only placeholders in
  `*.example` / `docs/env-examples.txt`) and none in the OneDrive apply scripts. The
  earlier "exposed credentials" note referred to keys pasted into past chat sessions —
  rotation (owner) is the only fix; checklist in `docs/incident-response.md`.
- GitHub **secret scanning + push protection: enabled** (done via API).
- `.gitignore` blocks all env files and key material; examples whitelisted.
- Secrets policy: production secrets live ONLY in Railway/Vercel env vars. Never put real
  values in the repo, CLAUDE.md, or chat. Staged new secrets: `C:\Users\sebas\.persistence-secrets\`.
- Breach runbook: `docs/incident-response.md` (kill switches, rotation checklist, user
  notification template, Railway DB lockdown steps).
- Rotating `JWT_SECRET` = global logout kill switch.

## 7. Feature state (as of 2026-06-11)

**Added 2026-06-11 (ops + landing + desktop v1.3.0):**
- Account self-service: `GET /api/account/export` (full JSON download) and `DELETE /api/account`
  (revokes Plaid items first, then CASCADE delete). UI in web Sidebar -> Account.
- Welcome emails on signup (both email + Google paths) via Resend — dormant until
  `RESEND_API_KEY` set in Railway. Sender stays `onboarding@resend.dev` until the
  persistence.finance domain is verified in Resend; reply-to is support@persistence.finance.
- Error monitoring via Sentry (`@sentry/node`) — dormant until `SENTRY_DSN` set.
- **SECURITY FIX**: Google sign-in now cryptographically verifies the ID token with
  google-auth-library (was an unverified decode — anyone could forge a login for any email).
- Support email everywhere: support@persistence.finance (landing footer, security page,
  web sidebar, HUD settings, welcome email reply-to). NOTE: address only works once the
  domain is bought + email routing set up.
- Landing: differentiators section (only persistent HUD / any MCP client / works alongside
  Monarch & Rocket Money / security), sharpened hero, real-screenshot section
  (`#hud-in-action`, auto-hidden until `frontend/public/hud-in-action.png` exists).
- Desktop v1.3.x: taskbar icon + Alt-Tab (`skip_taskbar(false)`); boot shows centered pulsing
  P logo (`body.booting`); always-on-top re-asserted every 20s (fixes other topmost apps like
  Claude Desktop covering the bar).
- **Settings panel (v1.3.2): the window GROWS DOWNWARD** (`size_for_settings` /
  `restore_after_settings` commands + `body.settings-open` + `#spanel` in index.html) so the
  bar stays live in the top 52px. **DO NOT create a second webview window at runtime** — on
  this machine/app it renders permanently blank white (tried: opaque, decorated,
  main-thread dispatch via run_on_main_thread, resize nudge, even loading index.html —
  all blank). v1.3.0/1.3.1 shipped that way and were broken; the grow-downward panel is
  the working pattern. Verified live on-screen 2026-06-11.

### Earlier (2026-06-10)

**Added 2026-06-10 (round 3 — business + customization):**
- **HUD drag-and-drop tile reordering** (desktop v1.2.0): HTML5 DnD in `ui/index.html`,
  order persisted in `persistence-hud-settings.order`.
- **Security & Privacy page**: `frontend/public/security.html`, linked from landing nav + footer.
  Keep its claims honest — it describes only measures that actually exist.
- **Admin metrics**: `GET /api/admin/metrics` (backend `routes/admin.js`) + web page at `/admin`.
  Gated by `ADMIN_EMAILS` env var on Railway (comma-separated email allowlist) — MUST be set or
  everyone gets 403.
- **Stripe subscriptions (scaffolded, dormant)**: `routes/billing.js` (checkout/portal/status),
  `routes/webhooks-stripe.js` (raw-body mount in index.js BEFORE express.json — keep that order).
  Inert until Railway env vars set: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_PRO`, `STRIPE_PRICE_WEALTH`, `APP_URL`. `users.stripe_customer_id` column is
  ensured idempotently at boot. Sidebar shows Upgrade button (alerts "coming soon" while dormant).
- **MCP server fixed for real use**: now exchanges a 30-day refresh token
  (`PERSISTENCE_REFRESH_TOKEN`, get the code from the `/desktop` page) for 15-min access tokens
  automatically. Defaults to the production API URL. Works with Claude Desktop / Claude Code via
  stdio; not hosted remotely.
- **Domain status (checked 2026-06-10)**: persistence.app TAKEN; persistence.finance,
  usepersistence.com, trypersistence.app AVAILABLE. Purchase is an owner action.
- Owner actions pending: buy domain; Authenticode code signing (Azure Trusted Signing ~$10/mo
  recommended); Plaid production access application; Stripe account + env vars; set ADMIN_EMAILS.

**Added 2026-06-10 (round 2 — web parity):**
- Web TopBar now shows the four new metrics (Safe to Spend, Credit Cards week, Bills 7 Days,
  Goal pacing) from `/api/summary/hud`, plus a gear dropdown to show/hide any metric
  (persisted in localStorage `persistence-web-metrics`).
- Auto-updater shipped in desktop v1.1.0 (see section 5); release process documented there.

**Added 2026-06-10 (round 1):**
- Backend `/api/summary/hud` endpoint; HUD switched off the slow AI-insights endpoint.
- HUD: settings panel (opacity, metric visibility, refresh interval, autostart, theme, sign out),
  minimize/close buttons, global hotkeys (Ctrl+Shift+H hide/show, Ctrl+Shift+P click-through),
  click-through ghost mode, new tiles (Safe to Spend, Credit Cards week, Bills 7 Days, Goals pace).
- Fixed missing `core:window:allow-start-resize-dragging` capability (resize handles).

### Earlier state (2026-06-09)

**Done & live:**
- Full Ledger→Persistence rebrand (web + desktop), B&W aesthetic, AP-monogram logo,
  light/dark theme with toggle (default light).
- Desktop installers built + GitHub Release v1.0.0 published.
- Green/red per-metric deltas + 1D/1W/1M toggle on the **web dashboard** (live, verified).
- Backend now records `breakdown` history.

**In flight / needs verification:**
- **Desktop HUD fluid resize + deltas** — code committed on `main` (commit `dc592f4`: fluid
  `fit()` scaler, reflow, custom resize handles, deltas baked in; `main.rs` edge-snap removed,
  min size lowered, `restore_bar` now restores pre-login bounds). Needs: `npm run tauri build`, reinstall, and
  **verify the resize handles actually drive native resize** on Windows. If they don't,
  fall back to a pure-JS mouse-tracking resize (setSize/setPosition).
- **Web TopBar glyph fix** — the theme icon (◐) and "Ask AI ↗" arrow had a double-encoding
  corruption; fix replaces them with JSX unicode escapes `{'\u25D0'}` / `{'\u2197'}`.
  CONFIRMED landed on `main` (commit `9f6c901`, verified in `frontend/components/TopBar.tsx`).

**Backlog / deferred:**
- HUD window size should persist across full app restarts (currently resets to default shape).
- Rotate exposed credentials (GitHub token, Anthropic key, Plaid secret) — owner action.
- Code signing for installers; Tauri auto-updater (needs signing keys).
- AI-insights endpoint may be slow for the 5-min HUD refresh; consider a lighter endpoint.

---

## 8. Conventions

- Keep user-facing copy as **Persistence**.
- Web dashboard responses/UX: minimalist black-and-white.
- When editing the desktop `index.html`, keep the source **ASCII-only** (use `\uXXXX` JS escapes
  or HTML entities for glyphs) — literal unicode glyphs have been corrupted by encoding mishaps before.
- Before a desktop release: bump `version` in `desktop-bar/src-tauri/tauri.conf.json` if the
  installer filename should change; otherwise the new build overwrites the existing v1.0.0 asset.
- Prefer real fixes over scaffolding; verify against the live deployments when possible.
