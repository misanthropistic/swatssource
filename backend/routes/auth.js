import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import { query, memberNumber } from '../db.js';
import {
  signToken,
  formatUser,
  requireAuth,
  siteRequiresDiscordToEdit,
  userIdFromToken,
  cookieSessionsEnabled,
  setSessionCookie,
  clearSessionCookie,
  tokenFromRequest,
} from '../auth.js';
import { verifySecondFactor } from '../twoFactor.js';
import { computeAutoBadges, sanitizeBadgeGrants, syncRoleBadges } from '../badges.js';
import { publicBaseUrl, oauthRedirectUrl } from '../publicUrl.js';
import { applyAuthRoles } from '../discordBot.js';
// Sign-ins, sign-ups, pairings and 2FA changes all land in the audit trail: an
// admin investigating an account needs the history, not just the current row.
import { logAudit } from '../auditLog.js';

const router = express.Router();

/* The OAuth state is a small JSON blob built by /discord/login. The provider
   hands it straight back, which makes it the only thing that tells the callback
   which account started the flow.

   LEAK: no session token ever goes through it. A token in the `state` rides in
   the Discord authorize URL — the browser history on the discord.com domain,
   the referrer headers Discord's pages produce, and every hop's request log.
   Instead, a one-time nonce names the link intent and the server remembers
   which account it belongs to; the callback burns the nonce on first use. */
const pendingLinks = new Map(); // nonce -> { userId, ts }
const PENDING_LINK_TTL = 10 * 60 * 1000;

function prunePendingLinks() {
  const now = Date.now();
  for (const [nonce, entry] of pendingLinks) {
    if (now - entry.ts > PENDING_LINK_TTL) pendingLinks.delete(nonce);
  }
}

// Start a link: resolve the visitor's session from the request itself — the
// Bearer header or, by default, the HttpOnly cookie — remember it under a
// nonce, and put only the nonce in the state.
function stageLink(req, kind = 'link') {
  const uid = userIdFromToken(tokenFromRequest(req));
  if (!uid) return null;
  prunePendingLinks();
  const nonce = crypto.randomBytes(24).toString('hex');
  // `kind` is what makes "Connect Discord" and "Add another account" two
  // different flows over the same OAuth round trip: `link` attaches the Discord
  // identity to the signed-in account, `pair` attaches the OTHER account to it.
  pendingLinks.set(nonce, { userId: uid, kind, ts: Date.now() });
  return nonce;
}

