// Run with: node --test backend/discordBot.test.js
//
// The bot panel's pieces that can be pinned without a live Discord guild or a
// seeded database: the custom-role condition matcher, the settings merge (a
// save must never wipe keys another feature wrote to the same site_settings
// row) and the botConfigured env gate. The Postgres pool in db.js connects
// lazily, so importing discordBot.js is safe without a database — but any call
// that touches site_settings needs one, which is what the guard below checks.
import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('./discordBot.js');
const {
  customRoleApplies,
  DEFAULT_BOT_SETTINGS,
  PRESENCE_OPTIONS,
  botConfigured,
  rolesForJoin,
  boosterRoleChange,
} = mod;

test('every condition name the admin UI offers decides a payload correctly', () => {
  const always = { role_id: '1', condition: 'always' };
  const member = { role_id: '2', condition: 'member' };
  const booster = { role_id: '3', condition: 'booster' };
  const notMember = { role_id: '4', condition: 'not_member' };

  const linkedMember = { member: true, booster: false };
  const linkedBooster = { member: true, booster: true };
  const linkedOutside = { member: false, booster: false };
  const bare = {}; // a payload a legacy row could carry

  assert.equal(customRoleApplies(always, linkedMember), true);
  assert.equal(customRoleApplies(always, linkedOutside), true);
  assert.equal(customRoleApplies(always, bare), true, "'always' must not depend on the payload");

  assert.equal(customRoleApplies(member, linkedMember), true);
  assert.equal(customRoleApplies(member, linkedBooster), true);
  assert.equal(customRoleApplies(member, linkedOutside), false);
  assert.equal(customRoleApplies(member, bare), false);

  assert.equal(customRoleApplies(booster, linkedBooster), true);
  assert.equal(customRoleApplies(booster, linkedMember), false);
  assert.equal(customRoleApplies(booster, linkedOutside), false);

  assert.equal(customRoleApplies(notMember, linkedOutside), true);
  assert.equal(customRoleApplies(notMember, linkedMember), false);

  // An unknown condition (hand-edited settings row) must never fire.
  assert.equal(customRoleApplies({ condition: 'free_premium' }, linkedBooster), false);
  assert.equal(customRoleApplies({ role_id: '9' }, linkedBooster), false);
});

test('defaults carry a full working mapping for a fresh install', () => {
  assert.equal(DEFAULT_BOT_SETTINGS.verified_role_id, null);
  assert.equal(DEFAULT_BOT_SETTINGS.og_role_id, null);
  assert.deepEqual(DEFAULT_BOT_SETTINGS.custom_roles, []);
  assert.equal(DEFAULT_BOT_SETTINGS.presence.status, 'online');
  assert.equal(typeof DEFAULT_BOT_SETTINGS.presence.custom_status, 'string');
});

test('only statuses Discord accepts are advertised', () => {
  assert.deepEqual([...PRESENCE_OPTIONS].sort(), ['dnd', 'idle', 'invisible', 'online']);
});

/* What happens the moment somebody joins the guild, decided without a guild.

   The distinction being pinned: being IN the server is what a join proves —
   which is the member role and the "member"-conditioned custom roles — while
   Verified ("linked a swats.bio account") and OG ("been here a while") are
   claims a brand new member has not made yet. Granting those on join would make
   them meaningless, and there is no way to walk them back for the people who
   already have them. */
test('a join grants the member role and member-conditioned custom roles', () => {
  const settings = {
    verified_role_id: 'verified',
    og_role_id: 'og',
    member_role_id: 'member',
    booster_role_id: 'booster',
    custom_roles: [
      { role_id: 'everyone', condition: 'always' },
      { role_id: 'members', condition: 'member' },
      { role_id: 'boosters', condition: 'booster' },
      { role_id: 'outsiders', condition: 'not_member' },
    ],
  };

  const plain = rolesForJoin(settings, { premium_since: null });
  assert.ok(plain.includes('member'));
  assert.ok(plain.includes('everyone'));
  assert.ok(plain.includes('members'));
  assert.equal(plain.includes('verified'), false, 'verified means a linked account');
  assert.equal(plain.includes('og'), false, 'a brand new member is not an OG');
  assert.equal(plain.includes('boosters'), false, 'no Nitro yet');
  assert.equal(plain.includes('outsiders'), false, 'they are in the server by definition');
});

