/* ---------------------------------------------------------------------------
   The global rooms

   Two rooms, both plain text in global_messages and both Premium-only (the
   whole /rooms surface sits behind the chat gate):

     general     the open room. Pictures and GIFs are welcome. The server can
                 read it, an admin can moderate it, a database dump is readable —
                 nothing here is pretending to be private.
     top-dogs    the built-in room every Premium member is in automatically.
                 Membership needs no join and no list to manage: anyone who can
                 open the chat at all is in it, because the gate itself is the
                 membership rule stated as a room.
   --------------------------------------------------------------------------- */

export const GLOBAL_ROOMS = [
  {
    id: 'top-dogs',
    title: 'Top Dogs',
    encrypted: false,
    hint: 'Where every Premium member sits — the built-in room, no join needed.',
  },
  {
    id: 'general',
    title: 'General',
    encrypted: false,
    hint: 'Open to every chat-capable member. Stored as text; pictures and GIFs welcome.',
  },
];

export const GLOBAL_ROOM_IDS = GLOBAL_ROOMS.map((r) => r.id);

export const roomById = (id) => GLOBAL_ROOMS.find((r) => r.id === id) || null;

/* A public room's message: text, or a picture with an optional caption, and
   never both empty. Length-capped so one message cannot be a payload. */
export const MAX_BODY = 2000;
export const MAX_ATTACHMENT_URL = 500;

/* The provider serves media from its own CDN and expects those URLs to be
   embedded as-is (with the credit the picker shows), so a GIF is linked rather
   than re-hosted. An allowlist, not "any https URL": a room where any address
   can be attached is a room where any address can be made to load for every
   member.

   Matched by domain suffix rather than as a fixed list of hostnames, because
   the provider rotates across media1…media4 on its own: a fixed list would
   start refusing the provider's own results the day it adds a fifth. The
   dot-boundary comparison is what keeps `evilgiphy.com` out. */
export const GIF_HOST_SUFFIXES = ['giphy.com'];