export function parseOAuthState(state) {
  if (typeof state !== 'string' || !state) return {};
  try {
    const parsed = JSON.parse(state);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/* What the callback should DO with this state: which account started the flow
   and whether it asked to connect Discord to that account (`link`) or to add a
   second account to it (`pair`). One nonce, burned on first read.

   Accepts both the nonce form the login route issues now and the legacy `token`
   form still in flight from before this hardening — an already-open Discord tab
   must not come back claiming nobody is signed in. */
export function readLinkIntent(state) {
  const parsed = parseOAuthState(state);
  if (typeof parsed.nonce === 'string' && parsed.nonce) {
    prunePendingLinks();
    const entry = pendingLinks.get(parsed.nonce);
    // Burned on first use: a nonce that hands its account to two callbacks is
    // not one-time at all.
    pendingLinks.delete(parsed.nonce);
    return entry ? { userId: entry.userId, kind: entry.kind === 'pair' ? 'pair' : 'link' } : null;
  }
  const legacy = userIdFromToken(parsed.token);
  return legacy === null ? null : { userId: legacy, kind: 'link' };
}

/* The account id from a link-mode state, or null for a plain sign-in. A PAIR
   intent is deliberately not one: pairing must never be mistaken for a
   connect, or the signed-in account would end up wearing the other one's
   Discord identity. */
export function readLinkToken(state) {
  const intent = readLinkIntent(state);
  return intent && intent.kind === 'link' ? intent.userId : null;
}

const RESERVED = new Set([
  'admin', 'api', 'dashboard', 'login', 'register', 'legal', 'compare',
  'pricing', 'home', 'www', 'support', 'help', 'about', 'swats', 'u', 'auth'
]);

/* The general settings row, read once per request. Every auth decision below
   (registration open, invite-only, Discord required) comes from this object, so
   they can never disagree with each other. */
async function generalSettings() {
  const { rows } = await query("SELECT value FROM site_settings WHERE key = 'general'");
  return rows[0]?.value || {};
}

// GET /api/auth/config — what the sign-in page needs to know before it renders:
// whether Discord is the only way in, and whether OAuth is even configured.
router.get('/config', async (req, res) => {
  try {
    const settings = await generalSettings().catch(() => ({}));
    return res.json({
      discord_required: settings.discord_required === true,
      discord_available: !!process.env.DISCORD_CLIENT_ID,
      registration_open: settings.registration_open !== false && settings.maintenance_mode !== true,
      invite_only: settings.invite_only === true,
    });
  } catch {
    return res.json({ discord_required: false, discord_available: false, registration_open: true, invite_only: false });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, username, display_name, invite_code } = req.body;

    // Check site settings for registration status
    const genSettings = await generalSettings();
    if (genSettings.registration_open === false || genSettings.maintenance_mode === true) {
      return res.status(403).json({ detail: 'Account registration is currently disabled by site administration' });
    }

    // Discord-first sign-up: when the admin requires Discord there is no password
    // account to create, so this route refuses and points at OAuth instead of
    // letting someone build a second, unlinked account.
    if (genSettings.discord_required === true) {
      return res.status(403).json({
        code: 'discord_required',
        detail: 'Sign up with Discord — this site requires a linked Discord account to register.',
      });
    }

    if (!email || !password || !username) {
      return res.status(400).json({ detail: 'Email, password, and username are required' });
    }

    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{2,20}$/.test(cleanUsername)) {
      return res.status(400).json({ detail: 'Username must be 2-20 characters: letters, numbers, _, .' });
    }

    if (RESERVED.has(cleanUsername)) {
      return res.status(400).json({ detail: 'This username is reserved' });
    }

    // Check existing
    const existing = await query(
      'SELECT id, username, email FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $2',
      [email.toLowerCase(), cleanUsername]
    );
    if (existing.rows.length > 0) {
      const match = existing.rows[0];
      if (match.email.toLowerCase() === email.toLowerCase()) {
        return res.status(400).json({ detail: 'Email is already registered' });
      }
      return res.status(400).json({ detail: 'Username is already taken' });
    }

    // Check invite code if provided or if invite-only mode is active
    let inviteUsed = null;
    // A code can carry a paid tier with it (see the invite generator), so the
    // account it creates starts on that tier instead of always 'free'.
    let inviteTier = 'free';
    // …and a duration: premium_days makes that tier a self-expiring trial.
    let premiumDays = null;
    // …and badges, validated against the catalog when the code is redeemed.
    let inviteBadges = [];
    if (invite_code) {
      const invCheck = await query('SELECT * FROM invite_codes WHERE code = $1 AND active = TRUE', [invite_code.trim()]);
      if (invCheck.rows.length === 0 || (invCheck.rows[0].max_uses && invCheck.rows[0].uses >= invCheck.rows[0].max_uses)) {
        return res.status(400).json({ detail: 'Invalid or expired invite code' });
      }
      inviteUsed = invite_code.trim();
      // …and badges: the code can hand out Verified / Media / OG to whoever it
      // creates, so no admin has to edit each new account by hand.
      inviteBadges = sanitizeBadgeGrants(invCheck.rows[0].grants_badges);
      // Only ever accept a tier we actually grant; never trust the column blindly.
      const granted = invCheck.rows[0].grants_tier;
      if (granted === 'premium') inviteTier = 'premium';
      // A code can ALSO carry a duration: premium_days turns the grant into a
      // timed trial that expires by itself (see auth.js premiumExpired).
      const days = parseInt(invCheck.rows[0].premium_days, 10);
      if (granted === 'premium' && Number.isFinite(days) && days >= 1) {
        premiumDays = Math.min(days, 365);
        permanentTrial = false;
      }
      await query('UPDATE invite_codes SET uses = uses + 1 WHERE code = $1', [inviteUsed]);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const initialProfile = {
      bio: '',
      avatar_url: '',
      banner_url: '',
      background_url: '',
      audio_url: '',
      theme_color: '#FF7FBC',
      accent_color: '#FFB8DB',
      name_font: 'Unbounded',
      display_font: 'Unbounded',
      bio_font: 'Inter',
      layout: 'floating',
      card_style: 'classic',
      links: [],
      widgets: [],
      tracks: [],
    };

    const insertRes = await query(`
      INSERT INTO users (email, password_hash, username, display_name, role, tier, profile, invite_code_used, premium_until)
      VALUES ($1, $2, $3, $4, 'user', $5, $6, $7, $8)
      RETURNING *
    `, [
      email.toLowerCase(),
      passwordHash,
      cleanUsername,
      display_name || cleanUsername,
      inviteTier,
      JSON.stringify(initialProfile),
      inviteUsed,
      // Premium with a duration starts its clock at sign-up; every other grant
      // has no expiry at all.
      premiumDays ? new Date(Date.now() + premiumDays * 86_400_000) : null,
    ]);

    let user = insertRes.rows[0];
    const badges = await computeAutoBadges(user);
    // An invite code can carry badges too, so the account it creates wears them
    // from the first moment. Same whitelist the admin UI writes through — a
    // code can never hand out owner/admin.
    if (inviteBadges.length) {
      for (const id of inviteBadges) if (!badges.includes(id)) badges.push(id);
    }
    if (badges.length > 0) {
      const updated = await query('UPDATE users SET badges = $1 WHERE id = $2 RETURNING *', [badges, user.id]);
      user = updated.rows[0];
    }

    const uid_number = await memberNumber(user.id, user.created_at);
    const token = signToken(user);
    await logAudit({
      req,
      actor: { id: user.id, username: user.username, role: user.role },
      action: 'auth.signup',
      targetType: 'user',
      targetId: user.id,
      detail: { email: user.email, invite_code: inviteUsed || null, tier: user.tier },
    });
    return res.json(sessionPayload(res, token, { ...formatUser(user), uid_number }));
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ detail: `Registration failed: ${err.message || 'Database or internal server error'}` });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const ident = req.body.email || req.body.username || req.body.identifier;
    const { password } = req.body;
    if (!ident || !ident.trim() || !password) {
      return res.status(400).json({ detail: 'Username/Email and password required' });
    }

    const cleanIdent = ident.trim().toLowerCase();
    const { rows } = await query(
      'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $1',
      [cleanIdent]
    );

    if (rows.length === 0) {
      return res.status(401).json({ detail: 'Invalid credentials' });
    }

    const user = rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ detail: 'This account signs in with Discord' });
    }

    // Discord-required mode blocks the password path for accounts that have no
    // Discord link yet. Nothing is lost by that: the OAuth callback matches an
    // existing account by email address, so signing in with the same Discord
    // email lands back on this very account and links it in the same step.
    // Admins and the owner are exempt so the switch can always be turned back off.
    if (user.role !== 'admin' && !user.is_owner) {
      const settings = await generalSettings().catch(() => ({}));
      if (settings.discord_required === true && !user.discord?.linked) {
        return res.status(403).json({
          code: 'discord_required',
          detail:
            'Sign in with Discord to continue. Use the same email address and this account will be linked automatically.',
        });
      }
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ detail: 'Invalid credentials' });
    }

    // Second factor, checked only after the password is known to be right — so
    // this answer cannot be used to discover which accounts have 2FA on, and a
    // wrong password never reaches the code check. `totp_required` tells the
    // sign-in page to ask for the code instead of showing "invalid credentials".
    if (user.totp_enabled) {
      const code = req.body.code || req.body.totp_code;
      if (!code) {
        return res.status(401).json({
          code: 'totp_required',
          detail: 'Enter the 6-digit code from your authenticator app.',
        });
      }
      if (!(await verifySecondFactor(user, code))) {
        return res.status(401).json({
          code: 'totp_required',
          detail: 'That code is not right. Use the current code, or one of your recovery codes.',
        });
      }
    }

    // Refresh auto badges
    const badges = await computeAutoBadges(user);
    if (JSON.stringify(badges) !== JSON.stringify(user.badges)) {
      await query('UPDATE users SET badges = $1 WHERE id = $2', [badges, user.id]);
      user.badges = badges;
    }

    const uid_number = await memberNumber(user.id, user.created_at);
    const token = signToken(user);
    await logAudit({
      req,
      actor: { id: user.id, username: user.username, role: user.is_owner ? 'owner' : user.role },
      action: 'auth.signin',
      targetType: 'user',
      targetId: user.id,
      detail: { method: 'password', two_factor: !!user.totp_enabled },
    });
    return res.json(sessionPayload(res, token, { ...formatUser(user), uid_number }));
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ detail: `Login failed: ${err.message || 'Database or internal server error'}` });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const badges = await computeAutoBadges(req.user);
  // The editor preview reads the numeric UID straight off this payload so the
  // owner sees exactly what a visitor sees.
  const uid_number = await memberNumber(req.user.id, req.user.created_at);
  // Surfaced so the dashboard can warn before an edit is attempted, instead of
  // letting someone fill in a whole page and lose it to a 403 on save. A failed
  // read must not break sign-in, so it falls back to "not required".
  const auth_required_to_edit = await siteRequiresDiscordToEdit().catch(() => false);
  if (JSON.stringify(badges) !== JSON.stringify(req.user.badges)) {
    const { rows } = await query('UPDATE users SET badges = $1 WHERE id = $2 RETURNING *', [badges, req.user.id]);
    return res.json({ ...formatUser(rows[0]), uid_number, auth_required_to_edit });
  }
  return res.json({ ...formatUser(req.user), uid_number, auth_required_to_edit });
});

