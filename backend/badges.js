import { query } from './db.js';
import { earnedEventBadges, EVENTS } from './eventBadges.js';
import { loadBotSettings } from './discordBot.js';

export const BADGE_CATALOG = [
  { id: 'og', name: 'OG', desc: 'First 10 users on swats.bio', type: 'auto' },
  { id: 'verified', name: 'Verified', desc: 'Officially verified by swats.bio', type: 'mod' },
  { id: 'bug_hunter', name: 'Bug Hunter', desc: 'Found and reported security/functional bugs', type: 'mod' },
  { id: 'team', name: 'Team', desc: 'Core swats.bio team member', type: 'mod' },
  { id: 'owner', name: 'Owner', desc: 'Platform creator and owner', type: 'auto' },
  { id: 'admin', name: 'Admin', desc: 'Platform administrator', type: 'auto' },
  { id: 'media', name: 'Media', desc: 'Content creator / partner media', type: 'mod' },
  { id: 'featured', name: 'Featured', desc: 'Showcased on landing page', type: 'mod' },
  { id: 'booster', name: 'Booster', desc: 'Active Discord server booster', type: 'auto' },
  { id: 'premium', name: 'Premium', desc: 'Supporter with unlocked premium perks', type: 'auto' },
  { id: 'donater', name: 'Donater', desc: 'Contributed to platform development fund', type: 'auto' },
  { id: 'partner', name: 'Partner', desc: 'Official platform partner', type: 'mod' },
];

/* Badges that something OTHER than the account itself may hand out: an admin
   editing a user, an invite code that carries badges, a Discord role the bot
   panel wired. `owner` and `admin` are deliberately absent — those say "this
   account is staff", and nothing that a code or a Discord role can carry may
   claim them. */
export const STAFF_GRANTABLE_BADGES = [
  'og', 'verified', 'bug_hunter', 'team', 'media', 'featured', 'partner', 'donater',
];

/* Whatever a form posted, the only grants that survive are catalog ids, minus
   the two that mean "staff". Returns a de-duplicated, ordered list so two
   identical saves write identical rows. */
