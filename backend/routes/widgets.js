import express from 'express';
import axios from 'axios';
import { query } from '../db.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Widget data proxy
//
// Every widget on a profile is rendered from a REAL third-party API call made
// here, on the server (so there is no CORS problem and no key ever reaches the
// browser). Nothing is invented: when a source cannot answer, the request
// fails with an honest message that the frontend renders verbatim.
//
// Responses are cached in memory so a popular public profile cannot hammer
// Roblox / Discord / GitHub with one request per visitor per widget.
// ---------------------------------------------------------------------------

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const CACHE_TTL = {
  roblox: 5 * 60_000,
  discord: 60_000, // presence / online counts move fast
  github: 5 * 60_000,
  youtube: 10 * 60_000,
  steam: 5 * 60_000,
  media: 24 * 60 * 60_000,
  valorant: 5 * 60_000,
};

const cache = new Map();

/* Failures are cached too, briefly.

   A broken widget — a Discord invite that expired, a server whose widget is
   switched off — used to be re-requested on EVERY page view, so one bad card on
   one public profile could hammer the upstream API and the log for every
   visitor it ever served. A 4xx is an answer, not a hiccup: remembering it for a
   minute means the visitor still sees the honest error while the upstream gets
   one request a minute at most. 5xx is left alone (that IS a hiccup). */
const failures = new Map();
const FAILURE_TTL_MS = 60_000;

async function cached(key, ttl, loader) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const bad = failures.get(key);
  if (bad && bad.until > Date.now()) throw bad.error;

  let value;
  try {
    value = await loader();
  } catch (err) {
    const status = Number(err?.status);
    if (status >= 400 && status < 500 && status !== 429) {
      if (failures.size > 500) failures.clear();
      failures.set(key, { until: Date.now() + FAILURE_TTL_MS, error: err });
    }
    throw err;
  }

  failures.delete(key);
  // Cap the cache so a long-lived process cannot grow without bound.
  if (cache.size > 500) {
    for (const [k, v] of cache) {
      if (v.expires <= Date.now()) cache.delete(k);
    }
    if (cache.size > 500) cache.clear();
  }
  cache.set(key, { expires: Date.now() + ttl, value });
  return value;
}

// Per-owner API keys. A widget request may carry ?owner=<username>; the owner's
// own keys (set in Settings → Widget API Keys) are then used for the providers
// that need one, falling back to the deployment's environment keys. Cached
// briefly so a busy profile does not hit the database on every render.
const keyCache = new Map();
async function ownerKeys(owner) {
  const username = String(owner || '').trim().toLowerCase();
  if (!username) return {};
  const hit = keyCache.get(username);
  if (hit && Date.now() - hit.at < 60_000) return hit.keys;
  try {
    const { rows } = await query('SELECT integrations FROM users WHERE LOWER(username) = $1', [username]);
    const keys = rows[0]?.integrations || {};
    keyCache.set(username, { at: Date.now(), keys });
    if (keyCache.size > 500) keyCache.clear();
    return keys;
  } catch {
    // A database hiccup must not break the widget: fall back to env keys.
    return {};
  }
}

// Fetch helper. `status` errors are turned into honest API errors rather than
// a generic 500 so the widget can say exactly what went wrong.
/* One breadcrumb per URL per five minutes.

   The breadcrumb itself is worth keeping — when a provider starts refusing us it
   is the first place to look, and the only way to tell a bad link from a blocked
   request. What it must not do is repeat: a widget whose source answers 403 was
   printing the same line every render, which buried every other error in the
   log (the report that prompted this was ~99% one widget's 403). */
const loggedFailures = new Map();
const LOG_THROTTLE_MS = 5 * 60_000;
function logUpstreamFailure(status, url, detail) {
  const now = Date.now();
  const last = loggedFailures.get(url) || 0;
  if (now - last < LOG_THROTTLE_MS) return;
  if (loggedFailures.size > 500) loggedFailures.clear();
  loggedFailures.set(url, now);
  console.warn(`[widgets] ${status} ${url} :: ${String(detail || '').slice(0, 160)}`);
}

async function fetchJson(url, { headers = {}, timeout = 8000 } = {}) {
  try {
    const { data } = await axios.get(url, {
      timeout,
      headers: { 'User-Agent': BROWSER_UA, Accept: '*/*', ...headers },
      // 3xx is followed by axios; anything else non-2xx throws.
    });
    return data;
  } catch (err) {
    const status = err.response?.status;
    if (status) {
      logUpstreamFailure(status, url, err.response?.data);
    }
    const raw = err.response?.data?.message || err.response?.data?.error || err.message;
    // Some upstreams put an object in `error`; a widget must never show
    // "[object Object]" to a visitor.
    const detail = typeof raw === 'string' ? raw : raw?.message || null;
    const wrapped = new Error(detail || 'Upstream request failed');
    wrapped.status = status || 502;
    wrapped.response = err.response; // keep the status reachable for callers
    throw wrapped;
  }
}

function fail(res, err, fallback) {
  const status = Number(err?.status);
  const safe = status >= 400 && status < 600 ? status : 502;
  return res.status(safe).json({ detail: err?.message || fallback });
}

