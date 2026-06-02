-- Ledger Database Schema
-- Run via: psql $DATABASE_URL -f schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT,
  tier            TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro','wealth')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- PLAID ITEMS (linked institution connections)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plaid_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id         TEXT UNIQUE NOT NULL,          -- Plaid item_id
  access_token    TEXT NOT NULL,                 -- Plaid access_token (encrypted at rest)
  institution_id  TEXT,
  institution_name TEXT,
  cursor          TEXT,                          -- Plaid sync cursor
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ACCOUNTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plaid_item_id   UUID REFERENCES plaid_items(id) ON DELETE CASCADE,
  plaid_account_id TEXT UNIQUE,                  -- Plaid account_id
  name            TEXT NOT NULL,
  official_name   TEXT,
  type            TEXT NOT NULL,                 -- depository, investment, credit, loan
  subtype         TEXT,                          -- checking, savings, 401k, etc.
  current_balance NUMERIC(14,2) DEFAULT 0,
  available_balance NUMERIC(14,2),
  currency        TEXT DEFAULT 'USD',
  institution_name TEXT,
  mask            TEXT,                          -- last 4 digits
  is_hidden       BOOLEAN DEFAULT FALSE,
  color           TEXT DEFAULT '#888888',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TRANSACTIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plaid_txn_id    TEXT UNIQUE,
  amount          NUMERIC(14,2) NOT NULL,        -- positive = debit, negative = credit
  date            DATE NOT NULL,
  name            TEXT NOT NULL,
  merchant_name   TEXT,
  category        TEXT[],                        -- Plaid category hierarchy
  category_custom TEXT,                          -- user-overridden category
  pending         BOOLEAN DEFAULT FALSE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS txn_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS txn_account ON transactions(account_id);

-- ─────────────────────────────────────────────
-- NET WORTH SNAPSHOTS (daily)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date   DATE NOT NULL,
  total_assets    NUMERIC(14,2) NOT NULL,
  total_liabilities NUMERIC(14,2) NOT NULL,
  net_worth       NUMERIC(14,2) NOT NULL,
  breakdown       JSONB,                         -- per-account balances
  UNIQUE(user_id, snapshot_date)
);

-- ─────────────────────────────────────────────
-- BILLS / RECURRING
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bills (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id      UUID REFERENCES accounts(id),
  name            TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  frequency       TEXT NOT NULL DEFAULT 'monthly', -- weekly, monthly, yearly
  next_due_date   DATE,
  autopay         BOOLEAN DEFAULT FALSE,
  category        TEXT,
  color           TEXT DEFAULT '#888888',
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- GOALS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,                 -- savings, debt_payoff, investment
  target_amount   NUMERIC(14,2) NOT NULL,
  current_amount  NUMERIC(14,2) DEFAULT 0,
  target_date     DATE,
  linked_account_id UUID REFERENCES accounts(id),
  monthly_contribution NUMERIC(14,2),
  notes           TEXT,
  completed       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- AUTOMATION RULES (AI can set these)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  trigger_type    TEXT NOT NULL,                 -- balance_threshold, date, spending_category
  trigger_value   JSONB NOT NULL,
  action_type     TEXT NOT NULL,                 -- transfer, alert, notify
  action_value    JSONB NOT NULL,
  active          BOOLEAN DEFAULT TRUE,
  last_triggered  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- AI CONVERSATION MEMORY
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id      TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_conv_user_session ON ai_conversations(user_id, session_id, created_at);

-- ─────────────────────────────────────────────
-- ALERTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  read            BOOLEAN DEFAULT FALSE,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
