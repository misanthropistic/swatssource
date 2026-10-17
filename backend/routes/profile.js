import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireAuth, formatUser, requireDiscordToEdit, signToken } from '../auth.js';
import { startSetup, completeSetup, disable as disableTwoFactor } from '../twoFactor.js';
import { rankForUser } from '../ranks.js';
import { sanitizeBadgeGrants } from '../badges.js';
import { upcomingEvents } from '../eventBadges.js';
import { loadRewardSettings } from '../rewards.js';

const router = express.Router();

const RESERVED = new Set([
  'admin', 'api', 'dashboard', 'login', 'register', 'legal', 'compare',
  'pricing', 'home', 'www', 'support', 'help', 'about', 'swats', 'u', 'auth'
]);

// Mirrors the frontend's card layout registry (frontend/src/constants/layouts.js):
// four layouts exist, one is premium, and the ones that were deleted fall back
// to the default rather than being stored and then rendered as nothing.
// A test pins the two lists together (profile.layouts.test.js).
const DEFAULT_LAYOUT = 'minimal';
const PREMIUM_LAYOUTS = ['slideshow'];
const REMOVED_LAYOUTS = [
  'classic', 'rail', 'stacks', 'panels', 'document', 'divider', 'showcase', 'nowplaying',
  'compact'
];
export const LAYOUTS = {
  default: DEFAULT_LAYOUT,
  premium: PREMIUM_LAYOUTS,
  removed: REMOVED_LAYOUTS,
};