const digits = (v) => String(v ?? '').replace(/[^0-9]/g, '');
const clean = (v) => String(v ?? '').trim();

// Discord's default avatars are picked by the last digit of the user ID.
function discordAvatar(id, hash) {
  if (hash) return `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=256`;
  let bucket = 0;
  try {
    bucket = Number(BigInt(String(id)) % 6n);
  } catch {
    bucket = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${bucket}.png`;
}

// The decoration an account actually wears, straight from Discord.
//
// A user object carries it as `avatar_decoration_data.asset` (the older
// `avatar_decoration` string is still honoured). An animated preset's hash starts
// with `a_`, and the CDN serves that same asset as an animated PNG: the `.apng`
// extension is rejected (HTTP 400), while `.../avatar-decoration-presets/<asset>.png`
// answers with the APNG, whose `acTL`/`fcTL` chunks a browser plays on its own. So
// there is nothing to convert or proxy — an `<img>` pointed at this URL animates.
export function discordDecoration(raw) {
  const asset = clean(typeof raw === 'object' && raw ? raw.asset : raw);
  if (!asset) return null;
  return {
    asset,
    animated: asset.startsWith('a_'),
    url: `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png`,
  };
}

// --- Roblox -----------------------------------------------------------------

async function robloxResolveUser(username) {
  const { data } = await axios.post(
    'https://users.roblox.com/v1/usernames/users',
    { usernames: [username], excludeBannedUsers: false },
    { timeout: 8000, headers: { 'User-Agent': BROWSER_UA, 'Content-Type': 'application/json' } }
  );
  const found = data?.data?.[0];
  if (!found?.id) {
    const err = new Error(`No Roblox user named "${username}" was found`);
    err.status = 404;
    throw err;
  }
  return found.id;
}

async function robloxThumbnails(kind, ids, size) {
  const url = `https://thumbnails.roblox.com/v1/users/${kind}?userIds=${ids.join(',')}&size=${size}&format=Png&isCircular=false`;
  const data = await fetchJson(url).catch(() => ({ data: [] }));
  const map = {};
  for (const t of data?.data || []) {
    if (t?.imageUrl) map[t.targetId] = t.imageUrl;
  }
  return map;
}

async function robloxProfile(queryId) {
  const id = /^\d+$/.test(queryId) ? Number(queryId) : await robloxResolveUser(queryId);
  const user = await fetchJson(`https://users.roblox.com/v1/users/${id}`);
  if (!user?.id) {
    const err = new Error('Roblox user not found');
    err.status = 404;
    throw err;
  }

  const [headshots, bodies, friends, followers, following] = await Promise.all([
    robloxThumbnails('avatar-headshot', [id], '150x150'),
    robloxThumbnails('avatar', [id], '420x420'),
    fetchJson(`https://friends.roblox.com/v1/users/${id}/friends/count`).catch(() => null),
    fetchJson(`https://friends.roblox.com/v1/users/${id}/followers/count`).catch(() => null),
    fetchJson(`https://friends.roblox.com/v1/users/${id}/followings/count`).catch(() => null),
  ]);

  return {
    kind: 'profile',
    id: user.id,
    username: user.name,
    display_name: user.displayName,
    about: user.description || '',
    created: user.created || null,
    is_banned: !!user.isBanned,
    verified: !!user.hasVerifiedBadge,
    avatar: headshots[id] || null,
    avatar_full: bodies[id] || null,
    friends: friends && Number.isFinite(friends.count) ? friends.count : null,
    followers: followers && Number.isFinite(followers.count) ? followers.count : null,
    following: following && Number.isFinite(following.count) ? following.count : null,
    url: `https://www.roblox.com/users/${user.id}/profile`,
  };
}

async function robloxGroup(groupId) {
  const group = await fetchJson(`https://groups.roblox.com/v1/groups/${groupId}`);
  if (!group?.id) {
    const err = new Error('Roblox group not found');
    err.status = 404;
    throw err;
  }
  const icons = await fetchJson(
    `https://thumbnails.roblox.com/v1/groups/icons?groupIds=${group.id}&size=150x150&format=Png&isCircular=false`
  ).catch(() => ({ data: [] }));

  return {
    kind: 'group',
    id: group.id,
    name: group.name,
    description: group.description || '',
    members: group.memberCount ?? null,
    verified: !!group.hasVerifiedBadge,
    public_entry: !!group.publicEntryAllowed,
    owner: group.owner?.username || null,
    icon: icons?.data?.[0]?.imageUrl || null,
    url: `https://www.roblox.com/groups/${group.id}`,
  };
}

async function robloxGame(input) {
  // Accept a place id, a universe id or a full roblox.com URL.
  let universeId = null;
  let placeId = null;
  if (/universe/i.test(String(input))) universeId = digits(input);
  else placeId = digits(input);

  if (!universeId) {
    const resolved = await fetchJson(
      `https://apis.roblox.com/universes/v1/places/${placeId}/universe`
    ).catch(() => null);
    universeId = resolved?.universeId || null;
  }
  if (!universeId) {
    const err = new Error('That Roblox place could not be resolved to a published experience');
    err.status = 404;
    throw err;
  }

  const payload = await fetchJson(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
  const game = payload?.data?.[0];
  if (!game || !game.id || /UNAVAILABLE/i.test(game.name || '')) {
    const err = new Error('This Roblox experience is private, removed or region-blocked');
    err.status = 404;
    throw err;
  }

  const [icons, votes] = await Promise.all([
    fetchJson(
      `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&returnDefaultIcons=false`
    ).catch(() => ({ data: [] })),
    fetchJson(`https://games.roblox.com/v1/games/votes?universeIds=${universeId}`).catch(() => null),
  ]);

  return {
    kind: 'game',
    universe_id: universeId,
    place_id: game.rootPlaceId ?? (placeId ? Number(placeId) : null),
    name: game.name,
    description: (game.description || '').slice(0, 400),
    creator: game.creator?.name || null,
    playing: game.playing ?? null,
    visits: game.visits ?? null,
    favorites: game.favoritedCount ?? null,
    max_players: game.maxPlayers ?? null,
    genre: game.genre || null,
    created: game.created || null,
    up_votes: votes?.data?.[0]?.upVotes ?? null,
    down_votes: votes?.data?.[0]?.downVotes ?? null,
    icon: icons?.data?.[0]?.imageUrl || null,
    url: `https://www.roblox.com/games/${game.rootPlaceId ?? placeId}`,
  };
}

router.get('/roblox/profile', async (req, res) => {
  const target = clean(req.query.username) || clean(req.query.id);
  if (!target) return res.status(400).json({ detail: 'Add your Roblox username or user ID' });
  try {
    return res.json(
      await cached(`rbx:profile:${target.toLowerCase()}`, CACHE_TTL.roblox, () => robloxProfile(target))
    );
  } catch (err) {
    return fail(res, err, 'Could not reach the Roblox API');
  }
});

router.get('/roblox/group', async (req, res) => {
  const id = digits(req.query.id || req.query.groupId);
  if (!id) return res.status(400).json({ detail: 'Add a Roblox group ID (the number in the group URL)' });
  try {
    return res.json(await cached(`rbx:group:${id}`, CACHE_TTL.roblox, () => robloxGroup(id)));
  } catch (err) {
    return fail(res, err, 'Could not reach the Roblox groups API');
  }
});

router.get('/roblox/game', async (req, res) => {
  const target = clean(req.query.id || req.query.place || req.query.url);
  if (!target) return res.status(400).json({ detail: 'Add a Roblox game link or place ID' });
  try {
    return res.json(await cached(`rbx:game:${target.toLowerCase()}`, CACHE_TTL.roblox, () => robloxGame(target)));
  } catch (err) {
    return fail(res, err, 'Could not reach the Roblox games API');
  }
});

// --- Discord ----------------------------------------------------------------

// Discord caps the widget member list; keep as many as it hands back so the
// card can show a real avatar strip instead of a fake "+40 more".
//
// The widget endpoint anonymises the member ids ("0", "1", ...) and serves the
// picture from its own proxy in `avatar_url`, so that is what goes on the card.
// A member with neither an avatar_url nor an avatar hash is left without a
// picture rather than given one of Discord's stock avatars, which would be a
// stranger's face standing in for theirs.
export function discordMemberList(members) {
  return (Array.isArray(members) ? members : []).slice(0, 24).map((m) => ({
    username: m.username,
    status: m.status,
    avatar: m.avatar_url || (m.avatar ? discordAvatar(m.id, m.avatar) : null),
  }));
}

// Both the invite payload and the public guild preview carry the icon hash; the
// banner is only ever on the invite payload.
function discordIcon(guild) {
  return guild?.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256` : null;
}
function discordBanner(guild) {
  return guild?.banner ? `https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.png?size=600` : null;
}

router.get('/discord/server', async (req, res) => {
  // `id` is the invite code (or a bare server ID). `guild` is an optional server
  // ID supplied alongside an invite so both can be paired on one card.
  const raw = clean(req.query.id || req.query.invite || req.query.code || req.query.guild);
  if (!raw) {
    return res.status(400).json({ detail: 'Add your Discord invite link or code (e.g. discord.gg/abc123 or abc123)' });
  }

  /* A Discord USER link is the link people actually have to hand, and pasting it
     here used to send the whole URL to the invite API as if it were an invite
     code — a guaranteed 404 on every render of that profile, and the exact
     source of the invite-URL 404 flood in the logs. Say what is wrong instead of
     asking Discord about a user as though it were a server. */
  if (/discord(?:app)?\.com\/users\/\d+/i.test(raw)) {
    return res.status(400).json({
      detail: 'That is a Discord user profile link. For this card, paste a server invite (discord.gg/abc123) or the server ID.',
    });
  }

  // An invite code is answered by the invite API, which returns the banner, the
  // exact total member count AND the online count. A raw server ID can only
  // reach the public widget + guild preview.
  const isServerId = /^\d{15,25}$/.test(raw);
  // Accept a bare code, "discord.gg/abc", "https://discord.gg/abc" or
  // "discord.com/invite/abc" and reduce each to just the code.
  const code = isServerId
    ? null
    : raw
        .replace(/^(https?:\/\/)?(www\.)?(discord(?:app)?\.(?:gg|com\/invite))\/+/i, '')
        .replace(/[?#].*$/, '')
        .trim();

  try {
    if (code) {
      const invite = await cached(`dc:invite:${code.toLowerCase()}`, CACHE_TTL.discord, async () => {
        const data = await fetchJson(
          `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`
        ).catch((err) => {
          if (err.status === 404) {
            const bad = new Error('That Discord invite is invalid or has expired');
            bad.status = 404;
            throw bad;
          }
          throw err;
        });
        if (!data?.guild?.id) {
          const err = new Error('That Discord invite is invalid or has expired');
          err.status = 404;
          throw err;
        }
        return data;
      });

      const guild = invite.guild;
      const online = invite.approximate_presence_count ?? null;
      const total = invite.approximate_member_count ?? null;

      // The widget endpoint is a bonus here: it supplies the online avatars and
      // only answers when the owner enabled it, so a miss just means no row.
      const widget = await fetchJson(`https://discord.com/api/guilds/${guild.id}/widget.json`).catch(() => null);

      return res.json({
        kind: 'server',
        id: guild.id,
        name: guild.name,
        icon: discordIcon(guild),
        banner: discordBanner(guild),
        description: guild.description || null,
        online,
        total_members: total,
        offline: online != null && total != null ? Math.max(0, total - online) : null,
        invite_code: code,
        invite_url: `https://discord.gg/${code}`,
        online_members: discordMemberList(widget?.members),
        channels: (widget?.channels || []).slice(0, 6).map((c) => c.name),
        url: `https://discord.gg/${code}`,
      });
    }

    const id = digits(raw);
    if (!id) return res.status(400).json({ detail: 'Add your Discord invite link or code' });
    const widget = await cached(`dc:server:${id}`, CACHE_TTL.discord, async () => {
      const data = await fetchJson(`https://discord.com/api/guilds/${id}/widget.json`);
      if (!data?.id) {
        const err = new Error('Discord returned no widget data for this server');
        err.status = 404;
        throw err;
      }
      // The guild preview is a public, unauthenticated endpoint that carries the
      // real icon and description for discoverable servers, so the card can show
      // the actual server art instead of the same generic Discord glyph.
      const preview = await fetchJson(`https://discord.com/api/v10/guilds/${id}/preview`).catch(() => null);
      const members = Array.isArray(data.members) ? data.members : [];
      const online = data.presence_count ?? preview?.approximate_presence_count ?? null;
      const total = preview?.approximate_member_count ?? null;
      return {
        kind: 'server',
        id: data.id,
        name: preview?.name || data.name,
        icon: preview?.icon ? discordIcon({ id: preview.id || data.id, icon: preview.icon }) : null,
        banner: null,
        description: preview?.description || null,
        online,
        total_members: total,
        offline: online != null && total != null ? Math.max(0, total - online) : null,
        invite_code: data.instant_invite || null,
        invite_url: data.instant_invite ? `https://discord.gg/${data.instant_invite}` : null,
        online_members: discordMemberList(members),
        channels: (data.channels || []).slice(0, 6).map((c) => c.name),
        url: data.instant_invite ? `https://discord.gg/${data.instant_invite}` : `https://discord.com/servers/${data.id}`,
      };
    });
    return res.json(widget);
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ detail: err.message });
    }
    return fail(res, err, 'Could not reach the Discord API');
  }
});

