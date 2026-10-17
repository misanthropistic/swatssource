// Shared effect catalogs used by the editor and profile preview.

/* ---------------------------------------------------------------------------
   The ghost set.

   Every catalog here is ghost.html's own list — the background, overlay,
   pointer and text effects exactly as that file ships them, in its order — and
   the renderers run that file's implementations verbatim (lib/ghostFx for the
   three canvas engines, FxText.jsx for the text half). "Now playing" invents
   nothing: an id in these lists is a painter in the ghost file, not a vibe.

   Rules that keep the store honest:
     • one entry per effect, in ghost's own order.
     • every id is rendered by exactly one canvas engine or CSS rule — see
       effects.test.js, which fails the build if a listed id paints nothing (or
       paints twice).
   --------------------------------------------------------------------------- */

export const TEXT_EFFECTS = [
  { id: "", label: "None", premium: false },
  { id: "typewriter", label: "Typewriter", premium: false },
  { id: "shake", label: "Shake", premium: false },
  { id: "rainbow", label: "Rainbow", premium: false },
  { id: "white-sparkle", label: "White Sparkle", premium: false },
  { id: "morph", label: "Morph", premium: true },
  { id: "shimmer-in", label: "Shimmer In", premium: true },
  { id: "shimmer-out", label: "Shimmer Out", premium: true },
  { id: "shine", label: "Shine", premium: true },
  { id: "glow", label: "Glow", premium: true },
  { id: "glitch", label: "Glitch", premium: true },
  { id: "flames", label: "Flames", premium: true },
  { id: "scramble", label: "Scramble", premium: true },
  { id: "flicker", label: "Flicker", premium: true },
  { id: "flip", label: "Flip", premium: true },
  { id: "loading", label: "Loading", premium: true },
  { id: "green-sparkle", label: "Green Sparkle", premium: true },
  { id: "rainbow-sparkle", label: "Rainbow Sparkle", premium: true },
  { id: "blackout", label: "Blackout", premium: true },
  { id: "bleeding", label: "Bleeding", premium: true },
  { id: "neon-aurora", label: "Neon Aurora", premium: true },
  { id: "reactive", label: "Reactive", premium: true },
];

export const OVERLAYS = [
  { id: "", label: "None", premium: false },
  { id: "snow", label: "Snow", premium: false },
  { id: "rain", label: "Rain", premium: false },
  { id: "vhs", label: "VHS", premium: true },
  { id: "grain", label: "Grain", premium: true },
  { id: "spotlight", label: "Spotlight", premium: true },
  { id: "dotters", label: "Dotters", premium: true },
];

export const CURSOR_EFFECTS = [
  { id: "", label: "None", premium: false },
  { id: "sparkle", label: "Sparkle", premium: false },
  { id: "star-dust", label: "Star Dust", premium: true },
  { id: "snow-flakes", label: "Snow Flakes", premium: true },
  { id: "blood-drips", label: "Blood Drips", premium: true },
  { id: "sparks", label: "Sparks", premium: true },
  { id: "silver-trail", label: "Silver Trail", premium: true },
  { id: "black-trail", label: "Black Trail", premium: true },
];

// Animated decorations layered over the avatar picture. These live on their own
// axis from the Discord PNG frames: a profile can wear one frame AND one effect
// at the same time, so they must never share a single selection field.
export const AVATAR_EFFECTS = [
  { id: "swats_shine", label: "Shine", desc: "Smooth glossy light pass", premium: true },
  { id: "swats_grain", label: "Grain", desc: "Authentic film texture", premium: true },
  { id: "swats_blur", label: "Blur Aura", desc: "Diffused background glow", premium: true },
  { id: "swats_blink", label: "Blink", desc: "Subtle periodic twinkle", premium: true },
  { id: "swats_shimmer", label: "Shimmer", desc: "Linear gradient sheen", premium: true },
  { id: "swats_pulse", label: "Pulse", desc: "Gentle rhythmic breathing", premium: true },
  { id: "swats_glaze", label: "Glaze", desc: "Frosted glass reflection", premium: true },
  { id: "swats_chromatic", label: "Chromatic", desc: "RGB lens separation", premium: true },
  { id: "swats_radiance", label: "Radiance", desc: "Soft ambient halo", premium: true },
  { id: "swats_twilight", label: "Twilight", desc: "Deep dusk violet aura", premium: true },
  { id: "swats_frosted", label: "Frosted Edge", desc: "Crisp glass borders", premium: true },
  { id: "swats_starlight", label: "Starlight", desc: "Micro particle sparkles", premium: true },
  { id: "swats_eclipse", label: "Eclipse", desc: "Dark ring silhouette", premium: true },
  { id: "swats_mirage", label: "Mirage", desc: "Heatwave dispersion", premium: true },
];