// PUT /api/me/profile
// `requireDiscordToEdit` is a no-op unless an admin switched the "Auth check"
// gate on (see backend/auth.js).
router.put('/profile', requireAuth, requireDiscordToEdit, async (req, res) => {
  try {
    // `badges`, `equipped_badges` and `custom_badges` are real columns on users.
    // They used to be merged into the `profile` JSONB blob instead, so equipping
    // a badge never actually persisted — it was written to profile.equipped_badges
    // while readers looked at the column. They are pulled out of the body here.
    const {
      display_name,
      badges,
      equipped_badges,
      custom_badges,
      custom_badges_data,
      ...profileData
    } = req.body;
    const isPremium = req.user.tier === 'premium' || req.user.tier === 'admin' || req.user.is_owner;

    // Layouts that no longer exist. A profile still holding one is moved to the
    // default layout, for every tier: the alternative is saving a value whose
    // renderer is gone, which is how a page ends up blank.
    if (REMOVED_LAYOUTS.includes(profileData.layout)) {
      profileData.layout = DEFAULT_LAYOUT;
    }
    // The "advanced" card surface had its sliders removed with the Advanced
    // Appearance panel, so it is saved as the plain style it now renders as.
    if (profileData.card_style === 'advanced') {
      profileData.card_style = 'classic';
    }

    // Free tier sanity / gating checks
    if (!isPremium) {
      // Premium layouts fall back to a real free layout rather than being saved
      // and then rendered as something the account does not own.
      if (PREMIUM_LAYOUTS.includes(profileData.layout)) {
        profileData.layout = DEFAULT_LAYOUT;
      }
      // The advanced surface, per-block placement and the reveal animations are
      // Premium. Stripped rather than stored, so a free account can never end up
      // holding settings its own editor refuses to show.
      profileData.advanced_mode = false;
      profileData.section_fold = false;
      // A custom crosshair image is Premium; the upload and its geometry are
      // stripped rather than stored, so a lapsed account cannot keep rendering
      // an image its editor now refuses to show.
      delete profileData.crosshair_image;
      delete profileData.crosshair_scale;
      delete profileData.crosshair_x;
      delete profileData.crosshair_y;
      delete profileData.cursor_image;
      if (['blur', 'cascade'].includes(profileData.reveal_animation)) {
        profileData.reveal_animation = '';
      }
      // The 'made with swats.bio' footer removal is Premium; a lapsed account
      // keeps the badge on their public page.
      delete profileData.hide_footer;
    }
    // Bounds for the JSONB blob. The profile reader renders only links,
    // widgets and tracks, and no saved string needs to be enormous — but an
    // unfiltered blob let a client write megabytes of arbitrary JSON into its
    // own row on every save, which then rides in every subsequent read of that
    // profile (news feeds, search, the leaderboard join). Cap the lists the
    // page actually renders, and floor any string value at a sane size.
    const LIST_CAPS = { links: 60, widgets: 40, tracks: 30 };
    for (const [key, cap] of Object.entries(LIST_CAPS)) {
      if (Array.isArray(profileData[key]) && profileData[key].length > cap) {
        profileData[key] = profileData[key].slice(0, cap);
      }
    }
    const STRING_FLOOR = 16_000;
    const clampValues = (node) => {
      if (typeof node === 'string') return node.slice(0, STRING_FLOOR);
      if (Array.isArray(node)) return node.map(clampValues);
      if (node && typeof node === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(node)) out[k] = clampValues(v);
        return out;
      }
      return node;
    };
    const clamped = clampValues(profileData);
    for (const key of Object.keys(clamped)) profileData[key] = clamped[key];

    // Badge state is column-only. Strip any badge keys that older clients (and the
    // old buggy write path) left inside the JSONB blob, so they can never be echoed
    // back out as a second, stale source of truth for what the user owns or shows.
    for (const key of ['badges', 'equipped_badges', 'custom_badges', 'custom_badges_data']) {
      delete profileData[key];
    }

    // The cursor-buddy pets (the 8-bit chasers and their upload) were removed
    // from the product entirely. A profile still carrying the fields would
    // render nothing for them anyway — the renderer that drew the pet is gone
    // — so the fields are dropped on write and stop riding into every read.
    for (const key of ['cursor_widget', 'cursor_widget_image', 'cursor_widget_speed', 'cursor_widget_delay']) {
      delete profileData[key];
    }

    // Metadata editor fields. Lengths match the editor's own maxLengths; empties
    // become empty strings (the public page falls back to the built-ins), and
    // image URLs are profile-scoped paths or plain https links.
    if (typeof profileData.meta_title === 'string') {
      profileData.meta_title = profileData.meta_title.slice(0, 60);
    }
    if (typeof profileData.meta_description === 'string') {
      profileData.meta_description = profileData.meta_description.slice(0, 160);
    }
    if (typeof profileData.meta_image === 'string') {
      const img = profileData.meta_image.trim().slice(0, 2048);
      profileData.meta_image = img === '' || img.startsWith('/') || /^https:\/\//i.test(img) ? img : '';
    }

    // Crosshair. `cursor_image` is the old field name; it is migrated rather
    // than kept, so one value owns the pointer. Geometry is bounded to the
    // native cursor budget (128px) and the image must be an http(s) or
    // site-relative URL — never a data: URI, which would ride in every read.
    const legacyCursor = profileData.cursor_image;
    delete profileData.cursor_image;
    if (profileData.crosshair_image === undefined && typeof legacyCursor === 'string') {
      profileData.crosshair_image = legacyCursor;
    }
    if (typeof profileData.crosshair_image === 'string') {
      const img = profileData.crosshair_image.trim().slice(0, 2048);
      profileData.crosshair_image = img === '' || img.startsWith('/') || /^https:\/\//i.test(img) ? img : '';
    }
    const crosshairScale = Number(profileData.crosshair_scale);
    profileData.crosshair_scale = Number.isFinite(crosshairScale)
      ? Math.min(2.5, Math.max(0.4, crosshairScale))
      : 1;
    for (const axis of ['crosshair_x', 'crosshair_y']) {
      const n = parseInt(profileData[axis], 10);
      profileData[axis] = Number.isFinite(n) ? Math.min(127, Math.max(0, n)) : 0;
    }

    const currentProfile = req.user.profile || {};
    const mergedProfile = { ...currentProfile, ...profileData };
    for (const key of ['badges', 'equipped_badges', 'custom_badges', 'custom_badges_data']) {
      delete mergedProfile[key];
    }

    const values = [JSON.stringify(mergedProfile)];
    const sets = ['profile = $1'];

    if (display_name !== undefined) {
      values.push(String(display_name).trim().slice(0, 32));
      sets.push(`display_name = $${values.length}`);
    }

    // A client may only manage its own `custom_*` badges: staff-granted and auto
    // badges (owner, admin, verified, og, ...) are server-controlled and must not
    // be self-assignable here.
    let ownedBadges = req.user.badges || [];
    if (Array.isArray(badges)) {
      // Ownership is additive: the request may only ADD custom badges, never drop
      // one that is already owned. Otherwise a client sending a partial list would
      // silently revoke badges that were granted to the account.
      const alreadyOwned = new Set(ownedBadges);
      const requested = badges
        .map(String)
        .filter((b) => b.startsWith('custom_') && (isPremium || alreadyOwned.has(b)));
      ownedBadges = [...new Set([...ownedBadges, ...requested])];
      values.push(ownedBadges);
      sets.push(`badges = $${values.length}`);
    }

    if (Array.isArray(equipped_badges)) {
      // Only badges the user actually owns can be shown on their card.
      const owned = new Set(ownedBadges);
      values.push([...new Set(equipped_badges.map(String).filter((b) => owned.has(b)))]);
      sets.push(`equipped_badges = $${values.length}`);
    }

    const nextCustomBadges = Array.isArray(custom_badges)
      ? custom_badges
      : (Array.isArray(custom_badges_data) ? custom_badges_data : null);
    if (nextCustomBadges) {
      values.push(JSON.stringify(nextCustomBadges));
      sets.push(`custom_badges = $${values.length}`);
    }

    values.push(req.user.id);
    const { rows } = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return res.json(formatUser(rows[0]));
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ detail: 'Failed to update profile' });
  }
});

