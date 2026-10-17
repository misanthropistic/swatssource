// Run with: node --test backend/discordLink.test.js
//
// The OAuth `state` is the only thing that tells the Discord callback which
// account started the flow. It was sent by /discord/login and then ignored, so
// "Connect Discord" on an existing profile fell through to the match-or-create
// path and produced a second account. These pin the reading of that state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken, userIdFromToken } from './auth.js';
import { parseOAuthState, readLinkToken, readLinkIntent } from './routes/auth.js';

const linkState = (id) =>
  JSON.stringify({ mode: 'link', token: signToken({ id, username: 'tester', role: 'user', tier: 'free' }) });

test('a link-mode state names the account that started the flow', () => {
  assert.equal(readLinkToken(linkState(42)), 42);
  assert.equal(readLinkToken(linkState('7')), '7');
});

test('a sign-in state carries no account, so it resolves by Discord id or email', () => {
  assert.equal(readLinkToken(JSON.stringify({ mode: 'login', token: null })), null);
  assert.equal(readLinkToken(JSON.stringify({ mode: 'login' })), null);
});

test('a state we did not sign is never trusted', () => {
  // Hand-made, truncated, foreign and plainly wrong tokens all mean "sign in".
  assert.equal(userIdFromToken('not.a.token'), null);
  assert.equal(readLinkToken(JSON.stringify({ mode: 'link', token: 'not.a.token' })), null);
  assert.equal(readLinkToken(JSON.stringify({ mode: 'link', token: 12345 })), null);
  assert.equal(readLinkToken(JSON.stringify({ mode: 'link', token: '' })), null);
  const [header, payload] = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiI5OTkifQ'].map(Buffer.from);
  assert.equal(readLinkToken(JSON.stringify({ mode: 'link', token: `${header}.${payload}.forged` })), null);
});

/* "Add another account" rides the same OAuth round trip as "Connect Discord"
   but must never be confused with it: a pair intent names the account that
   STAYS signed in, and treating it as a connect would overwrite that account's
   Discord identity with the other one's. */
test('a pair intent is never mistaken for a connect', () => {
  assert.equal(readLinkToken(JSON.stringify({ mode: 'pair', pair: true, nonce: 'n' })), null);
  assert.equal(readLinkIntent(JSON.stringify({ mode: 'pair', nonce: 'n' })), null);
  // A legacy token form is always a connect, never a pair.
  const intent = readLinkIntent(linkState(9));
  assert.equal(intent.kind, 'link');
  assert.equal(intent.userId, 9);
});

test('malformed state does not throw', () => {
  // A provider can hand back anything, including nothing at all.
  assert.deepEqual(parseOAuthState(undefined), {});
  assert.deepEqual(parseOAuthState(''), {});
  assert.deepEqual(parseOAuthState('{not json'), {});
  assert.deepEqual(parseOAuthState('"a string"'), {});
  assert.deepEqual(parseOAuthState('[1,2,3]'), {});
  // Express can turn a repeated query parameter into an array.
  assert.deepEqual(parseOAuthState(['{"mode":"link"}']), {});
  assert.equal(readLinkToken(undefined), null);
});
