import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { query } from '../db.js';
import { requireAdmin, formatUser } from '../auth.js';
import { computeAutoBadges, sanitizeBadgeGrants, syncRoleBadges } from '../badges.js';
import { AUDIENCES, resolveRecipients, countAudience, sendNotifications } from '../notifications.js';
import { loadRewardSettings, sanitizeMilestones } from '../rewards.js';
// Every admin mutation below records one row here. The trail is the answer to
// "who changed this, to what, and when" — see auditLog.js for the rules.
import { logAudit, auditFilters, auditWhere, formatAuditEvent } from '../auditLog.js';
import {
  loadBotSettings,
  saveBotSettings,
  applyAuthRoles,
  addMemberRole,
  removeMemberRole,
  getGuildRoles,
  getBotIdentity,
  getGuildInfo,
  botPresenceStatus,
  botConfigured,
  DEFAULT_BOT_SETTINGS,
} from '../discordBot.js';
// The two devlog feeds. Shared with the public reader in routes/notifications.js
// so the writer and the reader can never disagree about what a channel is.
import { DEVLOG_CHANNELS } from './notifications.js';

const router = express.Router();

// Apply requireAdmin to all admin routes
router.use(requireAdmin);

// ========================
// 1. BOT MANAGER
// ========================
router.get('/bot/status', async (req, res) => {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    return res.json({
      configured: false,
      status: 'offline',
      bot_user: null,
      guild: null,
      member_count: 0,
      booster_count: 0,
    });
  }

  try {
    const botUser = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bot ${botToken}` },
    });
    const guildRes = await axios.get(`https://discord.com/api/guilds/${guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${botToken}` },
    });

    return res.json({
      configured: true,
      status: 'online',
      bot_user: botUser.data,
      guild: guildRes.data,
      member_count: guildRes.data.approximate_member_count || 1300,
      booster_count: guildRes.data.premium_subscription_count || 24,
    });
  } catch (err) {
    return res.json({
      configured: true,
      status: 'error',
      error: err.response?.data?.message || err.message,
    });
  }
});

router.post('/bot/sync-boosters', async (req, res) => {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    return res.status(400).json({ detail: 'Discord bot is not configured' });
  }

  try {
    const usersWithDiscord = await query("SELECT id, discord, badges FROM users WHERE discord->>'id' IS NOT NULL");
    let synced = 0;

    for (const u of usersWithDiscord.rows) {
      try {
        const discordId = u.discord.id;
        const memberRes = await axios.get(`https://discord.com/api/guilds/${guildId}/members/${discordId}`, {
          headers: { Authorization: `Bot ${botToken}` },
        });

        const isBooster = !!memberRes.data?.premium_since;
        const updatedDiscord = { ...u.discord, booster: isBooster, member: true };
        const updatedBadges = await computeAutoBadges({ ...u, discord: updatedDiscord });

        await query('UPDATE users SET discord = $1, badges = $2 WHERE id = $3', [
          JSON.stringify(updatedDiscord),
          updatedBadges,
          u.id,
        ]);
        synced++;
      } catch (e) {
        // Not a guild member or rate limited
      }
    }

    await logAudit({ req, action: 'bot.sync_boosters', targetType: 'discord_guild', detail: { synced } });
    return res.json({ ok: true, synced_count: synced });
  } catch (err) {
    console.error('Booster sync error:', err);
    return res.status(500).json({ detail: 'Failed to sync boosters' });
  }
});

// =======================
// 1b. BOT PANEL — role mapping, presence, per-member roles
// =======================

// Everything the panel needs in one GET: the saved mapping, the guild's role
// list for the dropdowns, the bot's identity and the live presence state.
// One request rather than four, because the panel opens as a block on the
// Users tab and each extra call is another spinner.
router.get('/bot/panel', async (req, res) => {
  try {
    const settings = await loadBotSettings();
    const response = {
      configured: botConfigured(),
      settings,
      presence: botPresenceStatus(),
      defaults: DEFAULT_BOT_SETTINGS,
    };

    if (!botConfigured()) {
      // No bot token/guild: the panel still renders so an admin can see what
      // would live here, but the dropdowns carry no roles to pick.
      response.roles = [];
      response.bot_user = null;
      response.guild = null;
      return res.json(response);
    }

    const [roles, botUser, guild] = await Promise.all([
      getGuildRoles().catch(() => []),
      getBotIdentity().catch(() => null),
      getGuildInfo().catch(() => null),
    ]);

    return res.json({
      ...response,
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,          // int — frontend renders as hex
        position: r.position,
        member_count: r.count || null,
      })),
      bot_user: botUser
        ? { id: botUser.id, username: botUser.username, avatar: botUser.avatar }
        : null,
      guild: guild ? { id: guild.id, name: guild.name /*, icon: guild.icon */ } : null,
    });
  } catch (err) {
    console.error('Bot panel error:', err);
    return res.status(500).json({ detail: 'Failed to load the bot panel' });
  }
});