// POST /api/me/redeem-invite  { code }
// The dashboard's "Redeem invite code" card. A fresh signup can redeem an
// invite code AFTER they registered. A code can carry Premium (permanent, or a
// self-expiring trial when it has premium_days) and/or a list of badges
// (Verified, Media, OG, …) — so redeeming one can change the tier, the badge
// shelf, or both.
router.post('/redeem-invite', requireAuth, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ detail: 'Enter an invite code' });
    }

    const { rows } = await query('SELECT * FROM invite_codes WHERE code = $1 AND active = TRUE', [code]);
    const invite = rows[0];
    if (!invite || (invite.max_uses && invite.uses >= invite.max_uses)) {
      return res.status(400).json({ detail: 'Invalid or expired invite code' });
    }

    const wantsPremium = invite.grants_tier === 'premium';
    const granted = sanitizeBadgeGrants(invite.grants_badges);
    if (!wantsPremium && granted.length === 0) {
      return res.status(400).json({ detail: 'This invite code does not carry anything to redeem' });
    }

    // Admins/owner are premium by construction; a code cannot refund that.
    const isAdminOrOwner = req.user.role === 'admin' || req.user.is_owner;
    const alreadyPremium = !isAdminOrOwner && req.user.tier === 'premium';
    if (wantsPremium && alreadyPremium && granted.length === 0) {
      const still = req.user.premium_until ? ` until ${new Date(req.user.premium_until).toLocaleDateString()}` : '';
      return res.status(400).json({ detail: `You already have Premium${still}. Redeem this code after it ends.` });
    }

    const daysRaw = parseInt(invite.premium_days, 10);
    const days = Number.isFinite(daysRaw) && daysRaw >= 1 ? Math.min(daysRaw, 365) : null;
    // Extend from the later of "now" and an already-running trial, so
    // redeeming twice stacks instead of cutting the first grant short.
    const base = req.user.premium_until && new Date(req.user.premium_until) > new Date()
      ? new Date(req.user.premium_until).getTime()
      : Date.now();
    const until = days ? new Date(base + days * 86_400_000) : null;

    // Badges this account does not already wear. Only catalog ids the whitelist
    // allows can arrive here, so a forged code row still cannot mint owner/admin.
    const held = new Set(req.user.badges || []);
    const badgesAdded = granted.filter((id) => !held.has(id));
    const badges = [...new Set([...(req.user.badges || []), ...granted])];

    const { rows: updated } = await query(
      // $3 is cast explicitly: an untyped parameter inside CASE cannot be
      // inferred by Postgres and the statement fails before touching a row.
      `UPDATE users
         SET tier = CASE WHEN $3::boolean THEN 'premium' ELSE tier END,
             premium_until = CASE WHEN $3::boolean THEN $2 ELSE premium_until END,
             badges = $4
       WHERE id = $1
       RETURNING *`,
      [req.user.id, until, wantsPremium && !alreadyPremium && req.user.tier !== 'admin', badges],
    );
    await query('UPDATE invite_codes SET uses = uses + 1 WHERE code = $1', [code]);

    // Mint a fresh token: the tier rides in the JWT, so an old token would keep
    // the bearer reading as free until it expired.
    const token = signToken(updated[0]);
    return res.json({
      user: formatUser(updated[0]),
      token,
      premium_days: wantsPremium ? days : null,
      badges_added: badgesAdded,
    });
  } catch (err) {
    console.error('Invite redeem error:', err);
    return res.status(500).json({ detail: 'Failed to redeem invite code' });
  }
});