export const BACKGROUND_EFFECTS = [
  { id: "", label: "None", premium: false },
  { id: "rain", label: "Rain", premium: false },
  { id: "snow-v1", label: "Snow v1", premium: false },
  { id: "snow-v2", label: "Snow v2", premium: true },
  { id: "shooting-stars", label: "Shooting Stars", premium: true },
  { id: "thunder", label: "Thunder", premium: false },
  { id: "constellation", label: "Constellation", premium: true },
  { id: "galaxy", label: "Galaxy", premium: true },
  { id: "rain-fall", label: "Rain Fall", premium: true },
  { id: "love-fall", label: "Love Fall", premium: true },
  { id: "bleeding", label: "Bleeding", premium: true },
  { id: "tv", label: "TV", premium: true },
  { id: "snow-flake", label: "Snow Flake", premium: false },
  { id: "frosted", label: "Frosted", premium: true },
];

/* Profiles saved on the pre-ghost set still name those effects. Each maps to
   the ghost id that looks/acts the same (same family, tuned by the ghost file);
   anything with no reasonable twin resolves to none, exactly like
   REMOVED_LAYOUTS resolve to DEFAULT_LAYOUT. */
export const REMOVED_EFFECTS = [
  // backgrounds that no longer exist
  "window-rain", "cash-fall", "heart-fall", "vhs-tape", "cherry", "matrix", "aurora",
  "fireflies", "stars", "neon-wave",
  // overlays that no longer exist
  "noise", "retro", "scanlines", "vignette", "sparkle", "embers", "hearts",
  "snow-flakes", "frost-bite",
  // cursor
  "smooth-flow", "rainbow", "falling-particles", "falling-snow", "trailing",
  "spotlight", "fire", "matrix", "neon-glow", "laser", "bubbles", "confetti",
];

const LEGACY_BG_IDS = {
  "window-rain": "rain",
  "vhs-tape": "tv",
  "heart-fall": "love-fall",
  "snow-v1": "snow-v1",
  "snowflake": "snow-flake",
  "frost-bite": "frosted",
  "stars": "shooting-stars",
};
const LEGACY_OVERLAY_IDS = {
  dots: "dotters",
  stars: "dotters",
  "frost-bite": "grain",
};

const resolveWith = (id, legacyMap, catalog) => {
  const raw = String(id || "");
  if (!raw) return "";
  const mapped = legacyMap[raw] || raw;
  return catalog.some((e) => e.id === mapped) ? mapped : "";
};

export const resolveBackground = (id) => resolveWith(id, LEGACY_BG_IDS, BACKGROUND_EFFECTS);
export const resolveOverlay = (id) => resolveWith(id, LEGACY_OVERLAY_IDS, OVERLAYS);
export const resolveCursor = (id) => resolveWith(id, {}, CURSOR_EFFECTS);

export const TRACK_STYLES = [
  // Mini bar is the smallest footprint offered: one slim line with a play
  // glyph, the title, a hairline scrubber and the elapsed time — no card,
  // no background.
  { id: "mini-bar", label: "Mini Bar", premium: false },
  { id: "compact", label: "Compact", premium: false },
  // Corner icon pins a speaker glyph to the page's top-left corner; hovering
  // it pops out the full audio bar (title, artist, scrubber, time).
  { id: "corner-icon", label: "Corner Icon", premium: false },
];

/* Saved profiles can still carry the ids of removed styles ("simplistic",
   "wide", "vinyl", …) or nothing at all. The player catalogue is exactly
   three styles now, so every legacy value resolves onto the one it looks
   like: the Simplistic icon became the Corner Icon, and every remaining
   art-heavy style — Default, Banner, Vinyl, Cover Vinyl, Wide — falls back
   to the Compact player. */
export const resolveTrackStyle = (id) => {
  const raw = String(id || "");
  if (raw === "mini-bar" || raw === "compact" || raw === "corner-icon") return raw;
  if (raw === "simplistic") return "corner-icon";
  return "compact";
};

export const WIDGET_TYPES = [
  { id: "discord", label: "Discord", premium: false },
  { id: "spotify", label: "Spotify", premium: false },
  { id: "valorant", label: "Valorant", premium: false },
  { id: "roblox", label: "Roblox", premium: false },
  { id: "github", label: "GitHub", premium: false },
  { id: "youtube", label: "YouTube", premium: false },
  { id: "steam", label: "Steam", premium: false },
  { id: "tiktok", label: "TikTok", premium: false },
  { id: "soundcloud", label: "SoundCloud", premium: false },
  { id: "timezone", label: "Timezone", premium: false },
  { id: "account-date", label: "Account Date", premium: false },
  { id: "custom", label: "Custom Code", premium: true },
];
