/* ---------------------------------------------------------------------------
   Discord badge art

   Every badge picture the app can draw, taken from the two community sets that
   carry Discord's own artwork:

     • merlinfuchs/discord-badges (MIT) — the exact SVGs the Discord client uses,
       for the profile badges (staff, partner, bug hunter, HypeSquad, Nitro,
       boosting months, and so on).
     • PandaDevOfficial/badges-discord — the wider catalogue: the ten-tier
       activity series, gifting, subscriptions, server, special and guild icons.

   The files live in `public/badges/discord/<group>/` and are served as-is, so a
   badge is a picture again instead of a stand-in glyph. `src` is what BadgeChip
   renders; `tint` is the colour the monochrome style paints that picture with,
   and `group` is only for the dashboard's grouping and search.

   Adding a badge is one line in the table below — the id is what a profile
   stores, so it must stay stable once it has been handed out.
   --------------------------------------------------------------------------- */

const BASE = `${process.env.PUBLIC_URL || ""}/badges/discord`;

/* A group's tint is also its fallback colour: the monochrome style paints the
   art in one colour, and each family reads better in its own. */
export const BADGE_GROUPS = {
  core: { label: "Discord", tint: "#5865F2" },
  boosts: { label: "Boosting", tint: "#ff73fa" },
  activity: { label: "Activity", tint: "#43b581" },
  gifting: { label: "Gifting", tint: "#faa61a" },
  subscriptions: { label: "Subscriptions", tint: "#eb459e" },
  server: { label: "Servers", tint: "#5865f2" },
  special: { label: "Special", tint: "#23a55a" },
  guilds: { label: "Guilds", tint: "#f0b232" },
  platform: { label: "swats.bio", tint: "#A48DF4" },
  // The seasonal set: earned by being here while the window is open, one badge
  // per event per year (see constants/badges.js).
  events: { label: "Seasonal", tint: "#f97316" },
};

const art = (id, name, desc, file, group) => ({
  id,
  name,
  desc,
  group,
  src: `${BASE}/${file}`,
  tint: (BADGE_GROUPS[group] || BADGE_GROUPS.core).tint,
});

/* The classic profile badges, in the same art the client draws. */
const CORE = [
  ["staff", "Discord Staff", "Works at Discord", "core/staff.svg"],
  ["partnered_server_owner", "Partnered Server Owner", "Owns a server partnered with Discord", "core/partnered_server_owner.svg"],
  ["hypesquad_events", "HypeSquad Events", "Runs HypeSquad events for Discord", "core/hypesquad_events.svg"],
  ["hypesquad_bravery", "HypeSquad Bravery", "Member of HypeSquad Bravery", "core/hypesquad_bravery.svg"],
  ["hypesquad_brilliance", "HypeSquad Brilliance", "Member of HypeSquad Brilliance", "core/hypesquad_brilliance.svg"],
  ["hypesquad_balance", "HypeSquad Balance", "Member of HypeSquad Balance", "core/hypesquad_balance.svg"],
  ["bug_hunter", "Bug Hunter", "Reported a valid bug to Discord", "core/bug_hunter_level_1.svg"],
  ["bug_hunter_gold", "Bug Hunter Gold", "Reported several valid bugs and joined a bug-squashing event", "core/bug_hunter_level_2.svg"],
  ["early_supporter", "Early Supporter", "Supported Discord before it went public", "core/early_supporter.svg"],
  ["early_verified_developer", "Early Verified Bot Developer", "Built verified bots in Discord's early days", "core/early_verified_developer.svg"],
  ["certified_moderator", "Moderator Programs Alumni", "Alumni of Discord's moderator programmes", "core/certified_moderator.svg"],
  ["active_developer", "Active Developer", "Ran a slash command in an active app", "core/active_developer.svg"],
  ["nitro", "Nitro", "Subscribed to Discord Nitro", "core/nitro.svg"],
];

/* The same badges as they appear in the wider catalogue. They are kept as
   separate ids because a profile that was handed one keeps it. */
