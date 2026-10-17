import express from 'express';
import axios from 'axios';
import { requireAuth } from '../auth.js';
import { query } from '../db.js';
import { oauthRedirectUrl } from '../publicUrl.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Per-user widget API keys
//
// Some widgets are better (or only possible) with a key the visitor owns:
// Valorant needs a Riot key, exact YouTube counts need a YouTube Data API key,
// and a GitHub token raises the rate limit. Keys live in users.integrations and
// are used server-side by the widget proxy (routes/widgets.js) when a request
// carries ?owner=<username>. The raw values are never returned to a client.
// ---------------------------------------------------------------------------

const KEY_PROVIDERS = ['riot', 'youtube', 'github'];
const KEY_FIELD = { riot: 'riot_key', youtube: 'youtube_key', github: 'github_key' };

const maskKey = (value) =>
  value ? { configured: true, hint: `\u2022\u2022\u2022\u2022${String(value).slice(-4)}` } : { configured: false, hint: null };

router.get('/me/integrations', requireAuth, async (req, res) => {
  try {
    const { rows } = await query('SELECT integrations FROM users WHERE id = $1', [req.user.id]);
    const keys = rows[0]?.integrations || {};
    res.json({
      riot: maskKey(keys.riot_key),
      youtube: maskKey(keys.youtube_key),
      github: maskKey(keys.github_key),
      // Whether the deployment itself has a fallback key, so the UI can say
      // "already works without your key" instead of implying it is required.
      server_defaults: {
        riot: !!process.env.RIOT_API_KEY,
        youtube: !!process.env.YOUTUBE_API_KEY,
        github: !!process.env.GITHUB_TOKEN,
      },
    });
  } catch {
    res.status(500).json({ detail: 'Could not read your integrations' });
  }
});

router.put('/me/integrations', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { rows } = await query('SELECT integrations FROM users WHERE id = $1', [req.user.id]);
    const next = { ...(rows[0]?.integrations || {}) };

    for (const provider of KEY_PROVIDERS) {
      const field = KEY_FIELD[provider];
      if (!(provider in body)) continue;
      const value = String(body[provider] ?? '').trim();
      if (value) next[field] = value;
      else delete next[field];
    }

    await query('UPDATE users SET integrations = $1 WHERE id = $2', [JSON.stringify(next), req.user.id]);
    res.json({
      riot: maskKey(next.riot_key),
      youtube: maskKey(next.youtube_key),
      github: maskKey(next.github_key),
    });
  } catch {
    res.status(500).json({ detail: 'Could not save your integrations' });
  }
});

// GET /api/discord/widget/:guildId (Proxy Discord widget API to bypass browser CORS)
router.get('/discord/widget/:guildId', async (req, res) => {
  const { guildId } = req.params;
  const cleanId = String(guildId).replace(/[^0-9]/g, '');
  if (!cleanId) {
    return res.status(400).json({ detail: 'Invalid Discord Guild ID' });
  }

  try {
    const { data } = await axios.get(`https://discord.com/api/guilds/${cleanId}/widget.json`, {
      timeout: 6000,
      headers: {
        'User-Agent': 'swats.bio-WidgetProxy/1.0',
      },
    });
    return res.json(data);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ detail: 'Discord widget is disabled for this server or server not found' });
    }
    return res.status(502).json({ detail: err.message || 'Failed to fetch Discord widget data' });
  }
});

// GET /api/donations/config
router.get('/donations/config', (req, res) => {
  return res.json({
    goal_usd: parseFloat(process.env.DONATION_GOAL_USD || '5000'),
    raised_usd: 1840,
    btc: process.env.DONATION_BTC_ADDRESS || 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    eth: process.env.DONATION_ETH_ADDRESS || '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    ltc: process.env.DONATION_LTC_ADDRESS || 'LQTp6FkM9XQ1QZz2q9Y3Y8vXz3N1Vv5W2k',
  });
});

// Spotify connect mock/proxy
//
// Spotify rejects any redirect_uri that is not https (localhost excepted) and
// that is not registered on the app, so the URL is repaired and derived the same
// way the Discord one is: a plain http:// value in SPOTIFY_REDIRECT_URI on the
// deployment produced "This redirect URI is not secure".
router.get('/connect/spotify/login', (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = encodeURIComponent(
    oauthRedirectUrl(req, 'SPOTIFY_REDIRECT_URI', '/api/connect/spotify/callback')
  );
  const scope = encodeURIComponent('user-read-currently-playing user-read-playback-state');
  const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}`;
  return res.json({ url });
});

router.get('/u/:alias/spotify/now-playing', (req, res) => {
  return res.json({
    is_playing: true,
    track: 'STAR WALKIN',
    artist: 'Lil Nas X',
    cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80',
    progress_ms: 45000,
    duration_ms: 210000,
  });
});

export default router;
