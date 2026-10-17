// Run with: node --test backend/publicUrl.test.js
//
// These lock down the OAuth callback URLs. A regression in any of them is not a
// cosmetic bug: Discord answers "You provided an invalid redirect URI" and
// Spotify answers "This redirect URI is not secure", and sign-in stops working
// entirely. Both of those were seen in production, so each case below is named
// after the failure it prevents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublicUrl, publicBaseUrl, oauthRedirectUrl } from './publicUrl.js';

// Minimal stand-in for an Express request.
const fakeReq = (headers, protocol = 'http') => ({
  headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
  protocol,
  get(name) {
    return this.headers[String(name).toLowerCase()];
  },
});

test('repairs the one-slash scheme Discord reported as an invalid redirect URI', () => {
  assert.equal(
    normalizePublicUrl('https:/swatssource-production.up.railway.app/api/auth/discord/callback'),
    'https://swatssource-production.up.railway.app/api/auth/discord/callback'
  );
  // ...including when the slash is missing altogether.
  assert.equal(
    normalizePublicUrl('https:swats.bio/api/x'),
    'https://swats.bio/api/x'
  );
});

test('upgrades the http origin Spotify rejected as "not secure"', () => {
  assert.equal(
    normalizePublicUrl('http://swatssource-production.up.railway.app/api/connect/spotify/callback'),
    'https://swatssource-production.up.railway.app/api/connect/spotify/callback'
  );
  // A real domain is always https, however it was pasted.
  assert.equal(normalizePublicUrl('swats.bio'), 'https://swats.bio');
  assert.equal(normalizePublicUrl('http://swats.bio/'), 'https://swats.bio');
});

test('leaves http alone where http is the correct scheme', () => {
  // Loopback and LAN hosts are the only http origins the providers accept, and
  // upgrading them would break local development.
  assert.equal(normalizePublicUrl('http://localhost:5000/api/x'), 'http://localhost:5000/api/x');
  assert.equal(normalizePublicUrl('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.equal(normalizePublicUrl('http://192.168.1.20:5000/api/x'), 'http://192.168.1.20:5000/api/x');
  // A deliberate https localhost origin (CRA HTTPS=true) is never downgraded.
  assert.equal(normalizePublicUrl('https://localhost:3000'), 'https://localhost:3000');
});

test('strips the ways a hand-pasted env value arrives broken', () => {
  assert.equal(normalizePublicUrl('  "https://swats.bio/api/x"  '), 'https://swats.bio/api/x');
  assert.equal(normalizePublicUrl("SPOTIFY_REDIRECT_URI='http://swats.bio/api/x'"), 'https://swats.bio/api/x');
  assert.equal(normalizePublicUrl('<https://swats.bio/api/x>'), 'https://swats.bio/api/x');
  // A trailing slash would not match the value registered with the provider.
  assert.equal(normalizePublicUrl('https://swats.bio/api/x/'), 'https://swats.bio/api/x');
  // Empty and wildcard values pass through so CORS keeps working.
  assert.equal(normalizePublicUrl(''), '');
  assert.equal(normalizePublicUrl(undefined), '');
  assert.equal(normalizePublicUrl('*'), '*');
  // A path with no origin is left as written rather than given a bogus host.
  assert.equal(normalizePublicUrl('/api/connect/spotify/callback'), '/api/connect/spotify/callback');
});

test('publicBaseUrl trusts the proxy and forces https for a real domain', () => {
  // The platform proxy terminates TLS, so its header is the authority.
  assert.equal(
    publicBaseUrl(fakeReq({ host: 'swatssource-production.up.railway.app', 'x-forwarded-proto': 'https' })),
    'https://swatssource-production.up.railway.app'
  );
  // Even without that header: a real domain is served over TLS regardless.
  assert.equal(publicBaseUrl(fakeReq({ host: 'swats.bio' })), 'https://swats.bio');
  assert.equal(publicBaseUrl(fakeReq({ host: 'localhost:5000' })), 'http://localhost:5000');
  assert.equal(publicBaseUrl(fakeReq({ host: '192.168.4.4:5000' })), 'http://192.168.4.4:5000');
  // A rewritten host wins over the internal one.
  assert.equal(
    publicBaseUrl(fakeReq({ host: 'internal.railway.internal', 'x-forwarded-host': 'swats.bio', 'x-forwarded-proto': 'https' })),
    'https://swats.bio'
  );
});

test('oauthRedirectUrl prefers the configured value and falls back to the request', () => {
  const req = fakeReq({ host: 'swatssource-production.up.railway.app', 'x-forwarded-proto': 'https' });

  // Configured, but pasted with the http:// that Spotify refuses.
  process.env.TEST_SPOTIFY_REDIRECT_URI = 'http://swatssource-production.up.railway.app/api/connect/spotify/callback';
  assert.equal(
    oauthRedirectUrl(req, 'TEST_SPOTIFY_REDIRECT_URI', '/api/connect/spotify/callback'),
    'https://swatssource-production.up.railway.app/api/connect/spotify/callback'
  );

  // Unset: derive it from the request, still https.
  delete process.env.TEST_SPOTIFY_REDIRECT_URI;
  assert.equal(
    oauthRedirectUrl(req, 'TEST_SPOTIFY_REDIRECT_URI', '/api/connect/spotify/callback'),
    'https://swatssource-production.up.railway.app/api/connect/spotify/callback'
  );

  // A wildcard is not a usable callback URL, so the request wins over it.
  process.env.TEST_SPOTIFY_REDIRECT_URI = '*';
  assert.equal(
    oauthRedirectUrl(req, 'TEST_SPOTIFY_REDIRECT_URI', '/api/connect/spotify/callback'),
    'https://swatssource-production.up.railway.app/api/connect/spotify/callback'
  );
  delete process.env.TEST_SPOTIFY_REDIRECT_URI;

  // Local development keeps working end to end.
  assert.equal(
    oauthRedirectUrl(fakeReq({ host: 'localhost:5000' }), 'TEST_SPOTIFY_REDIRECT_URI', '/api/connect/spotify/callback'),
    'http://localhost:5000/api/connect/spotify/callback'
  );
});