/* The body of a successful sign-in.

   With cookie sessions on, the token is set as an HttpOnly cookie and left out
   of the JSON, so no script on the page can read it. With them off, the shape is
   exactly what it always was and the SPA keeps working unchanged. */
function sessionPayload(res, token, user) {
  setSessionCookie(res, token);
  return cookieSessionsEnabled() ? { user, cookie_session: true } : { token, user };
}

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  // The cookie is the only copy the browser holds, so clearing it is the whole
  // job here. "Sign out of every device" is a different, deliberate action
  // (POST /api/me/logout-all) because it also invalidates other sessions.
  clearSessionCookie(res);
  return res.json({ ok: true });
});

/* ---------------------------------------------------------------------------
   Multi-account switching.

   Pairing is mutual and deliberate: to add an account you sign into THAT
   account once, with its own password and second factor, and both sides record
   the link. A switch then re-issues a session for the other account without
   ever re-entering credentials — switching WITHOUT a link would let anybody
   with a stolen session wander into a stranger's dashboard, so only a paired
   account answers. */

function linkedOf(row) {
  return Array.isArray(row.linked_accounts) ? row.linked_accounts.map(String) : [];
}

function switchableSummary(row) {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name || row.username,
    avatar_url: row.profile?.avatar_url || null,
    tier: row.tier || 'free',
  };
}

