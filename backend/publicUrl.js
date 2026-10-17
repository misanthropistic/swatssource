/* ---------------------------------------------------------------------------
   Public URL repair

   OAuth providers match redirect_uri byte for byte against the values
   registered in their dashboard, and Spotify refuses a non-https host before it
   ever redirects. Those URLs are pasted by hand into the host's env panel, and
   both reported failures came straight out of that:

     - "You provided an invalid redirect URI:
        https:/swatssource-production.up.railway.app/api/auth/discord/callback"
       a one-slash scheme, which matches no registered value at Discord.
     - "This redirect URI is not secure:
        http://swatssource-production.up.railway.app/api/connect/spotify/callback"
       a plain http origin, which Spotify rejects outright.

   normalizePublicUrl() repairs both. A real domain name is always served over
   TLS behind the platform proxy, so it is upgraded to https; loopback and LAN
   hosts keep http, which is what local development needs (and the only http
   OAuth providers accept). publicBaseUrl() and oauthRedirectUrl() derive the
   same value from the incoming request when the variable is unset, so every
   OAuth route builds its callback URL one way instead of by hand.
   --------------------------------------------------------------------------- */

// Hand-pasted values arrive with the variable name still attached, wrapped in
// quotes, or wearing placeholder brackets.
const strip = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^[A-Za-z_][A-Za-z0-9_]*=/, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/[<>]/g, '')
    .trim();

const hostOf = (value) => {
  const match = /^(?:https?:\/\/)?([^/?#]+)/i.exec(String(value ?? '').trim());
  return (match?.[1] || '').toLowerCase();
};

// Loopback, LAN and container-internal addresses: the only hosts where plain
// http is both correct and accepted by the providers.
const isPrivateHost = (host) => {
  const bare = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return (
    !bare ||
    bare === 'localhost' ||
    bare.endsWith('.localhost') ||
    bare.endsWith('.local') ||
    bare.endsWith('.internal') ||
    bare === '::1' ||
    bare === '0.0.0.0' ||
    /^(10|127)\./.test(bare) ||
    /^192\.168\./.test(bare) ||
    /^169\.254\./.test(bare) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(bare)
  );
};

// A real domain name: has a dot, a TLD-shaped suffix, and is not an IP literal.
const isPublicDomain = (host) =>
  !isPrivateHost(host) && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(host.replace(/:\d+$/, ''));

/**
 * Repairs a hand-pasted public URL. Returns '' for empty input and '*' (the
 * CORS wildcard) untouched.
 */
export function normalizePublicUrl(input) {
  let value = strip(input);
  if (!value || value === '*' || value.startsWith('/')) return value;

  const hadScheme = /^https?:/i.test(value);
  if (hadScheme) {
    // "https:/host" and "https:host" are both attempts at "https://host".
    value = value.replace(/^(https?):\/*/i, '$1://');
  }

  const host = hostOf(value);
  if (!hadScheme) value = `${isPrivateHost(host) ? 'http' : 'https'}://${value}`;
  // Never downgrade: an https loopback origin is deliberate (CRA's HTTPS=true).
  if (isPublicDomain(host)) value = value.replace(/^http:\/\//i, 'https://');

  return value.replace(/\/+$/, '');
}

/**
 * The origin this request arrived on. The platform proxy terminates TLS, so the
 * forwarded scheme is preferred, and a real domain is https regardless of what
 * the request claims — Railway reports http on the internal hop.
 */
export function publicBaseUrl(req) {
  const header = (name) => String(req?.headers?.[name] ?? '').split(',')[0].trim();
  const host = header('x-forwarded-host') || String(req?.get?.('host') || req?.headers?.host || '');
  const observed = (header('x-forwarded-proto') || req?.protocol || '').toLowerCase();
  const scheme = isPublicDomain(host) || observed === 'https' ? 'https' : 'http';
  return host ? `${scheme}://${host}` : '';
}

/**
 * The redirect_uri for an OAuth provider: the configured value when there is
 * one (it has to match the provider's dashboard exactly), otherwise this
 * request's own origin plus the callback path.
 */
export function oauthRedirectUrl(req, envKey, path) {
  const configured = normalizePublicUrl(process.env[envKey]);
  if (configured && configured !== '*') return configured;
  return `${publicBaseUrl(req)}${path}`;
}
