import { Clock, CalendarDays, Code2, Hourglass, LayoutGrid } from "lucide-react";
import { FaDiscord, FaSpotify, FaGithub, FaYoutube, FaSteam, FaTiktok, FaSoundcloud } from "react-icons/fa6";
import { SiRoblox, SiValorant } from "react-icons/si";

// ---------------------------------------------------------------------------
// Widget catalog
//
// A widget stores ONLY an identifier (a username, an ID, a link) plus display
// options. Every number, name, avatar and status shown on the profile comes
// from a live API call — see backend/routes/widgets.js. There is deliberately
// no field anywhere in here for a member count, a rank or a follower number,
// because a widget can never be filled in by hand.
// ---------------------------------------------------------------------------

export const WIDGET_KINDS = [
  {
    id: "roblox",
    label: "Roblox",
    Icon: SiRoblox,
    color: "#E2231A",
    desc: "Avatar, join date, friends — or a group or a live game",
    subtypes: [
      { id: "profile", label: "Profile", fields: ["roblox_user"] },
      { id: "group", label: "Group / Community", fields: ["roblox_group"] },
      { id: "game", label: "Game", fields: ["roblox_game"] },
    ],
  },
  {
    id: "discord",
    label: "Discord",
    Icon: FaDiscord,
    color: "#5865F2",
    desc: "Live server counts, or your own presence & activity",
    subtypes: [
      { id: "server", label: "Server", fields: ["discord_server", "discord_invite"] },
      { id: "profile", label: "Profile", fields: ["discord_user"] },
    ],
  },
  {
    id: "spotify",
    label: "Spotify",
    Icon: FaSpotify,
    color: "#1DB954",
    desc: "Song, album or playlist — playable embed or card",
    subtypes: [{ id: "media", label: "Track / Album / Playlist", fields: ["media_url"] }],
  },
  {
    id: "youtube",
    label: "YouTube",
    Icon: FaYoutube,
    color: "#FF0000",
    desc: "Channel avatar, subscriber count and newest upload",
    subtypes: [{ id: "channel", label: "Channel", fields: ["youtube_channel"] }],
  },
  {
    id: "github",
    label: "GitHub",
    Icon: FaGithub,
    color: "#e7e7e7",
    desc: "Repos, followers, stars — or one repository",
    subtypes: [
      { id: "user", label: "Profile", fields: ["github_user"] },
      { id: "repo", label: "Repository", fields: ["github_repo"] },
    ],
  },
  {
    id: "steam",
    label: "Steam",
    Icon: FaSteam,
    color: "#c7d5e0",
    desc: "Persona, online status and current game",
    subtypes: [{ id: "profile", label: "Profile", fields: ["steam_user"] }],
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    Icon: FaSoundcloud,
    color: "#ff5500",
    desc: "Track artwork, title and artist from any track link",
    subtypes: [{ id: "media", label: "Track", fields: ["media_url"] }],
  },
  {
    id: "tiktok",
    label: "TikTok",
    Icon: FaTiktok,
    color: "#25F4EE",
    desc: "Any TikTok video, with its real caption and thumbnail",
    subtypes: [{ id: "media", label: "Video", fields: ["media_url"] }],
  },
  {
    id: "valorant",
    label: "Valorant",
    Icon: SiValorant,
    color: "#FF4655",
    desc: "Rank, RR, wins and peak straight from the Riot API",
    subtypes: [{ id: "player", label: "Player", fields: ["valorant_user"] }],
  },
  {
    id: "timezone",
    label: "Timezone Clock",
    Icon: Clock,
    color: "#FF7FBC",
    desc: "A live ticking clock for any timezone",
    subtypes: [{ id: "clock", label: "Clock", fields: ["timezone"] }],
  },
  {
    id: "countdown",
    label: "Countdown",
    Icon: Hourglass,
    color: "#FF7FBC",
    desc: "Counts down in real time to a date you pick",
    subtypes: [{ id: "timer", label: "Countdown", fields: ["countdown"] }],
  },
  {
    id: "account-date",
    label: "Account Date",
    Icon: CalendarDays,
    color: "#FF7FBC",
    desc: "When you joined swats.bio — read from your account",
    subtypes: [{ id: "joined", label: "Joined date", fields: [] }],
  },
  {
    id: "custom",
    label: "Custom Code",
    Icon: Code2,
    color: "#FF7FBC",
    premium: true,
    desc: "Your own HTML, CSS or iframe embed",
    subtypes: [{ id: "code", label: "HTML / CSS / Embed", fields: ["custom_code"] }],
  },
];

