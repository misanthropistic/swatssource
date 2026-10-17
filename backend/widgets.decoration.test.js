// Run with: node --test backend/widgets.decoration.test.js
//
// A Discord avatar decoration is read, never invented: the account's own
// `avatar_decoration_data.asset` becomes a CDN URL, and nothing is returned for
// an account wearing none. Animated presets are APNGs served from the same `.png`
// URL — the `.apng` extension is not a thing on that route (the CDN answers 400),
// so the helper must not try to request one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { discordDecoration } from './routes/widgets.js';

test('turns a decoration asset into the CDN URL Discord serves', () => {
  const deco = discordDecoration({ asset: 'a_fed43ab12698df65902ba06727e20c0e', sku_id: '1' });

  assert.equal(deco.url, 'https://cdn.discordapp.com/avatar-decoration-presets/a_fed43ab12698df65902ba06727e20c0e.png');
  assert.equal(deco.asset, 'a_fed43ab12698df65902ba06727e20c0e');
  // The `a_` prefix is how an animated preset announces itself, and the CDN's
  // `.png` URL is the APNG for exactly those assets.
  assert.equal(deco.animated, true);
});

test('a static preset is not called animated', () => {
  const deco = discordDecoration({ asset: 'fed43ab12698df65902ba06727e20c0e' });

  assert.equal(deco.animated, false);
});

test('reads the older bare decoration string too', () => {
  assert.equal(discordDecoration('a_0123456789').animated, true);
});

test('returns nothing when the account wears no decoration', () => {
  // A missing field, a null, and an empty asset all mean "no decoration" — not a
  // broken image URL the card would have to render.
  assert.equal(discordDecoration(undefined), null);
  assert.equal(discordDecoration(null), null);
  assert.equal(discordDecoration({ asset: null }), null);
  assert.equal(discordDecoration({ asset: '   ' }), null);
});