// Save the mapping + presence. The shape is validated by hand rather than
// trusted: role ids must look like Discord snowflakes, custom entries must
// carry id + label, and presence values must be ones Discord accepts.
const SNOWFLAKE = /^\d{5,25}$/;
router.put('/bot/panel', async (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};

    for (const field of ['verified_role_id', 'og_role_id', 'member_role_id', 'booster_role_id']) {
      if (body[field] !== undefined) {
        const v = body[field];
        if (v !== null && (typeof v !== 'string' || !SNOWFLAKE.test(v))) {
          return res.status(400).json({ detail: `${field} is not a valid role id` });
        }
        patch[field] = v || null;
      }
    }

    if (body.custom_roles !== undefined) {
      if (!Array.isArray(body.custom_roles)) {
        return res.status(400).json({ detail: 'custom_roles must be a list' });
      }
      const custom = [];
      for (const entry of body.custom_roles) {
        const roleId = typeof entry?.role_id === 'string' ? entry.role_id : '';
        const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
        const condition = typeof entry?.condition === 'string' ? entry.condition : 'always';
        if (!label) return res.status(400).json({ detail: 'Each custom role needs a name' });
        if (!SNOWFLAKE.test(roleId)) return res.status(400).json({ detail: `Custom role "${label}" has an invalid role id` });
        if (!['always', 'member', 'booster', 'not_member'].includes(condition)) {
          return res.status(400).json({ detail: `Custom role "${label}" has an unknown condition` });
        }
        custom.push({ id: entry.id || crypto.randomUUID(), role_id: roleId, label: label.slice(0, 60), condition });
      }
      patch.custom_roles = custom;
    }

    if (body.auto_roles_on_join !== undefined) {
      if (typeof body.auto_roles_on_join !== 'boolean') {
        return res.status(400).json({ detail: 'auto_roles_on_join must be true or false' });
      }
      patch.auto_roles_on_join = body.auto_roles_on_join;
    }

    if (body.presence !== undefined) {
      const p = body.presence || {};
      if (!['online', 'idle', 'dnd', 'invisible'].includes(p.status)) {
        return res.status(400).json({ detail: 'presence.status must be online, idle, dnd or invisible' });
      }
      patch.presence = {
        status: p.status,
        custom_status: String(p.custom_status || '').slice(0, 128),
      };
    }

    // Nothing to change — an empty patch would just rewrite what is loaded.
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ detail: 'Nothing to save' });
    }

    const settings = await saveBotSettings(patch);

    /* Rewiring a role to a badge must reach the members who already hold it.
       Their stored guild_roles are what the badge sync reads, so a DB-only
       sweep is enough here — no Discord calls, no waiting on the next sign-in.
       Capped: a settings save is not the place to rewrite ten thousand rows. */
    let badgesSynced = 0;
    if (patch.custom_roles !== undefined || ['verified_role_id', 'og_role_id'].some((f) => patch[f] !== undefined)) {
      try {
        const { rows } = await query(
          "SELECT * FROM users WHERE discord->>'id' IS NOT NULL ORDER BY created_at DESC LIMIT 300",
        );
        for (const row of rows) {
          // eslint-disable-next-line no-await-in-loop -- one account at a time keeps the pool free.
          await syncRoleBadges(row, []);
          badgesSynced += 1;
        }
      } catch (err) {
        console.error('Bot settings badge sync error:', err.message);
      }
    }

    await logAudit({ req, action: 'bot.settings', targetType: 'settings', targetId: 'discord_bot', detail: { changed: Object.keys(patch), to: patch, badges_synced: badgesSynced } });
    return res.json({ ok: true, settings, presence: botPresenceStatus(), badges_synced: badgesSynced });
  } catch (err) {
    console.error('Bot panel save error:', err);
    return res.status(500).json({ detail: 'Failed to save bot settings' });
  }
});

// Apply the saved mapping to one member right now, without waiting for the
// member to re-link. The account's stored Discord payload decides OG/member
// roles, exactly as a fresh auth would.
router.post('/bot/apply-roles/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT discord FROM users WHERE id = $1', [req.params.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ detail: 'User not found' });
    if (!user.discord?.id) return res.status(400).json({ detail: 'This account has no Discord linked' });

    const result = await applyAuthRoles(user.discord.id, user.discord);
    // The roles just re-asserted are also the authority for the badge side of
    // the mapping: keeping the Discord role and losing the badge is the bug
    // this pairs with applyAuthRoles.
    const badges = await syncRoleBadges(user, result.applied || []);
    await logAudit({
      req, action: 'bot.roles.apply', targetType: 'user', targetId: req.params.id,
      detail: { discord_id: user.discord.id, applied: result.applied || [], badges },
    });
    return res.json({ ok: true, applied: result.applied, badges });
  } catch (err) {
    console.error('Apply roles error:', err);
    return res.status(500).json({ detail: 'Failed to apply roles' });
  }
});

// Apply the saved mapping to many members at once — the bulk action behind a
// selection in the roster.
//
// Each account is its own attempt: one member Discord refuses (role above the
// bot, left the guild) must not stop the other forty from being fixed, so the
// answer is a per-account report rather than one ok/failed flag.
router.post('/bot/apply-roles', async (req, res) => {
  const ids = Array.isArray(req.body?.user_ids) ? [...new Set(req.body.user_ids.map(String))].slice(0, 100) : [];
  if (!ids.length) return res.status(400).json({ detail: 'Select at least one account' });

  try {
    const { rows } = await query('SELECT id, username, discord FROM users WHERE id = ANY($1::uuid[])', [ids]);
    if (!rows.length) return res.status(404).json({ detail: 'None of those accounts exist' });

    const results = [];
    for (const user of rows) {
      if (!user.discord?.id) {
        results.push({ id: user.id, username: user.username, applied: [], skipped: 'no_discord' });
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop -- sequential on purpose: Discord
        // rate-limits per route, and a burst of parallel role writes earns a 429.
        const applied = await applyAuthRoles(user.discord.id, user.discord);
        // Same badge sync as the single-member route — the bulk action is the
        // repair sweep an owner runs when badges and roles drifted apart.
        // eslint-disable-next-line no-await-in-loop
        const badges = await syncRoleBadges(user, applied.applied || []);
        results.push({ id: user.id, username: user.username, applied: applied.applied || [], badges });
      } catch (err) {
        results.push({ id: user.id, username: user.username, error: err.response?.data?.message || err.message });
      }
    }

    const touched = results.filter((r) => (r.applied?.length || 0) > 0).length;
    await logAudit({
      req, action: 'bot.roles.apply_bulk', targetType: 'user', targetId: `${ids.length} accounts`,
      detail: { requested: ids, touched, results },
    });
    return res.json({ ok: true, results, touched });
  } catch (err) {
    console.error('Bulk role apply error:', err);
    return res.status(500).json({ detail: 'Failed to apply roles' });
  }
});

/* POST /api/admin/bot/sync-all — the "Sync all" button on the Users page.

   apply-roles and the badge sync are two halves of the same truth (who holds a
   role in Discord, and which badge that role means), and they drifted apart for
   exactly one reason: nothing re-read a member's Discord state after roles were
   handed out. A member whose OG role was granted months ago still had no OG
   badge, because their stored `guild_roles` came from a sign-in where the member
   lookup failed.

   So this walks every linked account, DOES re-read Discord for each one, applies
   the wired mapping, recomputes the badges from the union of stored and just-
   applied roles, and stores the fresh member/booster/roles payload — one pass
   that repairs roles and badges together instead of one account at a time.

   Deliberately sequential: Discord rate-limits role writes per guild, and a burst
   of parallel calls earns 429s that leave half the guild half-fixed. Each account
   is its own attempt, so one member Discord refuses (left the guild, role above
   the bot) never stops the others.

   Paged, because a synchronous pass over every linked account would outlive the
   request that asked for it: `limit` caps one call (default 100, max 300) and the
   answer carries `next_offset`, which the caller passes back to continue. Ordered
   by (created_at, id) so the pages do not overlap or skip a row — the whole point
   of the button is that nothing is left out.

   Works with the bot unconfigured too — the Discord half is skipped and the
   badges are recomputed from what is already stored. */