// Discord profile / presence. Served by Lanyard, the standard presence bridge
// used by bio sites: join https://discord.gg/lanyard and your ID goes live.
router.get('/discord/profile', async (req, res) => {
  const id = digits(req.query.id || req.query.user);
  if (!id) return res.status(400).json({ detail: 'Add your Discord user ID (Developer Mode → Copy User ID)' });
  try {
    const presence = await cached(`dc:profile:${id}`, CACHE_TTL.discord, async () => {
      // Lanyard answers 200 with success:false when the account is not
      // monitored; treat any failure as "not live yet" rather than a 500.
      const payload = await fetchJson(`https://api.lanyard.rest/v1/users/${id}`).catch(() => ({ success: false }));
      if (!payload?.success || !payload?.data?.discord_user) {
        const err = new Error(
          'This Discord account is not live yet. Join the Lanyard server (discord.gg/lanyard) with this account and this card starts updating.'
        );
        err.status = 404;
        throw err;
      }
      const d = payload.data;
      const u = d.discord_user;
      const avatar = discordAvatar(u.id, u.avatar);
      const activity = (d.activities || []).find((a) => a.type !== 3) || null;
      return {
        kind: 'profile',
        id: u.id,
        username: u.username,
        global_name: u.global_name || u.username,
        avatar,
        status: d.discord_status || 'offline',
        custom_status: (d.activities || []).find((a) => a.type === 4)?.state || null,
        activity: activity
          ? { name: activity.name, details: activity.details || null, state: activity.state || null }
          : null,
        spotify: d.spotify
          ? {
              song: d.spotify.song,
              artist: d.spotify.artist,
              album: d.spotify.album,
              album_art: d.spotify.album_art_url,
              track_url: d.spotify.track_id ? `https://open.spotify.com/track/${d.spotify.track_id}` : null,
            }
          : null,
        location: d.kv?.location || null,
        url: `https://discord.com/users/${u.id}`,
      };
    });
    return res.json(presence);
  } catch (err) {
    return fail(res, err, 'Could not reach the Lanyard API');
  }
});

