import './env.js'; // resolves JWT_SECRET (see env.js) before anything signs a token
import jwt from 'jsonwebtoken';
import { query } from './db.js';

/* The secret is decided in env.js, which refuses to hand out the old hard-coded
   default in production. The fallback below only ever applies if this module is
   imported without env.js having run — which is a development-only situation. */
const JWT_SECRET = process.env.JWT_SECRET || 'development-only-jwt-secret-not-for-production';

/* `tv` is the account's session version. requireAuth refuses a token whose
   version no longer matches, which is what makes "sign out everywhere" — and
   banning an account — take effect immediately instead of in up to seven days. */
export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      tier: user.tier,
      tv: Number(user.token_version || 0),
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/* ---------------------------------------------------------------------------
   Session transport

   The token arrives either as `Authorization: Bearer …` or as the session
   cookie. Both are read so the cookie can be switched on per environment
   (SESSION_COOKIE=1) without breaking a deployment that still hands the token
   to JavaScript: with the switch off, login keeps returning the token in the
   body and nothing changes. With it on, the token is only ever in an HttpOnly
   cookie, so a script on the page — including a malicious widget — cannot read
   it. See SECURITY.md for the SameSite choice this needs.
   --------------------------------------------------------------------------- */
/* With the switch off, login keeps returning the token in the
   body and nothing changes. */
export const SESSION_COOKIE = 'swats_token';

/* Cookie sessions are the DEFAULT now: the token never has to exist anywhere
   JavaScript can read it, because the browser is only ever holding an HttpOnly
   cookie. An old deployment that still hands the token to its scripts opts out
   explicitly with SESSION_COOKIE=0. */
export const cookieSessionsEnabled = () => process.env.SESSION_COOKIE !== '0';

/* Same origin means `Lax` is enough; a frontend on a different host than the API
   needs `None` (plus Secure) for the cookie to be sent on its XHRs. */
export function sessionCookieOptions() {
  const sameSite = String(process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase();
  const secure = sameSite === 'none' || process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: ['lax', 'strict', 'none'].includes(sameSite) ? sameSite : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // matches the token's own 7-day life
  };
}

/* Express has no cookie parser in this app on purpose: one dependency fewer on
   the auth path, and this reads the single name we ever set. */
export function readCookie(req, name = SESSION_COOKIE) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/* Bearer first (an API client, a test), then the cookie (a browser with cookie
   sessions on). */
export function tokenFromRequest(req) {
  const header = req.headers?.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return readCookie(req);
}

export function setSessionCookie(res, token) {
  res.cookie
    ? res.cookie(SESSION_COOKIE, token, sessionCookieOptions())
    : res.setHeader('Set-Cookie', serializeSessionCookie(token));
}

export function clearSessionCookie(res) {
  const { maxAge, ...options } = sessionCookieOptions();
  res.clearCookie
    ? res.clearCookie(SESSION_COOKIE, options)
    : res.setHeader('Set-Cookie', serializeSessionCookie('', { ...options, maxAge: 0 }));
}

/* Minimal Set-Cookie serialisation, used when `res.cookie` is absent (a bare
   response double in a test, a non-Express caller). */
function serializeSessionCookie(value, options = sessionCookieOptions()) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(value)}`, `Path=${options.path || '/'}`];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${String(options.sameSite).replace(/^./, (c) => c.toUpperCase())}`);
  if (typeof options.maxAge === 'number') parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  return parts.join('; ');
}

/* The account a token was signed for, or null when it is missing, expired or
   not ours. Used to tell "connect Discord to the account I am signed into" apart
   from "sign me in", which is the difference between linking and creating a
   second account. Only a token this server signed counts, so a hand-made OAuth
   state cannot attach a Discord identity to somebody else's profile. */
export function userIdFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    return jwt.verify(token, JWT_SECRET).sub ?? null;
  } catch {
    return null;
  }
}

