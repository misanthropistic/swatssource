// Run with: node --test backend/templates.access.test.js
//
// Every template carries a tag: **Free** or **Premium**, read from what the
// template actually asks you to wear rather than from who wrote it. A free
// account can browse a Premium template and see exactly what it does, and cannot
// apply it — so the tag has to be right, because it is the thing the upsell
// hangs on.
//
// The tag is derived, never stored: nothing to migrate, and a font or a layout
// that changes tier retags the templates that use it. The two mirrored lists
// that decide it (the free fonts and the free player styles) are pinned to the
// frontend catalogs below, so a font moving between tiers cannot silently
// retag every template that uses it — which is the drift this whole file exists
// to catch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { templateTier, FREE_FONTS, FREE_TRACK_STYLES } from './routes/templates.js';

const frontend = (...parts) => fs.readFileSync(path.join(import.meta.dirname, '..', 'frontend', 'src', ...parts), 'utf8');

// A plain theme: a free layout, a free font, a colour. Nothing to upgrade for.
const FREE = {
  layout: 'minimal',
  theme_color: '#FF2693',
  accent_color: '#FFB8DB',
  display_font: 'Unbounded',
  name_font: 'Inter',
  bio_font: 'Inter',
  card_style: 'classic',
  card_radius: 24,
  track_style: 'compact',
  bio: 'hello',
};

test('a theme of free choices is tagged free', () => {
  assert.equal(templateTier(FREE), 'free');
  assert.equal(templateTier({}), 'free');
  assert.equal(templateTier(null), 'free');
  assert.equal(templateTier('not an object'), 'free');
  // The free player styles, spelled out and left out alike.
  for (const style of FREE_TRACK_STYLES) {
    assert.equal(templateTier({ ...FREE, track_style: style }), 'free');
  }
});

test('a premium layout makes the template premium', () => {
  assert.equal(templateTier({ ...FREE, layout: 'slideshow' }), 'premium');
  // Every other layout is free, so the tag follows the layout registry.
  for (const layout of ['minimal', 'floating', 'banner']) {
    assert.equal(templateTier({ ...FREE, layout }), 'free');
  }
});

test('any effect on a template makes it premium, whichever field it rides in', () => {
  // Every effect, overlay, background and cursor in the store is premium, so a
  // template that wears one cannot be applied by a free account.
  const fields = [
    'name_effect', 'bio_effect', 'avatar_effect', 'overlay',
    'background_effect', 'cursor_effect', 'crosshair_image',
    'crosshair_scale', 'crosshair_x', 'crosshair_y',
    'custom_css', 'custom_html',
  ];
  for (const field of fields) {
    assert.equal(templateTier({ ...FREE, [field]: 'something' }), 'premium', `${field} is not premium`);
    // Empty or absent means not worn, so it says nothing about the tag.
    assert.equal(templateTier({ ...FREE, [field]: '' }), 'free');
    assert.equal(templateTier({ ...FREE, [field]: '   ' }), 'free');
    assert.equal(templateTier({ ...FREE, [field]: null }), 'free');
  }
});

test('a premium font or player style makes the template premium', () => {
  assert.equal(templateTier({ ...FREE, display_font: 'Clash Display' }), 'premium');
  assert.equal(templateTier({ ...FREE, bio_font: 'Melodrama' }), 'premium');
  assert.equal(templateTier({ ...FREE, track_style: 'wide' }), 'premium');
  assert.equal(templateTier({ ...FREE, track_style: 'vinyl' }), 'premium');
});

test('the free font list is the frontend catalog, name for name', () => {
  const source = frontend('constants', 'fonts.js');
  const listed = [...source.matchAll(/\{\s*name:\s*"([^"]+)"[^}]*?free:\s*true/g)].map((m) => m[1]);

  assert.ok(listed.length > 10, 'the font catalog moved or changed shape');
  assert.deepEqual(
    [...new Set(listed)].sort(),
    [...new Set(FREE_FONTS)].sort(),
    'the backend free-font list no longer matches the editor',
  );
});

test('the free player styles are the frontend catalog, id for id', () => {
  const source = frontend('constants', 'effects.js');
  const block = /TRACK_STYLES = \[([\s\S]*?)\n\];/.exec(source);
  assert.ok(block, 'TRACK_STYLES moved or changed shape');

  const free = [...block[1].matchAll(/id:\s*"([a-z0-9_-]*)",\s*label:[^}]*?premium:\s*false/g)].map((m) => m[1]);
  assert.ok(free.length >= 3, 'no free player styles found');

  assert.deepEqual(
    [...new Set(['', ...free])].sort(),
    [...new Set(FREE_TRACK_STYLES)].sort(),
    'the backend free-player-style list no longer matches the editor',
  );
});