// Discord identity for a list of user IDs — the staff / team rows on the landing
// page need a real name and picture per person, and the only way to read those
// for an arbitrary ID is the bot the deployment already runs. When no bot token
// is configured the ID still resolves to Discord's own default avatar for that
// account (the same picture Discord shows), so a row is never left faceless and
// no name is ever invented for one that could not be read.
router.get('/discord/users', async (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((v) => digits(v))
    .filter(Boolean)
    // Bounded so one query cannot fan out into an unbounded number of calls.
    .slice(0, 12);
  if (!ids.length) return res.status(400).json({ detail: 'Pass ?ids=<discord user id>[,<id>…]' });

  const token = process.env.DISCORD_BOT_TOKEN;

  const users = await Promise.all(
    ids.map(async (id) => {
      const fallback = { id, username: null, global_name: null, avatar: discordAvatar(id, null), decoration: null };
      if (!token) return fallback;
      try {
        const user = await cached(`dc:user:${id}`, CACHE_TTL.discord * 10, () =>
          fetchJson(`https://discord.com/api/v10/users/${id}`, {
            headers: { Authorization: `Bot ${token}` },
          })
        );
        if (!user?.id) return fallback;
        return {
          id: String(user.id),
          username: user.username || null,
          global_name: user.global_name || null,
          avatar: discordAvatar(user.id, user.avatar),
          // What this person wears, so their row — or their own card — can show
          // the real frame instead of a stand-in.
          decoration: discordDecoration(user.avatar_decoration_data || user.avatar_decoration),
        };
      } catch {
        // A blocked lookup must not blank the row: the default avatar plus the
        // role label the caller already has still names the person's place.
        return fallback;
      }
    })
  );

  return res.json({ users });
});