export function formatUser(row) {
  const isAdminOrOwner = row.role === 'admin' || !!row.is_owner;
  const customBadges = Array.isArray(row.custom_badges) ? row.custom_badges : [];
  const profile = { ...(row.profile || {}) };
  // The badge editor reads/writes its custom list under this profile key, so it
  // is mirrored in from the column on every read. It is never persisted back
  // into the JSONB blob (see routes/profile.js) to avoid two sources of truth.
  profile.custom_badges_data = customBadges;
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name || row.username,
    email: row.email,
    role: row.role || 'user',
    tier: isAdminOrOwner ? 'premium' : (row.tier || 'free'),
    // Timed premium: when a Premium trial ends, so the dashboard can read it.
    premium_until: row.premium_until || null,
    is_owner: !!row.is_owner,
    views: row.views || 0,
    badges: row.badges || [],
    equipped_badges: row.equipped_badges || [],
    custom_badges: customBadges,
    discord: row.discord || { linked: false, username: null, booster: false },
    // Whether the second factor is on — never the secret or the recovery codes.
    two_factor_enabled: !!row.totp_enabled,
    profile,
    created_at: row.created_at,
  };
}

/* ---------------------------------------------------------------------------
   Editing gate (admin "Auth check")

   Accounts made before Discord sign-in existed have no Discord linked. When the
   admin turns this on, those accounts can still sign in and browse the
   dashboard, but their profile edits are refused until they link Discord once.
   --------------------------------------------------------------------------- */

// The single site-wide switch, read from site_settings.general.
export async function siteRequiresDiscordToEdit() {
  const { rows } = await query("SELECT value FROM site_settings WHERE key = 'general'");
  return rows[0]?.value?.auth_required_to_edit === true;
}

// Applied to the profile-writing routes. Admins and the owner are never gated.
export async function requireDiscordToEdit(req, res, next) {
  try {
    if (req.user.role === 'admin' || req.user.is_owner) return next();
    if (req.user.discord?.linked) return next();
    if (!(await siteRequiresDiscordToEdit())) return next();
    return res.status(403).json({
      code: 'discord_auth_required',
      detail:
        'Connect Discord to edit your profile. This account was created before Discord sign-in, ' +
        'so the link has to be made once — your dashboard and existing page keep working meanwhile.',
    });
  } catch (err) {
    // Fail open on purpose: an unreadable settings row must never lock people
    // out of their own profile.
    console.error('Discord edit gate check failed, allowing the edit:', err.message);
    return next();
  }
}

/* Timed Premium (invite-code or view-reward trials). The flip back to free
   does not need a cron: the first authenticated request past the deadline is
   enough, and the check is one date comparison on the row already loaded. */
export function premiumExpired(user) {
  if (!user || user.tier !== 'premium') return false;
  if (user.role === 'admin' || user.is_owner) return false;
  if (!user.premium_until) return false;
  return new Date(user.premium_until).getTime() <= Date.now();
}

// Degrade an account whose trial ran out. Best-effort: a failed write must not
// fail the request; the in-memory demotion still applies for this response.
function expireTrial(user) {
  user.tier = 'free';
  user.premium_until = null;
  query("UPDATE users SET tier = 'free', premium_until = NULL WHERE id = $1", [user.id])
    .catch((err) => console.warn('[tier] trial expiry write failed:', err.message));
}

export async function requireAuth(req, res, next) {
  try {
    const token = tokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ detail: 'Missing or invalid Authorization header' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [decoded.sub]);
    if (!rows[0]) {
      return res.status(401).json({ detail: 'User no longer exists' });
    }
    // A token signed for an older session version is a token the account has
    // already revoked: treat it exactly like an expired one.
    if (Number(decoded.tv || 0) !== Number(rows[0].token_version || 0)) {
      return res.status(401).json({ detail: 'This session was signed out. Sign in again.' });
    }
    if (premiumExpired(rows[0])) expireTrial(rows[0]);
    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ detail: 'Invalid or expired token' });
  }
}

/* Same token check as requireAuth, but a missing or bad token is not an error:
   req.user is simply left undefined. Public endpoints that show slightly more to
   a signed-in visitor (an announcement aimed at premium accounts) use this
   instead of either duplicating the JWT logic or locking anonymous visitors out. */
export async function optionalAuth(req, res, next) {
  try {
    const token = tokenFromRequest(req);
    if (!token) return next();
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [decoded.sub]);
    if (rows[0]) {
      if (Number(decoded.tv || 0) === Number(rows[0].token_version || 0)) {
        if (premiumExpired(rows[0])) expireTrial(rows[0]);
        req.user = rows[0];
      }
    }
  } catch {
    // An expired token just means "treat this visitor as anonymous".
  }
  return next();
}

export async function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && !req.user.is_owner) {
      return res.status(403).json({ detail: 'Admin privileges required' });
    }
    next();
  });
}