const SYNC_PAGE_DEFAULT = 100;
const SYNC_PAGE_MAX = 300;

router.post('/bot/sync-all', async (req, res) => {
  const rawLimit = parseInt(req.body?.limit, 10);
  const rawOffset = parseInt(req.body?.offset, 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), SYNC_PAGE_MAX) : SYNC_PAGE_DEFAULT;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const discordReady = !!(botToken && guildId);

  try {
    const totalRow = await query("SELECT COUNT(*)::int AS n FROM users WHERE discord->>'id' IS NOT NULL");
    const total = totalRow.rows[0]?.n || 0;
    const { rows } = await query(
      "SELECT * FROM users WHERE discord->>'id' IS NOT NULL ORDER BY created_at ASC, id ASC LIMIT $1 OFFSET $2",
      [limit, offset],
    );
    const targets = rows;
    const nextOffset = offset + targets.length;
    const remaining = Math.max(0, total - nextOffset);

    const results = [];
    let rolesApplied = 0;
    let badgesAdded = 0;
    let membersMissing = 0;

    for (const user of targets) {
      const before = new Set(user.badges || []);
      const row = { id: user.id, username: user.username, applied: [], badges_added: [] };

      try {
        // Fresh look at the member. 404 is an answer — "not in the guild" — and
        // is stored as such instead of leaving a stale `member: true` behind.
        let discord = { ...user.discord };
        if (discordReady) {
          try {
            // eslint-disable-next-line no-await-in-loop -- see the route comment.
            const member = await axios.get(
              `https://discord.com/api/guilds/${guildId}/members/${user.discord.id}`,
              { headers: { Authorization: `Bot ${botToken}` } },
            );
            discord = {
              ...discord,
              member: true,
              booster: !!member.data?.premium_since,
              guild_roles: member.data?.roles || [],
            };
            if (member.data?.user?.username) discord.username = member.data.user.username;
          } catch (memberErr) {
            if (memberErr.response?.status === 404) {
              membersMissing += 1;
              discord = { ...discord, member: false, booster: false, guild_roles: [] };
            } else {
              throw memberErr;
            }
          }
        }

        /* Nobody who left the guild gets a role written at them: Discord would
           answer 404 for every wired role and the log would fill up with
           failures for accounts that are simply not members any more. Their
           badges are still recomputed below, so a departed member keeps exactly
           the badges their history earned. */
        const inGuild = !discordReady || !!discord.member;
        if (!inGuild) row.skipped = 'not_in_server';
        // eslint-disable-next-line no-await-in-loop -- one account at a time.
        const roles = inGuild ? await applyAuthRoles(discord.id, discord) : { applied: [] };
        const applied = roles.applied || [];
        if (applied.length) rolesApplied += 1;

        // eslint-disable-next-line no-await-in-loop -- as above.
        let badges = await syncRoleBadges({ ...user, discord }, applied);
        // A member who stopped boosting keeps the role history but not the badge,
        // exactly as the per-member refresh does.
        if (!discord.booster && badges.includes('booster')) {
          badges = badges.filter((b) => b !== 'booster');
          // eslint-disable-next-line no-await-in-loop
          await query('UPDATE users SET badges = $1 WHERE id = $2', [badges, user.id]);
        }

        // The fresh Discord payload itself is part of the repair: the roster reads
        // member/booster/roles straight off this row.
        // eslint-disable-next-line no-await-in-loop
        await query('UPDATE users SET discord = $1 WHERE id = $2', [JSON.stringify(discord), user.id]);

        const added = badges.filter((b) => !before.has(b));
        if (added.length) badgesAdded += 1;
        row.applied = applied;
        row.badges_added = added;
        row.member = !!discord.member;
      } catch (err) {
        row.error = err.response?.data?.message || err.message;
      }

      results.push(row);
    }

    const failures = results.filter((r) => r.error);
    await logAudit({
      req,
      action: 'bot.sync_all',
      targetType: 'discord_guild',
      targetId: guildId || 'unconfigured',
      detail: {
        scanned: results.length,
        offset,
        total,
        roles_applied: rolesApplied,
        badges_added: badgesAdded,
        members_missing: membersMissing,
        failed: failures.length,
        remaining,
      },
    });

    return res.json({
      ok: true,
      scanned: results.length,
      roles_applied: rolesApplied,
      badges_added: badgesAdded,
      members_missing: membersMissing,
      failed: failures.length,
      total,
      offset,
      next_offset: nextOffset,
      remaining,
      discord_configured: discordReady,
      // Only the accounts something actually happened to, plus every failure —
      // a 200-row report of "nothing changed" is not worth reading.
      results: results.filter((r) => r.applied?.length || r.badges_added?.length || r.error),
      errors: failures.slice(0, 20).map((r) => ({ username: r.username, error: r.error })),
    });
  } catch (err) {
    console.error('Sync all error:', err);
    return res.status(500).json({ detail: 'Failed to sync roles and badges' });
  }
});

// Give / take a single role on one member — the buttons behind the per-row
// role chips. Returns Discord's answer so the UI can say what actually moved.
router.post('/bot/members/:discordId/roles', async (req, res) => {
  const { role_id: roleId, action } = req.body || {};
  if (!SNOWFLAKE.test(String(roleId || ''))) {
    return res.status(400).json({ detail: 'A valid role_id is required' });
  }
  if (!['add', 'remove'].includes(action)) {
    return res.status(400).json({ detail: 'action must be add or remove' });
  }

  try {
    const discordId = String(req.params.discordId);
    if (action === 'add') await addMemberRole(discordId, roleId);
    else await removeMemberRole(discordId, roleId);
    await logAudit({
      req, action: 'bot.roles.change', targetType: 'discord_member', targetId: discordId,
      detail: { role_id: roleId, change: action },
    });
    return res.json({ ok: true, action, role_id: roleId });
  } catch (err) {
    const status = err.response?.status || 502;
    const detail =
      status === 403
        ? 'Discord refused: the bot is missing Manage Roles, or that role outranks it'
        : err.response?.data?.message || 'Discord API request failed';
    return res.status(status === 403 ? 403 : 502).json({ detail });
  }
});

