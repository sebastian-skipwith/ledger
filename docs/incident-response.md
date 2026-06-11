# Incident response runbook — Persistence

Internal document. What to do the moment you suspect a credential leak or data
breach. Written for a solo founder: every step is something you can do yourself
in under an hour. Speed matters more than perfection — contain first,
investigate second, notify third.

## 0. Where secrets live (the rules)

- **Production secrets exist in exactly one place: Railway → backend service → Variables**
  (and Vercel env vars for the frontend). Never in the repo, never in chat
  sessions, never in OneDrive.
- Local dev uses gitignored `.env` files; `*.example` files contain placeholders only.
- The repo has GitHub **secret scanning + push protection enabled** — a push
  containing a recognizable key will be blocked. Don't override the block.
- Desktop updater private key: `C:\Users\sebas\.tauri\persistence-updater.key` (backed up
  offline). New Railway secrets staged at `C:\Users\sebas\.persistence-secrets\` — delete
  the staging file after pasting values into Railway.

## 1. Kill switches (containment, in order of blast radius)

| Suspected leak | Action | Effect |
|---|---|---|
| Any/unknown | Rotate `JWT_SECRET` in Railway | **Logs every user out instantly** (all access + refresh tokens die). Safe; users just sign in again. |
| Plaid secret | Plaid dashboard → Team Settings → Keys → rotate secret; update `PLAID_SECRET` in Railway | Old secret stops working. Linked items keep working (access tokens are item-scoped). |
| A user's bank link | `POST /item/remove` via the app (Unlink) or Plaid dashboard | Kills that access token at Plaid. |
| Anthropic key | console.anthropic.com → API Keys → revoke + create new; update Railway | AI features blip for seconds. |
| Database creds | Railway → Postgres service → rotate credentials (or destroy + recreate the public proxy domain); `DATABASE_URL` reference updates automatically if using Railway's variable reference | Old connection string dies. |
| GitHub access | github.com/settings/tokens + settings/sessions → revoke; `gh auth login` again | Stops repo/release tampering. Also check repo → Settings → Webhooks/Deploy keys for anything you didn't add. |
| `DATA_ENCRYPTION_KEY` | Cannot be hot-rotated alone — decrypt-and-re-encrypt migration needed. If both DB **and** key leaked, treat as full breach (step 3) and remove all Plaid items. | |

## 2. Assess scope

- Railway → backend service → Logs: look for unfamiliar IPs/routes, auth
  failures, admin endpoint hits.
- Postgres: `SELECT email, created_at FROM users ORDER BY created_at DESC` —
  any accounts you don't recognize? Any rows changed at odd times?
- GitHub → repo → Security tab → secret scanning alerts.
- Plaid dashboard → Logs: API calls you didn't make.
- What data could the attacker have read? (users table = emails + bcrypt
  hashes; plaid_items = bank access tokens — encrypted if `DATA_ENCRYPTION_KEY`
  was set; transactions/accounts = financial data.)

## 3. If user data was actually exposed

1. Contain (step 1) and snapshot evidence (export logs before they rotate).
2. Remove affected Plaid items (`/item/remove`) so leaked tokens are dead at Plaid's end.
3. **Notify affected users by email within 72 hours** — plain language: what
   leaked, when, what you did, what they should do (watch statements; no bank
   passwords are ever stored so no bank password reset needed). Template below.
4. Notify Plaid (dashboard support) — required for incidents involving their tokens.
5. US state breach-notification laws apply by user's state (most require
   "without unreasonable delay"). If in doubt, notify — over-notifying is legal,
   under-notifying is not.
6. Post-mortem in this file: what leaked, root cause, what changed.

### Notification template

> Subject: Security notice from Persistence
>
> On [date] we discovered [what]. The affected data was [scope]. Your bank
> username and password were never stored by Persistence and are not affected.
> We have [rotated all credentials / revoked the affected bank connections /
> logged out all sessions]. We recommend [actions]. Questions: reply directly
> to this email.

## 4. Standing rotation checklist (do these now, and after any suspected exposure)

- [ ] Anthropic API key → console.anthropic.com → update `ANTHROPIC_API_KEY` in Railway
- [ ] Plaid secret → dashboard.plaid.com → update `PLAID_SECRET` in Railway
- [ ] `JWT_SECRET` → use staged value in `C:\Users\sebas\.persistence-secrets\` (logs everyone out)
- [ ] GitHub personal tokens → github.com/settings/tokens (revoke any you can't account for)
- [ ] Railway DB → rotate credentials; verify the public TCP proxy is removed (see below)
- [ ] Google OAuth client secret → console.cloud.google.com → Credentials (if it ever leaves Railway)

## 5. Database exposure check (do once)

Railway Postgres ships with a public TCP proxy (`*.proxy.rlwy.net:port`) so you
can connect from your laptop. The backend doesn't need it — it should connect
via the **private network URL** (`postgres.railway.internal`).

1. Railway → Postgres service → Settings → Networking: if a public proxy/TCP
   endpoint exists, delete it (you can recreate it temporarily when you need a
   one-off psql session).
2. Railway → backend service → Variables: `DATABASE_URL` should reference the
   internal hostname (`${{Postgres.DATABASE_URL}}` reference does this when both
   services are in the same project).
3. After removing the proxy, redeploy and confirm `/health` still returns ok.
