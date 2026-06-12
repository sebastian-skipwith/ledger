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

## 4. Code changes (do AFTER the domains resolve + show HTTPS in Vercel)

These are hardcoded `ledger-theta-puce.vercel.app` references that should move to
`app.persistence.finance`. The old URL keeps working as long as the Vercel project
serves it, so there's no rush and no breakage — switch when ready, ship a desktop
release for the desktop ones:
- `desktop-bar/ui/login.js` — `DESKTOP_URL` (OAuth handoff page)
- `desktop-bar/ui/index.html` — `openDashboard()` shell.open URL
- `desktop-bar/src-tauri/src/main.rs` — tray "Open Dashboard" shell.open URL
- `frontend/public/landing.html` — internal links already relative; nav "Sign in" etc.
- `frontend/app/developers/page.tsx` + docs — `API_BASE` examples (optional: add
  `api.persistence.finance` as a Railway custom domain and update `NEXT_PUBLIC_API_URL`).

Keep the keyring service name, `ledger-store`, and the Railway/Vercel internal URLs
as-is (see CLAUDE.md DO-NOT-CHANGE) — only the user-facing site hostnames change.

## 5. Tell me when DNS is live

Once `app.persistence.finance` shows the app over HTTPS, say so and I'll do the
step-4 code changes + a desktop release in one coordinated pass.
