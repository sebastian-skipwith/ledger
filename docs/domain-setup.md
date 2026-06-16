# Domain setup — persistence.finance

Goal:
- **Landing page** → `persistence.finance` (and `www.persistence.finance`)
- **Web app** → `app.persistence.finance`
- Backend API stays at the Railway URL (CORS is `origin: true`, so no change needed).

Both the landing page and the web app are the SAME Vercel project (the app is a
Next.js app; the landing/security pages are static files in `frontend/public/`).
So both hostnames point at the one Vercel project; routing by hostname is optional.

## 1. Vercel — add the domains (owner action)

Vercel → the project → Settings → Domains → Add:
1. `persistence.finance`
2. `www.persistence.finance` (Vercel will offer to redirect it to the apex — accept)
3. `app.persistence.finance`

Vercel shows the DNS records to create. Typically:
- Apex `persistence.finance` → **A** record to `76.76.21.21` (Vercel's IP), OR an
  ALIAS/ANAME if your registrar supports it.
- `www` and `app` → **CNAME** to `cname.vercel-dns.com`.

## 2. Registrar — add the DNS records (owner action)

Wherever you bought persistence.finance (Cloudflare, Namecheap, etc.), open DNS and
add exactly the records Vercel listed. If using Cloudflare, set the proxy to
**DNS only** (grey cloud) for the Vercel records. Propagation: minutes to ~an hour.

Vercel auto-issues HTTPS certificates once the records resolve.

## 3. Google OAuth — authorize the new origins (owner action)

Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0 Client:
- **Authorized JavaScript origins**: add `https://app.persistence.finance` and
  `https://persistence.finance`.
- **Authorized redirect URIs**: add the same if the app uses redirect-based flow.
Without this, "Sign in with Google" fails on the new domain.

## 4. Code changes (DONE 2026-06-16 — domains live, DNS resolving to Vercel)

Hardcoded `ledger-theta-puce.vercel.app` references moved to the new domains. The
old URL keeps working (same Vercel project), so installed desktop apps that predate
the next release keep functioning until users update. Changed:
- `desktop-bar/ui/login.js` — `DESKTOP_URL` → `https://app.persistence.finance/desktop` ✅
- `desktop-bar/ui/index.html` — `openDashboard()` → `https://app.persistence.finance` ✅
- `desktop-bar/src-tauri/src/main.rs` — tray "show" → `https://app.persistence.finance` ✅
- `backend/src/routes/billing.js` — `APP_URL` fallback → `https://app.persistence.finance` ✅
- `backend/src/lib/email.js` — welcome-email security link → `https://persistence.finance/security.html` ✅
- `mcp-server/src/index.js` — connect-code instructions → `https://app.persistence.finance/desktop` ✅
- `frontend/public/landing.html` — internal links already relative; no change needed.
- `frontend/app/developers/page.tsx` — uses the Railway API URL, not the Vercel host; unchanged.

**Still pending (owner / release):**
- Desktop release so installed HUDs pick up the new `app.persistence.finance` URLs
  (old URL still works until then — no breakage).
- Optional: add `api.persistence.finance` as a Railway custom domain + update
  `NEXT_PUBLIC_API_URL`.

Keep the keyring service name, `ledger-store`, and the Railway/Vercel internal URLs
as-is (see CLAUDE.md DO-NOT-CHANGE) — only the user-facing site hostnames change.

## 5. Tell me when DNS is live

Once `app.persistence.finance` shows the app over HTTPS, say so and I'll do the
step-4 code changes + a desktop release in one coordinated pass.
