// Run with: node --test backend/widgets.memberList.test.js
//
// The online strip on a Discord server card only ever shows real faces. Discord
// hands the widget endpoint anonymised member ids ("0", "1", ...) and puts the
// picture in its own `avatar_url` proxy, so mapping the id through the profile
// avatar path produced one of Discord's stock avatars — a stranger's face
// standing in for a member of the server. These pin the rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { discordMemberList } from './routes/widgets.js';

const widgetMember = (extra = {}) => ({
  id: '0',
  username: 'someone',
  discriminator: '0000',
  avatar: null,
  avatar_url: null,
  status: 'online',
  ...extra,
});

test('uses the widget avatar proxy when Discord provides one', () => {
  const url = 'https://cdn.discordapp.com/widget-avatars/abc/def.png';
  const [member] = discordMemberList([widgetMember({ avatar_url: url })]);

  assert.equal(member.avatar, url);
  assert.equal(member.username, 'someone');
  assert.equal(member.status, 'online');
});

test('falls back to the avatar hash when a member has one', () => {
  const [member] = discordMemberList([widgetMember({ id: '4242', avatar: 'hash' })]);

  assert.equal(member.avatar, 'https://cdn.discordapp.com/avatars/4242/hash.png?size=256');
});

test('never invents an avatar for a member who has none', () => {
  const [member] = discordMemberList([widgetMember()]);

  // Not a stock embed avatar, and not an empty string the card would render as
  // a broken image.
  assert.equal(member.avatar, null);
});

test('caps the list and tolerates a missing one', () => {
  const many = Array.from({ length: 40 }, (_, i) => widgetMember({ id: String(i), avatar_url: `https://x/${i}.png` }));

  assert.equal(discordMemberList(many).length, 24);
  assert.deepEqual(discordMemberList(undefined), []);
  assert.deepEqual(discordMemberList(null), []);
});