// ========================
// 2. USER MANAGER
// ========================
router.get('/users', async (req, res) => {
  try {
    const search = (req.query.search || '').trim().toLowerCase();
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);

    let queryText = 'SELECT * FROM users';
    const params = [];

    if (search) {
      queryText += ' WHERE LOWER(username) LIKE $1 OR LOWER(email) LIKE $1 OR LOWER(display_name) LIKE $1';
      params.push(`%${search}%`);
    }

    queryText += ` ORDER BY created_at DESC LIMIT ${limit}`;
    const { rows } = await query(queryText, params);

    return res.json(rows.map(formatUser));
  } catch (err) {
    console.error('Admin users query error:', err);
    return res.status(500).json({ detail: 'Failed to fetch users' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { role, tier, badges, is_owner, username } = req.body;
    const userId = req.params.id;

    const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ detail: 'User not found' });
    }

    const current = rows[0];

    // ADMIN USERNAME OVERRIDE — the admin's edit modal can set anyone's
    // handle. Deliberately the only rule that applies is UNIQUENESS: none of
    // the self-serve username rules (reserved words, cooldown, length) are
    // enforced here, because the whole point of the override is that an admin
    // can set whatever name the situation calls for, gibberish included. The
    // one thing an override must never do is collide with an existing handle.
    let newUsername = current.username;
    if (username !== undefined) {
      const cleaned = String(username).trim().toLowerCase();
      if (!/^[a-z0-9_.]{1,30}$/.test(cleaned)) {
        return res.status(400).json({ detail: 'Username may use letters, numbers, _ and . (1-30 chars)' });
      }
      if (cleaned !== String(current.username).toLowerCase()) {
        const taken = await query('SELECT id FROM users WHERE LOWER(username) = $1 AND id <> $2', [cleaned, userId]);
        if (taken.rows.length > 0) {
          return res.status(409).json({ detail: 'That username is already taken' });
        }
      }
      newUsername = cleaned;
    }
    // The badges column may carry null (the table's default) for accounts that
    // were never granted one — spreading null into this Set threw, which is
    // why the edit modal reported "Failed to update user" for exactly those
    // accounts and worked only for accounts that already had badges.
    const incomingBadges = Array.isArray(badges)
      ? badges.map(String)
      : Array.isArray(current.badges)
        ? current.badges
        : [];
    const newRole = role !== undefined ? role : current.role;
    const newTier = tier !== undefined ? tier : current.tier;
    const newOwner = is_owner !== undefined ? !!is_owner : current.is_owner;
    let newBadges = incomingBadges;

    const updatedUser = {
      ...current,
      role: newRole,
      tier: newTier,
      is_owner: newOwner,
      badges: newBadges,
    };

    const autoBadges = await computeAutoBadges(updatedUser);
    const combinedBadges = Array.from(new Set([...newBadges, ...autoBadges]));

    const result = await query(`
      UPDATE users
      SET role = $1, tier = $2, is_owner = $3, badges = $4, username = $5
      WHERE id = $6
      RETURNING *
    `, [newRole, newTier, newOwner, combinedBadges, newUsername, userId]);

    // The BEFORE and AFTER of every field an admin can move. The new values on
    // their own cannot answer "what did this change?", which is the whole point
    // of an audit row.
    await logAudit({
      req,
      action: 'user.update',
      targetType: 'user',
      targetId: userId,
      detail: {
        username: { from: current.username, to: newUsername },
        role: { from: current.role, to: newRole },
        tier: { from: current.tier, to: newTier },
        is_owner: { from: !!current.is_owner, to: newOwner },
        badges: { from: current.badges || [], to: combinedBadges },
      },
    });

    return res.json(formatUser(result.rows[0]));
  } catch (err) {
    console.error('Admin user update error:', err);
    return res.status(500).json({ detail: 'Failed to update user' });
  }
});

