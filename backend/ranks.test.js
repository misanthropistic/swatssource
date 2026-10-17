// Run with: node --test backend/ranks.test.js
//
// Ranks are computed, never stored, so these tests are the only place the curve
// is checked. They walk the boundaries an account actually hits: the exact XP a
// rank starts at, one point short of it, the top rank (which has no next), and
// junk input, which must not produce a rank of NaN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RANKS, XP, rankFor, rankForUser, xpForUser } from './ranks.js';

const account = (over = {}) => ({
  id: 'u1',
  username: 'ada',
  created_at: '2026-08-01T00:00:00.000Z',
  views: 0,
  badges: [],
  profile: {},
  discord: { linked: false },
  tier: 'free',
  ...over,
});

const when = new Date('2026-08-31T12:00:00.000Z'); // 30 days after created_at

test('ranks are ordered and start at zero', () => {
  assert.equal(RANKS[0].min, 0);
  for (let i = 1; i < RANKS.length; i += 1) {
    assert.ok(RANKS[i].min > RANKS[i - 1].min, `${RANKS[i].id} must cost more than ${RANKS[i - 1].id}`);
  }
});

test('a rank is inclusive at its own threshold, and the one below owns the point before it', () => {
  const bronze = RANKS.find((r) => r.id === 'bronze');
  assert.equal(rankFor(bronze.min).rank.id, 'bronze');
  assert.equal(rankFor(bronze.min - 1).rank.id, 'rookie');
  // ...and reports exactly one point still to go, which is what the bar's
  // "1 XP to Bronze" line reads.
  assert.equal(rankFor(bronze.min - 1).toNext, 1);
});

test('junk XP is a rookie, not NaN', () => {
  for (const bad of [undefined, null, NaN, -50, 'abc', {}]) {
    const r = rankFor(bad);
    assert.equal(r.rank.id, 'rookie');
    assert.equal(r.xp, 0);
    assert.ok(Number.isFinite(r.progress));
  }
});

test('the progress bar is measured between this rank and the next, not from zero', () => {
  const silver = RANKS.find((r) => r.id === 'silver');
  const gold = RANKS.find((r) => r.id === 'gold');
  const halfway = silver.min + Math.floor((gold.min - silver.min) / 2);

  const r = rankFor(halfway);
  assert.equal(r.rank.id, 'silver');
  assert.equal(r.next.id, 'gold');
  // Judging the fill against "silver..gold" is what stops the bar jumping
  // backwards the moment you rank up.
  assert.ok(r.progress > 0.45 && r.progress < 0.55, `expected ~50%, got ${r.progress}`);
  assert.equal(r.toNext, gold.min - halfway);
});

test('the top rank has no next rank and a full bar', () => {
  const top = RANKS[RANKS.length - 1];
  const r = rankFor(top.min + 100000);
  assert.equal(r.rank.id, top.id);
  assert.equal(r.next, null);
  assert.equal(r.progress, 1);
  assert.equal(r.percent, 100);
  assert.equal(r.toNext, 0);
});

test('an empty account starts at zero XP', () => {
  assert.equal(xpForUser(account({ created_at: null }), when), 0);
});

test('time on the site is worth XP and then stops being worth anything', () => {
  const young = xpForUser(account({ created_at: '2026-08-29T00:00:00.000Z' }), when);
  const month = xpForUser(account({ created_at: '2026-08-01T00:00:00.000Z' }), when);
  const twoYears = xpForUser(account({ created_at: '2024-08-01T00:00:00.000Z' }), when);

  assert.equal(young, 2 * XP.perDay);
  assert.equal(month, 30 * XP.perDay);
  // Capped: past `maxDays` more time buys nothing at all.
  assert.equal(twoYears, XP.maxDays * XP.perDay);
  assert.equal(xpForUser(account({ created_at: '2020-01-01T00:00:00.000Z' }), when), XP.maxDays * XP.perDay);

  // The cap is deliberately below what a fully built page is worth, so an
  // account that is only old cannot outrank one that is finished. This pins the
  // balance: move any of the completeness values and this fails until the two
  // sides are thought about again.
  const maxTimeBonus = XP.maxDays * XP.perDay;
  const fullPage =
    XP.avatar + XP.background + XP.bio + XP.maxLinks * XP.perLink + XP.maxWidgets * XP.perWidget;
  assert.ok(maxTimeBonus < fullPage, `the time bonus (${maxTimeBonus}) must stay under a full page (${fullPage})`);

  // ...and an old account whose page IS finished still comes out ahead of both.
  const old = account({ created_at: '2020-01-01T00:00:00.000Z' });
  assert.ok(xpForUser({ ...old, profile: finishedProfile() }, when) > twoYears);
});

