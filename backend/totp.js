/* ---------------------------------------------------------------------------
   TOTP (RFC 6238) — the second factor.

   Deliberately dependency-free: node:crypto already has HMAC-SHA1, base32 is
   32 lines, and a second authentication factor is the last place to add a
   package you have to audit and keep patched. The RFC's own test vectors are in
   totp.test.js, including the case that catches the classic mistake — verifying
   the code for the *current* step only, which fails for anyone whose clock is
   half a minute behind.
   --------------------------------------------------------------------------- */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // RFC 4648

export const DEFAULT_STEP_SECONDS = 30;
export const DEFAULT_DIGITS = 6;

/* 20 random bytes is the RFC 4226 recommendation and the value every
   authenticator app expects to be able to scan. */
export function generateSecret(bytes = 20) {
  return base32Encode(randomBytes(bytes));
}

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/* Accepts what a user actually pastes: lower case, spaces, dashes, and the
   `====` padding some apps print. Returns null for anything that is not base32,
   so callers never hand garbage to the HMAC. */
export function base32Decode(input) {
  const clean = String(input || '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/=+$/, '');
  if (!clean) return null;

  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return out.length ? Buffer.from(out) : null;
}

/* HOTP: HMAC-SHA1(secret, counter) truncated to `digits`, per RFC 4226 §5.4. */
export function hotp(secret, counter, digits = DEFAULT_DIGITS) {
  const key = typeof secret === 'string' ? base32Decode(secret) : secret;
  if (!key) return null;

  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', key).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totp(secret, { at = Date.now(), step = DEFAULT_STEP_SECONDS, digits = DEFAULT_DIGITS } = {}) {
  return hotp(secret, Math.floor(at / 1000 / step), digits);
}

/* What a human typed, as digits. `123 456`, `123-456` and `123456` are all the
   same code; anything with a non-digit in it is not a code at all. */
export function normalizeCode(input) {
  const digits = String(input ?? '').replace(/[\s-]/g, '');
  return /^\d{6,8}$/.test(digits) ? digits : null;
}

/* Constant-time compare of two code strings, length-equal by construction. */
function codesMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/* Verifies a code against the step it belongs to, plus `window` steps either
   side — authenticator clocks drift, and a code that expired two seconds ago
   should not be the reason someone cannot get into their own account. The
   window is small on purpose: every extra step widens the replay window. */
export function verifyTotp(
  secret,
  code,
  { at = Date.now(), step = DEFAULT_STEP_SECONDS, window = 1, digits = DEFAULT_DIGITS } = {}
) {
  const normalized = normalizeCode(code);
  if (!normalized || normalized.length !== digits) return false;

  const counter = Math.floor(at / 1000 / step);
  // Compare every candidate anyway — returning early on the first match would
  // leak which step matched through timing.
  let matched = false;
  for (let drift = -window; drift <= window; drift += 1) {
    if (codesMatch(hotp(secret, counter + drift, digits), normalized)) matched = true;
  }
  return matched;
}

/* The URI an authenticator scans. `issuer` and `account` are display-only, but
   they are what makes ten entries in one app tell themselves apart. */
export function otpauthUri({ secret, account, issuer = 'swats.bio' }) {
  const label = encodeURIComponent(`${issuer}:${account || ''}`);
  const params = new URLSearchParams({
    secret: String(secret || ''),
    issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* Human-typed fallback codes for a lost phone. `XXXX-XXXX` in an unambiguous
   alphabet: no O/0, no I/1/L, because these get read off paper and typed. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRecoveryCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    let code = '';
    for (let c = 0; c < 8; c += 1) {
      if (c === 4) code += '-';
      code += RECOVERY_ALPHABET[randomBytes(1)[0] % RECOVERY_ALPHABET.length];
    }
    codes.push(code);
  }
  return codes;
}

/* Single-use, so it is matched exactly (same shape the user typed or a version
   with the dash removed) and never case-sensitively. */
export function normalizeRecoveryCode(input) {
  const clean = String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 8) return null;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}
