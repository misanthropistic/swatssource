import axios from 'axios';
import WebSocket from 'ws';
import { query } from './db.js';

/* The bot half of the Discord integration.
 *
 * Four jobs, all from one module so every caller shares one axios instance:
 *   1. The role mapping — an admin's answer to "which Discord role is the
 *      Verified role / the OG role" — stored in site_settings under
 *      'discord_bot' (see loadBotSettings below).
 *   2. Assigning those roles when someone links Discord (routes/auth.js).
 *   3. Presence: a persistent gateway connection that makes the bot actually
 *      appear online in the member list, with a custom status. REST alone
 *      cannot set presence — Discord only accepts it on the identify payload
 *      of a live gateway session — so this module owns one WebSocket that
 *      reconnects itself if Discord drops it.
 *   4. Guild role/member administration for the admin panel's buttons.
 *
 * The gateway is deliberately hand-rolled on `ws` rather than pulled in via
 * discord.js: the only frames this app needs are IDENTIFY, presence updates
 * and the heartbeat Discord mandates, and a zero-dependency client is far
 * easier to keep alive inside a Railway deployment than a full library.
 */

const botToken = () => process.env.DISCORD_BOT_TOKEN;
const guildId = () => process.env.DISCORD_GUILD_ID;

export const botConfigured = () => !!(botToken() && guildId());

const rest = axios.create({
  baseURL: 'https://discord.com/api/v10',
  timeout: 20_000,
});

const withBot = () => ({ headers: { Authorization: `Bot ${botToken()}` } });
// Discord ids (role / channel / user snowflakes) the bot will act on.
const SNOWFLAKE_STRING = /^\d{5,25}$/;

// Presence values Discord accepts for `status`.
export const PRESENCE_OPTIONS = ['online', 'idle', 'dnd', 'invisible'];

/* ------------------------------------------------------------------ */
/* 1. The settings store                                              */
/* ------------------------------------------------------------------ */

export const DEFAULT_BOT_SETTINGS = {
  verified_role_id: null,
  og_role_id: null,
  member_role_id: null,      // "in the server" role, applied on auth too
  booster_role_id: null,     // usually Discord's built-in nitro role; optional
  custom_roles: [],          // [{ id, role_id, label, condition }] — the admin's own mappings
  // Grant the wired roles the moment somebody joins the guild, without waiting
  // for them to sign in on the site. Needs the Server Members gateway intent
  // (DISCORD_MEMBER_INTENT=1); see memberEventsState().
  auto_roles_on_join: true,
  presence: { status: 'online', custom_status: 'swats.bio' },
};

// Site settings rows carry other features' values too, so only this feature's
// keys are ever touched — a read merges over defaults, a write preserves keys
// this module does not know about.
export async function loadBotSettings() {
  const { rows } = await query("SELECT value FROM site_settings WHERE key = 'discord_bot'");
  const value = rows[0]?.value || {};
  return {
    ...DEFAULT_BOT_SETTINGS,
    ...value,
    // Nested groups merge over their defaults the same way presence does, so
    // an old saved row without them still reads complete.
    presence: { ...DEFAULT_BOT_SETTINGS.presence, ...(value.presence || {}) },
  };
}