// ========================
// 2b. VIEW CHANGER
// ========================
// Correct a profile's view count by hand. `mode` is set | add | reset, so an
// admin can fix a bad number, give a friend a boost, or wipe a spam-inflated
// count. Clamped to the column's range and never below zero.
router.put('/users/:id/views', async (req, res) => {
  try {
    const userId = req.params.id;
    const mode = ['set', 'add', 'reset'].includes(req.body?.mode) ? req.body.mode : 'set';
    const value = Math.trunc(Number(req.body?.amount) || 0);

    const { rows } = await query('SELECT id, views FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) return res.status(404).json({ detail: 'User not found' });

    let result;
    if (mode === 'reset') {
      result = await query('UPDATE users SET views = 0 WHERE id = $1 RETURNING *', [userId]);
    } else if (mode === 'add') {
      result = await query(
        'UPDATE users SET views = LEAST(2147483647, GREATEST(0, COALESCE(views, 0) + $2)) WHERE id = $1 RETURNING *',
        [userId, value]
      );
    } else {
      result = await query(
        'UPDATE users SET views = LEAST(2147483647, GREATEST(0, $2)) WHERE id = $1 RETURNING *',
        [userId, value]
      );
    }

    await logAudit({
      req,
      action: 'user.views',
      targetType: 'user',
      targetId: userId,
      detail: { mode, amount: value, from: rows[0].views ?? 0, to: result.rows[0]?.views ?? null },
    });

    return res.json(formatUser(result.rows[0]));
  } catch (err) {
    console.error('Admin view update error:', err);
    return res.status(500).json({ detail: 'Failed to update views' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    if (userId === req.user.id) {
      return res.status(400).json({ detail: 'Cannot delete your own account' });
    }
    // Read the account first: after the DELETE its username only exists in this
    // line, and an audit row that says "deleted 4f2a…" answers nothing.
    const { rows } = await query('SELECT username, email, role, tier FROM users WHERE id = $1', [userId]);
    await query('DELETE FROM users WHERE id = $1', [userId]);
    await logAudit({
      req,
      action: 'user.delete',
      targetType: 'user',
      targetId: userId,
      detail: rows[0] ? { username: rows[0].username, email: rows[0].email, role: rows[0].role, tier: rows[0].tier } : { note: 'account was already gone' },
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to delete user' });
  }
});

// ========================
// 3. INVITE CODES
// ========================
router.get('/invites', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT i.*, u.username as creator_username
      FROM invite_codes i
      LEFT JOIN users u ON i.created_by = u.id
      ORDER BY i.created_at DESC
    `);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to fetch invite codes' });
  }
});

router.post('/invites', async (req, res) => {
  try {
    const { code, max_uses = 1, grants_tier = null, premium_days = null, grants_badges = [] } = req.body;
    const cleanCode = (code || `SWATS-${Math.random().toString(36).substring(2, 8).toUpperCase()}`).trim().toUpperCase();

    // A code may carry a paid tier. Anything else is stored as "no tier", so a
    // typo in the admin UI cannot mint an unknown tier at sign-up.
    const tier = grants_tier === 'premium' ? 'premium' : null;
    // …and a DURATION: premium_days turns the tier grant into a self-expiring
    // trial (used at sign-up and via the dashboard's Redeem Premium card).
    // A sane 1–365 window; anything else stores as a permanent grant.
    const daysRaw = parseInt(premium_days, 10);
    const days = tier && Number.isFinite(daysRaw) && daysRaw >= 1 ? Math.min(daysRaw, 365) : null;
    // …and badges. Whitelisted against the catalog (owner/admin can never ride
    // on a code) and de-duplicated, so a code hands out exactly what the form
    // shows. Applying them happens on redemption — see auth.js (sign-up) and
    // profile.js (/me/redeem-invite).
    const badges = sanitizeBadgeGrants(grants_badges);

    const { rows } = await query(`
      INSERT INTO invite_codes (code, created_by, max_uses, active, grants_tier, premium_days, grants_badges)
      VALUES ($1, $2, $3, TRUE, $4, $5, $6)
      RETURNING *
    `, [cleanCode, req.user.id, parseInt(max_uses, 10), tier, days, badges]);

    await logAudit({
      req,
      action: 'invite.create',
      targetType: 'invite',
      targetId: cleanCode,
      detail: { max_uses: parseInt(max_uses, 10), grants_tier: tier, premium_days: days, grants_badges: badges },
    });

    return res.json(rows[0]);
  } catch (err) {
    return res.status(400).json({ detail: 'Invite code already exists or invalid' });
  }
});

// GET/PUT /api/admin/rewards-settings — the view-milestone reward system.
// All of the knobs the engine reads live here, so every reward the site pays
// is configurable from the admin Settings page and nowhere else.
router.get('/rewards-settings', async (req, res) => {
  try {
    return res.json(await loadRewardSettings());
  } catch (err) {
    console.error('Rewards settings read error:', err);
    return res.status(500).json({ detail: 'Failed to load reward settings' });
  }
});

router.put('/rewards-settings', async (req, res) => {
  try {
    // A body can arrive as JSON text when a proxy or an older client encodes it
    // twice; parse it rather than silently saving an empty config.
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const next = {
      enabled: body.enabled === true,
      milestones: sanitizeMilestones(body.milestones).slice(0, 25),
    };
    await query(
      "INSERT INTO site_settings (key, value) VALUES ('view_rewards', $1)\n       ON CONFLICT (key) DO UPDATE SET value = $1",
      [JSON.stringify(next)],
    );
    await logAudit({
      req,
      action: 'rewards.update',
      targetType: 'settings',
      targetId: 'view_rewards',
      detail: next,
    });
    return res.json(next);
  } catch (err) {
    console.error('Rewards settings save error:', err);
    return res.status(500).json({ detail: 'Failed to save reward settings' });
  }
});

router.delete('/invites/:code', async (req, res) => {
  try {
    await query('DELETE FROM invite_codes WHERE code = $1', [req.params.code]);
    await logAudit({ req, action: 'invite.delete', targetType: 'invite', targetId: req.params.code });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to delete invite code' });
  }
});

// ========================
// 3b. AUDIT TRAIL
// ========================
// The trail every admin mutation (and every sign-in, pairing and automatic
// reward) writes to. Newest first, filterable, paginated — one row per thing
// that happened, with the actor, the target, the before/after and the request's
// address. `actions` is the distinct list, so the filter never offers an action
// that has no rows.
router.get('/audit', async (req, res) => {
  try {
    const filters = auditFilters(req.query);
    const { where, params } = auditWhere(filters);
    const page = await query(
      `SELECT * FROM audit_events ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, filters.offset],
    );
    const count = await query(`SELECT COUNT(*)::int AS total FROM audit_events ${where}`, params);
    const actions = await query('SELECT DISTINCT action FROM audit_events ORDER BY action');

    return res.json({
      events: page.rows.map(formatAuditEvent),
      total: count.rows[0]?.total ?? page.rows.length,
      actions: actions.rows.map((row) => row.action),
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch (err) {
    console.error('Audit read error:', err);
    return res.status(500).json({ detail: 'Failed to read the audit log' });
  }
});

// ========================
// 4. SITE SETTINGS
// ========================
router.get('/site', async (req, res) => {
  try {
    const { rows } = await query("SELECT value FROM site_settings WHERE key = 'general'");
    return res.json(rows[0]?.value || {});
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to get site settings' });
  }
});

router.put('/site', async (req, res) => {
  try {
    const settings = req.body;
    // Read the old row first: "registration was switched off" is only useful
    // with the value it used to hold.
    const before = await query("SELECT value FROM site_settings WHERE key = 'general'");
    const { rows } = await query(`
      INSERT INTO site_settings (key, value)
      VALUES ('general', $1)
      ON CONFLICT (key) DO UPDATE SET value = $1
      RETURNING value
    `, [JSON.stringify(settings)]);

    const previous = before.rows[0]?.value || {};
    const changed = Object.keys({ ...previous, ...(settings || {}) })
      .filter((k) => JSON.stringify(previous[k]) !== JSON.stringify(settings?.[k]));
    await logAudit({
      req, action: 'site.update', targetType: 'settings', targetId: 'general',
      detail: {
        changed,
        from: Object.fromEntries(changed.map((k) => [k, previous[k]])),
        to: Object.fromEntries(changed.map((k) => [k, settings?.[k]])),
      },
    });

    return res.json(rows[0].value);
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to update site settings' });
  }
});

// ========================
// 4b. DISCORD ROSTER (bot manager)
// ========================

// What the bot panel lists per account: whether Discord is linked, which other
// providers the account has authorised, and the guild state the bot last saw.
// Integration *keys* are reported as booleans only — routes/integrations.js is
// the only place that may ever read a value, and it masks them even for the
// owner. Admins have no reason to see someone else's API key.
const EMPTY_DISCORD = { linked: false, id: null, username: null, avatar: null, booster: false, member: false };

const rosterEntry = (row) => {
  const d = row.discord || {};
  const keys = row.integrations || {};
  const providers = [];
  if (d.linked) providers.push('discord');
  if (keys.riot_key) providers.push('riot');
  if (keys.youtube_key) providers.push('youtube');
  if (keys.github_key) providers.push('github');

  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name || row.username,
    email: row.email,
    role: row.role || 'user',
    tier: row.role === 'admin' || row.is_owner ? 'premium' : (row.tier || 'free'),
    is_owner: !!row.is_owner,
    created_at: row.created_at,
    invite_code_used: row.invite_code_used,
    badges: row.badges || [],
    views: row.views || 0,
    discord_linked: !!d.linked,
    discord_id: d.id || null,
    discord_username: d.username || null,
    discord_avatar: d.avatar || null,
    booster: !!d.booster,
    member: !!d.member,
    providers,
  };
};

/* How the roster is ordered. A whitelist rather than a parameter in the SQL:
   an ORDER BY cannot be a bound parameter, so the only safe shape is "the client
   picks a key, the server picks the expression". */
const ROSTER_ORDERS = {
  linked: "(discord->>'linked' = 'true') DESC, created_at DESC",
  newest: 'created_at DESC',
  oldest: 'created_at ASC',
  name: 'LOWER(username) ASC',
  views: 'views DESC, LOWER(username) ASC',
  tier: "CASE tier WHEN 'admin' THEN 0 WHEN 'premium' THEN 1 ELSE 2 END, LOWER(username) ASC",
};

router.get('/discord/roster', async (req, res) => {
  try {
    const search = (req.query.search || '').trim().toLowerCase();
    const filter = req.query.filter || 'all';
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200);
    // Paging, because a 1,300-member guild does not fit in one screen and
    // "search by name you already know" is not a way to browse.
    const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);
    const order = ROSTER_ORDERS[req.query.sort] || ROSTER_ORDERS.linked;

    const where = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(LOWER(username) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR LOWER(COALESCE(discord->>'username','')) LIKE $${params.length})`);
    }

    // Text comparisons rather than ::boolean casts: the column is JSONB written
    // by several code paths over time, and one odd value would otherwise make the
    // whole panel 500 instead of simply leaving that account out of the filter.
    if (filter === 'linked') where.push("discord->>'linked' = 'true'");
    else if (filter === 'unlinked') where.push("COALESCE(discord->>'linked', 'false') <> 'true'");
    else if (filter === 'boosters') where.push("discord->>'booster' = 'true'");
    else if (filter === 'members') where.push("discord->>'member' = 'true'");

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await query(
      `SELECT * FROM users ${whereSql} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const totals = await query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE discord->>'linked' = 'true')::int AS discord_linked,
        COUNT(*) FILTER (WHERE discord->>'booster' = 'true')::int AS boosters,
        COUNT(*) FILTER (WHERE discord->>'member' = 'true')::int AS members,
        COUNT(*) FILTER (WHERE COALESCE(discord->>'linked', 'false') <> 'true')::int AS discord_missing,
        COUNT(*) FILTER (WHERE integrations ? 'riot_key')::int AS riot_keys,
        COUNT(*) FILTER (WHERE integrations ? 'youtube_key')::int AS youtube_keys,
        COUNT(*) FILTER (WHERE integrations ? 'github_key')::int AS github_keys
      FROM users
    `);

    return res.json({
      users: rows.map(rosterEntry),
      page: { limit, offset, sort: ROSTER_ORDERS[req.query.sort] ? req.query.sort : 'linked', returned: rows.length },
      stats: {
        ...(totals.rows[0] || {}),
        bot_configured: !!(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID),
        guild_id: process.env.DISCORD_GUILD_ID || null,
      },
    });
  } catch (err) {
    console.error('Discord roster error:', err);
    return res.status(500).json({ detail: 'Failed to load the Discord roster' });
  }
});

// Detach Discord from an account. Used when someone signed in with the wrong
// account and needs to re-link, or when the link is stale. The stored object is
// reset (not just flagged) so the OAuth callback can no longer match this row by
// its old Discord id, and the auto-granted booster badge is removed with it.
router.post('/discord/:id/unlink', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ detail: 'User not found' });

    const badges = (await computeAutoBadges({ ...rows[0], discord: EMPTY_DISCORD })).filter((b) => b !== 'booster');
    const updated = await query(
      'UPDATE users SET discord = $1, badges = $2 WHERE id = $3 RETURNING *',
      [JSON.stringify(EMPTY_DISCORD), badges, req.params.id]
    );

    await logAudit({
      req, action: 'discord.unlink', targetType: 'user', targetId: req.params.id,
      detail: { username: rows[0].username, discord_id: rows[0].discord?.id || null },
    });
    return res.json({ ok: true, user: formatUser(updated.rows[0]) });
  } catch (err) {
    console.error('Discord unlink error:', err);
    return res.status(500).json({ detail: 'Failed to unlink Discord' });
  }
});

// Re-read one member from the guild so the roster reflects reality right now
// instead of whenever the last full sync ran.
router.post('/discord/:id/refresh', async (req, res) => {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId) {
    return res.status(400).json({ detail: 'Discord bot is not configured (DISCORD_BOT_TOKEN / DISCORD_GUILD_ID)' });
  }

  try {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ detail: 'User not found' });
    if (!user.discord?.id) return res.status(400).json({ detail: 'This account has no Discord id to look up' });

    let discord;
    try {
      const member = await axios.get(`https://discord.com/api/guilds/${guildId}/members/${user.discord.id}`, {
        headers: { Authorization: `Bot ${botToken}` },
      });
      discord = {
        ...user.discord,
        member: true,
        booster: !!member.data?.premium_since,
        // Fresh role ids feed the OG/Verified badge sync on the recompute below.
        guild_roles: member.data?.roles || [],
      };
      // Keep the stored handle fresh as well — the roster shows it verbatim.
      if (member.data?.user?.username) {
        discord.username = member.data.user.username;
      }
    } catch (err) {
      // 404 means "not in the guild", which is a real answer, not a failure.
      if (err.response?.status === 404) {
        discord = { ...user.discord, member: false, booster: false, guild_roles: [] };
      } else {
        return res.status(502).json({ detail: err.response?.data?.message || 'Discord API request failed' });
      }
    }

    let badges = await computeAutoBadges({ ...user, discord });
    if (!discord.booster) badges = badges.filter((b) => b !== 'booster');

    const updated = await query('UPDATE users SET discord = $1, badges = $2 WHERE id = $3 RETURNING *', [
      JSON.stringify(discord), badges, user.id,
    ]);

    await logAudit({
      req, action: 'discord.refresh', targetType: 'user', targetId: req.params.id,
      detail: { username: user.username, member: !!discord.member, booster: !!discord.booster, badges },
    });
    return res.json({ ok: true, user: formatUser(updated.rows[0]) });
  } catch (err) {
    console.error('Discord refresh error:', err);
    return res.status(500).json({ detail: 'Failed to refresh this member' });
  }
});

