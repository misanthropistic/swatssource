import express from 'express';
import { query, memberNumber } from '../db.js';
import { BADGE_CATALOG } from '../badges.js';
import { eventBadgeCatalog, upcomingEvents } from '../eventBadges.js';

const router = express.Router();

const RESERVED = new Set([
  'admin', 'api', 'dashboard', 'login', 'register', 'legal', 'compare',
  'pricing', 'home', 'www', 'support', 'help', 'about', 'swats', 'u', 'auth'
]);

// Discord asks the site to prove domain ownership when mapping swats.bio to
// an embedded activity / URL mapping: it fetches /.well-known/discord and looks
// for its verification token. Served as plain text exactly as generated; a
// 200 here is the whole proof. The static build also ships this file (see
// frontend/public/.well-known/discord) — whichever host Discord reaches first
// answers the same.
router.get('/.well-known/discord', (req, res) => {
  res.type('text/plain').send('dh=ee81cdd3e63320ecc6f57bab3ee28767de8b41ae');
});

router.get('/u/:alias', async (req, res) => {
  try {
    const alias = req.params.alias.trim().toLowerCase();
    const { rows } = await query('SELECT * FROM users WHERE LOWER(username) = $1', [alias]);

    if (rows.length === 0) {
      return res.status(404).json({ detail: 'User not found' });
    }

    const user = rows[0];
    // 1-based signup rank, shown as the profile's numeric UID.
    const uid_number = await memberNumber(user.id, user.created_at);

    // Views are NOT incremented here any more. A view is only counted through
    // /api/views/register, after the visitor has dwelled on the page and solved
    // the challenge — so simply loading this endpoint (or a bot hammering it)
    // can never inflate the number. This endpoint reports the current total.
    return res.json({
      id: user.id,
      uid_number,
      username: user.username,
      display_name: user.display_name || user.username,
      tier: user.tier,
      views: user.views || 0,
      // The join date a card can show. It is the same signup time the member
      // number is derived from, and it is public by design.
      created_at: user.created_at || null,
      badges: user.badges || [],
      // The curated set the owner chose to display. Falls back to every owned
      // badge only when nothing is equipped, so an empty selection stays empty.
      equipped_badges: Array.isArray(user.equipped_badges) ? user.equipped_badges : [],
      custom_badges: Array.isArray(user.custom_badges) ? user.custom_badges : [],
      discord: user.discord || {},
      profile: user.profile || {},
      badge_catalog: BADGE_CATALOG,
    });
  } catch (err) {
    console.error('Public profile error:', err);
    return res.status(500).json({ detail: 'Failed to fetch public profile' });
  }
});

// GET /api/check-username?alias=
router.get('/check-username', async (req, res) => {
  try {
    const raw = (req.query.alias || '').trim().toLowerCase();
    if (!raw) {
      return res.json({ available: false, alias: raw, reason: 'Username cannot be blank' });
    }

    if (!/^[a-z0-9_.]{2,20}$/.test(raw)) {
      return res.json({ available: false, alias: raw, reason: '2-20 characters: letters, numbers, _, .' });
    }

    if (RESERVED.has(raw)) {
      return res.json({ available: false, alias: raw, reason: 'Reserved platform name' });
    }

    const { rows } = await query('SELECT id FROM users WHERE LOWER(username) = $1', [raw]);
    if (rows.length > 0) {
      return res.json({ available: false, alias: raw, reason: 'Already taken' });
    }

    return res.json({ available: true, alias: raw, reason: 'Available' });
  } catch (err) {
    return res.status(500).json({ available: false, reason: 'Server check error' });
  }
});

// GET /api/leaderboard[?limit=&with=widgets]
//
// The landing page draws real widget cards from real profiles, which needs each
// row's widget configuration. That is public (a profile renders it for everyone),
// but it is heavy — a widget carries its whole option set — so it is opt-in via
// `?with=widgets` and the default payload stays the lean one the dashboard uses.
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 100);
    const withWidgets = String(req.query.with || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .includes('widgets');

    // Ranking is done in SQL, not by counting array positions in the client, so
    // #N means the same thing to every viewer and to the profile page's own rank
    // read. The tie-break (most views, then username) makes the order stable:
    // `ORDER BY views DESC` alone left two accounts on equal views swapping
    // places between requests, which renumbered everyone below them.
    //
    // `limit` is a clamped integer (1–100), so it is safe to inline in the way
    // the rest of the dashboard's paginated reads do.
    const { rows } = await query(`
      WITH ranked AS (
        SELECT id, username, display_name, tier, views, badges, profile, created_at,
               ROW_NUMBER() OVER (ORDER BY views DESC, LOWER(username) ASC) AS rank
        FROM users
      )
      SELECT * FROM ranked
      ORDER BY rank
      LIMIT ${limit}
    `);

    const sanitized = rows.map((u) => ({
      id: u.id,
      rank: Number(u.rank) || null,
      username: u.username,
      display_name: u.display_name || u.username,
      tier: u.tier,
      views: u.views || 0,
      badges: u.badges || [],
      avatar_url: u.profile?.avatar_url || '',
      accent_color: u.profile?.accent_color || '',
      created_at: u.created_at || null,
      ...(withWidgets ? { widgets: Array.isArray(u.profile?.widgets) ? u.profile.widgets : [] } : {}),
    }));

    return res.json(sanitized);
  } catch (err) {
    console.error('Leaderboard error:', err);
    return res.status(500).json({ detail: 'Failed to fetch leaderboard' });
  }
});

/* GET /api/badges/catalog

   The grantable badges plus the seasonal ones. An event badge is not something
   staff can hand out — it is earned by being here while its window is open —
   so it arrives with `type: 'event'` and a `live` flag, which is how the
   dashboard says "you can earn this now" instead of listing it as something to
   be given. `EVENTS` carries the windows themselves for the same reason. */