test('views count on a curve, so reach helps without swamping the rest', () => {
  const none = xpForUser(account({ created_at: null, views: 0 }), when);
  const thousand = xpForUser(account({ created_at: null, views: 1000 }), when);
  const tenThousand = xpForUser(account({ created_at: null, views: 10000 }), when);

  assert.equal(none, 0);
  assert.ok(thousand > 0 && tenThousand > thousand);
  // Ten times the views is nowhere near ten times the XP — otherwise the
  // leaderboard would just be the rank ladder.
  assert.ok(tenThousand < thousand * 10);
});

test('a finished profile outscores a bare one, and premium is worth something', () => {
  const bare = xpForUser(account(), when);
  const finished = xpForUser(account({ profile: finishedProfile(), badges: ['og'], discord: { linked: true } }), when);
  const paying = xpForUser(account({ profile: finishedProfile(), tier: 'premium' }), when);

  assert.ok(finished > bare);
  assert.ok(paying > xpForUser(account({ profile: finishedProfile() }), when));
  assert.equal(paying - xpForUser(account({ profile: finishedProfile() }), when), XP.premium);
});

test('extra links and widgets stop counting past their cap', () => {
  // `created_at: null` on purpose: this test is about the profile's worth, and
  // the time bonus would otherwise show up in every number below.
  const many = (n) => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, url: '#', label: 'x' }));
  const withLinks = (n) => xpForUser(account({ created_at: null, profile: { links: many(n) } }), when);
  const withWidgets = (n) => xpForUser(account({ created_at: null, profile: { widgets: many(n) } }), when);

  assert.equal(withLinks(XP.maxLinks), XP.maxLinks * XP.perLink);
  assert.equal(withLinks(XP.maxLinks + 20), withLinks(XP.maxLinks));
  assert.equal(withWidgets(XP.maxWidgets), XP.maxWidgets * XP.perWidget);
  assert.equal(withWidgets(XP.maxWidgets + 5), withWidgets(XP.maxWidgets));
});

test('a malformed profile blob does not throw and earns nothing', () => {
  assert.doesNotThrow(() => xpForUser(account({ profile: 'not an object', badges: null, views: 'lots' }), when));
  assert.equal(xpForUser(account({ profile: null, badges: null, views: 'lots', created_at: null }), when), 0);
  // An account with no creation date has been here zero days — not since 1970,
  // which is what `new Date(null)` would say.
  assert.equal(xpForUser(account({ created_at: null }), when), 0);
  assert.equal(xpForUser(account({ created_at: '' }), when), 0);
  assert.equal(xpForUser(account({ created_at: 'not a date' }), when), 0);
});

test('rankForUser reports the XP it ranked', () => {
  const user = account({ profile: finishedProfile(), badges: ['og', 'premium'] });
  const summary = rankForUser(user, when);
  assert.equal(summary.xp, xpForUser(user, when));
  assert.equal(summary.rank.id, rankFor(summary.xp).rank.id);
});

// A page someone actually filled in: avatar, background, bio, links, widgets.
const finishedProfile = () => ({
  avatar_url: 'https://cdn/avatar.png',
  background_url: 'https://cdn/bg.png',
  bio: 'hello',
  links: [{ label: 'a' }, { label: 'b' }],
  widgets: [{ type: 'discord' }],
});
