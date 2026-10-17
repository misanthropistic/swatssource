import { DISCORD_BADGES, DISCORD_BADGE_MAP, badgeSrc } from "./discordBadges";

/* ---------------------------------------------------------------------------
   What a badge IS on this site.

   Our own badges no longer stand in for something Discord already drew: each one
   wears real art (the files in `public/badges/`, plus Discord's own for the ones
   that map onto it), and every badge in `discordBadges.js` is registered here
   too, so a profile can wear any of them.

   `BADGE_META` is the single lookup: BadgeChip renders `meta.art.src`, the
   dashboard reads `meta.label`, and `meta.color` stays what it always was — the
   colour a badge falls back to when nobody has chosen one.
   --------------------------------------------------------------------------- */

/* Our own badges and the art each one wears. A path with no folder is one of the
   files dropped into `public/badges/` (the animated ones included); `discord/…`
   borrows from the Discord set. */
const PLATFORM_BADGES = {
  og: { src: "og.png", color: "#fbbf24" },
  verified: { src: "verfied.gif", color: "#A48DF4" },
  bug_hunter: { src: "discord/core/bug_hunter_level_1.svg", color: "#22c55e" },
  team: { src: "team.gif", color: "#38bdf8" },
  // Our own crown, in the brand pink. Discord's server-owner crown is the art
  // the *Server Owner* badge already wears, so using it here made the platform
  // owner and a Discord server owner look like the same badge.
  owner: { src: "owner.svg", color: "#A48DF4" },
  admin: { src: "discord/discordmod.svg", color: "#ef4444" },
  media: { src: "discord/server/CommunityDark.svg", color: "#ec4899" },
  // Transparent art on purpose: the source set's `fame/` folder was a set of
  // opaque panel screenshots, which showed up as a rectangle around the badge.
  // Those files are gone and the registry no longer lists them.
  featured: { src: "discord/core/hypesquad_events.svg", color: "#A48DF4" },
  booster: { src: "booster.png", color: "#f472b6" },
  premium: { src: "discord/core/nitro.svg", color: "#A48DF4" },
  donater: { src: "gifters.png", color: "#34d399" },
  donator: { src: "gifters.png", color: "#34d399" },
  partner: { src: "partner.png", color: "#60a5fa" },
};

const PLATFORM_ART = `${process.env.PUBLIC_URL || ""}/badges`;

/* ---------------------------------------------------------------------------
   Seasonal badges

   One badge per event per year — `halloween_2026`, `newyear_2027` — because the
   whole point is that you were here that year. That makes the id impossible to
   list ahead of time, so the art is registered once per EVENT and resolved from
   the id: `badgeMeta('newyear_2027')` finds the New Year picture and calls it
   "New Year 2027". Without that, a badge a profile legitimately wears would
   draw the fallback glyph, or vanish from the badge grid entirely, the moment a
   year passed.

   The windows these are earned in live on the backend (backend/eventBadges.js)
   and are pinned to this file by badges.test.js — the two must agree or the API
   hands out an id the site cannot draw.
   --------------------------------------------------------------------------- */
const EVENT_BADGES = {
  halloween: { label: "Halloween", color: "#f97316", src: "events/halloween.svg" },
  christmas: { label: "Christmas", color: "#dc2626", src: "events/christmas.svg" },
  newyear: { label: "New Year", color: "#fbbf24", src: "events/newyear.svg" },
};

/* An event badge id is `<event>_<year>` and nothing else is. */
const EVENT_ID = /^([a-z]+)_(\d{4})$/;

export const eventOfBadge = (id) => {
  const match = EVENT_ID.exec(String(id || ""));
  return match && EVENT_BADGES[match[1]] ? match[1] : null;
};

export const eventBadgeYear = (id) => {
  const match = EVENT_ID.exec(String(id || ""));
  return match && EVENT_BADGES[match[1]] ? Number(match[2]) : null;
};

/* Art and label for a seasonal badge, or null when the id is not one. */
export const eventBadgeMeta = (id) => {
  const event = eventOfBadge(id);
  if (!event) return null;
  const meta = EVENT_BADGES[event];
  const year = eventBadgeYear(id);
  return {
    color: meta.color,
    label: year ? `${meta.label} ${year}` : meta.label,
    event,
    year,
    art: { src: `${PLATFORM_ART}/${meta.src}`, tint: meta.color, group: "events" },
  };
};

export const EVENT_BADGE_ART = EVENT_BADGES;

const platformMeta = Object.fromEntries(
  Object.entries(PLATFORM_BADGES).map(([id, b]) => [
    id,
    {
      color: b.color,
      art: { src: `${PLATFORM_ART}/${b.src}`, tint: b.color, group: "platform" },
    },
  ])
);

const discordMeta = Object.fromEntries(
  DISCORD_BADGES.map((b) => [b.id, { color: b.tint, label: b.name, art: b }])
);

/* Ours win any id collision (our `bug_hunter` keeps our art): a profile stores
   the id, and what it has always meant must not change underneath it. */
export const BADGE_META = { ...discordMeta, ...platformMeta };

/* The lookup every badge surface should use. Registered badges come back as
   themselves; a seasonal id is answered by its event, so a badge from a year
   the registry has never heard of still draws the right picture. */
export const badgeMeta = (id) => BADGE_META[id] || eventBadgeMeta(id) || null;

/* Grantable badges, in the order the dashboard lists them. This mirror of
   backend/badges.js is the fallback before /badges/catalog answers. */
export const BADGE_CATALOG = [
  { id: "og", name: "OG", desc: "First 10 users on swats.bio", type: "auto", group: "platform" },
  { id: "verified", name: "Verified", desc: "Officially verified by swats.bio", type: "mod", group: "platform" },
  { id: "bug_hunter", name: "Bug Hunter", desc: "Found and reported security/functional bugs", type: "mod", group: "platform" },
  { id: "team", name: "Team", desc: "Core swats.bio team member", type: "mod", group: "platform" },
  { id: "owner", name: "Owner", desc: "Platform creator and owner", type: "auto", group: "platform" },
  { id: "admin", name: "Admin", desc: "Platform administrator", type: "auto", group: "platform" },
  { id: "media", name: "Media", desc: "Content creator / partner media", type: "mod", group: "platform" },
  { id: "featured", name: "Featured", desc: "Showcased on landing page", type: "mod", group: "platform" },
  { id: "booster", name: "Booster", desc: "Active Discord server booster", type: "auto", group: "platform" },
  { id: "premium", name: "Premium", desc: "Supporter with unlocked premium perks", type: "auto", group: "platform" },
  { id: "donater", name: "Donater", desc: "Contributed to platform development fund", type: "mod", group: "platform" },
  { id: "partner", name: "Partner", desc: "Official platform partner", type: "mod", group: "platform" },
];

/* Every Discord badge, handed out by staff like any other. One list rather than
   a hand-kept copy: if the art registry gains a badge, it becomes grantable. */
export const DISCORD_BADGE_CATALOG = DISCORD_BADGES.map((b) => ({
  id: b.id,
  name: b.name,
  desc: b.desc,
  type: "mod",
  group: b.group,
}));

export const FULL_CATALOG = [...BADGE_CATALOG, ...DISCORD_BADGE_CATALOG];

export { DISCORD_BADGES, DISCORD_BADGE_MAP, badgeSrc };
