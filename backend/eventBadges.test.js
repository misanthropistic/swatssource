// Run with: node --test backend/eventBadges.test.js
//
// The calendar decides which seasonal badge an account earns and when, so these
// tests are about dates: the edges of each window, the year boundary the New
// Year window straddles, the year in the id, and the property that matters most
// in production — running the grant on every sign-in must not hand the same
// badge out twice or take it back the day after the window closes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTS,
  EVENT_IDS,
  activeEventWindows,
  badgeIdFor,
  earnedEventBadges,
  eventBadgeCatalog,
  upcomingEvents,
  windowFor,
} from './eventBadges.js';
import { computeAutoBadges } from './badges.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const at = (iso) => new Date(iso);
const ids = (now, existing = []) => earnedEventBadges(now, existing).map((b) => b.id);

const event = (id) => EVENTS.find((e) => e.id === id);

test('each event names the badge year it grants', () => {
  assert.equal(badgeIdFor(event('halloween'), 2026), 'halloween_2026');
  assert.equal(badgeIdFor(event('christmas'), 2026), 'christmas_2026');
  // The New Year window that opens in December 2026 welcomes 2027, and the id
  // has to be the year people would call it.
  assert.equal(windowFor(event('newyear'), 2026).badgeYear, 2027);
});

test('Halloween is earned across October, not only on the 31st', () => {
  assert.deepEqual(ids(at('2026-10-01T00:00:00Z')), ['halloween_2026']);
  assert.deepEqual(ids(at('2026-10-15T12:00:00Z')), ['halloween_2026']);
  // 23:59:59 on the last day still counts.
  assert.deepEqual(ids(at('2026-10-31T23:59:59Z')), ['halloween_2026']);
  assert.deepEqual(ids(at('2026-11-01T09:00:00Z')), []);
  assert.deepEqual(ids(at('2026-09-30T23:59:59Z')), []);
});

test('Christmas closes before the New Year window opens', () => {
  assert.deepEqual(ids(at('2026-12-01T00:00:00Z')), ['christmas_2026']);
  assert.deepEqual(ids(at('2026-12-26T20:00:00Z')), ['christmas_2026']);
  assert.deepEqual(ids(at('2026-12-27T00:00:00Z')), ['newyear_2027']);
});

test('the New Year window spans the year boundary and keeps one name', () => {
  // Same badge on both sides of midnight on 1 January.
  assert.deepEqual(ids(at('2026-12-31T23:59:00Z')), ['newyear_2027']);
  assert.deepEqual(ids(at('2027-01-01T00:00:01Z')), ['newyear_2027']);
  assert.deepEqual(ids(at('2027-01-07T23:59:59Z')), ['newyear_2027']);
  assert.deepEqual(ids(at('2027-01-08T00:00:00Z')), []);
});

test('an ordinary day in the year grants nothing', () => {
  assert.deepEqual(ids(at('2026-07-04T12:00:00Z')), []);
  assert.deepEqual(ids(at('2027-03-15T12:00:00Z')), []);
});

test('a badge already held is never granted twice', () => {
  assert.deepEqual(ids(at('2026-10-10T12:00:00Z'), ['halloween_2026']), []);
  assert.deepEqual(ids(at('2026-10-10T12:00:00Z'), ['og', 'halloween_2026']), []);
});

test('last year badge is still held, and this year is still earnable', () => {
  const held = ['halloween_2025'];
  assert.deepEqual(ids(at('2026-10-10T12:00:00Z'), held), ['halloween_2026']);
});

test('only the windows that contain the moment are live', () => {
  assert.deepEqual(activeEventWindows(at('2026-12-27T12:00:00Z')).map((w) => w.badgeId), ['newyear_2027']);
  assert.equal(activeEventWindows(at('2026-06-01T12:00:00Z')).length, 0);
});

test('the calendar says when the next window opens', () => {
  const calendar = upcomingEvents(at('2026-09-15T12:00:00Z'));
  const halloween = calendar.find((e) => e.id === 'halloween');
  const newyear = calendar.find((e) => e.id === 'newyear');

  assert.equal(halloween.live, false);
  assert.equal(halloween.badgeId, 'halloween_2026');
  assert.equal(halloween.opensInDays, 16); // 15 September → 1 October
  assert.equal(newyear.badgeId, 'newyear_2027');
  assert.ok(newyear.opensInDays > halloween.opensInDays);

  // While it is open, `live` is true and the countdown is gone.
  const openNow = upcomingEvents(at('2026-10-10T12:00:00Z')).find((e) => e.id === 'halloween');
  assert.equal(openNow.live, true);
  assert.equal(openNow.opensInDays, null);
});