const EXTRA = [
  ["discord_staff", "Discord Staff (alt)", "Alternate staff artwork", "discordstaff.svg"],
  ["discord_partner", "Discord Partner (alt)", "Alternate partnered-server artwork", "discordpartner.svg"],
  ["discord_mod", "Discord Moderator", "Discord moderator artwork", "discordmod.svg"],
  ["discord_automod", "AutoMod Certified", "Certified for Discord AutoMod", "automod.svg"],
  ["discord_nitro", "Nitro (alt)", "Alternate Nitro artwork", "discordnitro.svg"],
  ["discord_active_developer", "Active Developer (alt)", "Alternate active-developer artwork", "activedeveloper.svg"],
  ["discord_bug_hunter_1", "Bug Hunter (alt)", "Alternate bug-hunter artwork", "discordbughunter1.svg"],
  ["discord_bug_hunter_2", "Bug Hunter Gold (alt)", "Alternate gold bug-hunter artwork", "discordbughunter2.svg"],
  ["discord_early_supporter", "Early Supporter (alt)", "Alternate early-supporter artwork", "discordearlysupporter.svg"],
  ["discord_bot_developer", "Verified Bot Developer", "Ships a verified Discord bot", "discordbotdev.svg"],
  ["discord_supports_commands", "Supports Slash Commands", "The bot supports slash commands", "supportscommands.svg"],
  ["discord_premium_bot", "Premium Bot", "Powers a premium Discord bot", "premiumbot.png"],
  ["discord_quest", "Quest Complete", "Completed a Discord Quest", "quest.png"],
  ["discord_username", "Username", "Took part in Discord's username rollout", "username.png"],
  ["discord_legacy_username", "Legacy Username", "Had a legacy Discord username", "lastmeadow.svg"],
  ["discord_orb", "Orb Profile", "Early access to the Orb profile", "orb.svg"],
  // The HypeSquad houses again, in the wider catalogue's artwork. Same badges,
  // two pictures — so every file that shipped is reachable.
  ["hypesquad_bravery_alt", "HypeSquad Bravery (alt)", "Alternate HypeSquad Bravery artwork", "hypesquadbravery.svg"],
  ["hypesquad_brilliance_alt", "HypeSquad Brilliance (alt)", "Alternate HypeSquad Brilliance artwork", "hypesquadbrilliance.svg"],
  ["hypesquad_balance_alt", "HypeSquad Balance (alt)", "Alternate HypeSquad Balance artwork", "hypesquadbalance.svg"],
  ["hypesquad_events_alt", "HypeSquad Events (alt)", "Alternate HypeSquad Events artwork", "hypesquadevents.svg"],
];

/* Boosting in both spellings: the month milestones, and the badge tiers. */
const BOOST_MONTHS = [1, 2, 3, 6, 9, 12, 15, 18, 24];

/* The activity badges evolve across ten tiers each; the tier names are Discord's
   own, so a badge reads "Voyager" instead of "game_variety_7". */
const ACTIVITY = [
  {
    key: "game_variety",
    name: "Game Variety",
    desc: "Play more unique detectable games with Discord open",
    tiers: ["Sampler", "Dabbler", "Enthusiast", "Ranger", "Explorer", "Adventurer", "Voyager", "Maverick", "Polymath", "Universalist"],
  },
  {
    key: "game_time",
    name: "Game Time",
    desc: "Play more hours of detectable PC games with Discord open",
    tiers: ["Casual", "Recreational", "Dedicated", "Committed", "Serious", "Devoted", "Seasoned", "Ironclad", "Unshakeable", "Eternal"],
  },
  {
    key: "streaming",
    name: "Streaming",
    desc: "Stream more hours to other people in voice channels",
    tiers: ["Newcomer", "Fledgling", "Breakout", "Standout", "Trendsetter", "Headliner", "Star", "Sensation", "Visionary", "Phenomenon"],
  },
  {
    key: "account_age",
    name: "Account Age",
    desc: "Keep an active Discord account; time does the rest",
    tiers: ["Seed", "Sprout", "Bud", "Sapling", "Blossom", "Redwood", "Sequoia", "Bristlecone", "Stromatolite", "Primordial"],
  },
];

// [id, name, desc] — the file is `gifting/<id>.png` in every case.
const GIFTING = [
  ["gifting_icon", "Gifting", "Sent gifts to other people on Discord"],
  ["gifting_hero", "Gifting Hero", "A notable gifter"],
  ["gifting_champion", "Gifting Champion", "A generous gifter"],
  ["gifting_legend", "Gifting Legend", "A legendary gifter"],
  ["gifting_luminary", "Gifting Luminary", "A luminary gifter"],
  ["gifting_patron", "Gifting Patron", "A patron of gifters"],
];

