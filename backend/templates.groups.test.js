// Run with: node --test backend/templates.groups.test.js
//
// Applying a template used to copy the whole profile blob, so someone else's
// avatar, audio and Discord tags landed on your page whether you wanted them or
// not. These pin what each choice takes and, more importantly, what it leaves
// alone — a "keep my own profile picture" switch that quietly copied the avatar
// anyway would be worse than not offering it.
//
// They also pin the two things a template never carries at all: your LINKS and
// your WIDGETS. A template is a look, not a page's furniture, so applying one
// must never replace the links and cards you built yourself — not even when the
// caller asks for them by name.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterTemplateConfig,
  groupForProfileKey,
  stripNeverCopied,
  TEMPLATE_GROUPS,
  ALL_PROFILE_GROUPS,
  TEMPLATE_NEVER_COPIED,
} from './routes/templates.js';

const CONFIG = {
  avatar_url: 'https://cdn.example/stranger.png',
  avatar_decoration: 'frame-7',
  bio: 'made by someone else',
  display_name: 'Stranger',
  theme_color: '#FF2693',
  accent_color: '#FFB8DB',
  name_font: 'Unbounded',
  card_style: 'glass',
  card_radius: 24,
  background_url: 'https://cdn.example/bg.png',
  background_effect: 'rain',
  bg_opacity: 60,
  banner_url: 'https://cdn.example/banner.png',
  name_effect: 'sparkle',
  cursor_effect: 'glow',
  overlay: 'sparkles',
  custom_css: '.x { color: red }',
  audio_url: 'https://cdn.example/song.mp3',
  audio_controls: false,
  tracks: [{ title: 'one' }],
  links: [{ label: 'site' }],
  widgets: [{ type: 'roblox' }],
  // A field nobody has grouped yet.
  something_new: 'future',
};

const allOn = () => Object.fromEntries(TEMPLATE_GROUPS.map((g) => [g, true]));
const withoutEvery = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

test('a profile key lands in a group that exists', () => {
  for (const key of Object.keys(CONFIG)) {
    assert.ok(ALL_PROFILE_GROUPS.includes(groupForProfileKey(key)), `${key} has no group`);
  }
  assert.equal(groupForProfileKey('avatar_url'), 'avatar');
  assert.equal(groupForProfileKey('tracks'), 'tracks');
  assert.equal(groupForProfileKey('theme_color'), 'theme');
  assert.equal(groupForProfileKey('unknown_key_we_added_later'), 'theme');
});

test('links and widgets are never offered, and never copied', () => {
  // Not a switch the dashboard can show: they are the visitor's own.
  for (const group of TEMPLATE_NEVER_COPIED) {
    assert.equal(TEMPLATE_GROUPS.includes(group), false, `${group} is still offered`);
  }

  // Asking for them by name changes nothing…
  const asked = filterTemplateConfig(CONFIG, { ...allOn(), links: true, widgets: true });
  assert.equal('links' in asked, false);
  assert.equal('widgets' in asked, false);

  // …and neither does the publish-side strip, which is the other way they used
  // to reach a template: an older row saved before this existed.
  const stored = stripNeverCopied(CONFIG);
  assert.equal('links' in stored, false);
  assert.equal('widgets' in stored, false);
  assert.equal(stored.theme_color, '#FF2693');
});

test('selecting everything copies everything else (the one-click Apply button)', () => {
  const expected = withoutEvery(CONFIG, ['links', 'widgets']);
  assert.deepEqual(filterTemplateConfig(CONFIG, allOn()), expected);
  // No `include` at all is the same thing, which is what the plain button sends.
  assert.deepEqual(filterTemplateConfig(CONFIG), expected);
  assert.deepEqual(filterTemplateConfig(CONFIG, {}), expected);
});

test('switching a part off keeps the profile it was switched off on', () => {
  const kept = filterTemplateConfig(CONFIG, { ...allOn(), avatar: false, audio: false, tracks: false });

  // The three things people actually want to keep are gone from the payload…
  assert.equal('avatar_url' in kept, false);
  assert.equal('avatar_decoration' in kept, false);
  assert.equal('audio_url' in kept, false);
  assert.equal('tracks' in kept, false);
  // …and the theme, which is the reason to apply a template, is untouched.
  assert.equal(kept.theme_color, '#FF2693');
  assert.equal(kept.card_style, 'glass');
  assert.equal(kept.background_url, 'https://cdn.example/bg.png');
});

test('the grouping matches what the dashboard offers', () => {
  const noAvatar = filterTemplateConfig(CONFIG, { ...allOn(), avatar: false });
  assert.equal('avatar_url' in noAvatar, false);
  assert.equal('bio' in noAvatar, true);

  const themeOnly = filterTemplateConfig(
    CONFIG,
    Object.fromEntries(TEMPLATE_GROUPS.map((g) => [g, g === 'theme'])),
  );
  assert.equal(themeOnly.theme_color, '#FF2693');
  assert.equal(themeOnly.card_radius, 24);
  // A field that matches no pattern rides with the theme, so a profile key added
  // later is not silently dropped from every template.
  assert.equal(themeOnly.something_new, 'future');
  assert.equal('bio' in themeOnly, false);
  assert.equal('avatar_url' in themeOnly, false);
});

test('a group the caller never mentioned is applied, not dropped', () => {
  // The dashboard always sends every group, but an older client that only knows
  // about one of them must not lose the rest.
  const kept = filterTemplateConfig(CONFIG, { avatar: false });
  assert.equal('avatar_url' in kept, false);
  assert.equal(kept.theme_color, '#FF2693');
  assert.equal(kept.something_new, 'future');
});

test('nothing selected and a broken config are both safe', () => {
  const none = filterTemplateConfig(CONFIG, Object.fromEntries(TEMPLATE_GROUPS.map((g) => [g, false])));
  // Ungrouped keys ride with `theme`, so switching theme off switches them off.
  assert.deepEqual(none, {});
  assert.deepEqual(filterTemplateConfig(null, allOn()), {});
  assert.deepEqual(filterTemplateConfig(undefined), {});
  assert.deepEqual(filterTemplateConfig('not an object', allOn()), {});
  // A profile with a prototype-polluting key is not special-cased away.
  assert.deepEqual(filterTemplateConfig({ ok: 1 }, { nothing: false }), { ok: 1 });
});
