// Run with: node --test backend/templates.limits.test.js
//
// Publishing a free template is the thing the dashboard promises, so the limits
// behind it are pinned here rather than left to whatever the route happens to
// read that day. The dashboard shows `count/limit` from the server, which means
// these numbers are also the ones a user sees on the button.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATE_LIMITS, templateLimitFor } from './routes/templates.js';

test('a free account can publish more than one template', () => {
  // The regression this guards: free was 1, so "posting a free template" worked
  // exactly once and then looked broken.
  assert.ok(TEMPLATE_LIMITS.free > 1, 'a free account must be able to publish more than one');
  assert.ok(TEMPLATE_LIMITS.premium > TEMPLATE_LIMITS.free);
});

test('tiers map to their limits', () => {
  assert.deepEqual(templateLimitFor({ tier: 'free' }), { premium: false, unlimited: false, limit: TEMPLATE_LIMITS.free });
  assert.deepEqual(templateLimitFor({ tier: 'premium' }), { premium: true, unlimited: false, limit: TEMPLATE_LIMITS.premium });
});

test('admins and the owner are not capped at all', () => {
  for (const user of [{ role: 'admin' }, { is_owner: true }, { tier: 'admin' }]) {
    const { unlimited, limit } = templateLimitFor(user);
    assert.equal(unlimited, true);
    // `null` — not Infinity and not 0 — so a client can tell "no cap" apart
    // from "no slots left" without a magic number.
    assert.equal(limit, null);
  }
});

test('a missing or junk user is a free account, not an unlimited one', () => {
  for (const user of [undefined, null, {}, { tier: 'whatever' }, { tier: null }]) {
    const { premium, unlimited, limit } = templateLimitFor(user);
    assert.equal(premium, false);
    assert.equal(unlimited, false);
    assert.equal(limit, TEMPLATE_LIMITS.free);
  }
});