// ========================
// 4c. INBOX BROADCASTS
// ========================
router.get('/notify/audiences', async (req, res) => {
  try {
    const counts = {};
    for (const audience of AUDIENCES) {
      // 'specific' has no fixed size; the picker reports it once names are chosen.
      if (audience === 'specific') continue;
      counts[audience] = await countAudience(audience);
    }
    return res.json({ audiences: AUDIENCES, counts });
  } catch (err) {
    console.error('Audience count error:', err);
    return res.status(500).json({ detail: 'Failed to count audiences' });
  }
});

// Sends an inbox message. `audience` is everyone / a tier / a Discord state /
// admins, or 'specific' with `user_ids` picked from the roster.
router.post('/notify', async (req, res) => {
  try {
    const { title, body = null, href = null, audience = 'all', user_ids = [] } = req.body || {};
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return res.status(400).json({ detail: 'A title is required' });
    if (cleanTitle.length > 120) return res.status(400).json({ detail: 'Keep the title under 120 characters' });
    if (!AUDIENCES.includes(audience)) return res.status(400).json({ detail: 'Unknown audience' });

    const recipients = await resolveRecipients(audience, user_ids);
    if (!recipients.length) return res.status(400).json({ detail: 'That audience has no recipients' });

    const result = await sendNotifications({
      userIds: recipients,
      kind: 'inbox',
      title: cleanTitle,
      body: String(body || '').trim() || null,
      href: String(href || '').trim() || null,
    });

    await logAudit({
      req, action: 'notify.send', targetType: 'notification_batch', targetId: result.batch_id,
      detail: { title: cleanTitle, body, href, audience, recipients: recipients.length, sent: result.sent },
    });
    return res.json({ ok: true, sent: result.sent, audience, batch_id: result.batch_id });
  } catch (err) {
    console.error('Notify error:', err);
    return res.status(500).json({ detail: 'Failed to send the message' });
  }
});

