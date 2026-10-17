import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
process.env.RATE_LIMIT_DISABLED = '1';

const app = (await import('./server.js')).default;

const startServer = () =>
  new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

const call = async (path) => {
  const server = await startServer();
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    const body = await res.json().catch(() => ({}));
    return { status: res.status, detail: body.detail || '' };
  } finally {
    server.close();
  }
};

test('GET /api/me/rewards is mounted and refuses an anonymous caller', async () => {
  const { status, detail } = await call('/api/me/rewards');
  assert.ok(!/No API route/.test(detail), `fell through to the catch-all: ${detail}`);
  assert.equal(status, 401);
});

test('GET /api/me/activity is mounted and refuses an anonymous caller', async () => {
  const { status, detail } = await call('/api/me/activity');
  assert.ok(!/No API route/.test(detail), `fell through to the catch-all: ${detail}`);
  assert.equal(status, 401);
});
