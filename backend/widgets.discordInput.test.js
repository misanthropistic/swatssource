// Run with: node --test backend/widgets.discordInput.test.js
//
// The Discord server card takes "an invite link or a server ID" from the profile
// owner. A Discord USER link is the paste people actually have, and it used to
// be handed to the invite API as a code — one guaranteed 404 per render added to
// the log every time that profile was viewed. These cases are offline-safe: both
// are rejected before any upstream request.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
process.env.RATE_LIMIT_DISABLED = '1';

const app = (await import('./server.js')).default;

const startServer = () =>
  new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

const get = async (url) => {
  const server = await startServer();
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${url}`);
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
};

test('a user profile link is refused with a usable message, not sent upstream', async () => {
  for (const raw of [
    'https://discordapp.com/users/1546745348020772915',
    'discord.com/users/1510715040519422033',
    'https://www.discordapp.com/users/123456789012345678',
  ]) {
    const { status, body } = await get(`/api/widgets/discord/server?id=${encodeURIComponent(raw)}`);
    assert.equal(status, 400, `expected 400 for ${raw}`);
    assert.match(String(body.detail), /user profile/i, `expected a "user profile" hint for ${raw}`);
  }
});

test('an empty id explains what the card wants', async () => {
  const { status, body } = await get('/api/widgets/discord/server');
  assert.equal(status, 400);
  assert.match(String(body.detail), /invite/i);
});