// The pair the signed-in account can currently switch between, current first.
async function switchableList(user) {
  const ids = linkedOf(user);
  const rows = ids.length
    ? (await query('SELECT * FROM users WHERE id = ANY($1::uuid[])', [ids])).rows
    : [];
  // A row disappears below when the other side removed its half of the link —
  // the pairing is mutual, so only mutual pairs switch.
  return [user, ...rows.filter((r) => linkedOf(r).includes(String(user.id)))].map(switchableSummary);
}

router.get('/switchable', requireAuth, async (req, res) => {
  try {
    return res.json({ accounts: await switchableList(req.user) });
  } catch (err) {
    console.error('Switchable list error:', err);
    return res.status(500).json({ detail: 'Could not read linked accounts' });
  }
});

// Pair the signed-in account with another one, verified with its own password
// (and second factor when that account has one). Both sides store the link, so
// either dashboard can switch from then on.
router.post('/link-account', requireAuth, async (req, res) => {
  try {
    const ident = (req.body.email || req.body.username || req.body.identifier || '').trim().toLowerCase();
    const { password, code } = req.body;
    if (!ident || !password) {
      return res.status(400).json({ detail: 'Email/username and password are required' });
    }
    if (req.user.password_hash) {
      // Signing into a second account with the SAME credentials adds nothing
      // and exists only to confuse — refuse.
      const same = await bcrypt.compare(password, req.user.password_hash)
        && ((req.user.email || '').toLowerCase() === ident || req.user.username === ident);
      if (same) {
        return res.status(400).json({ detail: 'That is the account you are already signed into' });
      }
    }

    const { rows } = await query(
      'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $1',
      [ident]
    );
    if (rows.length === 0) return res.status(401).json({ detail: 'Invalid credentials' });
    const other = rows[0];
    if (!other.password_hash) {
      return res.status(401).json({ detail: 'This account signs in with Discord' });
    }
    const valid = await bcrypt.compare(password, other.password_hash);
    if (!valid) return res.status(401).json({ detail: 'Invalid credentials' });
    if (other.totp_enabled && !(await verifySecondFactor(other, code || req.body.totp_code || ''))) {
      return res.status(401).json({ code: 'totp_required', detail: 'That account needs its 6-digit code.' });
    }
    if (String(other.id) === String(req.user.id)) {
      return res.status(400).json({ detail: 'That is the account you are already signed into' });
    }

    const mine = linkedOf(req.user);
    const theirs = linkedOf(other);
    if (mine.includes(String(other.id)) && theirs.includes(String(req.user.id))) {
      return res.json({ accounts: await switchableList(req.user) });
    }
    mine.push(String(other.id));
    theirs.push(String(req.user.id));
    await query('UPDATE users SET linked_accounts = $1::jsonb WHERE id = $2', [JSON.stringify(mine), req.user.id]);
    await query('UPDATE users SET linked_accounts = $1::jsonb WHERE id = $2', [JSON.stringify(theirs), other.id]);
    await logAudit({
      req,
      action: 'account.link',
      targetType: 'user',
      targetId: other.id,
      detail: { method: 'password', paired_with: { username: other.username } },
    });
    return res.json({ accounts: await switchableList({ ...req.user, linked_accounts: mine }) });
  } catch (err) {
    console.error('Link account error:', err);
    return res.status(500).json({ detail: 'Could not link that account' });
  }
});