export function parsePublicMessage(input) {
  const source = input && typeof input === 'object' ? input : {};
  const body = typeof source.body === 'string' ? source.body.trim() : '';
  const rawUrl = typeof source.attachment_url === 'string' ? source.attachment_url.trim() : '';

  if (body.length > MAX_BODY) {
    return { ok: false, detail: `Keep a message under ${MAX_BODY} characters.` };
  }
  if (rawUrl && rawUrl.length > MAX_ATTACHMENT_URL) {
    return { ok: false, detail: 'That attachment path is too long.' };
  }
  /* Only a path this site serves. An arbitrary URL would turn the room into a
     place to host other people's images, and a `javascript:` URL into a way to
     put a script in front of every member. The dot-segments are refused
     separately: ".." survives a naive prefix check and then resolves somewhere
     else entirely, which is the difference between reading /uploads/a.png and
     reading whatever sits one directory up. */
  const path = rawUrl.replace(/^\/+/, '').replace(/^api\//, '');
  const segments = path.split('/');
  const wellFormed = /^uploads\/[A-Za-z0-9._/-]+$/.test(path);
  const local = wellFormed && !segments.some((s) => s === '..' || s === '.');
  const external = isAllowedGifUrl(rawUrl);
  if (rawUrl && !local && !external) {
    return {
      ok: false,
      detail: 'Attachments have to be an upload on this site or a GIF from the picker.',
    };
  }
  if (!body && !rawUrl) {
    return { ok: false, detail: 'Say something, or attach a picture.' };
  }

  return {
    ok: true,
    body: body || (rawUrl ? '' : ''),
    // No attachment at all is null, not "/" — the empty string took the local
    // branch and produced a bare slash, which would render as a broken image.
    attachment_url: rawUrl ? (external ? rawUrl : `/${path}`) : null,
  };
}

/* An edit to somebody else's message, which only an admin can make.

   Deliberately narrower than a post: text only, because an admin fixing a
   message is correcting what was said and not adding a picture to somebody
   else's name — and because the alternative lets an admin attach a GIF to a
   message the room already read and believed. The empty body is refused with
   its own wording: "Say something, or attach a picture" is a composer's
   sentence and would be nonsense here. */
export function parseEditedMessage(input) {
  const source = input && typeof input === 'object' ? input : {};
  const body = typeof source.body === 'string' ? source.body.trim() : '';

  if (!body) return { ok: false, detail: 'An edit cannot be empty. Delete the message instead.' };
  if (body.length > MAX_BODY) {
    return { ok: false, detail: `Keep a message under ${MAX_BODY} characters.` };
  }
  return { ok: true, body };
}

/* A GIF the picker handed out. Parsed rather than prefix-matched so that
   `https://media.giphy.com.evil.example/x.gif` — which starts with the host and
   is not it — cannot pass. */
export function isAllowedGifUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return GIF_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

/* Whether this account may post to a room, and why not.

   A silence is not an eviction: the member keeps reading, which is what makes it
   usable as a cooldown, and it is one row that an admin can delete. */
export function postPolicy(user, { silenced = false } = {}) {
  if (!user) {
    return { allowed: false, status: 401, code: 'unauthenticated', detail: 'Sign in to post.' };
  }
  if (silenced) {
    return {
      allowed: false,
      status: 403,
      code: 'silenced',
      detail: 'You can still read this room, but an admin has stopped you posting here.',
    };
  }
  return { allowed: true, code: null, detail: null, attachmentAllowed: true };
}

/* ---------------------------------------------------------------------------
   GIPHY

   GIF search is proxied through the backend for one reason: the API key is a
   server secret. Putting it in the bundle would hand it to every visitor, and a
   leaked key cannot be rotated without shipping a new build.

   This used to be Tenor. Google switched the Tenor API off on 30 June 2026
   (new clients were refused from 13 January 2026), so the integration moved to
   GIPHY's Tenor-compatibility layer, which is the same request and the same
   response object under a different host: /v2/search, /v2/featured, results
   carrying media_formats. The trade is noted rather than hidden because it is
   a real one: GIPHY's own docs ask that search be called from the client and
   not proxied. The key staying on the server is worth more here than following
   that preference, and it is the shape the rest of this codebase uses for
   every provider key.

   The URL is built here, as a pure function, so the shape the provider requires
   (the `q`/`limit` parameters, the trending path, the media filters that keep a
   result usable in a chat bubble) is pinned by a test rather than by memory.
   --------------------------------------------------------------------------- */

export const GIF_API_HOST = 'https://api.giphy.com/v2';

/* BOTH renditions are asked for, and that is not a detail. `media_filter` is
   what the provider returns, so asking only for the tiny preview means the
   `gif` entry arrives missing and the full-size fallback silently becomes the
   100px thumbnail — the room would receive a blurry tile as the message. */
export const GIF_MEDIA_FILTER = 'tinygif,gif';

/* `contentfilter=high` is G-only. The provider defaults to `off` (every rating)
   and this room is a public one that any member can walk into, which makes the
   default the wrong one to inherit. */
export const GIF_CONTENT_FILTER = 'high';

export function gifSearchUrl({
  query,
  limit = 24,
  key,
  mediaFilter = GIF_MEDIA_FILTER,
  contentFilter = GIF_CONTENT_FILTER,
}) {
  if (!key) return null;
  const params = new URLSearchParams({
    key,
    limit: String(Math.min(Math.max(Number(limit) || 24, 1), 50)),
    media_filter: mediaFilter,
    contentfilter: contentFilter,
    client_key: 'swats.bio',
  });

  const term = typeof query === 'string' ? query.trim() : '';
  if (term) {
    params.set('q', term.slice(0, 100));
    return `${GIF_API_HOST}/search?${params.toString()}`;
  }
  return `${GIF_API_HOST}/featured?${params.toString()}`;
}

/* The provider's answer, reduced to what a picker needs: the id, the preview,
   the full GIF and its size. Anything malformed is dropped rather than rendered
   as an empty tile.

   Both shapes are read — the Tenor-compatible `media_formats` and the native
   `images` — because a compatibility layer is a promise about today. A parser
   that only understood one of them would turn a provider-side change into an
   empty picker, which reads to a member as "no GIFs match that" rather than as
   "the integration broke". */
export function normalizeGifResults(payload, { mediaFilter = 'tinygif' } = {}) {
  const results = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.data) ? payload.data : [];
  return results
    .map((r) => {
      const media = r?.media_formats || {};
      const native = r?.images || {};
      const preview =
        media[mediaFilter] ||
        media.tinygif ||
        media.gif ||
        native.fixed_height_small ||
        native.fixed_width_small ||
        native.preview_gif ||
        // Last resort the same way the other shape does it: a result whose only
        // rendition is the full GIF is still shown, rather than dropped.
        native.original ||
        native.downsized ||
        null;
      const full = media.gif || media.mediumgif || native.original || native.downsized || preview || null;
      if (!preview?.url || !full?.url) return null;
      const dims = preview?.dims || null;
      return {
        id: String(r.id || ''),
        preview: preview.url,
        url: full.url,
        width: Number(dims?.[0] ?? preview?.width) || null,
        height: Number(dims?.[1] ?? preview?.height) || null,
        alt: typeof r.content_description === 'string'
          ? r.content_description.slice(0, 160)
          : typeof r.alt_text === 'string'
            ? r.alt_text.slice(0, 160)
            : typeof r.title === 'string'
              ? r.title.slice(0, 160)
              : '',
      };
    })
    .filter((gif) => gif && gif.id && gif.url);
}