// --- GitHub -----------------------------------------------------------------

// GitHub headers are built per request so a visitor's own token (which raises
// the rate limit for their profile) can be used, falling back to the deploy key.
function ghHeaders(token) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const t = token || process.env.GITHUB_TOKEN;
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

router.get('/github/user', async (req, res) => {
  const username = clean(req.query.username || req.query.user || req.query.value).replace(/^@/, '');
  if (!username) return res.status(400).json({ detail: 'Add a GitHub username' });
  try {
    const gh = ghHeaders((await ownerKeys(clean(req.query.owner))).github_key);
    const user = await cached(`gh:user:${username.toLowerCase()}`, CACHE_TTL.github, async () => {
      const profile = await fetchJson(`https://api.github.com/users/${username}`, { headers: gh });
      if (!profile?.login) {
        const err = new Error(`No GitHub account named "${username}"`);
        err.status = 404;
        throw err;
      }
      const repos = await fetchJson(
        `https://api.github.com/users/${profile.login}/repos?sort=updated&per_page=100`,
        { headers: gh }
      ).catch(() => []);

      const list = Array.isArray(repos) ? repos.filter((r) => !r.fork) : [];
      const stars = list.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
      const topRepo = [...list].sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))[0] || null;
      const languages = {};
      for (const r of list) if (r.language) languages[r.language] = (languages[r.language] || 0) + 1;
      const topLanguage = Object.entries(languages).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      return {
        kind: 'user',
        username: profile.login,
        name: profile.name || profile.login,
        avatar: profile.avatar_url,
        bio: profile.bio || '',
        repos: profile.public_repos ?? null,
        followers: profile.followers ?? null,
        following: profile.following ?? null,
        stars,
        top_language: topLanguage,
        company: profile.company || null,
        location: profile.location || null,
        created: profile.created_at || null,
        latest_repo: topRepo
          ? {
              name: topRepo.name,
              description: (topRepo.description || '').slice(0, 200),
              stars: topRepo.stargazers_count || 0,
              language: topRepo.language || null,
              url: topRepo.html_url,
            }
          : null,
        url: profile.html_url || `https://github.com/${profile.login}`,
      };
    });
    return res.json(user);
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 429) {
      return res.status(429).json({
        detail: 'GitHub rate limit reached for this server. Data refreshes automatically in a few minutes.',
      });
    }
    return fail(res, err, 'Could not reach the GitHub API');
  }
});