// Input descriptors, keyed by field id. `pick` names the widget property the
// value is saved under so the editor never needs per-field save logic.
export const WIDGET_FIELDS = {
  roblox_user: {
    key: "username",
    label: "Roblox username or user ID",
    placeholder: "e.g. builderman",
    help: "The card shows their avatar, display name, about text, join date and friend count.",
  },
  roblox_group: {
    key: "group_id",
    label: "Group ID or group link",
    placeholder: "https://www.roblox.com/groups/33665685",
    help: "Group icon, name, description and live member count.",
  },
  roblox_game: {
    key: "game_url",
    label: "Game link or place ID",
    placeholder: "https://www.roblox.com/games/920587237",
    help: "Game icon, people playing right now, visits and favourites.",
  },
  discord_server: {
    key: "server_id",
    label: "Server ID (optional)",
    placeholder: "e.g. 613712999795015681",
    help: "Developer Mode → right-click the server → Copy Server ID. The icon and name come straight from Discord.",
  },
  discord_invite: {
    key: "invite_url",
    label: "Discord invite link",
    placeholder: "discord.gg/yourinvite",
    help: "The invite unlocks the server banner and the exact total member count — Discord only returns those for an invite.",
  },
  discord_user: {
    key: "user_id",
    label: "Discord user ID",
    placeholder: "e.g. 94490510688792576",
    help: "Your live Discord status, custom status, activity and Spotify. Join discord.gg/lanyard with this account to go live.",
  },
  media_url: {
    key: "url",
    label: "Link",
    placeholder: "https://open.spotify.com/track/...",
    help: "Title, artwork and author are read straight from the link — nothing is typed in twice.",
  },
  youtube_channel: {
    key: "channel",
    label: "Channel link or @handle",
    placeholder: "https://www.youtube.com/@yourchannel",
    help: "Channel avatar, name, subscriber count and newest upload.",
  },
  github_user: {
    key: "username",
    label: "GitHub username",
    placeholder: "e.g. torvalds",
    help: "Avatar, bio, repo count, followers, total stars and top language.",
  },
  github_repo: {
    key: "repo",
    label: "Repository",
    placeholder: "facebook/react",
    help: "Stars, forks, language, licence and description.",
  },
  steam_user: {
    key: "username",
    label: "Steam profile link or custom URL",
    placeholder: "https://steamcommunity.com/id/yourname",
    help: "Persona, avatar, online state and current game.",
  },
  valorant_user: {
    key: "riot_id",
    label: "Riot ID (Name#TAG)",
    placeholder: "e.g. TenZ#0001",
    help: "Rank, RR, wins and peak. Requires a Riot API key on the server (developer.riotgames.com).",
  },
  timezone: {
    key: "value",
    label: "Timezone",
    placeholder: "e.g. Europe/London",
    help: "Any IANA timezone. The clock ticks with the visitor's real time.",
  },
  countdown: {
    key: "date",
    label: "Target date & time",
    type: "datetime-local",
    help: "Counts down live for every visitor until the moment arrives.",
  },
  custom_code: {
    key: "code",
    label: "HTML / CSS / iframe",
    type: "textarea",
    placeholder: "<iframe src=\"...\" />",
    help: "Rendered exactly as written. Premium feature.",
  },
};

export const KIND_MAP = Object.fromEntries(WIDGET_KINDS.map((k) => [k.id, k]));

// Display options offered for every widget.
export const WIDGET_SPANS = [
  { id: 1, label: "Half width" },
  { id: 2, label: "Full width" },
];

