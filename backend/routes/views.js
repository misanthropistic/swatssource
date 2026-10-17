import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { grantViewRewards } from '../rewards.js';
import {
  VIEW_RULES,
  verifyProof,
  visitorHash,
  looseVisitorHash,
  viewBucket,
  clientIp,
  newSeed,
  newChallengeId,
} from '../views.js';

/* ---------------------------------------------------------------------------
   Profile view endpoints

     GET  /api/views/challenge?u=<username>  → issue a proof-of-work challenge
     POST /api/views/register                → verify the solved challenge and
                                               record at most one view per
                                               visitor per hour

   Design notes:
     * The challenge is stored server-side (not a signed stateless token) so it
       can be enforced single-use. This matters when the API runs as more than
       one instance.
     * The visitor is identified by an HMAC of (IP, UA, language) — never the
       raw IP — so the uniqueness window works without cookies. A challenge also
       stores the IP-free twin of that hash, and the register accepts either one:
       the strict key is what a dedupe uses, the loose key is what keeps a visit
       countable when the address changed mid-page (mobile handoff, proxy pool).
     * Cloudflare Turnstile is OPTIONAL: it only activates when
       TURNSTILE_SECRET_KEY is set, and the client is told the site key by the
       challenge response. Without keys the proof-of-work still gates the count.
       A token that is PRESENT and fails is always refused; a token that is
       ABSENT only refuses when TURNSTILE_REQUIRED is set, because an ad blocker
       or a blocked script used to turn into "no view is ever counted again".
   --------------------------------------------------------------------------- */

const router = express.Router();

const VIEW_SECRET =
  process.env.VIEW_SECRET || process.env.JWT_SECRET || 'swats-view-secret-change-me';
const JWT_SECRET = process.env.JWT_SECRET || 'swats-super-secret-jwt-key-minimum-32-chars-long';
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';
// Opt-in strictness: with this set a visitor that could not produce a Turnstile
// token is refused outright. Off by default — the proof of work is still
// enforced, and a hard requirement meant one broken script silently stopped
// every view on the site from being counted.
const TURNSTILE_REQUIRED = String(process.env.TURNSTILE_REQUIRED || '').toLowerCase() === 'true';

// Small in-memory rate limiter. Good enough to stop a single client from
// flooding challenge creation; a distributed botnet is handled by the PoW cost.
const buckets = new Map();
function allow(key, max, windowMs) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return true;
}

async function resolveUserId(username) {
  const alias = String(username || '').trim().toLowerCase();
  if (!alias) return null;
  const { rows } = await query('SELECT id FROM users WHERE LOWER(username) = $1', [alias]);
  return rows[0]?.id || null;
}

// A signed-in user looking at their own profile should never inflate its count.
function requesterId(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), JWT_SECRET).sub || null;
  } catch {
    return null;
  }
}

async function verifyTurnstile(token, ip) {
  try {
    const body = new URLSearchParams({ secret: TURNSTILE_SECRET, response: String(token) });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const { data } = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      body.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 6000 }
    );
    return !!data?.success;
  } catch (err) {
    console.warn('Turnstile verification error:', err.message);
    return false;
  }
}