// PUT /api/me/username
router.put('/username', requireAuth, requireDiscordToEdit, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ detail: 'Username is required' });
    }

    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{2,20}$/.test(clean)) {
      return res.status(400).json({ detail: 'Username must be 2-20 characters: letters, numbers, _, .' });
    }

    if (RESERVED.has(clean)) {
      return res.status(400).json({ detail: 'This username is reserved' });
    }

    if (clean === req.user.username) {
      return res.status(400).json({ detail: 'That is already your current username' });
    }

    // 48-hour (2 days) cooldown check
    const isAdmin = req.user.role === 'admin' || req.user.is_owner;
    if (!isAdmin && req.user.last_username_change) {
      const lastChange = new Date(req.user.last_username_change).getTime();
      const now = Date.now();
      const hoursPassed = (now - lastChange) / (1000 * 60 * 60);
      if (hoursPassed < 48) {
        const remainingHours = Math.ceil(48 - hoursPassed);
        return res.status(400).json({
          detail: `You can only change your alias once every 2 days. Try again in ${remainingHours} hour${remainingHours > 1 ? 's' : ''}.`
        });
      }
    }

    const existing = await query('SELECT id FROM users WHERE LOWER(username) = $1 AND id != $2', [clean, req.user.id]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ detail: 'Username already taken' });
    }

    const { rows } = await query(
      'UPDATE users SET username = $1, last_username_change = NOW() WHERE id = $2 RETURNING *',
      [clean, req.user.id]
    );
    return res.json(formatUser(rows[0]));
  } catch (err) {
    console.error('Username update error:', err);
    return res.status(500).json({ detail: 'Failed to change username' });
  }
});

// PUT /api/me/password
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ detail: 'New password must be at least 6 characters' });
    }

    if (req.user.password_hash) {
      if (!current_password) {
        return res.status(400).json({ detail: 'Current password is required' });
      }
      const valid = await bcrypt.compare(current_password, req.user.password_hash);
      if (!valid) {
        return res.status(400).json({ detail: 'Current password is incorrect' });
      }
    }

    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    return res.json({ ok: true, detail: 'Password updated successfully' });
  } catch (err) {
    return res.status(500).json({ detail: 'Failed to update password' });
  }
});

/* ─────────────────────────── two-factor authentication ──────────────────── */

// GET /api/me/2fa — whether it is on, and how many recovery codes are left.
// The secret and the codes themselves are never readable here.
router.get('/2fa', requireAuth, async (req, res) => {
  const codes = Array.isArray(req.user.totp_recovery) ? req.user.totp_recovery : [];
  return res.json({
    enabled: !!req.user.totp_enabled,
    recovery_codes_remaining: req.user.totp_enabled ? codes.length : 0,
    enabled_at: req.user.totp_enabled_at || null,
  });
});

// POST /api/me/2fa/setup — issue a secret and the URI an authenticator scans.
// Nothing is switched on yet: the factor turns on only when a code from the app
// proves the secret was really stored (see POST /2fa/enable).
router.post('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const result = await startSetup(req.user);
    if (result.error) return res.status(409).json({ detail: result.error });
    return res.json(result);
  } catch (err) {
    console.error('2FA setup error:', err);
    return res.status(500).json({ detail: 'Could not start two-factor setup' });
  }
});

// POST /api/me/2fa/enable { code } — confirm the app works, switch it on, and
// hand back the recovery codes. This is the only time they are ever shown.
router.post('/2fa/enable', requireAuth, async (req, res) => {
  try {
    const result = await completeSetup(req.user, req.body?.code);
    if (result.error) return res.status(400).json({ detail: result.error });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('2FA enable error:', err);
    return res.status(500).json({ detail: 'Could not enable two-factor authentication' });
  }
});

// POST /api/me/2fa/disable { code } — requires a working code (or recovery code),
// so a stolen session cannot strip the protection off the account.
router.post('/2fa/disable', requireAuth, async (req, res) => {
  try {
    const result = await disableTwoFactor(req.user, req.body?.code);
    if (result.error) return res.status(400).json({ detail: result.error });
    return res.json({ ok: true });
  } catch (err) {
    console.error('2FA disable error:', err);
    return res.status(500).json({ detail: 'Could not disable two-factor authentication' });
  }
});

// POST /api/me/logout-all — bump the session version, which invalidates every
// token ever signed for this account, including this one. The point of having it
// is the stolen-laptop case: a 7-day token that cannot be revoked is not a
// session you can end.
router.post('/logout-all', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = $1 RETURNING token_version',
      [req.user.id]
    );
    return res.json({ ok: true, token_version: rows[0]?.token_version ?? 1 });
  } catch (err) {
    console.error('Sign-out-everywhere error:', err);
    return res.status(500).json({ detail: 'Could not sign out your other sessions' });
  }
});

