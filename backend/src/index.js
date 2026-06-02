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
const webhooksRouter = require('./routes/webhooks');
const { authenticate } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Railway's proxy so rate-limit and IP detection work correctly
app.set('trust proxy', 1);

// Security
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'tauri://localhost',
    'https://tauri.localhost',
  ],
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
app.use(limiter);

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
app.use('/api/ai',           authenticate, aiLimiter, aiRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(`Ledger API running on :${PORT}`);
});

module.exports = app;
