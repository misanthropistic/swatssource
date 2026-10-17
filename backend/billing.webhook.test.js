// Run with: node --test backend/billing.webhook.test.js
//
// The webhook is the one endpoint that can hand out Premium without a person
// present, so what it does when it cannot verify a request is the whole
// security story: it must refuse, not trust. The old code fell through to
// "event = req.body" whenever the signing secret was missing, which is one
// misconfigured env var away from "anyone can upgrade any account".
//
// The module reads STRIPE_SECRET_KEY at import time, so the key is set before
// the import below and the secret is deliberately left unset.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder_for_initialisation_only';
delete process.env.STRIPE_WEBHOOK_SECRET;

const { handleStripeWebhook } = await import('./routes/billing.js');

function mockRes() {
  const state = { statusCode: 200, body: null, headers: {} };
  return {
    state,
    status(code) {
      state.statusCode = code;
      return this;
    },
    json(payload) {
      state.body = payload;
      return this;
    },
    send(payload) {
      state.body = payload;
      return this;
    },
    setHeader(k, v) {
      state.headers[k.toLowerCase()] = v;
    },
  };
}

// A body shaped exactly like the payload that grants Premium, so a fail-open
// implementation would visibly succeed on it.
const FORGED_UPGRADE = {
  type: 'checkout.session.completed',
  data: { object: { metadata: { user_id: '00000000-0000-0000-0000-000000000000' } } },
};

test('an unverifiable webhook is refused, not processed', async () => {
  const res = mockRes();
  await handleStripeWebhook({ headers: {}, body: JSON.stringify(FORGED_UPGRADE) }, res);

  // 503 rather than 200: Stripe retries, so a missing secret delays an upgrade
  // instead of silently losing it — and nothing was applied.
  assert.equal(res.state.statusCode, 503);
  assert.match(res.state.body.detail, /signing secret/i);
});

test('a signature header without a secret is still refused', async () => {
  const res = mockRes();
  await handleStripeWebhook(
    { headers: { 'stripe-signature': 't=1,v1=deadbeef' }, body: JSON.stringify(FORGED_UPGRADE) },
    res,
  );
  assert.equal(res.state.statusCode, 503);
});
