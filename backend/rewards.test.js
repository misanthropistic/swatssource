// Run with: node --test backend/rewards.test.js
//
// The reward engine's pure parts: settings sanitation (what the admin typed
// cannot break the engine) and the milestone picker (which crossing earns what,
// and never the same milestone twice).
import test from 'node:test';
import assert from 'node:assert/strict';

const { sanitizeMilestones, milestoneToAward, DEFAULT_REWARD_SETTINGS } = await import('./rewards.js');

test('milestone sanitation keeps only positive, de-duplicated, capped entries', () => {
  const clean = sanitizeMilestones([
    { views: 1000, premium_days: 3 },
    { views: 100, premium_days: 1 },
    { views: '500', premium_days: '7' }, // strings a hand-edited row could carry
    { views: 1000, premium_days: 9 },    // duplicate milestone — first wins
    { views: 'all-views', premium_days: 1 }, // garbage out
    { views: -5, premium_days: 1 },
    { views: 0, premium_days: 1 },
    { views: 250, premium_days: 0 },
    { views: 250, premium_days: 4000 },  // a day-cap: over-length trials are trimmed
  ]);
  assert.deepEqual(clean, [
    { views: 100, premium_days: 1 },
    { views: 250, premium_days: 365 },
    { views: 500, premium_days: 7 },
    { views: 1000, premium_days: 3 },
  ]);
  // Sorted smallest first whatever the admin's typing order was.
  assert.equal(DEFAULT_REWARD_SETTINGS.enabled, false);
});

test('the engine pays exactly once per milestone, greedy on big jumps', () => {
  const settings = {
    enabled: true,
    milestones: [
      { views: 100, premium_days: 1 },
      { views: 500, premium_days: 7 },
      { views: 1000, premium_days: 15 },
    ],
  };
  const hit = milestoneToAward(settings, 999, []);
  assert.equal(hit.views, 500);
  assert.equal(hit.premium_days, 7);
  // The lower milestone rides along in the same marking pass…
  assert.deepEqual(hit.alsoReached, [100]);
  // …so the next call after claiming 500+100 pays the 1000 tier, not 500 again.
  const next = milestoneToAward(settings, 1050, [500, 100]);
  assert.equal(next.views, 1000);
  assert.equal(next.premium_days, 15);

  // Disabled settings pay nothing; crossed-but-claimed milestones pay nothing.
  assert.equal(milestoneToAward({ ...settings, enabled: false }, 5000, []), null);
  assert.equal(milestoneToAward(settings, 999, [500, 100]), null);
  // A fresh profile with zero views earns nothing.
  assert.equal(milestoneToAward(settings, 0, []), null);
});

test('empty or broken settings never pay', () => {
  assert.equal(milestoneToAward({ enabled: true }, 9000, []), null);
  assert.equal(milestoneToAward(null, 9000, []), null);
  assert.deepEqual(sanitizeMilestones('garbage'), []);
  assert.deepEqual(sanitizeMilestones(undefined), []);
});
