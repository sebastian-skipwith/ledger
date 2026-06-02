# Ledger — Launch Guide

## Development (Local)

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Rust + Cargo (for Tauri desktop bar)
- Android Studio (for Android widget)
- Xcode 15+ (for iOS/macOS widget)

### 1. Database setup
```bash
# Create DB
createdb ledger

# Run schema
psql ledger -f backend/src/db/schema.sql
```

### 2. Get API keys

| Service | Where | Notes |
|---|---|---|
| Plaid | dashboard.plaid.com | Use Sandbox for development |
| Anthropic | console.anthropic.com | claude-opus-4-5 access |

### 3. Start services
```bash
# Terminal 1 — Backend API
cd backend && npm install && npm run dev

# Terminal 2 — Frontend
cd frontend && npm install && npm run dev

# Terminal 3 — MCP server (optional)
cd mcp-server && npm install && npm start

# Terminal 4 — Desktop bar (optional)
cd desktop-bar && npm install && npm run tauri dev
```

### 4. Add MCP to Claude Desktop
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "ledger": {
      "command": "node",
      "args": ["/absolute/path/to/ledger/mcp-server/src/index.js"],
      "env": {
        "LEDGER_API_URL": "http://localhost:3001",
        "LEDGER_USER_TOKEN": "YOUR_JWT_TOKEN_HERE"
      }
    }
  }
}
```
Get your JWT token from the browser localStorage after logging in at localhost:3000.

---

## Production Deployment

### Backend — Railway / Render / Fly.io
```bash
# Railway (recommended)
railway init
railway add --database postgresql
railway up
```

### Frontend — Vercel
```bash
cd frontend
vercel --prod
```

### MCP Server — Expose via ngrok or Cloudflare Tunnel
For public MCP access, expose the server with a persistent URL.

### Desktop bar — Tauri build
```bash
cd desktop-bar
npm run tauri build
# Outputs .dmg (macOS), .msi (Windows), .AppImage (Linux)
```

### iOS widget — Xcode
1. Open `widgets/ios/` in Xcode
2. Add your App Group in Signing & Capabilities
3. Set your production API URL in the Swift file
4. Archive → distribute via App Store or TestFlight

### Android widget — Android Studio
1. Open `widgets/android/` in Android Studio
2. Update `api_url` in SharedPreferences setup
3. Build APK → Play Store

---

## Security Checklist (before launch)

- [ ] Rotate all sandbox API keys to production keys
- [ ] Enable Plaid webhook signature verification
- [ ] Encrypt Plaid `access_token` at rest in DB (use `pg_crypto` or app-level AES)
- [ ] Set `JWT_SECRET` to 64+ random chars
- [ ] Enable HTTPS everywhere (Vercel handles frontend, use Railway's SSL for backend)
- [ ] Rate limiting on all AI endpoints (already configured)
- [ ] Enable Supabase Row-Level Security if migrating to Supabase
- [ ] Add Sentry or similar for error tracking
- [ ] Set up daily DB backups

---

## Revenue Path

1. **Month 1-3**: Launch free tier, build Plaid sandbox testing, acquire first 500 users
2. **Month 3-6**: Launch Pro tier ($9/mo), target $4,500 MRR at 500 paying users
3. **Month 6-12**: Launch Wealth tier ($29/mo), explore SEC RIA registration for investment advisory
4. **Year 2+**: B2B API offering for developers; white-label for fintech apps

## Competitive Moat
- Desktop HUD (nobody does this)
- MCP server (first-mover in AI-native finance)
- Native AI with live financial context (vs. generic chatbots)
- Multi-device persistence (phone + watch + desktop)