export function sanitizeBadgeGrants(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw ?? '').trim();
    if (!STAFF_GRANTABLE_BADGES.includes(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/* Which badge a Discord role mapping stands for.

   A custom mapping in the bot panel carries a human label ("Media", "Bug
   Hunter", …) and a Discord role id. When that label names a badge in the
   catalog, holding the role grants the badge — which is what makes "the OG
   role is the OG badge" work for every mapping the admin adds, not just the
   two wired slots. Matching is by id (`bug_hunter`), by label with spaces
   (`Bug Hunter`) or by name (`OG`), case-insensitively. */
export function badgeForRoleLabel(label) {
  const raw = String(label ?? '').trim().toLowerCase();
  if (!raw) return null;
  const slug = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  // "OG role", "OG Role " and "OG badge" all describe the OG badge: an admin
  // naming a mapping after the Discord role it wires should not have to match
  // the catalog's own name exactly.
  const bare = slug.replace(/_(role|badge)$/, '');
  const match = BADGE_CATALOG.find(
    (b) => b.id === raw || b.id === slug || b.id === bare || String(b.name).toLowerCase() === raw
  );
  return match && !['owner', 'admin'].includes(match.id) ? match.id : null;
}

/* Persist the badges an account earns from the Discord roles it holds right
   now.

   `extraRoleIds` is what the bot just assigned (see applyAuthRoles): the PUT is
   idempotent, so the list is every wired role the member is entitled to, even
   when the member lookup that fills `discord.guild_roles` failed. Without it a
   member whose role was granted in Discord before this account linked would
   never pick the badge up. Returns the saved badge list. */
export async function syncRoleBadges(userRow, extraRoleIds = []) {
  if (!userRow?.id) return userRow?.badges || [];
  const roles = [...new Set([
    ...((userRow.discord && userRow.discord.guild_roles) || []),
    ...(Array.isArray(extraRoleIds) ? extraRoleIds : []),
  ].map(String).filter(Boolean))];

  const discord = { ...(userRow.discord || {}), guild_roles: roles };
  const badges = await computeAutoBadges({ ...userRow, discord });
  const { rows } = await query(
    'UPDATE users SET badges = $1 WHERE id = $2 RETURNING *',
    [badges, userRow.id],
  );
  return rows[0]?.badges || badges;
}

/* Every badge the wired Discord roles entitle this account to.

   Pure on purpose (no database, no Discord): the caller hands in the bot
   panel's saved settings and the role ids the member holds, and gets back the
   badge ids. `verified_role_id` and `og_role_id` are the two named slots;
   every custom mapping is resolved through its own label, so an admin can wire
   "Media" once and every member with that role wears the Media badge. */
export function badgesFromGuildRoles(settings = {}, guildRoles = []) {
  const held = new Set((Array.isArray(guildRoles) ? guildRoles : []).map(String).filter(Boolean));
  const out = new Set();
  if (!held.size) return [];

  if (settings.verified_role_id && held.has(String(settings.verified_role_id))) out.add('verified');
  if (settings.og_role_id && held.has(String(settings.og_role_id))) out.add('og');

  for (const mapping of Array.isArray(settings.custom_roles) ? settings.custom_roles : []) {
    if (!mapping?.role_id) continue;
    if (!held.has(String(mapping.role_id))) continue;
    const badge = badgeForRoleLabel(mapping.label);
    if (badge) out.add(badge);
  }

  return [...out];
}

/* The badges an account has earned, given what it currently holds.

   Takes `now` so a test can walk the calendar instead of waiting for October,
   and so every caller inside one request agrees on the date. */
export async function computeAutoBadges(user, now = new Date()) {
  const currentBadges = new Set(user.badges || []);

  // OG check: check if user is in first 10 created
  try {
    const ogCheck = await query(`
      SELECT id FROM users ORDER BY created_at ASC LIMIT 10
    `);
    const ogIds = new Set(ogCheck.rows.map(r => r.id));
    if (ogIds.has(user.id)) {
      currentBadges.add('og');
    }
  } catch (e) {
    console.error('OG badge check error:', e);
  }

  // Owner & Admin
  if (user.is_owner) currentBadges.add('owner');
  if (user.role === 'admin') currentBadges.add('admin');

  // Premium
  if (user.tier === 'premium' || user.tier === 'admin') {
    currentBadges.add('premium');
  } else {
    currentBadges.delete('premium');
  }

  // Booster
  if (user.discord && user.discord.booster) {
    currentBadges.add('booster');
  }

  /* Discord role → badge sync. When the bot panel wires the guild's Verified
     and OG roles, HOLDING that role in our Discord grants the matching badge
     — the direction the owner asked for ("OG discord role = OG badge").
     The member's role ids ride in discord.guild_roles, recorded at sign-in
     and on every roster refresh. Wired-but-absent role ids simply never
     match, so an unconfigured bot cannot grant anything here. */
  const guildRoles = ((user.discord && user.discord.guild_roles) || []).map(String);
  if (guildRoles.length) {
    try {
      const bot = await loadBotSettings();
      for (const id of badgesFromGuildRoles(bot, guildRoles)) currentBadges.add(id);
    } catch (e) {
      console.error('Discord role badge sync error:', e);
    }
  }

  // Donations: the badge belongs to anyone who has given anything at all, so
  // it is computed from the running total rather than hand-pin it on every
  // donor one at a time.
  if (Number(user.donated_cents) > 0) currentBadges.add('donater');

  /* Seasonal badges are earned by being here while the window is open, which
     makes signing in the trigger. Nothing is ever removed here: the calendar
     decides when a badge can be granted, not when it expires, so a Halloween
     badge from 2026 is still worn in 2030. */
  for (const earned of earnedEventBadges(now, Array.from(currentBadges))) {
    currentBadges.add(earned.id);
  }

  return Array.from(currentBadges);
}

export { EVENTS };