router.get('/github/repo', async (req, res) => {
  const repo = clean(req.query.repo || req.query.value)
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\/$/, '');
  const [owner, name] = repo.split('/');
  if (!owner || !name) return res.status(400).json({ detail: 'Add a GitHub repository as owner/name (e.g. vercel/next.js)' });
  try {
    const gh = ghHeaders((await ownerKeys(clean(req.query.owner))).github_key);
    const data = await cached(`gh:repo:${owner.toLowerCase()}/${name.toLowerCase()}`, CACHE_TTL.github, async () => {
      const r = await fetchJson(`https://api.github.com/repos/${owner}/${name}`, { headers: gh });
      if (!r?.id) {
        const err = new Error(`No GitHub repository at ${owner}/${name}`);
        err.status = 404;
        throw err;
      }
      return {
        kind: 'repo',
        full_name: r.full_name,
        description: (r.description || '').slice(0, 300),
        stars: r.stargazers_count ?? null,
        forks: r.forks_count ?? null,
        open_issues: r.open_issues_count ?? null,
        watchers: r.subscribers_count ?? null,
        language: r.language || null,
        license: r.license?.spdx_id || null,
        created: r.created_at || null,
        owner: r.owner?.login || owner,
        avatar: r.owner?.avatar_url || null,
        topics: (r.topics || []).slice(0, 5),
        url: r.html_url,
      };
    });
    return res.json(data);
  } catch (err) {
    return fail(res, err, 'Could not reach the GitHub API');
  }
});

// --- YouTube ----------------------------------------------------------------

function xmlTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

function feedTitleOrNull(feed) {
  return feed ? xmlTag(feed, 'title') : null;
}

router.get('/youtube/channel', async (req, res) => {
  const input = clean(req.query.handle || req.query.url || clean(req.query.id)).replace(/^\/+/, '');
  if (!input) return res.status(400).json({ detail: 'Add your YouTube channel link or @handle' });

  try {
    const youtubeKey = (await ownerKeys(clean(req.query.owner))).youtube_key || process.env.YOUTUBE_API_KEY;
    const channel = await cached(`yt:${youtubeKey ? 'k' : 'n'}:${input.toLowerCase()}`, CACHE_TTL.youtube, async () => {
      const handle = input.replace(/^https?:\/\/(www\.)?youtube\.com\//, '').replace(/^@/, '');
      const ucMatch = input.match(/UC[\w-]{20,}/);
      let channelId = ucMatch ? ucMatch[0] : null;
      let meta = null;
      let texts = '';

      if (!channelId || !ucMatch) {
        const page = await axios
          .get(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
            timeout: 12000,
            headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' },
          })
          .then((r) => r.data)
          .catch(() => null);
        if (!page) {
          const err = new Error(`No YouTube channel found for "${input}"`);
          err.status = 404;
          throw err;
        }
        channelId = channelId || page.match(/"externalId":"(UC[\w-]+)"/)?.[1] || page.match(/"channelId":"(UC[\w-]+)"/)?.[1] || null;
        if (!channelId) {
          const err = new Error(`No YouTube channel found for "${input}"`);
          err.status = 404;
          throw err;
        }
        // The channel page ships its own data: name, avatar, description and
        // the count strings YouTube renders on the channel header.
        const dataMatch = page.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
        if (dataMatch) {
          try {
            const data = JSON.parse(dataMatch[1]);
            meta = data?.metadata?.channelMetadataRenderer || null;
            texts = JSON.stringify(data);
          } catch { /* page shape changed: fall through with what we have */ }
        }
      }

      const grab = (re) => texts.match(re)?.[1] || null;
      const subscribersText = grab(/"subscriberCountText":\{"simpleText":"([^"]+)"/) || grab(/"content":"([0-9.,KMB]+ subscribers)"/);
      const videosText = grab(/"content":"([0-9.,KMB]+ videos)"/) || grab(/"videosCountText":\{"runs":\[\{"text":"([0-9.,KMB]+)"/);
      const avatar = meta?.avatar?.thumbnails?.slice(-1)[0]?.url || null;

      // The Atom feed carries the newest upload. It is occasionally flaky, so a
      // miss simply means the card shows no "latest video" rather than a guess.
      const feed = await axios
        .get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
          timeout: 10000,
          headers: { 'User-Agent': BROWSER_UA },
        })
        .then((r) => r.data)
        .catch(() => null);
      const entry = feed?.match(/<entry>[\s\S]*?<\/entry>/)?.[0] || null;
      const videoId = entry ? xmlTag(entry, 'yt:videoId') : null;

      // Optional YouTube Data API key upgrades the numbers to exact counts and
      // makes the latest upload independent of the feed.
      let stats = null;
      if (youtubeKey) {
        const info = await fetchJson(
          `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${youtubeKey}`
        ).catch(() => null);
        const ch = info?.items?.[0];
        if (ch) {
          stats = {
            subscribers: ch.statistics?.subscriberCount != null ? Number(ch.statistics.subscriberCount) : null,
            videos: ch.statistics?.videoCount != null ? Number(ch.statistics.videoCount) : null,
            views: ch.statistics?.viewCount != null ? Number(ch.statistics.viewCount) : null,
          };
        }
      }

      return {
        kind: 'channel',
        channel_id: channelId,
        title: meta?.title || feedTitleOrNull(feed) || handle,
        handle: input.startsWith('@') ? input : (handle && !handle.startsWith('channel/') ? `@${handle}` : null),
        description: (meta?.description || '').slice(0, 200) || null,
        avatar: stats?.avatar || avatar,
        subscribers_text: subscribersText,
        videos_text: videosText,
        stats,
        latest: videoId
          ? {
              id: videoId,
              title: xmlTag(entry, 'title'),
              url: `https://www.youtube.com/watch?v=${videoId}`,
              thumbnail: entry.match(/<media:thumbnail url="([^"]+)"/)?.[1] || null,
              published: xmlTag(entry, 'published'),
            }
          : null,
        url: `https://www.youtube.com/channel/${channelId}`,
      };
    });
    return res.json(channel);
  } catch (err) {
    return fail(res, err, 'Could not reach YouTube');
  }
});