// Remove one side of a pair; the other side's half goes with it.
router.delete('/link-account/:id', requireAuth, async (req, res) => {
  try {
    const target = String(req.params.id);
    const mine = linkedOf(req.user).filter((id) => id !== target);
    await query('UPDATE users SET linked_accounts = $1::jsonb WHERE id = $2', [JSON.stringify(mine), req.user.id]);
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [target]);
    if (rows[0]) {
      await query(
        'UPDATE users SET linked_accounts = $1::jsonb WHERE id = $2',
        [JSON.stringify(linkedOf(rows[0]).filter((id) => id !== String(req.user.id))), target],
      );
    }
    const { rows: fresh } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    await logAudit({
      req,
      action: 'account.unlink',
      targetType: 'user',
      targetId: target,
      detail: { removed_username: rows[0]?.username || null },
    });
    return res.json({ accounts: await switchableList(fresh[0] || req.user) });
  } catch (err) {
    console.error('Unlink account error:', err);
    return res.status(500).json({ detail: 'Could not remove that link' });
  }
});

// Swap the session to another mutually linked account. The response carries the
// new session exactly like a sign-in does, so the client just calls refresh().
router.post('/switch/:id', requireAuth, async (req, res) => {
  try {
    const targetId = String(req.params.id);
    if (targetId === String(req.user.id)) {
      return res.status(400).json({ detail: 'Already signed into that account' });
    }
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ detail: 'That account no longer exists' });
    const target = rows[0];
    // Mutual check — a stolen session can never hop into an account that has
    // not deliberately paired with the session's owner.
    if (!linkedOf(target).includes(String(req.user.id)) || !linkedOf(req.user).includes(targetId)) {
      return res.status(403).json({ detail: 'That account is not linked to this one' });
    }
    const token = signToken(target);
    const uid_number = await memberNumber(target.id, target.created_at);
    await logAudit({
      req,
      action: 'account.switch',
      targetType: 'user',
      targetId: target.id,
      detail: { from: { id: req.user.id, username: req.user.username }, to: { username: target.username } },
    });
    return res.json(sessionPayload(res, token, { ...formatUser(target), uid_number }));
  } catch (err) {
    console.error('Account switch error:', err);
    return res.status(500).json({ detail: 'Could not switch accounts' });
  }
});

