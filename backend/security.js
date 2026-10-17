/* ---------------------------------------------------------------------------
   Abuse protection — application-level rate limiting + security headers.

   This is the SECOND line of defence. The first line is the Cloudflare edge
   (proxy, WAF managed rules, edge rate-limit rules, Bot Fight Mode); see
   ANTI_DDOS.md for that setup. Even with the edge configured, every API
   instance should still cap what a single client can do, so one unlucky IP (or
   a request that slips past the edge) cannot exhaust the Postgres pool or the
   CPU. Everything here is dependency-free and pure enough to unit test.
   --------------------------------------------------------------------------- */

export const RATE_LIMIT_DISABLED = () => process.env.RATE_LIMIT_DISABLED === '1';

/* Which client a request belongs to. Prefers Cloudflare's header so that all
   visitors behind the proxy are bucketed by their real IP rather than by the
   edge node's shared address. Mirrors views.js#clientIp on purpose. */
export function clientKey(req) {
  const headers = req?.headers || {};
  const cf = headers['cf-connecting-ip'];
  if (cf) return String(cf).split(',')[0].trim();
  const xff = headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req?.ip || req?.socket?.remoteAddress || 'unknown';
}

/* Sliding-window counter: at most `max` hits per `windowMs` per key. Keeps the
   timestamp list sorted, trims expired entries on every check, and never pushes
   while blocked — so a single key's memory is bounded by `max`. */
export class SlidingWindowLimiter {
  constructor({ windowMs = 60_000, max = 300, maxKeys = 50_000 } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.maxKeys = maxKeys;
    this.hits = new Map(); // key -> ascending number[] of timestamps
  }

  get size() {
    return this.hits.size;
  }

  check(key, now = Date.now()) {
    const cutoff = now - this.windowMs;
    let list = this.hits.get(key) || [];
    if (list.length && list[0] <= cutoff) list = list.filter((t) => t > cutoff);

    if (list.length >= this.max) {
      this.hits.set(key, list);
      const oldest = list[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        limit: this.max,
        retryAfterMs: Math.max(0, oldest + this.windowMs - now),
      };
    }

    list.push(now);
    this.hits.set(key, list);
    return { allowed: true, remaining: this.max - list.length, limit: this.max, retryAfterMs: 0 };
  }

  /* Drop keys with no hits left in the window. Called by the middleware at most
     once per window so the map cannot grow without bound under a spoofed-IP
     flood. */
  prune(now = Date.now()) {
    const cutoff = now - this.windowMs;
    for (const [key, list] of this.hits) {
      const kept = list.filter((t) => t > cutoff);
      if (kept.length) this.hits.set(key, kept);
      else this.hits.delete(key);
    }
    if (this.hits.size > this.maxKeys) {
      // Still oversized (a distributed flood): evict the least-recently-used
      // keys first, preserving the entries still doing useful work.
      const byNewest = [...this.hits.entries()].sort(
        (a, b) => (b[1][b[1].length - 1] || 0) - (a[1][a[1].length - 1] || 0)
      );
      for (const [key] of byNewest.slice(this.maxKeys)) this.hits.delete(key);
    }
    return this.hits.size;
  }
}

/* Express middleware factory. `scope` keeps independent limiters from sharing a
   bucket, `skip` lets a static/health path opt out. */
export function rateLimit(options = {}) {
  const {
    windowMs = 60_000,
    max = 300,
    message = 'Too many requests. Slow down.',
    scope = 'rl',
    key = clientKey,
    skip = null,
    statusCode = 429,
    sendHeaders = true,
  } = options;

  const limiter = new SlidingWindowLimiter({ windowMs, max });
  let lastPrune = 0;

  function rateLimitMiddleware(req, res, next) {
    if (RATE_LIMIT_DISABLED() || (skip && skip(req))) return next();

    const now = Date.now();
    if (now - lastPrune >= windowMs) {
      limiter.prune(now);
      lastPrune = now;
    }

    const result = limiter.check(`${scope}:${key(req)}`, now);

    if (sendHeaders) {
      res.setHeader('X-RateLimit-Limit', String(result.limit));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    }

    if (!result.allowed) {
      const retryAfter = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(statusCode).json({ detail: message, retry_after: retryAfter });
    }

    return next();
  }

  rateLimitMiddleware.limiter = limiter; // exposed for tests / introspection
  return rateLimitMiddleware;
}

/* Nothing behind a token may be cached.

   Every response under /api/me, /api/notifications, /api/admin and
   /api/billing is either personal or privileged, and the defaults are not on our
   side: a shared proxy, a corporate cache or a mis-set CDN rule can store a
   200 for `GET /api/me` and hand one account's profile to the next person who
   asks for that URL. `no-store` plus a `private` scope stops the request ever
   being reused. The public reads (/api/u/:username, /api/leaderboard,
   /api/stats) keep their normal caching, which is what makes them cheap. */
export const PRIVATE_API_PREFIXES = ['/api/me', '/api/notifications', '/api/admin', '/api/billing'];

export function privateNoStore() {
  return function privateNoStoreMiddleware(req, res, next) {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // A single URL that answers differently per token must not be keyed as a
    // shared object by anything downstream.
    res.setHeader('Vary', 'Authorization');
    return next();
  };
}

/* Baseline response headers. Kept deliberately small: the app embeds third
   party media and avatars, so a strict CSP would break it without a dedicated
   pass. HSTS is only sent on HTTPS so local http:// development is unaffected.

   Embedding: Discord runs embedded apps in an iframe on its own origins
   (discord.com / discord.gg / discordsays.com), so when frameAncestors is opted
   into we answer with a CSP frame-ancestors allow-list instead of X-Frame-Options
   — XFO cannot express multiple origins, and when both headers are present the
   browser applies whichever is stricter, which would keep the embed blocked. */
export const FRAME_ANCESTORS_ORIGIN_PATTERNS = [
  'https://discord.com',
  'https://discordapp.com',
  'https://*.discord.gg',
  'https://*.discordsays.com',
  'https://*.discordsnap.co',
  'https://*.discordsnap.com',
];

/* The directives that are safe on every API answer. Deliberately not a full
   policy: the JSON routes need none of it, and the few responses that ARE HTML
   (the /meta embed pages) carry third-party markup whose inline styles a
   `style-src 'self'` would strip. The SPA's real policy is served with the
   static files (see vercel.json) — this is the frame-ancestors side, plus the
   two directives that cost nothing anywhere. */
export const BASE_CSP_DIRECTIVES = ["object-src 'none'", "base-uri 'self'", "form-action 'self'"];

export function securityHeaders({ frameOptions = 'SAMEORIGIN', hsts = true, frameAncestors = false } = {}) {
  return function securityHeadersMiddleware(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (frameAncestors) {
      res.setHeader(
        'Content-Security-Policy',
        [`frame-ancestors 'self' ${FRAME_ANCESTORS_ORIGIN_PATTERNS.join(' ')}`, ...BASE_CSP_DIRECTIVES].join('; ')
      );
    } else {
      res.setHeader('X-Frame-Options', frameOptions);
      res.setHeader('Content-Security-Policy', BASE_CSP_DIRECTIVES.join('; '));
    }
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=(), payment=()');

    const proto = String(req.headers?.['x-forwarded-proto'] || (req.secure ? 'https' : ''))
      .split(',')[0]
      .trim();
    if (hsts && proto === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }

    return next();
  };
}