// GET /api/me/leaderboard
//
// Where the signed-in account sits on the public board — including when it is
// far outside the 100 rows the page itself loads. The rank is computed in
// Postgres with the same ordering routes/public.js uses (most views first, then
// username), so "#412" here and "#412" on someone else's screen cannot disagree.
// GET /api/me/rewards — the account's real view-reward state: the milestones
// the admin configured, which of them this account has already been paid, and
// the next one. No copy of the ladder is stored on the client.
router.get('/rewards', requireAuth, async (req, res) => {
  try {
    const settings = await loadRewardSettings();
    const { rows } = await query(
      'SELECT views, rewarded_milestones, premium_until, tier FROM users WHERE id = $1',
      [req.user.id]
    );
    const row = rows[0] || {};
    const awarded = (row.rewarded_milestones || []).map(Number);
    const views = Number(row.views) || 0;
    const milestones = settings.milestones.map((m) => ({
      views: m.views,
      premium_days: m.premium_days,
      claimed: awarded.includes(m.views),
      progress: Math.min(100, Math.round((views / m.views) * 100)),
    }));
    const next = milestones.find((m) => !m.claimed) || null;
    return res.json({
      enabled: !!settings.enabled,
      views,
      tier: row.tier || req.user.tier,
      premium_until: row.premium_until || null,
      milestones,
      claimed: milestones.filter((m) => m.claimed),
      next,
      remaining: next ? Math.max(0, next.views - views) : 0,
    });
  } catch (err) {
    console.error('Rewards read error:', err.message);
    return res.status(500).json({ detail: 'Failed to load rewards' });
  }
});

// GET /api/me/activity — what actually happened on this account lately: the
// last validated views per day plus the account's own audit events.
router.get('/activity', requireAuth, async (req, res) => {
  try {
    const [daily, events] = await Promise.all([
      query(
        `SELECT to_char(date_trunc('day', viewed_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS views
           FROM profile_views
          WHERE user_id = $1 AND viewed_at > NOW() - INTERVAL '14 days'
          GROUP BY 1 ORDER BY 1`,
        [req.user.id]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT action, detail, created_at
           FROM audit_events
          WHERE actor_id = $1
          ORDER BY created_at DESC
          LIMIT 10`,
        [req.user.id]
      ).catch(() => ({ rows: [] })),
    ]);
    const total = daily.rows.reduce((sum, d) => sum + Number(d.views || 0), 0);
    return res.json({
      days: daily.rows,
      total_last_14: total,
      events: events.rows.map((e) => ({
        action: e.action,
        detail: e.detail || {},
        created_at: e.created_at,
      })),
    });
  } catch (err) {
    console.error('Activity read error:', err.message);
    return res.status(500).json({ detail: 'Failed to load activity' });
  }
});

router.get('/leaderboard', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (ORDER BY views DESC, LOWER(username) ASC) AS rank,
                COUNT(*) OVER () AS total
         FROM users
       )
       SELECT rank, total FROM ranked WHERE id = $1`,
      [req.user.id]
    );

    const ranked = rows[0];
    const total = Number(ranked?.total || 0);
    const rank = ranked ? Number(ranked.rank) : null;
    const views = Number(req.user.views || 0);
    // Top-N share, as a whole percent — "top 3%" is what a reader takes from a
    // rank, and it stays meaningful as the site grows.
    const percentile = rank && total ? Math.max(1, Math.round((rank / total) * 100)) : null;

    return res.json({ rank, total, views, percentile });
  } catch (err) {
    console.error('Leaderboard rank error:', err);
    return res.status(500).json({ detail: 'Failed to read your leaderboard rank' });
  }
});

/* GET /api/me/rank

   The overview's rank box. Everything is derived from the account row on every
   read (see ranks.js), so there is no stored level that can fall out of step
   with the page it describes. The account's badges come along because the box
   draws them: the rank and the shelf of badges that built it belong together.
   The event calendar rides along too, so the box can say when the next
   seasonal badge opens without a second request. */
router.get('/rank', requireAuth, async (req, res) => {
  const summary = rankForUser(req.user);
  return res.json({
    rank: summary.rank,
    next: summary.next,
    xp: summary.xp,
    intoRank: summary.intoRank,
    span: summary.span,
    toNext: summary.toNext,
    percent: summary.percent,
    badges: req.user.badges || [],
    equipped_badges: req.user.equipped_badges || [],
    events: upcomingEvents(),
  });
});

export default router;
