require('dotenv').config();

// Error monitoring — dormant until SENTRY_DSN is set in Railway.
let Sentry = null;
if (process.env.SENTRY_DSN) {
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
  });
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRouter = require('./routes/auth');
const googleAuthRouter = require('./routes/auth-google');
const plaidRouter = require('./routes/plaid');
const accountsRouter = require('./routes/accounts');
const transactionsRouter = require('./routes/transactions');
const netWorthRouter = require('./routes/networth');
const billsRouter = require('./routes/bills');
const aiRouter = require('./routes/ai');
const goalsRouter = require('./routes/goals');
const summaryRouter = require('./routes/summary');
const adminRouter = require('./routes/admin');
const accountRouter = require('./routes/account');
const developerRouter = require('./routes/developer');
const intelligenceRouter = require('./routes/intelligence');
const mcpHttpRouter = require('./routes/mcp-http');
const rulesRouter = require('./routes/rules');
const householdRouter = require('./routes/household');
const investmentsRouter = require('./routes/investments');
const billingRouter = require('./routes/billing');
const creditRouter = require('./routes/credit');
const stripeWebhookRouter = require('./routes/webhooks-stripe');
const webhooksRouter = require('./routes/webhooks');
const oauthRouter = require('./routes/oauth');
const { authenticate } = require('./middleware/auth');
const { mcpAuthenticate } = require('./middleware/mcp-auth');
const { query } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Railway's proxy
app.set('trust proxy', 1);

// Security - disable contentSecurityPolicy and allowedHosts to avoid blocking Railway traffic
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: true, // Allow all origins in production (API is protected by JWT)
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, validate: { xForwardedForHeader: false } });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, validate: { xForwardedForHeader: false } });
app.use(limiter);

// Stripe webhook needs the raw request body for signature verification, so it
// is mounted before express.json().
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRouter);

// Capture the raw body (used to verify Plaid webhook signatures in routes/webhooks.js).
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', time: new Date().toISOString() });
});

// Public routes
app.use('/api/auth', authRouter);
app.use('/api/auth', googleAuthRouter);
app.use('/api/webhooks', webhooksRouter);

// OAuth 2.1 authorization server + discovery (public) so MCP clients like
// Claude can connect to /api/mcp via OAuth. Mounted at root for the
// /.well-known/* discovery paths.
app.use(oauthRouter);

