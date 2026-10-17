// Run with: node --test backend/pairLogin.test.js
//
// "Add another account" rides the Discord OAuth round trip. If the start of that
// flow has no session to attach to, continuing would sign the visitor in as the
// OTHER account instead of pairing — the account they are already on would be
// replaced, which is the one thing this flow must never do. So the start is
// refused, and only the plain sign-in mode stays available anonymously.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.DISCORD_CLIENT_ID = '1234567890';

const app = (await import('./server.js')).default;

const startServer = () =>
  new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

const get = async (path, headers = {}) => {
  const server = await startServer();
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
};

test('a pair start without a session is refused, not downgraded to a sign-in', async () => {
  const { status, body } = await get('/api/auth/discord/login?mode=pair');
  assert.equal(status, 401);
  assert.match(String(body.detail || ''), /sign in again/i);
});

test('a connect start without a session is refused the same way', async () => {
  const { status } = await get('/api/auth/discord/login?mode=link');
  assert.equal(status, 401);
});

test('a plain sign-in still starts anonymously', async () => {
  const { status, body } = await get('/api/auth/discord/login');
  assert.equal(status, 200);
  const url = new URL(body.url);
  assert.equal(url.hostname, 'discord.com');
  // No account is named in a sign-in state.
  const state = JSON.parse(url.searchParams.get('state'));
  assert.equal(state.mode, 'login');
  assert.equal(state.nonce, undefined);
});
