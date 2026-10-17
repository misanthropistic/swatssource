// Run with: node --test backend/security.test.js
//
// These cover the abuse-protection primitives that decide whether a request is
// allowed: the sliding window (including its memory bound), the middleware
// contract (429 + Retry-After), the client key precedence behind Cloudflare,
// and the security headers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SlidingWindowLimiter,
  rateLimit,
  clientKey,
  securityHeaders,
  privateNoStore,
  PRIVATE_API_PREFIXES,
} from './security.js';

// Minimal Express req/res doubles — enough for the middleware to run.
function makeRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  return {
    headers,
    get statusCode() {
      return statusCode;
    },
    body: () => body,
    setHeader: (k, v) => {
      headers[k.toLowerCase()] = v;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
}

const req = (headers = {}, ip = '203.0.113.9') => ({ headers, ip, method: 'GET', path: '/api/x' });

test('sliding window allows exactly max hits then blocks', () => {
  const limiter = new SlidingWindowLimiter({ windowMs: 1000, max: 3 });
  for (let i = 0; i < 3; i += 1) {
    assert.equal(limiter.check('k', 1000).allowed, true, `hit ${i} should pass`);
  }
  const blocked = limiter.check('k', 1000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  // The oldest hit was at t=1000, so it frees up 1000ms later.
  assert.equal(blocked.retryAfterMs, 1000);
});

test('sliding window frees capacity once the oldest hit ages out', () => {
  const limiter = new SlidingWindowLimiter({ windowMs: 1000, max: 2 });
  limiter.check('k', 0);
  limiter.check('k', 100); // full
  assert.equal(limiter.check('k', 150).allowed, false);
  // At t=1000 the hit from t=0 has left the window.
  assert.equal(limiter.check('k', 1000).allowed, true);
});

test('a blocked key does not grow its timestamp list without bound', () => {
  const limiter = new SlidingWindowLimiter({ windowMs: 10_000, max: 5 });
  for (let i = 0; i < 500; i += 1) limiter.check('flood', 1000);
  assert.equal(limiter.hits.get('flood').length, 5);
});

test('prune drops keys with only expired hits', () => {
  const limiter = new SlidingWindowLimiter({ windowMs: 1000, max: 5 });
  limiter.check('old', 0);
  limiter.check('fresh', 5000);
  assert.equal(limiter.prune(5000), 1);
  assert.equal(limiter.hits.has('old'), false);
  assert.equal(limiter.hits.has('fresh'), true);
});

test('keys are isolated from each other', () => {
  const limiter = new SlidingWindowLimiter({ windowMs: 1000, max: 1 });
  assert.equal(limiter.check('a', 0).allowed, true);
  assert.equal(limiter.check('b', 0).allowed, true);
  assert.equal(limiter.check('a', 0).allowed, false);
});

test('middleware calls next() while under the limit and sets counters', () => {
  const mw = rateLimit({ windowMs: 1000, max: 2 });
  const res = makeRes();
  let nexts = 0;
  mw(req(), res, () => { nexts += 1; });
  assert.equal(nexts, 1);
  assert.equal(res.headers['x-ratelimit-limit'], '2');
  assert.equal(res.headers['x-ratelimit-remaining'], '1');
});

test('middleware answers 429 with Retry-After once the limit is hit', () => {
  const mw = rateLimit({ windowMs: 1000, max: 1, message: 'Nope.' });
  mw(req(), makeRes(), () => {});
  const res = makeRes();
  let nexts = 0;
  mw(req(), res, () => { nexts += 1; });

  assert.equal(nexts, 0);
  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.body(), { detail: 'Nope.', retry_after: 1 });
  assert.equal(res.headers['retry-after'], '1');
  assert.equal(res.headers['x-ratelimit-remaining'], '0');
});

test('skip() bypasses the limiter entirely', () => {
  const mw = rateLimit({ windowMs: 1000, max: 1, skip: (r) => r.path === '/api/health' });
  const health = req();
  health.path = '/api/health';
  for (let i = 0; i < 5; i += 1) {
    let nexts = 0;
    mw(health, makeRes(), () => { nexts += 1; });
    assert.equal(nexts, 1);
  }
});

test('RATE_LIMIT_DISABLED=1 turns the limiter off', () => {
  const prev = process.env.RATE_LIMIT_DISABLED;
  process.env.RATE_LIMIT_DISABLED = '1';
  try {
    const mw = rateLimit({ windowMs: 1000, max: 1 });
    for (let i = 0; i < 10; i += 1) {
      let nexts = 0;
      mw(req(), makeRes(), () => { nexts += 1; });
      assert.equal(nexts, 1);
    }
  } finally {
    if (prev === undefined) delete process.env.RATE_LIMIT_DISABLED;
    else process.env.RATE_LIMIT_DISABLED = prev;
  }
});

test('clientKey prefers CF-Connecting-IP, then X-Forwarded-For, then req.ip', () => {
  assert.equal(
    clientKey(req({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '10.0.0.1' })),
    '198.51.100.7'
  );
  assert.equal(clientKey(req({ 'x-forwarded-for': '10.0.0.1, 10.0.0.2' })), '10.0.0.1');
  assert.equal(clientKey(req({}, '192.0.2.5')), '192.0.2.5');
  assert.equal(clientKey({ headers: {} }), 'unknown');
});

test('scopes keep independent buckets for the same client', () => {
  const a = rateLimit({ windowMs: 1000, max: 1, scope: 'auth' });
  const b = rateLimit({ windowMs: 1000, max: 1, scope: 'upload' });
  a(req(), makeRes(), () => {});
  let nexts = 0;
  b(req(), makeRes(), () => { nexts += 1; });
  assert.equal(nexts, 1);
});

test('private API answers are marked uncacheable', () => {
  const mw = privateNoStore();
  const res = makeRes();
  let nexts = 0;
  mw(req(), res, () => {
    nexts += 1;
  });

  assert.equal(nexts, 1);
  assert.match(res.headers['cache-control'], /no-store/);
  assert.match(res.headers['cache-control'], /private/);
  assert.equal(res.headers['pragma'], 'no-cache');
  // Per-token answers must not be keyed as one shared object downstream.
  assert.equal(res.headers['vary'], 'Authorization');
});

test('the private prefixes cover every token-scoped surface', () => {
  assert.deepEqual(PRIVATE_API_PREFIXES, [
    '/api/me',
    '/api/notifications',
    '/api/admin',
    '/api/billing',
  ]);
});

test('security headers are always set, HSTS only over HTTPS', () => {
  const mw = securityHeaders();
  const plain = makeRes();
  mw(req({ host: 'swats.bio' }), plain, () => {});
  assert.equal(plain.headers['x-content-type-options'], 'nosniff');
  assert.equal(plain.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(plain.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(plain.headers['strict-transport-security'], undefined);

  const secure = makeRes();
  mw(req({ 'x-forwarded-proto': 'https' }), secure, () => {});
  assert.match(secure.headers['strict-transport-security'], /max-age=\d+/);
});

test('the API policy pins what is costly and leaves third-party markup alone', () => {
  const framed = makeRes();
  securityHeaders({ frameAncestors: true })(req(), framed, () => {});

  const csp = framed.headers['content-security-policy'];
  // Embedding: Discord's activity iframe is the one thing allowed to frame us.
  assert.match(csp, /frame-ancestors 'self' https:\/\/discord\.com/);
  assert.match(csp, /https:\/\/\*\.discordsays\.com/);
  // ...and cost-free hardening that has no reason to be missing.
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
  // Deliberately NOT a script-src: the /meta pages carry third-party markup and
  // a policy guessed at here would break them rather than protect anything.
  assert.equal(/script-src/.test(csp), false);
  // When XFO is used instead, the policy still travels with the response.
  const plain = makeRes();
  securityHeaders()(req(), plain, () => {});
  assert.equal(plain.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(plain.headers['content-security-policy'], /object-src 'none'/);
});