// GET /api/auth/discord/login
router.get('/discord/login', async (req, res) => {
  const { mode = 'login' } = req.query;
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId || clientId === 'undefined') {
    return res.status(400).json({ detail: 'Discord OAuth is not configured on the server (missing DISCORD_CLIENT_ID environment variable)' });
  }
  // One implementation for every OAuth callback URL: it repairs the pasted
  // scheme/slashes in DISCORD_REDIRECT_URI, and falls back to this request's own
  // origin. Hand-rolled `${req.protocol}://${req.get('host')}` here is what let
  // this route and the Spotify one drift apart.
  const redirectUri = encodeURIComponent(
    oauthRedirectUrl(req, 'DISCORD_REDIRECT_URI', '/api/auth/discord/callback')
  );
  const scope = encodeURIComponent('identify email guilds guilds.members.read');
  // The query's `token` parameter is ignored on purpose: a token in the
  // authorize URL leaks it to Discord's logs and history. A link intent is
  // staged server-side under a nonce instead, from the session the request
  // already carries (Bearer or cookie).
  // `link` connects Discord to the signed-in account; `pair` adds the OTHER
  // Discord account as a switchable pair. Both are staged server-side under a
  // nonce, so neither needs (or leaks) a token in the authorize URL.
  let staged = {};
  if (mode === 'link' || mode === 'pair') {
    const nonce = stageLink(req, mode);
    // No session means there is no account to attach the identity to. Letting
    // the round trip continue would quietly turn "add an account" into "sign in
    // as the other account" — the exact mix-up pairing exists to prevent — so it
    // stops here instead.
    if (!nonce) {
      return res.status(401).json({ detail: 'Sign in again before adding another account' });
    }
    staged = mode === 'link' ? { link: true, nonce } : { pair: true, nonce };
  }
  const state = encodeURIComponent(JSON.stringify({ mode, ...staged }));

  const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;
  return res.json({ url });
});

