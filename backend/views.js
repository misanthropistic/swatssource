import crypto from 'node:crypto';

/* ---------------------------------------------------------------------------
   Profile view system — pure helpers
   ---------------------------------------------------------------------------
   A "view" only counts when a real visitor actually looked at the page:

     1. the client sits on the page for at least `dwellMs`,
     2. the client solves a proof-of-work challenge (cheap for one browser,
        expensive for a bot farm), and optionally a Cloudflare Turnstile
        challenge,
     3. the server records the visitor once per `windowMs` (12h), so refreshing
        or hammering the page cannot inflate the count.

   Everything here is pure so it can be unit tested without a database.
   --------------------------------------------------------------------------- */

/* The gates below are all env-overridable, and every default is deliberately on
   the forgiving side: the point of the first pass is that an honest visit counts,
   and the hardening only has to make bulk inflation expensive.

   What changed and why (the old values made a real visit easy to miss):
     • dwell      2000ms → 1200ms  — enough to prove the page was looked at,
                                      short enough that a reader who clicks away
                                      quickly is still counted,
     • window     12h    → 1h      — one counted view per visitor per hour; a
                                      refresh loop still cannot inflate anything,
                                      but returning readers now register,
     • difficulty 15     → 12 bits — ~32k hashes down to ~4k, so the challenge is
                                      solved in a few milliseconds. Still a real
                                      cost per view at bot-farm scale. */
export const VIEW_RULES = {
  // Keep in sync with the client (frontend/src/lib/viewTracker.js) — the client
  // uses dwell_ms from the challenge response, so this is the source of truth.
  dwellMs: Math.max(0, Number(process.env.VIEW_DWELL_MS || 1200) || 1200),
  // One counted view per visitor per hour.
  windowMs: Math.max(60_000, Number(process.env.VIEW_WINDOW_MS || 60 * 60 * 1000) || 60 * 60 * 1000),
  // A challenge is single-use and short-lived.
  challengeTtlMs: 5 * 60 * 1000,
  // Leading zero BITS required on sha256(seed + ":" + nonce). ~4k hashes on
  // average — imperceptible in a browser, a real cost at bot-farm scale.
  difficulty: Math.max(1, Math.min(30, Number(process.env.VIEW_POW_DIFFICULTY || 12) || 12)),
};

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

// Number of leading zero bits in a hex string. 0x0 -> 4 bits, 0x1 -> 3, ...
export function leadingZeroBits(hex) {
  let bits = 0;
  for (let i = 0; i < hex.length; i += 1) {
    const v = parseInt(hex[i], 16);
    if (Number.isNaN(v)) return bits;
    if (v === 0) { bits += 4; continue; }
    if (v < 2) bits += 3;
    else if (v < 4) bits += 2;
    else if (v < 8) bits += 1;
    break;
  }
  return bits;
}

export function proofHash(seed, nonce) {
  return sha256Hex(`${seed}:${nonce}`);
}

export function verifyProof(seed, nonce, difficulty) {
  if (seed == null || nonce == null) return false;
  return leadingZeroBits(proofHash(seed, String(nonce))) >= Number(difficulty);
}

// The visitor's IP, preferring Cloudflare's header when the site is proxied.
export function clientIp(req) {
  const cf = req.headers?.['cf-connecting-ip'];
  if (cf) return String(cf).split(',')[0].trim();
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Identity used for the 12h uniqueness window. Coarse on purpose: one IP + UA +
// language per window is enough to stop refresh-inflation without needing
// cookies or fingerprinting.
export function visitorKey(req) {
  const ua = req.headers?.['user-agent'] || '';
  const lang = req.headers?.['accept-language'] || '';
  return `${clientIp(req)}|${ua}|${lang}`;
}

export function visitorHash(req, secret) {
  return crypto.createHmac('sha256', String(secret)).update(visitorKey(req)).digest('hex');
}

/* The strict key includes the IP, which is what stops one browser behind a
   rotating address from inflating a count — and is also why an honest view went
   missing whenever a phone hopped from Wi-Fi to cellular between the challenge
   and the register, or a proxy pool changed the egress mid-page. The loose key
   drops the IP.

   It is only ever used as a SECOND accepted match on a challenge that was
   already issued to this same visitor (the id is unguessable and single-use), so
   it cannot be used to claim somebody else's challenge — it just means the same
   visit still lands when the address changed underneath it. */
export function looseVisitorKey(req) {
  const ua = req.headers?.['user-agent'] || '';
  const lang = req.headers?.['accept-language'] || '';
  return `${ua}|${lang}`;
}

export function looseVisitorHash(req, secret) {
  return crypto.createHmac('sha256', String(secret)).update(looseVisitorKey(req)).digest('hex');
}

// Which uniqueness window a view falls into. Stored on the row so a single
// unique index (user_id, visitor_hash, bucket) makes duplicate counting a
// no-op even under concurrent requests.
export function viewBucket(now = Date.now()) {
  return Math.floor(now / VIEW_RULES.windowMs);
}

export const newSeed = () => crypto.randomBytes(16).toString('hex');
export const newChallengeId = () => crypto.randomUUID();
