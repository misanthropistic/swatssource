// Run with: node --test backend/billing.routes.test.js
//
// The catch-all "No API route for ..." JSON response sits at the very end of
// server.js's mount order, so a mount that stops matching (a path typo in
// app.use, a route renamed, a router mounted after a `app.use('/', …)` that
// swallows POSTs) turns request 404s into that message and every caller sees
// "No API route for POST /api/billing/donate". This boots the real app the way
// the server does and drives the actual Express stack, so a change to the
// mount order or the route table fails here instead of in production.
import test from 'node:test';
import assert from 'node:assert/strict';

// No listen() from the import itself (tests own the server), and no
// Discord gateway attempt — just the HTTP table.
process.env.VERCEL = '1';
process.env.RATE_LIMIT_DISABLED = '1';

const app = (await import('./server.js')).default;

const startServer = () =>
  new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

test('POST /api/billing/donate reaches its route, never the unmatched-API 404', async () => {
  const server = await startServer();
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/billing/donate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_usd: 5 }),
    });
    const detail = await res.json().then((d) => d.detail || '');

    // Whatever the auth result is, the catch-all message — the exact string
    // users reported — must not come back from this URL.
    assert.ok(res.status !== 404, `donate route 404'd`);
    assert.ok(
      !/No API route/.test(detail),
      `donate fell through to the catch-all: ${detail}`,
    );
  } finally {
    server.close();
  }
});

test('GET /api/billing/portal stays mounted on the same router', async () => {
  const server = await startServer();
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/billing/portal`;
    const res = await fetch(url);
    const body = await res.json();
    assert.ok(res.status !== 404);
    assert.ok(!/No API route/.test(body.detail || ''));
  } finally {
    server.close();
  }
});
