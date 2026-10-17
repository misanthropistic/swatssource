import express from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../auth.js';
import { query } from '../db.js';
import { computeAutoBadges } from '../badges.js';
import { logSystemEvent } from '../auditLog.js';

const router = express.Router();
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

// POST /api/billing/checkout
router.post('/checkout', requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ detail: 'Stripe is not configured in backend environment variables' });
  }

  try {
    const successUrl = process.env.STRIPE_SUCCESS_URL || 'https://swats.bio/!/pricing?upgrade=success';
    const cancelUrl = process.env.STRIPE_CANCEL_URL || 'https://swats.bio/!/pricing?upgrade=cancelled';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'swats.bio Premium Subscription',
              description: 'Unlock all 100+ fonts, custom code widgets, MP4 video uploads, card styles, and animations.',
            },
            unit_amount: 500, // $5.00
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      customer_email: req.user.email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: req.user.id,
      },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ detail: err.message || 'Failed to create checkout session' });
  }
});

/* POST /api/billing/webhook (raw body, registered in server.js)

   This endpoint hands out Premium, so the signature is not optional decoration:
   an unsigned body is something any visitor can POST themselves. The old shape
   (`if (webhookSecret && sig) verify else trust it`) failed open — with the
   secret unset the body was treated as an event. It now fails closed and says
   so, with a 503 so Stripe keeps retrying instead of quietly dropping the
   customer's upgrade. Nothing is ever processed unverified. */
export async function handleStripeWebhook(req, res) {
  // No Stripe key at all: billing is switched off on this deployment, and there
  // is nothing to verify against. Answering 200 keeps Stripe's dashboard clean.
  if (!stripe) return res.status(200).send();

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error(
      '[billing] STRIPE_WEBHOOK_SECRET is not set — refusing to process the webhook. ' +
        'Copy the endpoint signing secret from the Stripe dashboard into the env panel; ' +
        'until then paid upgrades will not be applied automatically.'
    );
    return res.status(503).json({ detail: 'Webhook signing secret is not configured' });
  }

  if (!sig) {
    return res.status(400).json({ detail: 'Missing stripe-signature header' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    // A bad signature is either a misconfigured endpoint or somebody forging an
    // upgrade. Both get the same terse answer.
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      if (!userId) return res.json({ received: true });

      // A donation pays the bills; it does not buy a tier. The metadata kind
      // the donate route wrote is the only honest way to tell the two sessions
      // apart — without it a one-time $5 gift would flip the donor to Premium,
      // and a Premium purchase would be awarded nothing.
      if (session.metadata?.kind === 'donation') {
        const cents = Math.max(Number(session.amount_total) || 0, 0);
        const { rows } = await query(
          `UPDATE users SET donated_cents = COALESCE(donated_cents, 0) + $1 WHERE id = $2 RETURNING *`,
          [cents, userId],
        );
        if (rows[0]) {
          const badges = await computeAutoBadges(rows[0]);
          await query('UPDATE users SET badges = $1 WHERE id = $2', [badges, userId]);
        }
        await logSystemEvent({
          actor: { id: userId },
          action: 'billing.donation',
          targetType: 'user',
          targetId: userId,
          detail: { amount_cents: cents, stripe_session: session.id },
        });
        return res.json({ received: true, donation: true });
      }

      const { rows } = await query("UPDATE users SET tier = 'premium' WHERE id = $1 RETURNING *", [userId]);
      if (rows[0]) {
        const badges = await computeAutoBadges(rows[0]);
        await query('UPDATE users SET badges = $1 WHERE id = $2', [badges, userId]);
      }
      await logSystemEvent({
        actor: { id: userId },
        action: 'billing.premium',
        targetType: 'user',
        targetId: userId,
        detail: { amount_cents: Number(session.amount_total) || null, currency: session.currency || null, stripe_session: session.id },
      });
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerEmail = subscription.customer_email;
      if (customerEmail) {
        const { rows } = await query("UPDATE users SET tier = 'free' WHERE LOWER(email) = $1 RETURNING *", [customerEmail.toLowerCase()]);
        if (rows[0]) {
          const badges = await computeAutoBadges(rows[0]);
          await query('UPDATE users SET badges = $1 WHERE id = $2', [badges, rows[0].id]);
        }
      }
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('Error handling Stripe webhook event:', err);
    return res.status(500).json({ detail: 'Webhook handling error' });
  }
}

/* POST /api/billing/donate   { amount_usd }

   A one-time contribution, not a subscription: the same Stripe session flow the
   premium checkout uses, `mode: 'payment'` instead of `mode: 'subscription'`,
   with a preset or custom amount between 1 and 500 USD. The webhook records the
   plan for the donor by `metadata.user_id`, which also earns them the Donator
   badge computed in the same checkout handler. */
router.post('/donate', requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ detail: 'Stripe is not configured in backend environment variables' });
  }

  const requested = Number(req.body?.amount_usd);
  if (!Number.isFinite(requested)) {
    return res.status(400).json({ detail: 'Give an amount in USD, e.g. { amount_usd: 5 }' });
  }
  // Rounded to cents and boxed in: a penny donation breaks Stripe (minimum
  // charge), and one request must not create a $10,000,000 session.
  const amount = Math.round(requested * 100);
  if (amount < 100 || amount > 50000) {
    return res.status(400).json({ detail: 'Donations run from $1.00 to $500.00' });
  }

  try {
    const frontendUrl = (process.env.FRONTEND_URL || process.env.STRIPE_SUCCESS_URL || 'https://swats.bio').split(',')[0];
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'swats.bio donation',
              description: `Supporting swats.bio — a one-time gift from @${req.user.username}`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: req.user.email,
      success_url: `${frontendUrl}/!/donate?donated=${amount}`,
      cancel_url: `${frontendUrl}/!/donate?donation=cancelled`,
      metadata: {
        user_id: req.user.id,
        kind: 'donation',
      },
    });

    return res.json({ url: session.url, amount });
  } catch (err) {
    console.error('Stripe donation error:', err);
    return res.status(500).json({ detail: err.message || 'Failed to create donation checkout' });
  }
});

// GET /api/billing/portal
router.get('/portal', requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ detail: 'Stripe is not configured' });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripe_customer_id,
      return_url: `${(process.env.FRONTEND_URL || 'https://swats.bio').split(',')[0]}/!/dashboard/settings`,
    });
    return res.json({ url: session.url });
  } catch (err) {
    return res.status(400).json({ detail: 'No active billing subscription found' });
  }
});

export default router;
