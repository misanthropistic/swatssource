// Cloudinary credential resolution.
//
// Deliberately dependency-free (no express, no cloudinary, no database) so the
// parsing can be unit tested directly — see cloudinaryConfig.test.js.
//
// Why this is its own module: Cloudinary reports a wrong api_secret as
// "Invalid Signature", which is indistinguishable from a secret that was
// corrupted on the way in. The previous implementation did two things that can
// corrupt one:
//
//   1. `credentials.split(':')` destructured only the first two elements, so an
//      api_secret containing ':' was silently truncated.
//   2. `decodeURIComponent()` was applied to all three values. The WHATWG URL
//      parser that Cloudinary's own SDK uses keeps existing percent-escapes as
//      written, so decoding turned a secret like "Ab%41Cd" into "AbACd" — a
//      different secret, and therefore a different signature.
//
// Values are now taken verbatim: either straight from the dedicated variables,
// or sliced out of CLOUDINARY_URL without any decoding.

const strip = (v) =>
  String(v ?? '')
    .trim()
    .replace(/^[A-Z_]+=/, '') // a pasted "NAME=value" pair
    .replace(/^['"]|['"]$/g, '') // wrapped in quotes
    .replace(/[<>]/g, '') // strip placeholder angle brackets like <api_key>
    .trim();

/**
 * Resolve Cloudinary credentials from the environment.
 *
 * Precedence matches the original code: CLOUDINARY_URL wins when it parses,
 * otherwise the three dedicated variables are used. It is always safe to call —
 * nothing throws on malformed input, it reports a reason instead.
 */
export function readCloudinaryCredentials(env = process.env) {
  const explicit = {
    cloud_name: strip(env.CLOUDINARY_CLOUD_NAME),
    api_key: strip(env.CLOUDINARY_API_KEY),
    api_secret: strip(env.CLOUDINARY_API_SECRET),
  };
  const explicitComplete = Boolean(
    explicit.cloud_name && explicit.api_key && explicit.api_secret
  );

  const rawUrl = strip(env.CLOUDINARY_URL || env.CLOUDINARY_CONFIG_URL);
  let fromUrl = null;
  let urlProblem = null;

  if (rawUrl) {
    const rest = rawUrl.replace(/^cloudinary:\/\//i, '');
    const firstColon = rest.indexOf(':');
    const lastAt = rest.lastIndexOf('@');

    if (!/^cloudinary:\/\//i.test(rawUrl)) {
      urlProblem = 'CLOUDINARY_URL does not start with cloudinary://';
    } else if (firstColon <= 0 || lastAt <= firstColon) {
      urlProblem =
        'CLOUDINARY_URL is not in the form cloudinary://<api_key>:<api_secret>@<cloud_name>';
    } else {
      // Slice rather than split: the key ends at the FIRST colon and the secret
      // ends at the LAST '@', so ':' and '@' inside the secret survive intact.
      fromUrl = {
        cloud_name: rest.slice(lastAt + 1).replace(/\/+$/, '').trim(),
        api_key: rest.slice(0, firstColon).trim(),
        api_secret: rest.slice(firstColon + 1, lastAt),
      };
      if (!fromUrl.cloud_name || !fromUrl.api_key || !fromUrl.api_secret) {
        urlProblem = 'CLOUDINARY_URL is missing the api key, api secret, or cloud name';
        fromUrl = null;
      }
    }
  }

  const credentials = fromUrl
    ? { ...fromUrl, source: 'CLOUDINARY_URL' }
    : explicitComplete
      ? { ...explicit, source: 'explicit CLOUDINARY_* variables' }
      : null;

  // Two sources holding different values is a classic way to end up signing with
  // a key from one account and a secret from another.
  const conflict = Boolean(
    explicitComplete &&
      fromUrl &&
      (explicit.cloud_name !== fromUrl.cloud_name ||
        explicit.api_key !== fromUrl.api_key ||
        explicit.api_secret !== fromUrl.api_secret)
  );

  return { credentials, explicitComplete, urlPresent: Boolean(rawUrl), urlProblem, conflict };
}

/**
 * Diagnostics that are safe to log or return to the authenticated owner.
 *
 * `cloud_name` and `api_key` are public values — the api key ships inside
 * client-side upload widgets and appears in unsigned upload URLs — so showing
 * them is what makes a credential mismatch diagnosable. The secret itself is
 * never included: only its length and which special characters it contains,
 * since those are exactly the characters a naive parser corrupts.
 */
export function describeCloudinaryCredentials(credentials) {
  if (!credentials) {
    return { source: null, reason: 'no Cloudinary credentials resolved from the environment' };
  }
  const secret = credentials.api_secret || '';
  const specials = [...new Set(secret.match(/[%:@/\\?#+]/g) || [])].join('');
  return {
    source: credentials.source,
    cloud_name: credentials.cloud_name,
    api_key: credentials.api_key,
    api_secret_length: secret.length,
    api_secret_special_chars: specials || 'none',
  };
}
