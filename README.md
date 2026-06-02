# Ledger — Personal Finance Platform

A full-stack personal finance platform with persistent desktop HUD, AI-powered money management, multi-device widgets, and an MCP server for AI agent integration.

## Architecture Overview

```
ledger/
├── backend/          # Node.js + FastAPI API server
├── frontend/         # Next.js 15 web dashboard
├── desktop-bar/      # Tauri always-on-top overlay
├── mcp-server/       # Claude MCP integration server
├── widgets/          # iOS/Android/macOS widget specs
└── docs/             # API docs, integration guides
```

## Stack

| Layer | Technology |
|---|---|
| Backend API | Node.js (Express) + Python FastAPI for ML |
| Database | PostgreSQL via Supabase |
| Financial Data | Plaid Link |
| AI Engine | Claude API (Anthropic) via MCP |
| Web App | Next.js 15, Tailwind CSS |
| Desktop Bar | Tauri v2 (Rust + WebView) |
| iOS/macOS Widget | Swift + WidgetKit |
| Android Widget | Kotlin + Jetpack Glance |
| Auth | Supabase Auth (JWT) |
| Realtime | Supabase Realtime subscriptions |

## Quick Start

### 1. Backend
```bash
cd backend
cp .env.example .env          # fill in keys
npm install
npm run dev                   # runs on :3001
```

### 2. Frontend
```bash
cd frontend
cp .env.example .env.local    # fill in keys
npm install
npm run dev                   # runs on :3000
```

### 3. MCP Server
```bash
cd mcp-server
npm install
npm start                     # runs on :3002
```

### 4. Desktop Bar (Tauri)
```bash
cd desktop-bar
npm install
npm run tauri dev
```

## Environment Variables

### Backend `.env`
```
DATABASE_URL=postgresql://...
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
ANTHROPIC_API_KEY=
JWT_SECRET=
PORT=3001
```

### Frontend `.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_PLAID_LINK_TOKEN_ENDPOINT=/api/plaid/create-link-token
```

## Product Tiers

| Tier | Features | Price |
|---|---|---|
| Free | Dashboard, Plaid linking (2 accounts), AI Q&A (10/day) | $0 |
| Pro | Unlimited accounts, auto-rules, alerts, widgets | $9/mo |
| Wealth | Portfolio analysis, tax optimization, SEC advisory | $29/mo |

## Key Features

- **Persistent Top Bar** — always-visible financial HUD (desktop)
- **AI Chat** — Claude-powered financial advisor with full account context
- **MCP Server** — connect your finances to any AI assistant (Claude, ChatGPT, etc.)
- **Auto-Transfer Rules** — set rules, AI executes them
- **Multi-Device Widgets** — iOS, Android, macOS, Windows
- **Real-time Sync** — Plaid webhooks → Supabase → live UI
- **Smart Alerts** — unusual spending, bill due dates, savings opportunities
