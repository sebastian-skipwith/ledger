const router = require('express').Router();
const { query } = require('../db');

// Stripe subscription billing. Dormant until these Railway env vars are set:
//   STRIPE_SECRET_KEY      sk_live_... (or sk_test_... while testing)
//   STRIPE_WEBHOOK_SECRET  whsec_...   (from the webhook endpoint in Stripe dashboard)
//   STRIPE_PRICE_PRO       price id of the Pro $9/mo recurring price
//   STRIPE_PRICE_WEALTH    price id of the Wealth $29/mo recurring price
//   APP_URL                https://app.persistence.finance (checkout redirect target)
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

const PRICE_FOR_TIER = () => ({
  pro: process.env.STRIPE_PRICE_PRO,
  wealth: process.env.STRIPE_PRICE_WEALTH,
});

// GET /api/billing/status
router.get('/status', (req, res) => {
  res.json({ configured: !!process.env.STRIPE_SECRET_KEY, tier: req.user.tier });
});

// POST /api/billing/checkout { tier: 'pro' | 'wealth' } -> { url }
router.post('/checkout', async (req, res, next) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Billing is not configured yet' });
    const tier = req.body.tier;
    const price = PRICE_FOR_TIER()[tier];
    if (!price) return res.status(400).json({ error: 'Unknown tier' });

    // Reuse the Stripe customer if this user already has one.
    let customerId = (await query(
      'SELECT stripe_customer_id FROM users WHERE id=$1', [req.user.id]
    )).rows[0]?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { user_id: req.user.id },
      });
      customerId = customer.id;
      await query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [customerId, req.user.id]);
    }

    const appUrl = process.env.APP_URL || 'https://app.persistence.finance';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${appUrl}/?billing=success`,
      cancel_url: `${appUrl}/?billing=cancelled`,
      metadata: { user_id: req.user.id, tier },
      subscription_data: { metadata: { user_id: req.user.id, tier } },
    });
    res.json({ url: session.url });
  } catch (err) { next(err); }
});

// POST /api/billing/portal -> { url } (manage/cancel subscription)
router.post('/portal', async (req, res, next) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Billing is not configured yet' });
    const customerId = (await query(
      'SELECT stripe_customer_id FROM users WHERE id=$1', [req.user.id]
    )).rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No billing account yet' });
    const appUrl = process.env.APP_URL || 'https://app.persistence.finance';
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/`,
    });
    res.json({ url: session.url });
  } catch (err) { next(err); }
});

module.exports = router;