router.get('/views/challenge', async (req, res) => {
  try {
    if (!allow(`challenge:${clientIp(req)}`, 40, 60_000)) {
      return res.status(429).json({ detail: 'Too many view challenges. Slow down.' });
    }

    const userId = await resolveUserId(req.query.u);
    if (!userId) return res.status(404).json({ detail: 'User not found' });

    const id = newChallengeId();
    const seed = newSeed();
    const vHash = visitorHash(req, VIEW_SECRET);
    const looseHash = looseVisitorHash(req, VIEW_SECRET);
    const expiresAt = new Date(Date.now() + VIEW_RULES.challengeTtlMs);

    await query(
      `INSERT INTO view_challenges (id, user_id, visitor_hash, visitor_hash_loose, seed, difficulty, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, userId, vHash, looseHash, seed, VIEW_RULES.difficulty, expiresAt]
    );

    // Opportunistic cleanup of long-expired challenges; never blocks the reply.
    query("DELETE FROM view_challenges WHERE expires_at < NOW() - INTERVAL '1 hour'").catch(() => {});

    return res.json({
      challenge_id: id,
      seed,
      difficulty: VIEW_RULES.difficulty,
      algorithm: 'sha256-leading-zero-bits',
      dwell_ms: VIEW_RULES.dwellMs,
      turnstile_site_key: TURNSTILE_SITE_KEY || null,
    });
  } catch (err) {
    console.error('View challenge error:', err);
    return res.status(500).json({ detail: 'Failed to create view challenge' });
  }
});

router.post('/views/register', async (req, res) => {
  try {
    // 60/min rather than 25/min: a household or office behind one address was
    // hitting this with ordinary traffic and losing honest views to a 429.
    if (!allow(`register:${clientIp(req)}`, 60, 60_000)) {
      return res.status(429).json({ detail: 'Too many view requests. Slow down.' });
    }

    const { challenge_id: challengeId, nonce, turnstile_token: turnstileToken } = req.body || {};
    if (!challengeId || nonce === undefined || nonce === null) {
      return res.status(400).json({ detail: 'challenge_id and nonce are required' });
    }

    const { rows } = await query('SELECT * FROM view_challenges WHERE id = $1', [challengeId]);
    const challenge = rows[0];
    if (!challenge) return res.status(400).json({ detail: 'Unknown challenge' });
    if (challenge.used) return res.status(400).json({ detail: 'Challenge already used' });
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ detail: 'Challenge expired' });
    }

    // Either key identifies the visitor. The strict one is preferred (and is what
    // the row is written under); the loose one only rescues a visit whose address
    // changed between the challenge and now.
    const vHash = visitorHash(req, VIEW_SECRET);
    const looseHash = looseVisitorHash(req, VIEW_SECRET);
    const sameVisitor =
      vHash === challenge.visitor_hash ||
      (!!challenge.visitor_hash_loose && looseHash === challenge.visitor_hash_loose);
    if (!sameVisitor) {
      return res.status(400).json({ detail: 'Challenge does not belong to this visitor' });
    }

    if (!verifyProof(challenge.seed, String(nonce), challenge.difficulty)) {
      return res.status(400).json({ detail: 'Invalid proof of work' });
    }

    if (TURNSTILE_SECRET) {
      // A token that IS supplied must verify. A token that is missing is only
      // fatal in strict mode — otherwise the visitor simply passes on the proof
      // of work alone, which is the same gate an unconfigured deployment uses.
      if (turnstileToken) {
        const human = await verifyTurnstile(turnstileToken, clientIp(req));
        if (!human) return res.status(400).json({ detail: 'Human verification failed' });
      } else if (TURNSTILE_REQUIRED) {
        return res.status(400).json({ detail: 'Human verification token required' });
      }
    }

    // Consume the challenge before touching the counter.
    await query('UPDATE view_challenges SET used = TRUE WHERE id = $1', [challengeId]);

    const viewer = requesterId(req);
    if (viewer && viewer === challenge.user_id) {
      const cur = await query('SELECT views FROM users WHERE id = $1', [challenge.user_id]);
      return res.json({ counted: false, reason: 'own_profile', views: cur.rows[0]?.views || 0 });
    }

    const inserted = await query(
      `INSERT INTO profile_views (user_id, visitor_hash, bucket)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, visitor_hash, bucket) DO NOTHING
       RETURNING id`,
      [challenge.user_id, vHash, viewBucket()]
    );

    if (inserted.rows.length === 0) {
      const cur = await query('SELECT views FROM users WHERE id = $1', [challenge.user_id]);
      return res.json({ counted: false, reason: 'duplicate', views: cur.rows[0]?.views || 0 });
    }

    const updated = await query(
      'UPDATE users SET views = COALESCE(views, 0) + 1 WHERE id = $1 RETURNING views',
      [challenge.user_id]
    );

    // Fire the reward engine after the count moved, deliberately NOT awaited:
    // a milestone grant must never delay the profile's view counter response,
    // and the engine is non-throwing by design.
    const newViews = updated.rows[0]?.views || 0;
    grantViewRewards(challenge.user_id).catch((err) => console.warn('[rewards] trigger failed:', err.message));

    return res.json({ counted: true, views: newViews });
  } catch (err) {
    console.error('View register error:', err);
    return res.status(500).json({ detail: 'Failed to register view' });
  }
});

export default router;