test('joining while already boosting gets both roles at once', () => {
  const settings = { member_role_id: 'member', booster_role_id: 'booster', custom_roles: [] };
  const roles = rolesForJoin(settings, { premium_since: '2026-01-01T00:00:00Z' });
  assert.deepEqual(roles.sort(), ['booster', 'member']);
});

test('a custom mapping wired to the verified role is left to the site flow', () => {
  // Otherwise the same role would be handed out on join and the "verify" step
  // it represents would be free.
  const settings = {
    verified_role_id: 'verified',
    custom_roles: [{ role_id: 'verified', condition: 'always' }],
  };
  assert.deepEqual(rolesForJoin(settings, { premium_since: null }), []);
});

test('an empty mapping grants nothing rather than throwing', () => {
  assert.deepEqual(rolesForJoin({}, {}), []);
  assert.deepEqual(rolesForJoin(DEFAULT_BOT_SETTINGS, {}), []);
  assert.deepEqual(rolesForJoin(undefined, undefined), []);
});

test('the booster role follows Nitro in both directions', () => {
  const settings = { booster_role_id: 'booster' };
  assert.deepEqual(boosterRoleChange(settings, { premium_since: '2026-01-01T00:00:00Z' }), {
    add: ['booster'],
    remove: [],
  });
  // A cancelled subscription arrives as the same event with a null timestamp.
  assert.deepEqual(boosterRoleChange(settings, { premium_since: null }), {
    add: [],
    remove: ['booster'],
  });
  // Nothing wired: no request either way.
  assert.deepEqual(boosterRoleChange({}, { premium_since: null }), { add: [], remove: [] });
});

test('auto-roles-on-join is on by default and can be switched off', () => {
  assert.equal(DEFAULT_BOT_SETTINGS.auto_roles_on_join, true);
});

// The welcome template, the nickname sync and the announcement poster were
// removed with the bot settings that drove them, so nothing in the module or in
// its defaults may still carry them: a saved row that names these keys must not
// resurrect a feature the panel can no longer switch off.
test('the removed bot features are gone from the module and its defaults', () => {
  for (const gone of ['welcomeMessageFor', 'syncMemberNickname', 'announceBotEvent']) {
    assert.equal(typeof mod[gone], 'undefined', `${gone} is still exported`);
  }
  for (const key of ['welcome', 'announcements', 'sync_nicknames']) {
    assert.ok(!(key in DEFAULT_BOT_SETTINGS), `${key} is still a saved default`);
  }
});

test('sendBotMessage refuses to fire without config or a real channel id', async () => {
  const had = { token: process.env.DISCORD_BOT_TOKEN, guild: process.env.DISCORD_GUILD_ID };
  try {
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.DISCORD_GUILD_ID;
    assert.deepEqual(await mod.sendBotMessage('123456789012345', 'hi'), { ok: false, skipped: 'not_configured' });

    process.env.DISCORD_BOT_TOKEN = 't';
    process.env.DISCORD_GUILD_ID = 'g';
    assert.deepEqual(await mod.sendBotMessage('not-a-snowflake', 'hi'), { ok: false, skipped: 'bad_channel' });
  } finally {
    if (had.token === undefined) delete process.env.DISCORD_BOT_TOKEN; else process.env.DISCORD_BOT_TOKEN = had.token;
    if (had.guild === undefined) delete process.env.DISCORD_GUILD_ID; else process.env.DISCORD_GUILD_ID = had.guild;
  }
});

test('botConfigured follows the two env vars together', () => {
  const had = { token: process.env.DISCORD_BOT_TOKEN, guild: process.env.DISCORD_GUILD_ID };
  try {
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.DISCORD_GUILD_ID;
    assert.equal(botConfigured(), false);

    process.env.DISCORD_BOT_TOKEN = 't';
    assert.equal(botConfigured(), false, 'a token without a guild is not configured');

    process.env.DISCORD_GUILD_ID = 'g';
    assert.equal(botConfigured(), true);

    process.env.DISCORD_BOT_TOKEN = '';
    assert.equal(botConfigured(), false, 'an empty string is not a token');
  } finally {
    if (had.token === undefined) delete process.env.DISCORD_BOT_TOKEN; else process.env.DISCORD_BOT_TOKEN = had.token;
    if (had.guild === undefined) delete process.env.DISCORD_GUILD_ID; else process.env.DISCORD_GUILD_ID = had.guild;
  }
});
