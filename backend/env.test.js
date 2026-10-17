// Run with: node --test backend/env.test.js
//
// The JWT signing secret is the whole difference between "logged in" and "anyone
// can be anyone": a token is a self-signed claim, so a secret that ships with
// the source lets anyone mint one for any account. auth.js used to fall back to
// exactly such a string. These pin the replacement rule in env.js:
//
//   • a real secret is left alone (never silently rotated);
//   • the leaked default is refused, even when it is still in the environment;
//   • production without a secret fails CLOSED with a random per-process value;
//   • development keeps a stable value so local work and the suite need no setup.
//
// Each case imports env.js through a fresh cache-busting URL, because the module
// decides the secret once, at import time.
import test from 'node:test';
import assert from 'node:assert/strict';

const LEAKED = 'swats-super-secret-jwt-key-minimum-32-chars-long';
const STRONG = 'a-real-secret-that-is-long-enough-to-be-worth-keeping-0123456789';

let caseId = 0;

async function loadEnvWith({ nodeEnv, jwtSecret }) {
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.JWT_SECRET;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  if (jwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = jwtSecret;

  try {
    caseId += 1;
    await import(`./env.js?case=${caseId}`);
    return process.env.JWT_SECRET;
  } finally {
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
  }
}

test('production without JWT_SECRET fails closed instead of using a default', async () => {
  const resolved = await loadEnvWith({ nodeEnv: 'production', jwtSecret: undefined });
  assert.ok(resolved && resolved.length >= 32, 'a usable secret is generated');
  assert.notEqual(resolved, LEAKED);
});

test('the leaked repository default is refused even when it is still configured', async () => {
  const resolved = await loadEnvWith({ nodeEnv: 'production', jwtSecret: LEAKED });
  assert.notEqual(resolved, LEAKED, 'the public default must never sign a token');
  assert.ok(resolved.length >= 32);
});

test('two production boots without a secret do not share one', async () => {
  const first = await loadEnvWith({ nodeEnv: 'production', jwtSecret: undefined });
  const second = await loadEnvWith({ nodeEnv: 'production', jwtSecret: undefined });
  assert.notEqual(first, second);
});

test('a real secret is kept exactly as configured', async () => {
  const resolved = await loadEnvWith({ nodeEnv: 'production', jwtSecret: STRONG });
  assert.equal(resolved, STRONG);
});

test('development works with no configuration at all', async () => {
  const resolved = await loadEnvWith({ nodeEnv: undefined, jwtSecret: undefined });
  assert.ok(resolved && resolved.length > 0);
  assert.notEqual(resolved, LEAKED);
});
