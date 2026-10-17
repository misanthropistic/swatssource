// Run with: node --test backend/botSync.route.test.js
//
// "Sync all" is the button the owner clicks when roles and badges have drifted
// apart, so the two ways it can be useless both matter: a mount that stops
// matching (the "No API route for …" family this repo has been bitten by four
// times) and a mount that is not actually behind requireAdmin — it writes roles
// into Discord and badges onto accounts, so it must never be reachable without a
// session.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
process.env.RATE_LIMIT_DISABLED = '1';

const app = (await import('./server.js')).default;

const startServer = () =>
  new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

const post = async (headers = {}) => {
  const server = await startServer();
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/bot/sync-all`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: '{}',
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
};

test('POST /api/admin/bot/sync-all is mounted and refuses anonymous callers', async () => {
  const { status, body } = await post();
  assert.notEqual(status, 404, 'sync-all route 404s');
  assert.ok(!/No API route/.test(String(body.detail || '')), 'sync-all fell through to the catch-all');
  assert.equal(status, 401, `expected 401 for no token, got ${status}`);
});

test('a forged token cannot run the sync either', async () => {
  const { status } = await post({ Authorization: 'Bearer not.a.real.token' });
  assert.equal(status, 401);
});