// Protected routes
app.use('/api/plaid',        authenticate, plaidRouter);
app.use('/api/accounts',     authenticate, accountsRouter);
app.use('/api/transactions', authenticate, transactionsRouter);
app.use('/api/net-worth',    authenticate, netWorthRouter);
app.use('/api/bills',        authenticate, billsRouter);
app.use('/api/goals',        authenticate, goalsRouter);
app.use('/api/summary',      authenticate, summaryRouter);
app.use('/api/billing',      authenticate, billingRouter);
app.use('/api/credit',       authenticate, creditRouter);
app.use('/api/admin',        authenticate, adminRouter);
app.use('/api/account',      authenticate, accountRouter);
app.use('/api/developer',    authenticate, developerRouter);
app.use('/api/intelligence', authenticate, aiLimiter, intelligenceRouter);
app.use('/api/mcp',          mcpAuthenticate, mcpHttpRouter);
app.use('/api/ai',           authenticate, aiLimiter, aiRouter);
app.use('/api/rules',        authenticate, rulesRouter);
app.use('/api/household',    authenticate, householdRouter);
app.use('/api/investments',  authenticate, investmentsRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (Sentry && (!err.status || err.status >= 500)) {
    Sentry.captureException(err, { user: req.user ? { id: req.user.id } : undefined });
  }
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Idempotent schema additions (there is no migration runner; schema.sql is
// applied manually, so additive columns are ensured here at boot).
(async () => {
  try {
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT');
    // Per-account prior balance so the UI can show change since the last sync.
    await query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS previous_balance NUMERIC');
    // Manually-tracked credit scores (Plaid does not provide credit scores).
    await query(`CREATE TABLE IF NOT EXISTS credit_scores (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      source TEXT,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query('CREATE INDEX IF NOT EXISTS credit_scores_user ON credit_scores(user_id, recorded_at DESC)');
    await query(`CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      key_prefix TEXT NOT NULL,
      scopes TEXT[] DEFAULT ARRAY['read'],
      last_used_at TIMESTAMPTZ,
      revoked BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query('CREATE INDEX IF NOT EXISTS api_keys_hash ON api_keys(key_hash) WHERE revoked = false');

    // ── OAuth 2.1 authorization-server tables (for MCP connectors like Claude) ──
    await query(`CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id TEXT PRIMARY KEY,
      redirect_uris TEXT[] NOT NULL,
      client_name TEXT,
      scope TEXT DEFAULT 'mcp:read',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS oauth_pending_authorizations (
      request_id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      scope TEXT,
      resource TEXT,
      code_challenge TEXT,
      code_challenge_method TEXT DEFAULT 'S256',
      state TEXT,
      consumed BOOLEAN DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
      code_hash TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      redirect_uri TEXT NOT NULL,
      scope TEXT,
      resource TEXT,
      code_challenge TEXT,
      code_challenge_method TEXT DEFAULT 'S256',
      used BOOLEAN DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS oauth_access_tokens (
      token_hash TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scope TEXT,
      resource TEXT,
      revoked BOOLEAN DEFAULT FALSE,
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
      token_hash TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scope TEXT,
      resource TEXT,
      revoked BOOLEAN DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // Durable key/value memory the AI connector can read/write so financial
    // goals & preferences persist across sessions and across AI clients.
    await query(`CREATE TABLE IF NOT EXISTS agent_memory (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, key)
    )`);
    await query('CREATE INDEX IF NOT EXISTS agent_memory_user ON agent_memory(user_id, updated_at DESC)');

    // Cleaned merchant name + free-form tags for transactions; manual-account flag.
    await query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant_name_clean TEXT');
    await query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tags TEXT[]');
    await query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'plaid'");

    // Plain-English categorization/tagging rules applied on sync + on demand.
    await query(`CREATE TABLE IF NOT EXISTS transaction_rules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_field TEXT NOT NULL CHECK (match_field IN ('merchant','name','amount')),
      match_op TEXT NOT NULL CHECK (match_op IN ('contains','equals','gt','lt')),
      match_value TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('set_category','set_tag')),
      action_value TEXT NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query('CREATE INDEX IF NOT EXISTS transaction_rules_user ON transaction_rules(user_id) WHERE active = true');

    // Shared household views: members keep their own accounts; an active member
    // sees the combined view of all members' non-hidden accounts.
    await query(`CREATE TABLE IF NOT EXISTS households (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS household_members (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      invited_email TEXT,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
      status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(household_id, user_id)
    )`);
    await query("CREATE INDEX IF NOT EXISTS household_members_user ON household_members(user_id) WHERE status='active'");
    await query("CREATE INDEX IF NOT EXISTS household_members_invited ON household_members(invited_email) WHERE status='invited'");
    // DB-level guard against duplicate pending invites (UNIQUE(household_id,user_id) allows NULLs).
    await query("CREATE UNIQUE INDEX IF NOT EXISTS household_members_pending_uq ON household_members (household_id, LOWER(invited_email)) WHERE status='invited'");

    // Investment holdings (read-only, from Plaid Investments) + portfolio snapshots.
    await query(`CREATE TABLE IF NOT EXISTS securities (
      security_id TEXT PRIMARY KEY,
      ticker_symbol TEXT,
      name TEXT,
      type TEXT,
      close_price NUMERIC(20,6),
      close_price_as_of DATE,
      is_cash_equivalent BOOLEAN,
      iso_currency_code TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS holdings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      security_id TEXT NOT NULL REFERENCES securities(security_id),
      quantity NUMERIC(28,10) NOT NULL,
      institution_price NUMERIC(20,6),
      institution_value NUMERIC(20,2),
      cost_basis NUMERIC(20,2),
      iso_currency_code TEXT,
      as_of DATE,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (account_id, security_id)
    )`);
    await query('CREATE INDEX IF NOT EXISTS holdings_user ON holdings(user_id)');
    await query(`CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      snapshot_date DATE NOT NULL,
      total_value NUMERIC(20,2) NOT NULL,
      total_cost_basis NUMERIC(20,2),
      allocation JSONB,
      UNIQUE (user_id, snapshot_date)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS target_allocations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      targets JSONB NOT NULL,
      drift_threshold NUMERIC DEFAULT 0.05,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id)
    )`);
  } catch (err) {
    console.error('Schema ensure failed:', err.message);
  }

  // Encrypt any plaintext Plaid tokens once DATA_ENCRYPTION_KEY is set.
  // Nothing in this block may crash the app — it degrades to warnings.
  try {
    const { isConfigured, encryptSecret, PREFIX } = require('./lib/crypto');
    if (isConfigured()) {
      const { rows } = await query(
        `SELECT id, access_token FROM plaid_items WHERE access_token NOT LIKE $1`, [`${PREFIX}%`]
      );
      for (const r of rows) {
        await query('UPDATE plaid_items SET access_token=$1 WHERE id=$2', [encryptSecret(r.access_token), r.id]);
      }
      console.log(`Token encryption active${rows.length ? ` — encrypted ${rows.length} existing Plaid token(s)` : ''}`);
    } else {
      console.warn('DATA_ENCRYPTION_KEY not set — Plaid access tokens are NOT application-encrypted at rest');
    }
  } catch (err) {
    console.error('Token encryption migration failed (continuing without it):', err.message);
  }
})();

app.listen(PORT, () => {
  console.log(`Ledger API running on :${PORT}`);
});

module.exports = app;