const SUBSCRIPTIONS = ["bronze", "silver", "gold", "platinum", "diamond", "emerald", "ruby", "opal"];

const SERVER = [
  ["Boost3Dark", "server_boost_3", "Server Boost Level 3", "Reached the highest server boost level"],
  ["CommunityDark", "server_community", "Community Server", "Runs a Discord community server"],
  ["Crown", "server_owner", "Server Owner", "Owns a Discord server"],
  ["NewHere", "server_new_member", "New Member", "Newly joined a server"],
  ["Partnered", "server_partnered", "Partnered Server", "Runs a partnered server"],
  ["Verified", "server_verified", "Verified Server", "Runs a verified server"],
];

const SPECIAL = [
  ["App", "special_app", "App", "A Discord application"],
  ["Beta", "special_beta", "Beta Tester", "Tried a Discord beta"],
  ["LightAi", "special_ai", "AI Early Access", "Early access to Discord's AI features"],
  ["Official", "special_official", "Official", "An official Discord presence"],
  ["OriginalPoster", "special_original_poster", "Original Poster", "Started the thread"],
  ["Server", "special_server", "Server", "A Discord server"],
  ["System", "special_system", "System", "A system account"],
  ["VerifiedApp", "special_verified_app", "Verified App", "A verified Discord application"],
  ["discordlootbox", "special_lootbox", "Lootbox", "Opened a Discord lootbox"],
];

const GUILDS = [1, 2, 3, 4, 5];

export const DISCORD_BADGES = [
  ...CORE.map(([id, name, desc, file]) => art(id, name, desc, file, "core")),
  ...EXTRA.map(([id, name, desc, file]) => art(id, name, desc, file, "core")),

  ...BOOST_MONTHS.map((months) =>
    art(`boosting_${months}_months`, `${months} Month Boost`, `Boosted a server for ${months} ${months === 1 ? "month" : "months"}`, `core/boosting_${months}_months.svg`, "boosts")
  ),
  // `boosting_tier_…`, not `server_boost_…`: the server group below already owns
  // `server_boost_3` for the level-3 server badge.
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((tier) =>
    art(`boosting_tier_${tier}`, `Server Boost ${tier}`, `Reached server boost tier ${tier}`, `boosts/discordboost${tier}.svg`, "boosts")
  ),

  ...ACTIVITY.flatMap(({ key, name, desc, tiers }) =>
    tiers.map((tier, i) =>
      art(`${key}_${i + 1}`, `${name}: ${tier}`, `${desc} — tier ${i + 1} of 10`, `activity/${key}_${i + 1}.svg`, "activity")
    )
  ),

  ...GIFTING.map(([id, name, desc]) => art(id, name, desc, `gifting/${id}.png`, "gifting")),
  ...SUBSCRIPTIONS.map((tier) =>
    art(`subscription_${tier}`, `${tier[0].toUpperCase()}${tier.slice(1)} Supporter`, `${tier} supporter tier`, `subscriptions/badges/${tier}.png`, "subscriptions")
  ),

  ...SERVER.map(([file, id, name, desc]) => art(id, name, desc, `server/${file}.svg`, "server")),
  ...SPECIAL.map(([file, id, name, desc]) => art(id, name, desc, `special/${file}.svg`, "special")),
  ...GUILDS.map((n) => art(`guild_${n}`, `Guild Badge ${["I", "II", "III", "IV", "V"][n - 1]}`, `Guild badge tier ${n}`, `guilds/${n}.svg`, "guilds")),
];

/* The source set's `fame/` folder held four screenshots of a Discord panel —
   a title bar, a table, an opaque backdrop in every pixel — rather than badge
   art. Drawn at 18px inside a chip they were a rectangle with a badge hidden
   somewhere in the corner, so they are not registered. `discordBadges.test.js`
   now fails on any art file that has a background baked into it, whichever
   group it lands in. */

export const DISCORD_BADGE_MAP = Object.fromEntries(DISCORD_BADGES.map((b) => [b.id, b]));

/* The picture for an id, or for an entry that already carries one. */
export const badgeSrc = (idOrEntry) =>
  typeof idOrEntry === "string"
    ? DISCORD_BADGE_MAP[idOrEntry]?.src || null
    : idOrEntry?.src || null;

export default DISCORD_BADGES;
