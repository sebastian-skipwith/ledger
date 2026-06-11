const router = require('express').Router();
const { query } = require('../db');

// Stripe webhook. Mounted BEFORE express.json() with express.raw() so the
// signature can be verified against the exact bytes Stripe sent.
// Stripe dashboard -> Developers -> Webhooks -> endpoint:
//   https://ledger-production-5649.up.railway.app/api/webhooks/stripe
// Events: checkout.session.completed, customer.subscription.updated,
//         customer.subscription.deleted
router.post('/', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Billing is not configured' });
  }
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        const tier = s.metadata?.tier;
        const userId = s.metadata?.user_id;
        if (userId && ['pro', 'wealth'].includes(tier)) {
          await query(
            'UPDATE users SET tier=$1, stripe_customer_id=COALESCE(stripe_customer_id,$2) WHERE id=$3',
            [tier, s.customer, userId]
          );
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const tier = sub.metadata?.tier;
        const active = ['active', 'trialing'].includes(sub.status);
        if (sub.customer) {
          await query(
            'UPDATE users SET tier=$1 WHERE stripe_customer_id=$2',
            [active && ['pro', 'wealth'].includes(tier) ? tier : 'free', sub.customer]
          );
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        if (sub.customer) {
          await query('UPDATE users SET tier=$1 WHERE stripe_customer_id=$2', ['free', sub.customer]);
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

module.exports = router;
