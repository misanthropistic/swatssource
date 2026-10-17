// Sanitizes environment variables BEFORE libraries that read them on import (e.g. cloudinary).
// Import this module first.
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import { normalizePublicUrl } from './publicUrl.js';

dotenv.config();

const clean = (v) =>
  String(v || '')
    .trim()
    .replace(/^[A-Z_]+=/, '') // pasted "NAME=value"
    .replace(/^['"]|['"]$/g, '') // wrapped in quotes
    .replace(/[<>]/g, '') // strip placeholder angle brackets like <api_key>
    .trim();

// Clean dedicated variables if set
if (process.env.CLOUDINARY_CLOUD_NAME) process.env.CLOUDINARY_CLOUD_NAME = clean(process.env.CLOUDINARY_CLOUD_NAME);
if (process.env.CLOUDINARY_API_KEY) process.env.CLOUDINARY_API_KEY = clean(process.env.CLOUDINARY_API_KEY);
if (process.env.CLOUDINARY_API_SECRET) process.env.CLOUDINARY_API_SECRET = clean(process.env.CLOUDINARY_API_SECRET);

// Cloudinary throws at import time if CLOUDINARY_URL is malformed, which crashes the server.
if (process.env.CLOUDINARY_URL !== undefined) {
  const url = clean(process.env.CLOUDINARY_URL);
  if (url.startsWith('cloudinary://')) {
    try {
      // Validate with URL parser so Cloudinary's import won't crash Node
      new URL(url);
      process.env.CLOUDINARY_URL = url;
    } catch (err) {
      console.warn(
        `[env] CLOUDINARY_URL is invalid (${err.message}). Uploads are disabled until it is fixed.`
      );
      delete process.env.CLOUDINARY_URL;
    }
  } else {
    if (url) {
      console.warn(
        "[env] CLOUDINARY_URL is invalid (must start with 'cloudinary://'). Uploads are disabled until it is fixed."
      );
    }
    delete process.env.CLOUDINARY_URL;
  }
}

/* ---------------------------------------------------------------------------
   JWT signing secret.

   auth.js used to fall back to a hard-coded string that lives in this public
   repository. Anyone who read it could sign `{ sub: <any id> }` and be that
   account, so the fallback is gone:

     • a real secret is kept as entered (after the same literal-value cleaning
       the Cloudinary keys go through);
     • the leaked default is recognised and replaced even if it is still set;
     • in production a missing secret gets a random per-process one, which fails
       CLOSED — nothing forged can be accepted — at the cost of invalidating
       sessions whenever the process restarts, hence the loud warning;
     • outside production a clearly non-secret development value is used, so
       local runs and the test suite need no configuration.
   --------------------------------------------------------------------------- */

// The old hard-coded fallback. Recognised on purpose so deploying it back by
// accident cannot restore the hole.
const LEAKED_JWT_SECRETS = new Set(['swats-super-secret-jwt-key-minimum-32-chars-long']);
const DEV_JWT_SECRET = 'development-only-jwt-secret-not-for-production';
const isProduction = () => process.env.NODE_ENV === 'production';

function generateSecret() {
  // 48 bytes of CSPRNG entropy, base64url so it survives env-panel copy/paste.
  return randomBytes(48).toString('base64url');
}

function resolveJwtSecret() {
  const supplied = clean(process.env.JWT_SECRET);

  if (supplied && !LEAKED_JWT_SECRETS.has(supplied)) {
    if (supplied.length < 32) {
      console.warn(
        '[env] JWT_SECRET is shorter than 32 characters. Use a long random value (e.g. `openssl rand -base64 48`).'
      );
    }
    return supplied;
  }

  if (supplied) {
    console.error(
      '[env] JWT_SECRET is the shared default from this repository and is public — replacing it with a random value. Set JWT_SECRET in the host env panel to stop being logged out on every deploy.'
    );
    return generateSecret();
  }

  if (isProduction()) {
    console.error(
      '[env] CRITICAL: JWT_SECRET is not set. Generating a random secret for this process: tokens cannot be forged, but every restart and deploy signs everyone out. Set JWT_SECRET now.'
    );
    return generateSecret();
  }

  return DEV_JWT_SECRET;
}

process.env.JWT_SECRET = resolveJwtSecret();

export const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
);

/* Public URLs are pasted by hand into the host's env panel, which is where the
   two OAuth callback failures came from: a one-slash scheme ("https:/host",
   which Discord reports as an invalid redirect URI) and a plain http origin on a
   real domain ("This redirect URI is not secure", from Spotify). Repaired once
   here so every consumer — OAuth redirects, CORS, the Stripe return URL — reads
   a usable value no matter how it was entered. Comma-separated lists are
   repaired entry by entry, and the CORS wildcard is left alone. */
const PUBLIC_URL_VARS = [
  'DISCORD_REDIRECT_URI',
  'SPOTIFY_REDIRECT_URI',
  'FRONTEND_URL',
  'CORS_ORIGINS',
];

for (const key of PUBLIC_URL_VARS) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') continue;

  const fixed = String(raw)
    .split(',')
    .map((part) => (part.trim() === '*' ? '*' : normalizePublicUrl(part)))
    .filter(Boolean)
    .join(',');

  if (fixed !== raw) {
    console.warn(`[env] ${key} was repaired: ${JSON.stringify(raw)} -> ${JSON.stringify(fixed)}`);
    process.env[key] = fixed;
  }
}
