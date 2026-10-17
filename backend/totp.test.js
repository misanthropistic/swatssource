// Run with: node --test backend/totp.test.js
//
// The second factor is only as good as its arithmetic, so these are the RFC's
// own vectors rather than numbers produced by this implementation: the SHA-1
// rows of RFC 6238 Appendix B, over the ASCII secret "12345678901234567890"
// (base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ).
//
// The failure this file exists to prevent is the subtle one: verifying only the
// current 30-second step passes every "does it accept a fresh code" test and
// still locks out anyone whose phone clock is half a minute behind.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateSecret,
  hotp,
  normalizeCode,
  normalizeRecoveryCode,
  otpauthUri,
  totp,
  verifyTotp,
} from './totp.js';

const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

// RFC 6238 Appendix B, SHA-1, 8 digits.
const RFC_VECTORS = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

test('matches every SHA-1 test vector in RFC 6238', () => {
  for (const [seconds, expected] of RFC_VECTORS) {
    assert.equal(
      hotp(RFC_SECRET, Math.floor(seconds / 30), 8),
      expected,
      `counter for T=${seconds} should be ${expected}`
    );
  }
});

test('totp() is hotp() over the current step', () => {
  // 59s falls in step 1 (0-29, 30-59), which the vector above pins.
  assert.equal(totp(RFC_SECRET, { at: 59_000, digits: 8 }), '94287082');
  // Six digits is the last six of the same value — what authenticator apps show.
  assert.equal(totp(RFC_SECRET, { at: 59_000 }), '287082');
});

test('base32 round-trips, and rejects what is not base32', () => {
  const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);
  assert.deepEqual(base32Decode(base32Encode(buf)), buf);
  // Lower case, spaces and padding are how these arrive from a human.
  assert.deepEqual(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq'), base32Decode(RFC_SECRET));
  assert.equal(base32Decode('not base32!'), null);
  assert.equal(base32Decode(''), null);
});

test('a generated secret is 20 bytes of base32 and verifies its own code', () => {
  const secret = generateSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  const at = 1_700_000_000_000;
  assert.equal(verifyTotp(secret, totp(secret, { at }), { at }), true);
});

test('accepts the previous and next step, rejects anything further out', () => {
  const secret = generateSecret();
  const at = 1_700_000_000_000;

  assert.equal(verifyTotp(secret, totp(secret, { at: at - 30_000 }), { at }), true, 'one step behind');
  assert.equal(verifyTotp(secret, totp(secret, { at: at + 30_000 }), { at }), true, 'one step ahead');
  assert.equal(verifyTotp(secret, totp(secret, { at: at - 60_000 }), { at }), false, 'two steps behind');
  assert.equal(verifyTotp(secret, totp(secret, { at: at + 120_000 }), { at }), false, 'four steps ahead');
});

test('a wrong or malformed code is refused', () => {
  const secret = generateSecret();
  const at = 1_700_000_000_000;
  const good = totp(secret, { at });

  assert.equal(verifyTotp(secret, null, { at }), false);
  assert.equal(verifyTotp(secret, '', { at }), false);
  assert.equal(verifyTotp(secret, 'abcdef', { at }), false);
  assert.equal(verifyTotp(secret, '12345', { at }), false, 'too short');
  assert.equal(verifyTotp(secret, '1234567', { at }), false, 'too long');
  assert.equal(verifyTotp(secret, String((Number(good) + 1) % 1_000_000).padStart(6, '0'), { at }), false);
  // A secret that is not base32 must not throw, it must refuse.
  assert.equal(verifyTotp('not base32!', good, { at }), false);
});

test('spaces, dashes and case do not decide whether a valid code works', () => {
  assert.equal(normalizeCode('123 456'), '123456');
  assert.equal(normalizeCode('123-456'), '123456');
  assert.equal(normalizeCode(' 123456 '), '123456');
  assert.equal(normalizeCode('12a456'), null);
  assert.equal(normalizeCode('12345'), null);

  const secret = generateSecret();
  const at = 1_700_000_000_000;
  const code = totp(secret, { at });
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  assert.equal(verifyTotp(secret, spaced, { at }), true);
});

test('the otpauth URI carries what an authenticator app needs', () => {
  const uri = otpauthUri({ secret: RFC_SECRET, account: 'ada@swats.bio', issuer: 'swats.bio' });
  assert.match(uri, /^otpauth:\/\/totp\/swats\.bio%3Aada%40swats\.bio\?/);
  const params = new URL(uri.replace('otpauth://', 'https://')).searchParams;
  assert.equal(params.get('secret'), RFC_SECRET);
  assert.equal(params.get('issuer'), 'swats.bio');
  assert.equal(params.get('digits'), '6');
  assert.equal(params.get('period'), '30');
});

test('recovery codes are unambiguous, unique, and single-use shaped', () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10, 'no duplicates in one batch');
  for (const code of codes) {
    // No I, L, O or 0/1 — these are read off paper.
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  }
  // What someone types back, in any case, with or without the dash.
  assert.equal(normalizeRecoveryCode(codes[0].toLowerCase()), codes[0]);
  assert.equal(normalizeRecoveryCode(codes[0].replace('-', '')), codes[0]);
  assert.equal(normalizeRecoveryCode('short'), null);
});
