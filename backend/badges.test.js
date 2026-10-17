// Run with: node --test backend/badges.test.js
//
// The three pure pieces behind "a Discord role grants a badge" and "an invite
// code carries badges". They decide what a code or a role mapping can hand out,
// so the boundaries (no owner/admin, no duplicates, no invented ids) are the
// point of the file.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STAFF_GRANTABLE_BADGES,
  sanitizeBadgeGrants,
  badgeForRoleLabel,
  badgesFromGuildRoles,
} from './badges.js';

test('a grant list keeps only catalog badges and never staff ones', () => {
  assert.deepEqual(sanitizeBadgeGrants(['og', 'media']), ['og', 'media']);
  // owner/admin say "this account is staff"; nothing a code carries may claim
  // them, so they are dropped rather than saved.
  assert.deepEqual(sanitizeBadgeGrants(['owner', 'admin', 'verified']), ['verified']);
  // Unknown ids, blanks and duplicates are dropped; the order of the catalog
  // input is preserved so two identical saves write identical rows.
  assert.deepEqual(sanitizeBadgeGrants(['og', 'nope', '', null, 'og']), ['og']);
  assert.deepEqual(sanitizeBadgeGrants('og'), []);
  assert.deepEqual(sanitizeBadgeGrants(null), []);
  assert.ok(STAFF_GRANTABLE_BADGES.includes('og'));
  assert.ok(!STAFF_GRANTABLE_BADGES.includes('owner'));
});

test('a role mapping resolves to a badge by id, name or a role/badge suffix', () => {
  assert.equal(badgeForRoleLabel('og'), 'og');
  assert.equal(badgeForRoleLabel('OG'), 'og');
  assert.equal(badgeForRoleLabel('bug_hunter'), 'bug_hunter');
  assert.equal(badgeForRoleLabel('Bug Hunter'), 'bug_hunter');
  // Admins name mappings after the Discord role they wire, which is not always
  // the badge's own spelling.
  assert.equal(badgeForRoleLabel('OG role'), 'og');
  assert.equal(badgeForRoleLabel('Media badge'), 'media');
  assert.equal(badgeForRoleLabel('Verified Role'), 'verified');
  assert.equal(badgeForRoleLabel('designer'), null);
  assert.equal(badgeForRoleLabel(''), null);
  // Staff ids are not reachable through a mapping either.
  assert.equal(badgeForRoleLabel('owner'), null);
  assert.equal(badgeForRoleLabel('admin'), null);
});

test('the wired and mapped guild roles decide the badges', () => {
  const settings = {
    verified_role_id: '100',
    og_role_id: '200',
    custom_roles: [
      { role_id: '300', label: 'Media', condition: 'always' },
      { role_id: '400', label: 'Owner', condition: 'always' },
    ],
  };

  assert.deepEqual(badgesFromGuildRoles(settings, ['100', '200']).sort(), ['og', 'verified']);
  assert.deepEqual(badgesFromGuildRoles(settings, ['100', '300']).sort(), ['media', 'verified']);
  // A role nobody wired grants nothing, and a mapping labelled with a staff
  // badge stays inert even when the member holds the role.
  assert.deepEqual(badgesFromGuildRoles(settings, ['999']), []);
  assert.deepEqual(badgesFromGuildRoles(settings, ['400']), []);
  // No roles at all (an unlinked member) is an empty list, not the whole catalog.
  assert.deepEqual(badgesFromGuildRoles(settings, []), []);
  assert.deepEqual(badgesFromGuildRoles({}, ['100']), []);
});

test('role ids compare as strings, whatever the API returned', () => {
  const settings = { verified_role_id: '100', custom_roles: [] };
  assert.deepEqual(badgesFromGuildRoles(settings, [100, null, undefined]), ['verified']);
});
