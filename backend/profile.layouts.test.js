// Run with: node --test backend/profile.layouts.test.js
//
// The card layouts live in the frontend registry, and the API enforces them:
// a deleted layout is rewritten to the default on save, and a premium layout is
// rewritten for a free account. Those two lists have to agree with the frontend
// or the API quietly stores a layout nobody can render. This reads both files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS as API } from './routes/profile.js';
import { LAYOUTS, LAYOUT_IDS, DEFAULT_LAYOUT } from '../frontend/src/constants/layouts.js';

test('the API default layout exists in the card layout registry', () => {
  assert.equal(API.default, DEFAULT_LAYOUT);
  assert.ok(LAYOUT_IDS.includes(API.default), `${API.default} is not a real layout`);
});

test('every layout the API calls premium is premium in the registry', () => {
  for (const id of API.premium) {
    const layout = LAYOUTS.find((l) => l.id === id);
    assert.ok(layout, `${id} is marked premium in the API but is not a layout`);
    assert.equal(layout.premium, true, `${id} is premium in the API but free in the registry`);
  }
  // ...and the other way round: a premium layout the API forgets would be saved
  // for free accounts and then render as something they do not own.
  for (const layout of LAYOUTS.filter((l) => l.premium)) {
    assert.ok(API.premium.includes(layout.id), `${layout.id} is premium in the registry but not in the API`);
  }
});

test('no removed layout is still in the registry', () => {
  for (const id of API.removed) {
    assert.ok(!LAYOUT_IDS.includes(id), `${id} is both removed and offered`);
  }
});

test('the registry only offers the four layouts the site is built around', () => {
  assert.deepEqual(LAYOUT_IDS, ['minimal', 'floating', 'banner', 'slideshow']);
});