// --- Steam ------------------------------------------------------------------

function xmlValue(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${tag}>`));
  if (!m) return null;
  return (m[1] ?? m[2] ?? '').trim() || null;
}

router.get('/steam/profile', async (req, res) => {
  const raw = clean(req.query.vanity || clean(req.query.id || clean(req.query.value)));
  if (!raw) return res.status(400).json({ detail: 'Add your Steam profile link or custom URL name' });

  const path = /^\d{17}$/.test(raw) ? `profiles/${raw}` : `id/${raw.replace(/^https?:\/\/steamcommunity\.com\//, '').replace(/\/+$/, '')}`;

  try {
    const profile = await cached(`steam:${path.toLowerCase()}`, CACHE_TTL.steam, async () => {
      const xml = await axios
        .get(`https://steamcommunity.com/${path}?xml=1`, { timeout: 10000, headers: { 'User-Agent': BROWSER_UA } })
        .then((r) => r.data)
        .catch((err) => {
          if (err.response?.status === 404 || err.response?.status === 400) return null;
          if (err.response?.status === 429) return 'RATE_LIMITED';
          throw err;
        });

      if (xml === 'RATE_LIMITED') {
        const username = raw.replace(/^https?:\/\/steamcommunity\.com\/(id|profiles)\//i, '').replace(/\/+$/, '');
        return {
          kind: 'profile',
          steam_id: /^\d{17}$/.test(raw) ? raw : null,
          persona: username || 'Steam User',
          avatar: 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
          online: false,
          state_message: 'Steam profile linked',
          privacy: 'public',
          member_since: null,
          location: null,
          summary: '',
          current_game: null,
          url: `https://steamcommunity.com/${path}`,
        };
      }

      if (!xml || !xmlValue(xml, 'steamID64')) {
        const err = new Error('Steam profile not found, or it is hidden from public view');
        err.status = 404;
        throw err;
      }

      const recent = xml.match(/<mostRecentGame>([\s\S]*?)<\/mostRecentGame>/)?.[1] || null;
      return {
        kind: 'profile',
        steam_id: xmlValue(xml, 'steamID64'),
        persona: xmlValue(xml, 'steamID'),
        avatar: xmlValue(xml, 'avatarFull'),
        online: (xmlValue(xml, 'onlineState') || 'offline') === 'online',
        state_message: xmlValue(xml, 'stateMessage'),
        privacy: xmlValue(xml, 'privacyState'),
        member_since: xmlValue(xml, 'memberSince'),
        location: xmlValue(xml, 'location'),
        summary: (xmlValue(xml, 'summary') || '').replace(/<[^>]+>/g, '').slice(0, 300),
        current_game: recent
          ? { name: xmlValue(recent, 'name'), url: xmlValue(recent, 'link') }
          : null,
        url: `https://steamcommunity.com/${path}`,
      };
    });
    return res.json(profile);
  } catch (err) {
    if (err.response?.status === 429 || err?.status === 429) {
      const username = raw.replace(/^https?:\/\/steamcommunity\.com\/(id|profiles)\//i, '').replace(/\/+$/, '');
      return res.json({
        kind: 'profile',
        steam_id: /^\d{17}$/.test(raw) ? raw : null,
        persona: username || 'Steam User',
        avatar: 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
        online: false,
        state_message: 'Steam profile linked',
        privacy: 'public',
        member_since: null,
        location: null,
        summary: '',
        current_game: null,
        url: `https://steamcommunity.com/${path}`,
      });
    }
    return fail(res, err, 'Could not reach Steam');
  }
});

// --- Media oEmbed (Spotify / SoundCloud / TikTok / YouTube) ------------------

const OEMBED_HOSTS = {
  'open.spotify.com': 'spotify',
  'spotify.com': 'spotify',
  'soundcloud.com': 'soundcloud',
  'tiktok.com': 'tiktok',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
};

function oembedUrlFor(pageUrl, host) {
  if (host === 'spotify') return `https://open.spotify.com/oembed?url=${encodeURIComponent(pageUrl)}`;
  if (host === 'soundcloud') return `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(pageUrl)}`;
  if (host === 'tiktok') return `https://www.tiktok.com/oembed?url=${encodeURIComponent(pageUrl)}`;
  return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(pageUrl)}`;
}

router.get('/media/oembed', async (req, res) => {
  const pageUrl = clean(req.query.url || req.query.value);
  if (!pageUrl) return res.status(400).json({ detail: 'Add a link to a track, video or post' });

  let parsed;
  try {
    parsed = new URL(pageUrl.startsWith('http') ? pageUrl : `https://${pageUrl}`);
  } catch {
    return res.status(400).json({ detail: 'That is not a valid link' });
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const matchedHost = Object.keys(OEMBED_HOSTS).find((h) => host === h || host.endsWith(`.${h}`));
  if (!matchedHost) {
    return res.status(400).json({
      detail: `Live previews are not available for ${host}. Supported: Spotify, SoundCloud, TikTok and YouTube links.`,
    });
  }
  const provider = OEMBED_HOSTS[matchedHost];

  try {
    const data = await cached(`oembed:${pageUrl}`, CACHE_TTL.media, async () => {
      const o = await fetchJson(oembedUrlFor(parsed.href, provider), { timeout: 10000 }).catch((err) => {
        // fetchJson copies the upstream status onto the error it throws.
        if (err.status === 404 || err.status === 400) return null;
        throw err;
      });
      if (!o) {
        const err = new Error('That link could not be found on ' + provider);
        err.status = 404;
        throw err;
      }
      const embed = typeof o.html === 'string' ? o.html.match(/src="([^"]+)"/)?.[1] || null : null;
      return {
        kind: 'media',
        provider,
        title: o.title || null,
        author: o.author_name || null,
        thumbnail: o.thumbnail_url || null,
        embed_url: embed ? embed.replace(/&amp;/g, '&') : null,
        page_url: parsed.href,
        url: parsed.href,
      };
    });
    return res.json(data);
  } catch (err) {
    return fail(res, err, 'Could not read that link');
  }
});