test('every event appears in the calendar whatever the date', () => {
  for (const when of ['2026-01-02T00:00:00Z', '2026-06-01T00:00:00Z', '2026-12-30T00:00:00Z']) {
    const calendar = upcomingEvents(at(when));
    assert.equal(calendar.length, EVENTS.length);
    for (const entry of calendar) {
      assert.ok(entry.badgeId, `${entry.id} has no badge on ${when}`);
      assert.match(entry.badgeId, new RegExp(`^${entry.id}_\\d{4}$`));
    }
  }
});

test('the catalog marks a live event as available and the rest as upcoming', () => {
  const catalog = eventBadgeCatalog(at('2026-10-05T12:00:00Z'));
  const halloween = catalog.find((c) => c.id === 'halloween_2026');
  const christmas = catalog.find((c) => c.id === 'christmas_2026');

  assert.equal(halloween.type, 'event');
  assert.equal(halloween.live, true);
  assert.match(halloween.desc, /available now/);
  assert.equal(christmas.live, false);
  assert.ok(!/available now/.test(christmas.desc));
});

test('computeAutoBadges grants the seasonal badge and keeps everything else', async () => {
  // The only thing computeAutoBadges reaches the database for is the OG check,
  // so an account that is already an admin skips it entirely (see badges.js).
  const before = { id: 'u1', badges: [], role: 'admin', tier: 'free' };
  const granted = await computeAutoBadges(before, at('2026-10-10T12:00:00Z'));
  assert.ok(granted.includes('halloween_2026'), 'expected the Halloween badge');
  assert.ok(granted.includes('admin'), 'expected the automatic admin badge to stay');

  // Running it again on the next sign-in changes nothing.
  const again = await computeAutoBadges({ ...before, badges: granted }, at('2026-10-20T12:00:00Z'));
  assert.deepEqual(again.sort(), granted.sort());
});

test('a badge earned in October survives the window closing', async () => {
  const held = ['og', 'halloween_2026'];
  const after = await computeAutoBadges({ id: 'u1', badges: held, role: 'admin' }, at('2026-11-20T12:00:00Z'));
  assert.ok(after.includes('halloween_2026'), 'a past event badge must never be taken away');
});

/* ---------------------------------------------------------------------------
   The calendar and the art have to agree

   This is the seam that fails silently. The backend decides an id such as
   `halloween_2026`; the frontend resolves that id to a picture through its own
   event registry. Add an event here without a picture there (or rename one on
   either side) and nothing throws — profiles simply start wearing the fallback
   glyph, which reads as "the badge is broken" rather than as a missing file.
   So the two files are compared, and every picture is checked to exist.
   --------------------------------------------------------------------------- */

test('the frontend registers exactly the events the calendar can grant', () => {
  const source = fs.readFileSync(path.join(REPO, 'frontend/src/constants/badges.js'), 'utf8');
  const block = /const EVENT_BADGES = \{([\s\S]*?)\n\};/.exec(source);
  assert.ok(block, 'EVENT_BADGES not found in frontend/src/constants/badges.js');

  const registered = [...block[1].matchAll(/^\s*([a-z]+):\s*\{/gm)].map((m) => m[1]).sort();
  assert.deepEqual(registered, [...EVENT_IDS].sort());
});

test('every seasonal badge has a picture that ships', () => {
  const source = fs.readFileSync(path.join(REPO, 'frontend/src/constants/badges.js'), 'utf8');
  const files = [...source.matchAll(/events\/([a-z]+)\.svg/g)].map((m) => m[1]);

  for (const event of EVENT_IDS) {
    assert.ok(files.includes(event), `${event} has no art registered`);
    assert.ok(
      fs.existsSync(path.join(REPO, 'frontend/public/badges/events', `${event}.svg`)),
      `frontend/public/badges/events/${event}.svg is missing`
    );
  }
});
