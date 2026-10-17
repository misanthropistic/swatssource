/* User-facing side of the notification system.
 *
 * The dashboard bell polls GET /notifications; the public profile pages read
 * /announcements and /devlogs without a session. Everything an admin sends
 * (inbox message, devlog post, announcement) lands here as a row per recipient,
 * written by backend/notifications.js.
 */
import express from 'express';
import { query } from '../db.js';
import { requireAuth, optionalAuth } from '../auth.js';

const router = express.Router();

const clampLimit = (value, fallback = 30, max = 100) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), max) : fallback;
};

// GET /api/notifications — the caller's own inbox, newest first, plus the unread
// count the bell badge shows. `?after=<ISO>` lets the poller ask only for what
// arrived since its last successful read.
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const limit = clampLimit(req.query.limit, 30, 100);
    const { rows } = await query(
      `SELECT id, kind, title, body, href, read_at, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );

    const unread = await query(
      'SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [req.user.id]
    );

    // Private per-user data: it must never sit in a shared or edge cache.
    res.set('Cache-Control', 'private, no-store');
    return res.json({ items: rows, unread: unread.rows[0]?.n || 0 });
  } catch (err) {
    console.error('Notifications fetch error:', err);
    return res.status(500).json({ detail: 'Failed to load notifications' });
  }
});

// POST /api/notifications/read — { ids: [...] } marks those, an empty body marks
// everything. Scoped to the caller so one user can never clear another's inbox.
router.post('/notifications/read', requireAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : null;

    if (ids && ids.length) {
      await query(
        'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL',
        [req.user.id, ids]
      );
    } else {
      await query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Notifications read error:', err);
    return res.status(500).json({ detail: 'Failed to update notifications' });
  }
});

router.delete('/notifications/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ detail: 'Failed to delete notification' });
  }
});

/* GET /api/announcements — every banner live right now for this viewer.
   "Live" means active, started, and not yet ended. `premium`/`admins` targeted
   banners are filtered out for anonymous or free visitors, which is why the
   token is parsed optionally rather than required. */
router.get('/announcements', optionalAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, message, level, href, href_label, audience, starts_at, ends_at
       FROM announcements
       WHERE active = TRUE
         AND starts_at <= NOW()
         AND (ends_at IS NULL OR ends_at > NOW())
       ORDER BY starts_at DESC
       LIMIT 20`
    );

    // The single-string banner that used to be the only announcement mechanism
    // (site_settings.general.announcement) is still shown, so an announcement
    // written before this table existed does not silently disappear. Once the
    // admin creates a real one, this fallback stays out of the way.
    if (rows.length === 0) {
      const legacy = await query("SELECT value FROM site_settings WHERE key = 'general'");
      const message = legacy.rows[0]?.value?.announcement;
      if (message && String(message).trim()) {
        return res.json([
          {
            id: 'legacy',
            message: String(message).trim(),
            level: 'info',
            href: null,
            href_label: null,
            audience: 'all',
            starts_at: null,
            ends_at: null,
          },
        ]);
      }
    }

    const user = req.user;
    const tier = user?.role === 'admin' || user?.is_owner ? 'premium' : (user?.tier || 'free');
    const visible = rows.filter((a) => {
      if (a.audience === 'all' || !a.audience) return true;
      if (a.audience === 'premium') return tier !== 'free';
      if (a.audience === 'admins') return user?.role === 'admin' || !!user?.is_owner;
      if (a.audience === 'discord') return !!user?.discord?.linked;
      if (a.audience === 'no_discord') return !user?.discord?.linked;
      return true;
    });

    return res.json(visible);
  } catch (err) {
    console.error('Announcements fetch error:', err);
    return res.status(500).json({ detail: 'Failed to load announcements' });
  }
});

// Somewhere a devlog post can live. Two feeds, two audiences: 'public' is the
// changelog on the site, 'dashboard' is the build log signed-in members read.
const DEVLOG_CHANNELS = ['public', 'dashboard'];

// GET /api/devlogs — published changelog posts, per channel.
//
// Public on purpose: the public devlog is the face of what the inbox
// notifications are about, and the dashboard feed is only reached from inside a
// dashboard, which is behind a session of its own. The channel is validated
// against a fixed list rather than passed through, so an unknown value cannot
// empty the feed or reach the query as anything but a known channel.
router.get('/devlogs', async (req, res) => {
  try {
    const limit = clampLimit(req.query.limit, 30, 100);
    const requested = String(req.query.channel || 'public').toLowerCase();
    const channel = DEVLOG_CHANNELS.includes(requested) ? requested : 'public';

    const { rows } = await query(
      `SELECT id, title, body, tag, channel, pinned, author_username, created_at, updated_at
       FROM devlogs
       WHERE published = TRUE AND COALESCE(channel, 'public') = $1
       ORDER BY pinned DESC, created_at DESC
       LIMIT $2`,
      [channel, limit]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Devlogs fetch error:', err);
    return res.status(500).json({ detail: 'Failed to load devlogs' });
  }
});

export { DEVLOG_CHANNELS };

export default router;
