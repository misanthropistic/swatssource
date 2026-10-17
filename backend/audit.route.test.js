// Run with: node --test backend/audit.route.test.js
//
// The admin audit endpoint sits inside the one admin router. A mount that stops
// matching (a path typo, a router mounted after the catch-all) turns this URL
// into "No API route for GET /api/admin/audit" — the failure mode the billing
// route test exists for. It must also stay behind requireAdmin: the trail names
// accounts and IPs, so it is not public in any sense.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
process.env.RATE_LIMIT_DISABLED = '1';

const app = (await import('./server.js')).default;

const startServer = () =>
  new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

test('GET /api/admin/audit is mounted and refuses anonymous callers', async () => {
  const server = await startServer();
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/audit`);
    const body = await res.json().catch(() => ({}));

    assert.notEqual(res.status, 404, 'audit route 404s');
    assert.ok(!/No API route/.test(String(body.detail || '')), 'audit route fell through to the catch-all');
    assert.equal(res.status, 401, `expected 401 for no token, got ${res.status}`);
  } finally {
    server.close();
  }
});

test('a forged token cannot read the trail either', async () => {
  const server = await startServer();
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/audit`, {
      headers: { Authorization: 'Bearer not.a.real.token' },
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});