// History is grouped by batch id: one row per send, not per recipient, which is
// what makes "sent to 412 people, 30 still unread" readable.
router.get('/notify/history', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT batch_id, kind, title, body, href,
             COUNT(*)::int AS recipients,
             COUNT(*) FILTER (WHERE read_at IS NULL)::int AS unread,
             MAX(created_at) AS created_at
      FROM notifications
      WHERE batch_id IS NOT NULL
      GROUP BY batch_id, kind, title, body, href
      ORDER BY MAX(created_at) DESC
      LIMIT 40
    `);
    return res.json(rows);
  } catch (err) {
    console.error('Notify history error:', err);
    return res.status(500).json({ detail: 'Failed to load sent messages' });
  }
});

// Recalls a send: the bell stops showing it for everyone. Meant for the typo
// that went to 412 people, so undelivered copies are deleted outright.
router.delete('/notify/batch/:batchId', async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM notifications WHERE batch_id = $1', [req.params.batchId]);
    await logAudit({
      req, action: 'notify.recall', targetType: 'notification_batch', targetId: req.params.batchId,
      detail: { removed: rowCount },
    });
    return res.json({ ok: true, removed: rowCount });
  } catch (err) {
    console.error('Notify recall error:', err);
    return res.status(500).json({ detail: 'Failed to recall that message' });
  }
});

// ========================
// 4d. DEVLOGS
// ========================
router.get('/devlogs', async (req, res) => {
  try {
    // Every post, both channels, so the authoring page can show which feed each
    // one belongs to.
    const { rows } = await query('SELECT * FROM devlogs ORDER BY pinned DESC, created_at DESC LIMIT 100');
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to load devlogs' });
  }
});

// Publishing a devlog is the same fan-out as an inbox message, so the post shows
// up in the bell of whoever the admin chose instead of quietly sitting on a page
// nobody opens.
router.post('/devlogs', async (req, res) => {
  try {
    const {
      title, body = '', tag = null, pinned = false, published = true,
      notify = true, audience = 'all', user_ids = [], channel = 'public',
    } = req.body || {};

    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return res.status(400).json({ detail: 'A title is required' });
    if (cleanTitle.length > 140) return res.status(400).json({ detail: 'Keep the title under 140 characters' });
    if (!AUDIENCES.includes(audience)) return res.status(400).json({ detail: 'Unknown audience' });

    const cleanChannel = DEVLOG_CHANNELS.includes(String(channel)) ? String(channel) : 'public';

    const { rows } = await query(`
      INSERT INTO devlogs (author_id, author_username, title, body, tag, channel, pinned, published)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [req.user.id, req.user.username, cleanTitle, String(body || ''), String(tag || '').trim() || null, cleanChannel, !!pinned, published !== false]);

    const devlog = rows[0];
    let sent = 0;

    // An unpublished draft notifies nobody — otherwise the bell would point at a
    // page that cannot show the post yet.
    if (notify && published !== false) {
      const recipients = await resolveRecipients(audience, user_ids);
      const result = await sendNotifications({
        userIds: recipients,
        kind: 'devlog',
        title: cleanTitle,
        body: String(body || '').slice(0, 240) || null,
        // The bell points at the feed the post actually lives in, so a build-log
        // entry does not drop the reader on the public changelog wondering where
        // it went.
        href: cleanChannel === 'dashboard' ? '/!/dashboard/devlogs' : '/!/devlogs',
        sourceId: devlog.id,
      });
      sent = result.sent;
    }

    await logAudit({
      req, action: 'devlog.create', targetType: 'devlog', targetId: devlog.id,
      detail: { title: cleanTitle, channel: cleanChannel, published: published !== false, notified: sent },
    });
    return res.json({ ...devlog, notified: sent, audience: notify ? audience : null });
  } catch (err) {
    console.error('Devlog create error:', err);
    return res.status(500).json({ detail: 'Failed to publish the devlog' });
  }
});

