// Run with: node --test backend/routes.frontend.test.js
//
// Every API call the frontend makes must have a route behind it.
//
// The failure this exists for is the one users actually reported: "No API route
// for PUT /api/admin/rewards-settings" and its siblings. A call with no route
// answers the catch-all's 404, which the SPA can only render as a failed card —
// and nothing in either suite noticed, because the frontend tests mock the API
// and the backend tests only cover the routes they know about.
//
// How it works: read every literal path out of `api.get("/x")`-style calls in
// frontend/src, boot the real Express app, and require that none of them hit the
// catch-all. Query strings and path params are deliberately NOT sent, so no
// upstream provider is ever contacted (a widget with no parameters answers 400
// before it reaches Discord/Roblox) and the only thing under test is routing.
//
// Limits, stated honestly: it sees the first string argument of a call. A path
// built at runtime (`api.get(someVar)`) is invisible to it, and an aliased client
// (`const c = api; c.get("/x")`) is too — so this is a floor, not a proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.VERCEL = '1';
process.env.RATE_LIMIT_DISABLED = '1';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../frontend/src');

const files = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) files(p, out);
    else if (/\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) out.push(p);
  }
  return out;
};

/* `api\n  .get("/x", …)` is the house style, so whitespace between the instance,
   the method and the literal is allowed. `${…}` in a template path becomes "1" —
   enough for routing, where only the shape matters. */
function collectCalls(dir) {
  const found = new Map();
  for (const file of files(dir)) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /api\s*\.\s*(get|post|put|delete|patch)\s*\(\s*[`"']([^`"']+)[`"']/g;
    let m;
    while ((m = re.exec(src))) {
      const url = m[2].replace(/\$\{[^}]*\}/g, '1');
      if (!url.startsWith('/')) continue;
      const key = `${m[1].toUpperCase()} ${url}`;
      if (!found.has(key)) found.set(key, file);
    }
  }
  return found;
}

test('every API call in the frontend is routed by the backend', async (t) => {
  if (!fs.existsSync(SRC)) {
    t.skip('frontend source not present in this checkout');
    return;
  }

  const calls = collectCalls(SRC);
  assert.ok(calls.size > 20, `expected to find the frontend's API calls, found ${calls.size}`);

  const app = (await import('./server.js')).default;
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

  const unrouted = [];
  try {
    const { port } = server.address();
    for (const [key, from] of calls) {
      const i = key.indexOf(' ');
      const method = key.slice(0, i);
      const url = key.slice(i + 1);
      const res = await fetch(`http://127.0.0.1:${port}/api${url}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
      });
      if (res.status !== 404) continue;
      const body = await res.text();
      if (/No API route/.test(body)) {
        unrouted.push(`${method} /api${url}  (called from ${path.relative(here, from)})`);
      }
    }
  } finally {
    server.close();
  }

  assert.deepEqual(
    unrouted,
    [],
    `these calls have no backend route and will answer "No API route":\n  ${unrouted.join('\n  ')}`,
  );
});