// GET /api/auth/discord/callback
router.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  // FRONTEND_URL is already repaired on import (see env.js); the request's own
  // origin is the fallback when it is not configured at all.
  const rawFrontendUrl = (process.env.FRONTEND_URL || publicBaseUrl(req)).split(',')[0];
  const frontendUrl = rawFrontendUrl.replace(/\/+$/, '');

  if (!code) {
    return res.redirect(`${frontendUrl}/!/login?discord=error`);
  }

  try {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    // Must be byte-identical to the value sent to /authorize above, which is why
    // both call the same helper with the same arguments.
    const redirectUri = oauthRedirectUrl(req, 'DISCORD_REDIRECT_URI', '/api/auth/discord/callback');

    // 1. Exchange OAuth code for access token
    const tokenRes = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenRes.data.access_token;

    // 2. Fetch Discord user details
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const dUser = userRes.data;

    // 3. Guild booster check if Bot Token & Guild ID present
    let isBooster = false;
    let isMember = false;
    let guildRoles = [];
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (botToken && guildId) {
      try {
        const guildRes = await axios.get(`https://discord.com/api/guilds/${guildId}/members/${dUser.id}`, {
          headers: { Authorization: `Bot ${botToken}` },
        });
        if (guildRes.data) {
          isMember = true;
          isBooster = !!guildRes.data.premium_since;
          // The member's role ids ride along: this is what the OG/Verified
          // badge sync reads the next time auto-badges are recomputed.
          guildRoles = guildRes.data.roles || [];
        }
      } catch (err) {
        console.log('Discord Guild member check status:', err.response?.status);
      }
    }

    const discordPayload = {
      linked: true,
      id: dUser.id,
      username: dUser.username,
      avatar: dUser.avatar ? `https://cdn.discordapp.com/avatars/${dUser.id}/${dUser.avatar}.png` : null,
      booster: isBooster,
      member: isMember,
      guild_roles: guildRoles,
    };

    // "Connect Discord" starts from an account that is already signed in, so the
    // state's token decides which account this Discord identity belongs to.
    // Without it the callback could only match by Discord id or email and 
    // inserted a new user when neither matched, which is exactly why connecting
    // Discord from an existing profile produced a second account.
    const intent = readLinkIntent(state);
    const linkUserId = intent?.kind === 'link' ? intent.userId : null;
    const pairUserId = intent?.kind === 'pair' ? intent.userId : null;

    /* ADD ANOTHER ACCOUNT.
     *
     * Accounts are created and signed into with Discord, so verifying a second
     * account with a password could never work — an account with no password
     * hash simply cannot be proven that way, which is exactly why the old
     * "Add another account" form was dead for everyone on this site. Pairing
     * proves POSSESSION OF THE SECOND DISCORD ACCOUNT instead: the visitor signs
     * into it, the callback matches it to its swats account, and the two are
     * linked mutually. The session on screen never changes here. */
    if (pairUserId) {
      const me = (await query('SELECT * FROM users WHERE id = $1', [pairUserId])).rows[0];
      if (!me) return res.redirect(`${frontendUrl}/!/login?discord=error`);

      const other = (await query("SELECT * FROM users WHERE discord->>'id' = $1", [dUser.id])).rows[0];
      if (!other) {
        // Nothing to pair with: this Discord identity has never signed in here.
        return res.redirect(`${frontendUrl}/!/auth/discord?pair=missing`);
      }
      if (String(other.id) === String(me.id)) {
        return res.redirect(`${frontendUrl}/!/auth/discord?pair=same`);
      }

      const mine = linkedOf(me);
      const theirs = linkedOf(other);
      if (!mine.includes(String(other.id))) mine.push(String(other.id));
      if (!theirs.includes(String(me.id))) theirs.push(String(me.id));
      await query('UPDATE users SET linked_accounts = $1::jsonb WHERE id = $2', [JSON.stringify(mine), me.id]);
      await query('UPDATE users SET linked_accounts = $1::jsonb WHERE id = $2', [JSON.stringify(theirs), other.id]);

      await logAudit({
        actor: { id: me.id, username: me.username, role: me.role },
        action: 'account.pair',
        targetType: 'user',
        targetId: other.id,
        detail: { paired_with: { username: other.username, discord_id: discordPayload.id } },
      });

      // No session cookie is set: pairing is not signing in.
      return res.redirect(`${frontendUrl}/!/auth/discord?paired=1`);
    }

    if (linkUserId) {
      // Never take an identity away from whoever already owns it.
      const owner = await query(
        "SELECT id FROM users WHERE discord->>'id' = $1 AND id <> $2",
        [dUser.id, linkUserId]
      );
      if (owner.rows.length > 0) {
        return res.redirect(`${frontendUrl}/!/auth/discord?link=taken`);
      }
    }

    // Check if user exists with this discord id (or, when linking, the account
    // the visitor is already signed in as)
    let { rows } = linkUserId
      ? await query('SELECT * FROM users WHERE id = $1', [linkUserId])
      : await query("SELECT * FROM users WHERE discord->>'id' = $1", [dUser.id]);
    let user;
    // Whether this callback made a brand-new account — the audit row says
    // "signed up" rather than "signed in" because of it.
    let created = false;

    if (rows.length > 0) {
      user = rows[0];
      const badges = await computeAutoBadges({ ...user, discord: discordPayload });
      const upd = await query(
        'UPDATE users SET discord = $1, badges = $2 WHERE id = $3 RETURNING *',
        [JSON.stringify(discordPayload), badges, user.id]
      );
      user = upd.rows[0];
    } else if (linkUserId) {
      // The token named an account that no longer exists. Do not quietly create a
      // replacement for it — send the visitor back to sign in again.
      return res.redirect(`${frontendUrl}/!/login?discord=error`);
    } else {
      // Find by email or create new
      const emailMatch = await query('SELECT * FROM users WHERE LOWER(email) = $1', [dUser.email ? dUser.email.toLowerCase() : '']);
      if (emailMatch.rows.length > 0) {
        user = emailMatch.rows[0];
        const badges = await computeAutoBadges({ ...user, discord: discordPayload });
        const upd = await query(
          'UPDATE users SET discord = $1, badges = $2 WHERE id = $3 RETURNING *',
          [JSON.stringify(discordPayload), badges, user.id]
        );
        user = upd.rows[0];
      } else {
        // Create new account
        let baseUsername = dUser.username.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 15) || 'user';
        let candidate = baseUsername;
        let c = 1;
        while ((await query('SELECT id FROM users WHERE LOWER(username) = $1', [candidate])).rows.length > 0) {
          candidate = `${baseUsername}${c++}`;
        }

        const initialProfile = {
          bio: '',
          avatar_url: discordPayload.avatar || '',
          theme_color: '#FF7FBC',
          accent_color: '#FFB8DB',
          name_font: 'Unbounded',
          display_font: 'Unbounded',
          bio_font: 'Inter',
          layout: 'floating',
          card_style: 'classic',
          links: [],
          widgets: [],
          tracks: [],
        };

        const ins = await query(`
          INSERT INTO users (email, username, display_name, role, tier, discord, profile)
          VALUES ($1, $2, $3, 'user', 'free', $4, $5)
          RETURNING *
        `, [
          dUser.email ? dUser.email.toLowerCase() : `${dUser.id}@discord.swats.bio`,
          candidate,
          dUser.global_name || dUser.username,
          JSON.stringify(discordPayload),
          JSON.stringify(initialProfile),
        ]);
        user = ins.rows[0];
        created = true;
        const badges = await computeAutoBadges(user);
        if (badges.length > 0) {
          const upd = await query('UPDATE users SET badges = $1 WHERE id = $2 RETURNING *', [badges, user.id]);
          user = upd.rows[0];
        }
      }
    }

    await logAudit({
      req,
      actor: { id: user.id, username: user.username, role: user.role },
      action: linkUserId ? 'discord.connect' : created ? 'auth.signup' : 'auth.signin',
      targetType: 'user',
      targetId: user.id,
      detail: { method: 'discord', discord_id: discordPayload.id, email: user.email },
    });

    const jwtToken = signToken(user);
    // `linked=1` tells the frontend this was a connect, not a sign-in, so it can
    // say so instead of silently swapping the session it already had.
    const linkedFlag = linkUserId ? '&linked=1' : '';

    // Hand the mapped Discord roles over — Verified, OG, member, booster and any
    // custom mapping the admin wired up. Never blocks the sign-in: applyAuthRoles
    // swallows per-role Discord errors, and a genuine bug here must not turn the
    // login page into an error page.
    try {
      const roles = await applyAuthRoles(discordPayload.id, discordPayload);
      if (roles.applied.length > 0) {
        console.log(`[auth] assigned Discord roles to ${user.username}: ${roles.applied.join(', ')}`);
      }
      // The roles the bot just confirmed are the authoritative list for the
      // badge side of the mapping — including when the member lookup that
      // fills guild_roles failed (the OG role is still held in Discord, and
      // applyAuthRoles just re-asserted it). This is what makes "holding the OG
      // role grants the OG badge" true on the sign-in that links the account.
      const badges = await syncRoleBadges(user, roles.applied);
      user = { ...user, badges };
    } catch (err) {
      console.error('[auth] Discord role assignment failed:', err.message);
    }

    // With cookie sessions on the token travels in the cookie this response
    // sets, not in a URL the browser keeps in history, the referrer header and
    // every server log it passes through.
    setSessionCookie(res, jwtToken);
    if (cookieSessionsEnabled()) {
      return res.redirect(`${frontendUrl}/!/auth/discord?session=1${linkedFlag}`);
    }

    return res.redirect(`${frontendUrl}/!/auth/discord?token=${jwtToken}${linkedFlag}`);
  } catch (err) {
    console.error('Discord callback error:', err);
    return res.redirect(`${frontendUrl}/!/login?discord=error`);
  }
});

export default router;