router.patch('/devlogs/:id', async (req, res) => {
  try {
    const { title, body, tag, pinned, published, channel } = req.body || {};
    const { rows } = await query('SELECT * FROM devlogs WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ detail: 'Devlog not found' });
    const current = rows[0];

    const updated = await query(`
      UPDATE devlogs
      SET title = $1, body = $2, tag = $3, channel = $4, pinned = $5, published = $6, updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [
      title !== undefined ? String(title).trim().slice(0, 140) : current.title,
      body !== undefined ? String(body) : current.body,
      tag !== undefined ? (String(tag).trim() || null) : current.tag,
      // Moving a post between the two feeds is allowed; anything else is refused
      // rather than written, so a bad value cannot hide the post from both.
      channel !== undefined && DEVLOG_CHANNELS.includes(String(channel)) ? String(channel) : (current.channel || 'public'),
      pinned !== undefined ? !!pinned : current.pinned,
      published !== undefined ? !!published : current.published,
      req.params.id,
    ]);

    await logAudit({
      req, action: 'devlog.update', targetType: 'devlog', targetId: req.params.id,
      detail: {
        from: { title: current.title, channel: current.channel, published: current.published, pinned: current.pinned },
        to: { title: updated.rows[0]?.title, channel: updated.rows[0]?.channel, published: updated.rows[0]?.published, pinned: updated.rows[0]?.pinned },
      },
    });
    return res.json(updated.rows[0]);
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to update the devlog' });
  }
});

router.delete('/devlogs/:id', async (req, res) => {
  try {
    await query('DELETE FROM devlogs WHERE id = $1', [req.params.id]);
    // The inbox entries pointing at it are deleted with it, so the bell can never
    // offer a link to a post that no longer exists.
    await query('DELETE FROM notifications WHERE source_id = $1', [req.params.id]);
    await logAudit({ req, action: 'devlog.delete', targetType: 'devlog', targetId: req.params.id });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to delete the devlog' });
  }
});

// ========================
// 4e. ANNOUNCEMENTS
// ========================
router.get('/announcements', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100');
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to load announcements' });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const {
      message, level = 'info', href = null, href_label = null,
      audience = 'all', starts_at = null, ends_at = null,
      active = true, notify = false, user_ids = [],
    } = req.body || {};

    const clean = String(message || '').trim();
    if (!clean) return res.status(400).json({ detail: 'An announcement needs a message' });
    if (clean.length > 400) return res.status(400).json({ detail: 'Keep the announcement under 400 characters' });
    if (!['info', 'success', 'warning', 'critical'].includes(level)) {
      return res.status(400).json({ detail: 'Unknown announcement level' });
    }
    if (!AUDIENCES.includes(audience)) return res.status(400).json({ detail: 'Unknown audience' });

    const { rows } = await query(`
      INSERT INTO announcements (message, level, href, href_label, audience, active, starts_at, ends_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), $8::timestamptz, $9)
      RETURNING *
    `, [
      clean, level,
      String(href || '').trim() || null,
      String(href_label || '').trim() || null,
      audience, active !== false,
      starts_at || null, ends_at || null, req.user.id,
    ]);

    const announcement = rows[0];
    let sent = 0;
    if (notify) {
      const recipients = await resolveRecipients(audience, user_ids);
      const result = await sendNotifications({
        userIds: recipients,
        kind: 'announcement',
        title: clean.slice(0, 120),
        body: href ? String(href_label || href) : null,
        href: href || null,
        sourceId: announcement.id,
      });
      sent = result.sent;
    }

    await logAudit({
      req, action: 'announcement.create', targetType: 'announcement', targetId: announcement.id,
      detail: { message: clean, level, audience, active: active !== false, notified: sent },
    });
    return res.json({ ...announcement, notified: sent });
  } catch (err) {
    console.error('Announcement create error:', err);
    return res.status(500).json({ detail: 'Failed to create the announcement' });
  }
});

router.patch('/announcements/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM announcements WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ detail: 'Announcement not found' });
    const current = rows[0];
    const { message, level, href, href_label, audience, active, starts_at, ends_at } = req.body || {};

    const updated = await query(`
      UPDATE announcements
      SET message = $1, level = $2, href = $3, href_label = $4, audience = $5, active = $6,
          starts_at = COALESCE($7::timestamptz, starts_at), ends_at = $8::timestamptz
      WHERE id = $9
      RETURNING *
    `, [
      message !== undefined ? String(message).trim().slice(0, 400) || current.message : current.message,
      level !== undefined ? level : current.level,
      href !== undefined ? (String(href).trim() || null) : current.href,
      href_label !== undefined ? (String(href_label).trim() || null) : current.href_label,
      audience !== undefined ? audience : current.audience,
      active !== undefined ? !!active : current.active,
      starts_at || null,
      ends_at !== undefined ? (ends_at || null) : current.ends_at,
      req.params.id,
    ]);

    await logAudit({
      req, action: 'announcement.update', targetType: 'announcement', targetId: req.params.id,
      detail: {
        from: { message: current.message, level: current.level, audience: current.audience, active: current.active },
        to: { message: updated.rows[0]?.message, level: updated.rows[0]?.level, audience: updated.rows[0]?.audience, active: updated.rows[0]?.active },
      },
    });
    return res.json(updated.rows[0]);
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to update the announcement' });
  }
});

router.delete('/announcements/:id', async (req, res) => {
  try {
    await query('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    await logAudit({ req, action: 'announcement.delete', targetType: 'announcement', targetId: req.params.id });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to delete the announcement' });
  }
});

// ========================
// 5. ANALYTICS
// ========================
router.get('/analytics', async (req, res) => {
  try {
    const totalUsers = await query('SELECT COUNT(*) FROM users');
    const totalViews = await query('SELECT SUM(views) FROM users');
    const premiumUsers = await query("SELECT COUNT(*) FROM users WHERE tier = 'premium' OR tier = 'admin'");
    const recentSignups = await query(`
      SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as signups
      FROM users
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day ASC
    `);

    return res.json({
      total_users: parseInt(totalUsers.rows[0].count || '0', 10),
      total_views: parseInt(totalViews.rows[0].sum || '0', 10),
      premium_users: parseInt(premiumUsers.rows[0].count || '0', 10),
      recent_signups: recentSignups.rows,
    });
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to load analytics' });
  }
});

export default router;