/* The two widget card styles.

   The editor used to offer six controls for this — background opacity, outline
   transparency, four outline widths and four corner presets — and in practice
   they produced the same two cards: a soft translucent one and a flat opaque
   one. Nothing was removed from the data model: each preset still writes real
   `card_fill_alpha` / `card_outline_alpha` / `card_border_width` / `card_radius`
   values, so a widget saved before this keeps rendering and can be switched
   between the two looks without touching a slider. */
export const WIDGET_CARD_STYLES = [
  {
    id: "glass",
    label: "Glass",
    desc: "Translucent surface, hairline edge, soft corners",
    values: { card_fill_alpha: 72, card_outline_alpha: 10, card_border_width: 1, card_radius: 18 },
  },
  {
    id: "solid",
    label: "Solid",
    desc: "Flat opaque surface with a crisper, tighter edge",
    values: { card_fill_alpha: 100, card_outline_alpha: 20, card_border_width: 1, card_radius: 14 },
  },
];

export const WIDGET_CARD_STYLE_MAP = Object.fromEntries(WIDGET_CARD_STYLES.map((s) => [s.id, s]));

// Which of the two a saved widget is showing. Read from the fill alpha, which is
// the value the two presets differ on most, so a widget saved under the old
// six-control UI still resolves to one of them.
export const widgetCardStyleId = (w = {}) => {
  const fill = Number(w?.card_fill_alpha ?? WIDGET_SURFACE_DEFAULTS.fillAlpha);
  return Number.isFinite(fill) && fill >= 92 ? "solid" : "glass";
};

// The four corner presets and four outline widths that used to live here are
// gone with the six-control surface panel they fed (see WIDGET_CARD_STYLES
// above). `card_radius` and `card_border_width` are still real saved fields, so
// a widget saved under those controls keeps rendering exactly as it did.

// ---------------------------------------------------------------------------
// Link display styles
// ---------------------------------------------------------------------------

export const LINK_MODES = [
  { id: "card", label: "Card" },
  { id: "icon", label: "Icon only" },
];

export const LINK_CARD_STYLES = [
  { id: "", label: "Match theme" },
  { id: "new", label: "Card Pro" },
  { id: "solid", label: "Solid" },
  { id: "gradient", label: "Gradient" },
  { id: "frosted", label: "Frosted" },
  { id: "outline", label: "Outline" },
  { id: "glass", label: "Glass" },
  { id: "aurora", label: "Aurora" },
  { id: "neon", label: "Neon" },
  { id: "minimal", label: "Minimal" },
];

// How a link's optional description behaves. "Reveal on hover" keeps a card
// tidy; "Folded" hides it until the card is focused.
export const LINK_FOLDS = [
  { id: "", label: "Always visible" },
  { id: "hover", label: "Reveal on hover" },
  { id: "folded", label: "Folded" },
];

// Discord widget layouts. Classic is the full card, Minimal is a single row,
// and Banner puts the server banner across the top with the stats beneath it.
export const DISCORD_STYLES = [
  { id: "classic", label: "Classic" },
  { id: "minimal", label: "Minimal" },
  { id: "banner", label: "Banner" },
];

// Per-widget card surface options. Every value is a real, saved setting so the
// outline the owner dislikes can be dialled down to nothing.
export const WIDGET_SURFACE_DEFAULTS = {
  fillAlpha: 90,
  outlineAlpha: 8,
  borderWidth: 1,
  radius: 18,
  glowAmount: 22,
};

export const LINK_ICON_STYLES = [
  { id: "bare", label: "No plate" },
  { id: "rounded", label: "Rounded" },
  { id: "square", label: "Square" },
  { id: "circle", label: "Circle" },
];

// The link "badge overlay" picker (None / Verified / Star / Boost / Hot /
// Favorite / Premium / New / Live) used to live here. It was removed: the marks
// duplicated the badge system the profile already has, sat on top of the icon
// the owner had just chosen, and made every link card read as a sticker sheet.
// A link is now just its icon, its label and its description.

export const GENERIC_WIDGET_ICON = LayoutGrid;
