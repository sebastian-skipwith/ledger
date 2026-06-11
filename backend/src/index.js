require('dotenv').config();
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
const billingRouter = require('./routes/billing');
const stripeWebhookRouter = require('./routes/webhooks-stripe');
const webhooksRouter = require('./routes/webhooks');
const { authenticate } = require('./middleware/auth');
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

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', time: new Date().toISOString() });
});

// Public routes
app.use('/api/auth', authRouter);
app.use('/api/auth', googleAuthRouter);
app.use('/api/webhooks', webhooksRouter);

// Protected routes
app.use('/api/plaid',        authenticate, plaidRouter);
app.use('/api/accounts',     authenticate, accountsRouter);
app.use('/api/transactions', authenticate, transactionsRouter);
app.use('/api/net-worth',    authenticate, netWorthRouter);
app.use('/api/bills',        authenticate, billsRouter);
app.use('/api/goals',        authenticate, goalsRouter);
app.use('/api/summary',      authenticate, summaryRouter);
app.use('/api/billing',      authenticate, billingRouter);
app.use('/api/admin',        authenticate, adminRouter);
app.use('/api/ai',           authenticate, aiLimiter, aiRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Idempotent schema additions (there is no migration runner; schema.sql is
// applied manually, so additive columns are ensured here at boot).
(async () => {
  try {
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT');
  } catch (err) {
    console.error('Schema ensure failed:', err.message);
  }
})();

app.listen(PORT, () => {
  console.log(`Ledger API running on :${PORT}`);
});

module.exports = app;