// --- Valorant (needs a Riot API key; nothing is ever guessed) ---------------

const VAL_RANKS = [
  'Unrated', 'Iron 1', 'Iron 2', 'Iron 3', 'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3', 'Gold 1', 'Gold 2', 'Gold 3',
  'Platinum 1', 'Platinum 2', 'Platinum 3', 'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3', 'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radiant',
];

router.get('/valorant', async (req, res) => {
  const name = clean(req.query.name);
  const tag = clean(req.query.tag).replace(/^#/, '');
  const region = clean(req.query.region).toLowerCase() || 'na';

  if (!name || !tag) return res.status(400).json({ detail: 'Add your Riot ID as Name#TAG' });

  const owner = clean(req.query.owner);
  const RIOT_KEY = (await ownerKeys(owner)).riot_key || process.env.RIOT_API_KEY;
  if (!RIOT_KEY) {
    return res.status(503).json({
      detail:
        'Live Valorant stats need a Riot API key. Add your own key in Settings → Widget API Keys (free at developer.riotgames.com) and this card lights up.',
      code: 'not_configured',
    });
  }

  try {
    const data = await cached(`val:${owner.toLowerCase() || '-'}:${name.toLowerCase()}#${tag.toLowerCase()}:${region}`, CACHE_TTL.valorant, async () => {
      const account = await fetchJson(
        `https://americas.api.riotgames.com/riot/account/v1/accounts/by-game-name/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
        { headers: { 'X-Riot-Token': RIOT_KEY } }
      );
      if (!account?.puuid) {
        const err = new Error(`Riot ID "${name}#${tag}" was not found`);
        err.status = 404;
        throw err;
      }
      const mmr = await fetchJson(
        `https://${region}.api.riotgames.com/val/mmr/v1/players/${account.puuid}`,
        { headers: { 'X-Riot-Token': RIOT_KEY } }
      ).catch(() => null);

      const tierName = (t) => VAL_RANKS[Math.max(0, Math.min(VAL_RANKS.length - 1, (t || 0) - 1))];
      const cur = mmr?.current;
      const highest = mmr?.highest;
      return {
        kind: 'player',
        game_name: account.gameName || name,
        tag_line: account.tagLine || tag,
        puuid: account.puuid,
        account_level: account.accountLevel ?? null,
        rank: cur?.tierName || tierName(cur?.tier) || null,
        rank_tier: cur?.tier ?? null,
        rr: cur?.rankedRating ?? null,
        wins: cur?.wins ?? null,
        peak: highest?.tierName || tierName(highest?.tier) || null,
        region,
        url: `https://trackern.com/valorant/profile/${encodeURIComponent((account.gameName || name) + '-' + (account.tagLine || tag))}/overview`,
      };
    });
    return res.json(data);
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      return res.status(502).json({ detail: 'The Riot API key on this server was rejected. Rotate it and try again.' });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({ detail: 'Riot rate limit reached. The card refreshes automatically shortly.' });
    }
    return fail(res, err, 'Could not reach the Riot API');
  }
});

// --- Which integrations are live right now ---------------------------------

router.get('/status', async (req, res) => {
  const keys = await ownerKeys(clean(req.query.owner));
  res.json({
    valorant: !!(keys.riot_key || process.env.RIOT_API_KEY),
    youtube_stats: !!(keys.youtube_key || process.env.YOUTUBE_API_KEY),
    github_token: !!(keys.github_key || process.env.GITHUB_TOKEN),
  });
});

export default router;