export async function saveBotSettings(patch) {
  const current = await loadBotSettings();
  const next = {
    ...current,
    ...patch,
    presence: { ...current.presence, ...(patch.presence || {}) },
  };
  await query(
    `INSERT INTO site_settings (key, value) VALUES ('discord_bot', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify(next)]
  );
  // Presence is gateway-only: a settings change updates the live session.
  schedulePresenceUpdate();
  return next;
}

/* ------------------------------------------------------------------ */
/* 2. Applying roles to a member                                      */
/* ------------------------------------------------------------------ */

// Called on every Discord auth. `discordPayload` is the object the callback is
// already holding (member/booster flags included), so no second API read is
// needed to decide which of the wired roles belong on this member. Never
// throws: a failed role grant must not fail the sign-in that triggered it.
export async function applyAuthRoles(discordId, discordPayload = {}) {
  if (!botConfigured() || !discordId) return { applied: [], skipped_custom: true };

  const settings = await loadBotSettings();

  const roleIds = [
    settings.verified_role_id,
    // OG is only for members already in the guild at auth time — "OG" reads as
    // been-here, not just-linked.
    settings.og_role_id && (discordPayload.member || discordPayload.booster)
      ? settings.og_role_id
      : null,
    settings.member_role_id && discordPayload.member ? settings.member_role_id : null,
    settings.booster_role_id && discordPayload.booster ? settings.booster_role_id : null,
  ].filter(Boolean);

  const applied = [];
  for (const roleId of roleIds) {
    try {
      await rest.put(
        `/guilds/${guildId()}/members/${discordId}/roles/${roleId}`,
        {},
        withBot()
      );
      applied.push(roleId);
    } catch (err) {
      console.warn(
        `[discordBot] role ${roleId} assign failed for ${discordId}:`,
        err.response?.data?.message || err.message
      );
    }
  }

  // Custom mappings are opt-in per condition; each is its own try so one bad
  // mapping cannot stop the wired roles above from applying.
  for (const mapping of settings.custom_roles || []) {
    if (!mapping?.role_id) continue;
    if (!customRoleApplies(mapping, discordPayload)) continue;
    try {
      await rest.put(
        `/guilds/${guildId()}/members/${discordId}/roles/${mapping.role_id}`,
        {},
        withBot()
      );
      applied.push(mapping.role_id);
    } catch (err) {
      console.warn(
        `[discordBot] custom role ${mapping.role_id} assign failed for ${discordId}:`,
        err.response?.data?.message || err.message
      );
    }
  }

  return { applied };
}

// A custom mapping fires when its chosen condition matches the payload the
// auth callback computed. 'always' exists so an admin can hand out a role to
// everyone who links, without wiring it into verified_role_id.
const CUSTOM_CONDITIONS = ['always', 'member', 'booster', 'not_member'];
export function customRoleApplies(mapping, payload = {}) {
  switch (mapping.condition) {
    case 'always': return true;
    case 'member': return !!payload.member;
    case 'booster': return !!payload.booster;
    case 'not_member': return !payload.member;
    default: return false;
  }
}

/* ------------------------------------------------------------------ */
/* 2b. Roles that arrive with the member, not from the site           */
/* ------------------------------------------------------------------ */

/* Which roles a member is given the second they join the guild.

   `member_role_id` and the mapped custom roles belong here — they describe being
   in the server, and joining is the proof. `verified_role_id` deliberately does
   NOT: verifying means linking a swats.bio account, and handing it out on join
   would make it meaningless. `og_role_id` is the same shape of judgement — "OG"
   reads as been-here-a-while, which a brand new member is not. */
export function rolesForJoin(settings = {}, member = {}) {
  const booster = !!member.premium_since;
  const roles = new Set();

  if (settings.member_role_id) roles.add(settings.member_role_id);
  if (booster && settings.booster_role_id) roles.add(settings.booster_role_id);

  for (const mapping of settings.custom_roles || []) {
    if (!mapping?.role_id) continue;
    // A mapping wired to the verified role is left to the site's own flow.
    if (mapping.role_id === settings.verified_role_id) continue;
    // `member: true` is what makes a 'not_member' mapping correctly skip a join.
    if (customRoleApplies(mapping, { member: true, booster })) roles.add(mapping.role_id);
  }

  return [...roles];
}

/* The booster role has to follow Nitro in both directions, and Discord announces
   it as a plain member update. The change is computed from the member's own
   `premium_since`, so no previous-state bookkeeping is needed — and a member who
   never had the role just produces a harmless 404. */
export function boosterRoleChange(settings = {}, member = {}) {
  const roleId = settings.booster_role_id;
  if (!roleId) return { add: [], remove: [] };
  const boosting = !!member.premium_since;
  return boosting ? { add: [roleId], remove: [] } : { add: [], remove: [roleId] };
}

/* Assign a list of roles, one request each, and report what actually moved.
   Every failure is logged and skipped: one unassignable role (above the bot in
   the hierarchy) must not stop the others from landing. */
export async function applyRoleIds(discordId, roleIds = []) {
  const applied = [];
  for (const roleId of roleIds) {
    try {
      // eslint-disable-next-line no-await-in-loop -- one REST call per role, a handful at most.
      await rest.put(`/guilds/${guildId()}/members/${discordId}/roles/${roleId}`, {}, withBot());
      applied.push(roleId);
    } catch (err) {
      console.warn(
        `[discordBot] role ${roleId} assign failed for ${discordId}:`,
        err.response?.data?.message || err.message
      );
    }
  }
  return applied;
}

export async function removeRoleIds(discordId, roleIds = []) {
  const removed = [];
  for (const roleId of roleIds) {
    try {
      // eslint-disable-next-line no-await-in-loop -- one REST call per role.
      await rest.delete(`/guilds/${guildId()}/members/${discordId}/roles/${roleId}`, withBot());
      removed.push(roleId);
    } catch (err) {
      // 404 = the member never had it. Not worth a warning.
      if (err.response?.status !== 404) {
        console.warn(
          `[discordBot] role ${roleId} removal failed for ${discordId}:`,
          err.response?.data?.message || err.message
        );
      }
    }
  }
  return removed;
}

/* What a join event should do, as one call, so the gateway handler and any test
   share the same answer. Returns the roles granted, or an empty list when the
   feature is switched off. */
export async function grantJoinRoles(member, { settings } = {}) {
  if (!botConfigured()) return { applied: [], skipped: 'not_configured' };
  const config = settings || (await loadBotSettings());
  if (config.auto_roles_on_join === false) return { applied: [], skipped: 'disabled' };

  const roles = rolesForJoin(config, member);
  if (!roles.length) return { applied: [], skipped: 'no_roles_wired' };
  return { applied: await applyRoleIds(member.user?.id || member.user_id, roles) };
}

// Add one role by id to one member. Used by the per-user "give role" action.
export async function addMemberRole(discordId, roleId) {
  await rest.put(`/guilds/${guildId()}/members/${discordId}/roles/${roleId}`, {}, withBot());
  return true;
}

export async function removeMemberRole(discordId, roleId) {
  await rest.delete(`/guilds/${guildId()}/members/${discordId}/roles/${roleId}`, withBot());
  return true;
}

/* ------------------------------------------------------------------ */
/* 3. Guild + bot state                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 3. Messages                                                        */
/* ------------------------------------------------------------------ */

// One guarded message post. Returns { ok, id? } rather than throwing so a dead
// channel or a missing SEND_MESSAGES permission can never crash the caller
// (the join handler, the billing webhook) that asked for the notice.
export async function sendBotMessage(channelId, content) {
  if (!botConfigured()) return { ok: false, skipped: 'not_configured' };
  if (!SNOWFLAKE_STRING.test(String(channelId || ''))) return { ok: false, skipped: 'bad_channel' };
  try {
    const { data } = await rest.post(
      `/channels/${channelId}/messages`,
      { content: String(content || '').slice(0, 2000) },
      withBot(),
    );
    return { ok: true, id: data?.id || null };
  } catch (err) {
    console.warn(`[discordBot] message to ${channelId} failed:`, err.response?.data?.message || err.message);
    return { ok: false, error: err.response?.status || null };
  }
}

export async function getGuildRoles() {
  const { data } = await rest.get(`/guilds/${guildId()}/roles`, withBot());
  // Managed integration roles and @everyone are never assignable by hand —
  // inviting an admin to pick one would guarantee a 403 later.
  return data.filter((r) => !r.managed && r.name !== '@everyone');
}

export async function getBotIdentity() {
  const { data } = await rest.get('/users/@me', withBot());
  return data;
}

export async function getGuildMember(userId) {
  try {
    const { data } = await rest.get(`/guilds/${guildId()}/members/${userId}`, withBot());
    return { ok: true, member: data };
  } catch (err) {
    if (err.response?.status === 404) return { ok: false, reason: 'not_in_guild' };
    throw err;
  }
}

// The panel header shows the server's name; the icon is deliberately not part
// of this return (routes/admin.js picks what it exposes).
export async function getGuildInfo() {
  const { data } = await rest.get(`/guilds/${guildId()}`, withBot());
  return data;
}

// Whether the bot can actually hand out the roles it is wired to. Discord
// answers 403 for roles at or above the bot's own highest role; surfacing that
// in the panel beats a silent no-op at auth time.
export async function verifyRoleAssignability(roleIds) {
  const roles = await getGuildRoles();
  const manageable = new Set(roles.map((r) => r.id));
  const results = {};
  for (const id of roleIds) results[id] = manageable.has(id);
  return results;
}

/* ------------------------------------------------------------------ */
/* 4. Gateway presence — the bot appears online, with a custom status  */
/* ------------------------------------------------------------------ */

let gateway = null;          // the live `ws` socket, or null
let heartbeatTimer = null;   // the interval Discord's heartbeat interval demands
let reconnectTimer = null;
let reconnectAttempts = 0;
let presenceDirty = false;   // a settings write arrived mid-session
let closingDown = false;     // set on process shutdown so we stop reconnecting

/* Server-members events (join, boost changes) need the privileged GUILD_MEMBERS
   intent, which has to be switched on in the Discord developer portal AS WELL as
   requested here. Asking for it without the portal toggle makes Discord refuse
   the entire connection (close code 4014) — which would take the bot's presence
   offline, the one thing that already works. So it is opt-in, refusals are
   remembered for the life of the process, and the panel reports which state the
   bot is actually in rather than claiming auto-roles are live. */
const GUILD_MEMBERS_INTENT = 1 << 1;

// 'off' (not requested) | 'requested' | 'ready' | 'refused'
let memberEventsState = process.env.DISCORD_MEMBER_INTENT === '1' ? 'requested' : 'off';
let intentRefused = false;

export const memberEventsEnabled = () => memberEventsState === 'requested' || memberEventsState === 'ready';

// The intents this session asks for. 0 is enough for presence; the member bit is
// added only when the deployment opted in.
function gatewayIntents() {
  if (intentRefused || memberEventsState === 'off') return 0;
  return GUILD_MEMBERS_INTENT;
}

function presencePayload(settings) {
  // `since` null and idle game refs left off: this is a status line, not an
  // activity. A custom_status activity is what shows next to the bot's name
  // in the member list; without any activity there is no text at all.
  const activities = settings.presence?.custom_status
    ? [{ name: 'Custom Status', type: 4, state: String(settings.presence.custom_status).slice(0, 128) }]
    : [];
  return {
    since: null,
    activities,
    status: PRESENCE_OPTIONS.includes(settings.presence?.status) ? settings.presence.status : 'online',
    afk: false,
  };
}

async function identify() {
  // The gateway URL minted a short-lived token at /gateway/bot; keeping the
  // simple wss endpoint avoids that extra round-trip per reconnect.
  const { data: gw } = await rest.get('/gateway/bot', withBot());
  const ws = new WebSocket(gw.url);

  ws.on('message', (raw) => {
    let pkt;
    try { pkt = JSON.parse(raw); } catch { return; }
    switch (pkt.op) {
      case 10: { // Hello — the heartbeat interval is non-negotiable
        const interval = pkt.d.heartbeat_interval;
        heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: null }));
        }, interval);
        ws.send(JSON.stringify({
          op: 2, // IDENTIFY
          d: {
            token: botToken(),
            // Presence of *this* bot needs no intents at all; the member bit is
            // for join/boost events and is opt-in (see gatewayIntents).
            intents: gatewayIntents(),
            properties: { os: 'linux', browser: 'swats', device: 'swats' },
            presence: presencePayload(currentSettings),
          },
        }));
        reconnectAttempts = 0;
        break;
      }
      case 11: // Heartbeat ACK — connection confirmed alive
        break;
      case 7: // Reconnect requested by Discord
        ws.close(4000);
        break;
      case 9: // Invalid session — pause, then resume fresh
        setTimeout(() => reconnect(), 5_000);
        break;
      case 1: // Heartbeat request while we are between timers
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: null }));
        break;
      case 0: // Dispatch
        handleDispatch(pkt);
        break;
      default:
        break;
    }
  });

  ws.on('error', (err) => console.warn('[discordBot] gateway error:', err.message));
  ws.on('close', (code) => {
    cleanupGateway();
    if (code === 4014) {
      // "Disallowed intent(s)" — the portal has not granted GUILD_MEMBERS.
      // Drop back to presence-only for the rest of this process so the bot stays
      // online, and say exactly what to switch on.
      if (memberEventsState === 'requested' || memberEventsState === 'ready') {
        memberEventsState = 'refused';
        console.error(
          '[discordBot] Discord refused the GUILD_MEMBERS intent, so join/boost roles are off. ' +
            'Enable "Server Members Intent" for the bot in the Discord developer portal, then restart.'
        );
      }
      intentRefused = true;
    }
    if (!closingDown) scheduleReconnect();
  });

  gateway = ws;
}

let currentSettings = DEFAULT_BOT_SETTINGS; // read once by identify(), reloaded on settings save

/* Dispatch frames. Only the member events matter here, and each job is wrapped:
   an unexpected payload from Discord must not kill a connection that is
   otherwise doing its job (staying online). */
function handleDispatch(pkt) {
  const type = pkt.t;
  if (type === 'READY') {
    if (memberEventsState === 'requested') memberEventsState = 'ready';
    return;
  }
  if (!memberEventsState || memberEventsState === 'off' || memberEventsState === 'refused') return;

  if (type === 'GUILD_MEMBER_ADD') {
    const member = pkt.d || {};
    if (String(member.guild_id) !== String(guildId())) return;
    grantJoinRoles(member)
      .then(({ applied, skipped }) => {
        if (applied?.length) {
          console.log(`[discordBot] join roles for ${member.user?.username || member.user?.id}: ${applied.join(', ')}`);
        } else if (skipped === 'no_roles_wired') {
          console.log('[discordBot] a member joined but no join roles are wired in the bot panel');
        }
      })
      .catch((err) => console.warn('[discordBot] join role grant failed:', err.message));
    return;
  }

  if (type === 'GUILD_MEMBER_UPDATE') {
    const member = pkt.d || {};
    if (String(member.guild_id) !== String(guildId())) return;
    loadBotSettings()
      .then(async (settings) => {
        const { add, remove } = boosterRoleChange(settings, member);
        if (add.length) await applyRoleIds(member.user?.id, add);
        if (remove.length) await removeRoleIds(member.user?.id, remove);
      })
      .catch((err) => console.warn('[discordBot] booster role update failed:', err.message));
  }
}

function cleanupGateway() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  gateway = null;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  // Exponential-ish backoff, capped, so a wrong token cannot spin the CPU.
  const wait = Math.min(30_000, 1_000 * Math.pow(2, reconnectAttempts++));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startPresence();
  }, wait);
}

async function startPresence() {
  if (!botConfigured() || closingDown) return;
  if (gateway && (gateway.readyState === WebSocket.OPEN || gateway.readyState === WebSocket.CONNECTING)) return;
  try {
    currentSettings = await loadBotSettings();
    await identify();
    console.log('[discordBot] gateway presence connected');
  } catch (err) {
    console.warn('[discordBot] gateway connect failed:', err.response?.data?.message || err.message);
    scheduleReconnect();
  }
}

// A settings save can change status text; updating an established session with
// a PRESENCE_UPDATE beats tearing it down and re-identifying.
function schedulePresenceUpdate() {
  if (!gateway || gateway.readyState !== WebSocket.OPEN) return; // next identify picks it up
  if (presenceDirty) return;
  presenceDirty = true;
  setTimeout(async () => {
    presenceDirty = false;
    try {
      currentSettings = await loadBotSettings();
      gateway.send(JSON.stringify({ op: 3, d: presencePayload(currentSettings) })); // PRESENCE_UPDATE
    } catch (err) {
      console.warn('[discordBot] presence update failed:', err.message);
    }
  }, 1_000);
}

export function startBotPresence() {
  if (!botConfigured()) {
    console.log('[discordBot] presence disabled (DISCORD_BOT_TOKEN / DISCORD_GUILD_ID not set)');
    return;
  }
  closingDown = false;
  startPresence();
}

// Runtime status for the admin panel: is the bot online via gateway, what
// presence is it showing, and when did the last heartbeat land.
export function botPresenceStatus() {
  const open = gateway?.readyState === WebSocket.OPEN;
  return {
    configured: botConfigured(),
    gateway: open ? 'connected' : gateway ? 'reconnecting' : 'disconnected',
    status: currentSettings.presence?.status || 'online',
    custom_status: currentSettings.presence?.custom_status || null,
    // Whether join/boost role events are actually arriving, so the panel can say
    // why the "auto roles on join" switch is or is not doing anything.
    member_events: memberEventsState,
    member_events_opt_in: process.env.DISCORD_MEMBER_INTENT === '1',
  };
}

// Graceful shutdown handshake — Discord punishes dropped sockets less than
// half-open ones, so a clean close is worth the effort.
export function stopBotPresence() {
  closingDown = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (gateway) {
    try { gateway.close(1000); } catch { /* already gone */ }
  }
  cleanupGateway();
}