router.get('/badges/catalog', (req, res) => {
  return res.json([...eventBadgeCatalog(), ...BADGE_CATALOG]);
});

// GET /api/badges/events — when each seasonal badge can be earned.
router.get('/badges/events', (req, res) => {
  return res.json(upcomingEvents());
});

// GET /api/stats
router.get('/stats', async (req, res) => {
  try {
    const userCount = await query('SELECT COUNT(*) as count, COALESCE(SUM(views), 0) as total_views FROM users');
    const count = parseInt(userCount.rows[0].count || '0', 10);
    const views = parseInt(userCount.rows[0].total_views || '0', 10);

    return res.json({
      bio_links: count,
      total_views: views,
    });
  } catch (err) {
    return res.json({ bio_links: 0, total_views: 0 });
  }
});

// GET /ranked — leaderboard ranked by real profile views (the engagement metric
// swats actually tracks). Score currently equals validated views; interactions
// fold in here once per-profile interaction counts exist.
router.get('/ranked', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const { rows } = await query(
      `SELECT id, username, display_name, tier, views, badges, profile, created_at
       FROM users ORDER BY views DESC, created_at ASC LIMIT $1`,
      [limit],
    );
    const list = rows.map((u, i) => ({
      rank: i + 1,
      id: u.id,
      username: u.username,
      display_name: u.display_name || u.username,
      avatar: u.profile?.avatar_url || '',
      tier: u.tier,
      views: u.views || 0,
      score: u.views || 0,
      verified: (u.badges || []).includes('verified'),
      badges: (u.badges || []).slice(0, 5),
    }));
    return res.json(list);
  } catch (err) {
    return res.json([]);
  }
});

// GET /api/users/showcase
router.get('/users/showcase', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id, username, display_name, tier, views, badges, profile
      FROM users
      WHERE 'featured' = ANY(badges) OR tier = 'premium' OR views > 0
      ORDER BY views DESC
      LIMIT 20
    `);

    const showcase = rows.map((u) => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name || u.username,
      avatar: u.profile?.avatar_url || '',
      verified: (u.badges || []).includes('verified'),
      views: u.views || 0,
      tag: u.tier === 'premium' ? 'PRO' : 'VIP',
    }));

    return res.json(showcase);
  } catch (err) {
    return res.json([]);
  }
});

// GET /explore[?q=&sort=views|new&tier=premium|free&limit=]
router.get('/explore', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const sort = req.query.sort === 'new' ? 'created_at DESC' : 'views DESC';
    const tier = req.query.tier;
    const limit = Math.min(parseInt(req.query.limit, 10) || 48, 100);
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(LOWER(username) LIKE $${params.length} OR LOWER(display_name) LIKE $${params.length})`);
    }
    if (tier === 'premium') where.push(`tier = 'premium'`);
    if (tier === 'free') where.push(`tier = 'free'`);
    // A badge filter: only ids the platform actually grants, so a caller cannot
    // probe arbitrary array contents through this endpoint.
    const badge = String(req.query.badge || '').trim();
    if (['verified', 'og', 'media', 'premium', 'staff', 'owner'].includes(badge)) {
      params.push(badge);
      where.push(`$${params.length} = ANY(COALESCE(badges, '{}'))`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT id, username, display_name, tier, views, badges, profile, created_at
       FROM users ${whereSql} ORDER BY ${sort} LIMIT ${limit}`,
      params,
    );
    const list = rows.map((u) => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name || u.username,
      avatar: u.profile?.avatar_url || '',
      banner: u.profile?.banner_url || u.profile?.background_url || '',
      bio: u.profile?.bio || '',
      verified: (u.badges || []).includes('verified'),
      tier: u.tier,
      views: u.views || 0,
      badges: (u.badges || []).slice(0, 4),
    }));
    return res.json(list);
  } catch (err) {
    return res.json([]);
  }
});

// GET /meta/:username (Open Graph / Discord Embed Metadata renderer)
router.get('/meta/:username', async (req, res) => {
  try {
    const username = req.params.username.trim().toLowerCase();
    const { rows } = await query('SELECT * FROM users WHERE LOWER(username) = $1', [username]);

    if (rows.length === 0) {
      return res.type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>swats | User Not Found</title>
          <meta property="og:title" content="swats.bio | User Not Found" />
          <meta property="og:description" content="This username is available to claim on swats.bio" />
          <meta property="theme-color" content="#FF7FBC" />
        </head>
        <body>User Not Found</body>
        </html>
      `);
    }

    const user = rows[0];
    const profile = user.profile || {};
    const name = user.display_name || user.username;
    const bio = profile.bio || `Check out ${name}'s bio link on swats.bio`;
    const avatar = profile.avatar_url || 'https://www.swats.bio/logo.png';
    const color = profile.theme_color || '#FF7FBC';

    return res.type('text/html').send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>swats | ${name}</title>
        <meta name="theme-color" content="${color}" />
        <meta property="og:type" content="profile" />
        <meta property="og:site_name" content="swats.bio" />
        <meta property="og:title" content="${name} (@${user.username})" />
        <meta property="og:description" content="${bio}" />
        <meta property="og:image" content="${avatar}" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:title" content="${name} (@${user.username})" />
        <meta property="twitter:description" content="${bio}" />
        <meta property="twitter:image" content="${avatar}" />
      </head>
      <body>
        <h1>${name} (@${user.username})</h1>
        <p>${bio}</p>
      </body>
      </html>
    `);
  } catch (err) {
    return res.status(500).send('Server Error');
  }
});

export default router;
