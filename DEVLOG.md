# DEVLOG

## 2026-10-17 (night, batch 6) — one button that repairs roles AND badges

### Sync all

"Apply Discord roles" only ever wrote to Discord, and nothing re-read a member
afterwards — which is the whole reason a member could hold the OG role with no OG
badge: their stored `guild_roles` came from a sign-in whose member lookup failed,
and no later request ever corrected it. The per-account Refresh button fixed one
row at a time; there was no "fix everyone".

`POST /api/admin/bot/sync-all` walks every linked account and, for each one,
re-reads the member from Discord, applies the wired role mapping, recomputes the
badges from the union of stored and just-applied roles, drops the booster badge
from anyone who stopped boosting, and stores the fresh member/booster/roles
payload the roster reads. It is deliberately sequential (Discord rate-limits role
writes per guild), and each account is its own attempt so one refusal cannot stop
the rest. Nobody who left the guild gets a role written at them — Discord would
404 for every wired role and fill the log with failures for accounts that are
simply not members any more; their badges are still recomputed, so a departed
member keeps exactly what their history earned.

It is **paged** rather than unbounded: one call handles 100 accounts (max 300)
and returns `next_offset`/`remaining`, and the button loops through the pages
until the server says nothing is left — a single synchronous pass over a whole
guild would outlive its own HTTP request, and ordering the pages by
`(created_at, id)` is what guarantees the loop neither skips nor repeats a row.
The label counts up (`Syncing 200/340`) so it is obvious it is still working. The
endpoint also works with the bot unconfigured: the Discord half is skipped and the
badges are rebuilt from what is stored.

The button sits in the Users page header ([UserManager.jsx](frontend/src/pages/dashboard/UserManager.jsx)),
not in the selection bar: the drift it repairs is invisible by looking at the
table, and a whole-roster action should not require selecting a roster's worth of
rows first. The toast reports what actually moved (checked / got roles / gained
badges / not in the server / failed) and says so plainly when there was nothing
to sync instead of printing zeros.

Covered from both ends: [botSync.route.test.js](backend/botSync.route.test.js)
proves the route is mounted and behind `requireAdmin`; three new
[dashboard.test.js](frontend/src/pages/dashboard/dashboard.test.js) cases drive
the button and assert it reaches that endpoint, that it works through **both**
pages (offsets 0 then 100 — the assertion that "Sync all" is not "sync the first
page"), and that a click which checked nothing does not trigger a pointless
reload. The route-coverage test picks the call up on its own: a frontend call with
no backend route fails the suite.

Backend 177/177 green, frontend 36 suites × 381 tests green, production build
compiles.

## 2026-10-17 (night, batch 5) — the widget that shouted into the log, and a test that catches unrouted calls

### Every API call the frontend makes is now checked against the route table

Users reported "No API route for …" four separate times, because nothing owned
that question: the frontend suites mock the API and the backend suites only
cover routes they already know about. [routes.frontend.test.js](backend/routes.frontend.test.js)
reads every literal `api.get("/x")`-style path out of `frontend/src`, boots the
real Express app and fails if any of them falls through to the catch-all. It
sends no query strings, so no third-party provider is ever contacted — the
question is routing, nothing else. **78 distinct calls, 0 unrouted** today.
It is a floor, not a proof: a path built at runtime or through an aliased client
is invisible to it, and that limitation is written down in the file.

### One line repeating forever had buried the log

The log we were handed was ~99% two widget breadcrumbs repeated every ~20
seconds: a Discord invite 404 whose "code" was a **user profile URL**, and a
guild `widget.json` 403. Three separate causes, three fixes:

- **A user link is refused, not requested.** Pasting `discordapp.com/users/<id>`
  into a server card used to send the whole URL to the invite API as if it were
  an invite code — a guaranteed 404 per render. It now answers 400 with "That is
a Discord user profile link… paste a server invite". Pinned offline by
  [widgets.discordInput.test.js](backend/widgets.discordInput.test.js).
- **Failures are cached.** `cached()` now remembers a 4xx for a minute, so a
  permanently broken widget costs one upstream request a minute instead of one
  per page view. 5xx is still retried immediately — that is a hiccup.
- **The breadcrumb is throttled** to once per URL per five minutes. The
  breadcrumb itself stays: it is the fastest way to tell a blocked request from a
  bad link.

### Console noise, twice over

The API target banner printed on every page load for every visitor (now only when
a backend URL is configured, or in development), and a signed-out visitor got a
red API error for `/auth/me` — the normal state of the site, not a fault. A 401 on
the session probe is now quiet; a 500 on the same URL is still reported.

Backend 174/174 green (including the two new files), frontend 36 suites × 379
tests green, production build compiles.

## 2026-10-17 (night, batch 4) — Every admin route was 404ing because the backend could not load at all

### One backtick took the whole API down

The report was "No API route for PUT /api/admin/rewards-settings", "... for GET
/api/admin/audit", "... for POST /api/admin/bot/apply-roles" — the catch-all's
text, so the routes really were unmatched on whatever was answering. They are
not missing: `node --test audit.route.test.js` boots the app and all seven admin
probes (audit, rewards-settings, bot/apply-roles, bot/settings, invites ×2,
users) answer 401 "Missing or invalid Authorization header" — mounted, guarded,
not 404.

The reason nothing matched is one character. The comment I added above the new
`grants_badges` migration used backticks around a column name **inside the
template literal holding the whole schema**, which closed the string early:
`db.js` was a syntax error, so `import './db.js'` failed, so `server.js` could
not be imported at all. Every mount in the file was unreachable and the only
route table that could still answer was an older deployment's. Fixed (comment
reworded), and the route pins in `audit.route.test.js` / `billing.routes.test.js`
go green again.

### Invite codes hand out badges

`invite_codes.grants_badges` is now written and read. The admin generator has a
chip picker (OG, Verified, Bug Hunter, Team, Media, Featured, Partner, Donater —
never Owner/Admin, and the backend whitelist enforces the same list), the invite
table shows what each code carries, and a code applies its badges on **sign-up**
(`routes/auth.js`) and on **redemption** (`POST /api/me/redeem-invite`, which now
accepts a badge-only code instead of insisting every code be Premium).

### The redeem box the owner could never see

The Overview card was wrapped in `{!redeemAdmin && …}` — so the *owner and every
admin*, the people most likely to hold a badge-carrying code, were the only
accounts it was hidden from. It is shown to everyone now, it says "Redeem invite
code" because it grants badges too, and the toast names what landed ("Permanent
Premium + 2 badges unlocked").

### Rank box and the seasonal dashes

"Could not load your rank just now" and Halloween/Christmas/New Year all showing
"—" are the same event: `/me/rank` failed, so the box had no calendar to draw and
fell back to the static rows' empty status. The failure path now also reads the
public `GET /api/badges/events`, so the season still says "Live now" / "in 45d"
even when the rank is unknown.

### One working 2FA section, not two

Settings showed the real `TwoFactorPanel` **and** an older "Enable 2FA" card
whose button only raised "2FA Setup will be available soon." The stub is gone;
the panel that actually enrols a factor is the only 2FA section.

### Holding the OG role finally wears the OG badge

`computeAutoBadges` read `discord.guild_roles`, which is empty whenever the
member lookup failed at sign-in — so the bot could give the role and the badge
never followed. New `syncRoleBadges(user, extraRoleIds)` merges the roles
`applyAuthRoles` just re-asserted (that PUT is idempotent, so the list is every
wired role the member is entitled to) with the stored ones and saves the result.
It runs on Discord sign-in, on both `bot/apply-roles` routes, and — when the bot
panel's mapping is saved — across the accounts that already linked, so rewiring
a role to a badge reaches members who never sign in again. A mapping labelled
"OG role" or "Media badge" now resolves too, not only the catalog's exact name.

Backend 172/172 green, frontend 36 suites × 379 tests green, production build
compiles.

## 2026-10-17 (night, batch 3) — Effects stop bullying the background, the player lifted clean

### Background effects no longer eat the page

Every ghost background painter fills its own dark plate (window-rain's #0b0e13
sheet, vhs-tape's tape plate, thunder's flash wash), so any background EFFECT
buried whichever image or colour the owner had actually put behind the card —
"if it's on everything goes black", exactly. The canvas layer now composites
with `mix-blend-mode: screen`: the dark plate drops out against the owner's
background while the particles, streaks, scanlines and flashes stay full
strength. The pinned ghostFx source and its signature tests are untouched.

### A player, and shells pretending to be one

Three ways the top-right player still read as "in the card": Minimal's and
Banner's separate track boxes and Slideshow's audio block kept rendering as
EMPTY card shells around the null AudioBlock (so a pinned player drew an empty
grey box under the card). All three are gated on the pin now. And the editor's
real-time preview keeps its pinned player visible — the pin is absolute inside
the preview panel there, so the editor shows the lift instead of hiding it.

Player customization, two more dials: a **Top left** position joins In card /
Top right, and the Mini Bar and Compact players carry a per-visitor mute button
(session-only; every load starts from the owner's saved default volume).

Widgets' cards, headers and radius inheritance reviewed; their flows were
already sound under the pinned tests, so nothing warranted a change. The save
bar's dirty baseline already tracks the new `track_position`.

Frontend 307/307 green (with the background-effect and audio suites re-run
file-local first); production build green.

## 2026-10-17 (late, batch 2) — Counters once, the player lifted, colour pickers, a live background

### The view count drew itself twice

The Banner layout painted its own view chip at the banner's top corner on
EVERY profile, on top of whatever `views_position` had decided: move the count
to a page corner and two chips showed, set it "Hidden" and the banner chip
gleefully ignored the owner. The chip now obeys the same one placement map as
everywhere else — it draws only when the count's home is the meta line — and
it reads the one compact format instead of its own `toLocaleString()`.

### The player can go back up

"Top right" in the Widgets page lifts the player out of the card and pins it
to the page's top-right corner (the first track drives it; the rest stay in
the card's audio block; Corner Icon already pins itself and the editor's
embedded preview keeps everything in the card). Saved as a new `track_position`
field, threaded through the widget baseline and all three save paths.

### The Advanced panel stopped lying about itself

The panel rendered on any truthy `p.advanced_mode` while the renderer's
override is a strict `=== true` — so profiles carrying the legacy numeric `1`
saw the dials in the editor and NOTHING happen on the public page. The editor
matches the renderer now. And the panel gained the pickers it never had: name,
alias and bio colours sit beside the three surface colours.

### A background the picker could never draw

`background_color` was written by the editor and read by no renderer anywhere:
picking the Colour half of the Background row saved a value the page painted
over with #050505. Every layout now paints the picked colour behind everything
(media still covers it). And a set media background used to sit perfectly
still — it gets a 60-second slow drift zoom now, keyed off `.sw-bg-drift` and
shared with the Slideshow's sticky layer.

### The footer, shortened

"made with swats.bio" renders as the logo pill + "swats" (the long string
still states itself in the pill's tooltip). The footer test pins the new text.

Frontend 307/307 green; production build green.

## 2026-10-18 (late) — Three players, honest presets, multi-account, Marketplace, hardened auth

### The audio catalogue is three players now

Mini Bar (one slim line — play, title, scrubber, time, no background), Compact
(a small player with an artwork icon and progress) and Corner Icon (a speaker
glyph pinned to the page's top-left corner; hovering pops out the full audio
bar). Banner, Vinyl, Cover Vinyl, Wide and the old Default are gone;
`resolveTrackStyle` folds every saved legacy id onto the style it looks like,
so old profiles render instead of falling into a dead branch. The Wide player
was the only lyric surface, so the dashboard's lyrics box went with it — saved
lyric text stays in the data but renders nowhere.

### Presets that actually apply, dials behind Advanced

The glass blur / surface alpha / outline alpha / corner rounding / card width
dials now live behind the Advanced-mode switch, and the Themes grid (Midnight
through Ember) is gone — three colour pickers replace it. The reason the
Card Style presets ("Frosted and stuff") read like they did nothing: profiles
touched by the long-gone Advanced panel carried a *numeric* `advanced_mode: 1`,
which forced Classic forever. The override is a strict `=== true` now — the
deliberate toggle still wins when it is on, everyone else's chosen preset
renders. The Settings' per-device "Interface rounding" box is gone.

### Multi-account sessions + the top-right switcher

The avatar opens a menu: current account, the mutually linked accounts to swap
between, an "Add account" form that pairs by signing into the other account
once (its own password and 2FA), and sign-out. Pairing is mutual by design —
`POST /auth/switch/:id` only issues a session for an account that has linked
*back* — so a stolen session can never hop into a stranger's dashboard.
`linked_accounts` (JSONB) is the new column.

### Auth: no token anywhere a leak can sit

Cookie sessions are the default (`SESSION_COOKIE=0` opts back out); the
Discord link flow no longer puts the session token in the OAuth `state` — a
one-time server-side nonce does that job, burned on first use and dead after
ten minutes. The callback page scrubs its query string (`?token=…` included)
from the address bar and history the moment it is read.

### Marketplace

A new dashboard tab: "Coming soon" for real, plus live previews of featured
accounts pulled from the public showcase, so it opens like a destination
instead of a stub.

### Admin username override

The admin user-edit modal sets anyone's handle; the only rule enforced is
uniqueness — no reserved list, no cooldown, no format restrictions beyond the
characters a profile URL can carry.

### Android tab bounce

The section-tab nav is verified sound end to end and its round-trip test
still passes; no redirect path anywhere in the shell pages explains the
bounce, so if it still happens on a device I need the URL it lands on to
dig further.

## 2026-10-18 (evening) — Role→badge sync, the identity format in Discord, rounding that rounds

### OG Discord role = OG badge (and Verified the same way)

The bot's role wiring now runs BOTH directions. Sign-in and roster refresh
record the member's guild role ids on the account (`discord.guild_roles`), and
the auto-badge pass grants the **Verified** badge when the wired Verified role
is held and the **OG** badge when the wired OG role is — yes, an OG Discord
role now mints the OG badge even for an account that joined late. Booster
already flowed through its own flag. Unwired role ids can never match
anything, so a freshly installed bot grants nothing by accident.

### The identity format lives inside Discord now

`harmnation394324 (@cut)` — Discord handle first, site handle in brackets — is
not only the roster's column format: with the new **Nickname sync** toggle (on
by default), the bot renames members of our guild to exactly that on sign-in
and roster refresh (Manage Nicknames permission needed, otherwise it skips
silently). Refresh also stores the canonical handle verbatim, so the pair can
never fall back to a stale display name.

### Rounding that actually rounds

The music-player card and the links/widgets sub-card did arithmetic on the
corner radius STRING (`"24px" - 4` = NaN, dropped by the browser) — which is
why the rounding slider changed the main card and nothing else. Both now take
the numeric dial, and every widget card inherits the profile's radius with a
per-widget override still winning; the meta pills follow the same rule.

### The rest of the polish pass

Frosted / Frosted-soft learned real glass: a top-lit sheen falling away down
the card, saturation so blurred art reads as glass, Webkit prefix so Safari
gets it. The Overview dropped the spreadsheet look — gradient stat tiles with
a hover lift (accent glow wakes on hover) and an accent bar on every section
heading.

Backend 155 tests green; frontend 306 green; build green.

## 2026-10-18 (later) — Social area deleted; invite durations, view rewards, Redeem Premium card

### The social area is gone — entirely

Friends, requests, group chats and the built-in rooms are removed end to end:
`Inbox` (the whole "Social" tab and its drag-order thread board), `GlobalRoom`,
the chat-only `UserPreview` hover card, the route + nav entry, the image-side
`/api/chat` surface (chats were the only thing it served — plain-text message
writes, friend graphs, room moderation, 1,093 lines), its three test files, and
the `/api/chat` no-store prefix + admission-rate bucket. Notifications are
untouched — they live in the bell, not the chats. No data was dropped from the
database: the tables stay so a page of history still exists; nothing reads it.

### Premium has a duration now, everywhere

- **Invite codes carry a duration.** The admin generator has a days field
  (1–365, blank = permanent); the roster greets a premium trial with its expiry
  on the account (`users.premium_until`), enforced lazily: the first
  authenticated request past the deadline flips the tier back itself, no cron.
- **View milestones pay trials.** A new rewards engine (`backend/rewards.js`)
  watches lifetime profile views, and every crossing of an admin-set milestone
  gifts a self-expiring Premium trial — stacked on a running one, never
  double-paying a milestone (per-account milestone ledger), all knobs driven by
  the admin Settings page's new View Rewards panel (its own validated
  `/admin/rewards-settings` row).
- **Redeem Premium lives in the Overview.** The front page of the dashboard
  (hidden for admins/owner) accepts an invite code AFTER sign-up, grants the
  tier (permanent, or the code's duration, extending a running trial) and mints
  a fresh session token, so the tier applies immediately.
- User management reads the timed state: the roster tier cell shows "until
  {date}" for trials and the edit modal gains a Trial-ends chip.

Backend: 155 tests green (rewards engine's sanitation + picking pinned);
frontend: 306 green including the redeem-card and admin-edit-menu flows; build
green.

## 2026-10-18 — Admin edit modal revived, Discord identity format, real bot messaging

### The fix that was one wrong icon name

The admin Users page crashed out of the tree the instant the **Edit** button was
pressed: the modal rendered `<FaDiscord>` but the file imports
`FaDiscord as FaDiscordIcon`, so React hit `ReferenceError` mid-render and the
whole page (table, modal, everything) unmounted — "press Edit and nothing
shows". With the alias fixed and a `user-edit-modal` testid added, the editor
now opens over the table with its role picker and Granted Badges menu, and two
new tests drive the whole thing: open the modal, grant a badge, save, and
assert the roster PUT carries both badges.

### The Discord identity format

Every Discord-backed identity now reads **"discord username (swats.bio
username)"** — e.g. `fbidiscord (@fbi)` — in the roster column and the edit
modal chip. And it is only ever the raw Discord handle for accounts actually in
OUR guild: the roster's member flag decides, with "linked · not in server" as
the honest state for a linked account outside the guild.

### The bot actually talks now

- **Welcome messages**: when somebody joins, the bot greets them in the wired
  channel — `{user}`, `{username}`, `{server}` templated, roles still granted
  first, every failure non-throwing.
- **Server announcements**: one channel the admin chooses; the billing webhook
  posts Donations and new-Premium notices through it.
- **Test send**: a "Send test message" button on the bot panel — one real post
  through the pipe, so channel wiring is provable without inventing a site
  event (backend endpoint `/admin/bot/test-message`).
- The panel gains the Welcome and Announcements blocks (toggle, channel id,
  template field), validated through the same hand-checked settings put.

Backend: 185 tests green (welcome templates, config gating); frontend: 332
tests green; build green.

## 2026-10-17 (night) — Buddies retired, Advanced mode reborn, link cards & glow recipe redone

### The cursor buddies are gone — fully

The 8-bit pets (picker, chase canvas, sprite tables, dials, uploads) are deleted
end to end: `CursorWidget` + `cursorPets` + `PetSprite` and their tests are gone,
`CURSOR_WIDGETS` is out of the effects catalogue, the public page no longer
renders a chaser, the backend strips the four `cursor_widget*` fields from every
save regardless of tier, and the template premium-key list drops them. The only
pointer left on a profile is the owner's own uploaded cursor — whose uploader
also moved tools: it was the oversized square box, now it is the same compact
pill the Avatar/Background/Banner rows use.

### Advanced mode, rebuilt with the dials it never had

The Card section grows an **Advanced mode** switch behind which the card is
painted from the owner's own settings on every layout: fill/outline/glow colour
pickers, a **Glow strength** dial joining the always-visible surface alpha /
outline alpha / rounding / blur sliders, and five one-tap **themes** (Midnight,
Rose, Ocean, Forest, Ember) that set all three colours at once. Off means the
Card Style preset is honoured exactly as shipped.

Also new: a **Card width** dial (320–920px, default 680) — the card was
hard-coded centred forever.

### Link cards, glow layers, meta pills

- `linkSurface` redone — every style keeps the same three-layer glow recipe (a
  tight tinted rim, a wide soft halo, and a plain drop shadow underneath), plus
  two new styles: **Neon** (dark body, bright rim, glow built into the style)
  and **Minimal** (near-flat tint, no border).
- The card's own glow obeys the advanced colour/strength dials, with layered
  shadows instead of one flat `0 0 Npx` smear; presets that author their own
  glow (Aurora) keep it.
- The meta-line pills get real-glass chrome (blur plate, tightened ring, drop
  shadow) instead of the flat 5%-white chip.

Pinned by tests: buddy removal (editor + public page + FxTile), advanced mode's
pickers/glow dial/theme hit/save payload, compact cursor upload, layered link
glow, and the width dial. Backend: 183 tests green; frontend: 330 tests green;
build green.

## 2026-10-17 (late evening) — Editor dials restored, embed-image upload, cursor upload findable, donate route pinned

Four user reports, four root causes — three of them were "the control exists but
in the last place anyone would look":

- **No alpha / rounding sliders.** The Advanced Appearance clean-up deleted the
  fill/outline/radius dials, but the renderer kept reading
  `card_fill_alpha` / `card_outline_alpha` / `card_radius` — so every Card Style
  preset (Frosted included) was fixed at its built-in alpha with no way to change
  it, and "the alpha sliders" genuinely did not exist. They are back in the Card
  Style section, beside the presets they shape
  ([Editor.jsx](frontend/src/pages/dashboard/Editor.jsx)).
- **Card styles "stuck on Classic".** The chips do flip the preview and the saved
  value reaches the public page — new dashboard tests drive the chip clicks and
  assert the live preview card's inline style changes. The remaining real gap was
  the deleted sliders: without an alpha dial a Frosted change barely reads on most
  backgrounds. Both the slider block and the style-switcher render are now pinned
  in [dashboard.test.js](frontend/src/pages/dashboard/dashboard.test.js).
- **Embed image was a bare URL field.** It is still there for pasted links, but an
  Upload button now sits under it — same `/api/upload` endpoint as every other
  asset, writing the returned URL straight into the field.
- **Custom cursor upload unfindable.** It existed all along, but inside the
  Effects tab under the cursor-*effect* picker («Your own pointer»), one screen
  away from the buddy's uploader. Moved to a «Custom cursor» row in the Profile
  & Assets tab, next to Avatar/Background/Banner — same `cursor_image` field,
  no buddy involved.
- **POST /api/billing/donate** is mounted and answers (local run: 401
  unauthorized without a session, exactly like every personal endpoint) — the
  "No API route for POST /api/billing/donate" text only comes from the backend's
  unmatched-API catch-all, so anyone who saw it was talking to a backend whose
  route table predates the donate route; redeploy it. A new pin-it-in-two
  [billing.routes.test.js](backend/billing.routes.test.js) boots the real Express
  app and fails the suite if the mount order drifts again.

All backend tests green, all 349 frontend tests green, production build green.

## 2026-10-17 (evening) — Pets that behave, custom cursors, faster frames, no fake loading

### The loading screen was lies

The `Boot` component held every landing-page visit for about a second behind a
fake progress bar that measured nothing but a `setInterval`. Deleted, along
with `LoadingScreen.jsx`; the protected routes render nothing while the session
check runs instead of a spinner, and the Discord callback's flash screen is an
empty shell (it navigates within a frame).

### Pets, as animals

- **Standoff**: the pet now stands 26px beside and 34px above the pointer's tip
  (`OFFSET` in CursorWidget), arriving at first sight already offset — the
  cursor's own pixels stay visible under it, and the effect layer above is no
  longer stamped over. The two contract tests were updated to the new pins —
  this offset is the requested behavior, not a regression.
- **Idle paw attack**: cat and dog got two dedicated reach/lunge poses
  (`petAttackFrames`, outside the walk cycle), alternated at the attack's own
  210ms half-cycle cadence with the pet facing the cursor and its paw lifting
  on the swipe. Pets without a pair play the old idle hop. An art-audit test
  covers the pairs.
- Walk/run mechanics were kept (distance-driven strides, run on a long haul);
  the walk-cycle formula is once again `petFrames - 1` wide so the run frame is
  the last walk pose, exactly as before this batch.

### FPS

- The backing store only reallocates on a genuine size change — the old
  per-frame `size()` cleared and reallocated the canvas twice per frame.
- An idle pet draws on a 20fps slot-holding throttle; a chase stays full-rate.
- A hidden tab parks the loop entirely; the next pointermove re-arms it.

### Custom cursor

New `cursor_image` profile field: upload a PNG on the Cursor card
(`asset-cursor-image`), worn on the public profile as the actual pointer with a
12,4 hotspot (the arrow's tip). Premium-gated like the custom pet art;
`profile.js` strips it for free accounts and `templates.js` treats it as a
Premium value key so a template cannot hand it over the wall.

### Verified

Frontend 34 suites × 347 tests pass against the final committed state; the
widget's own 10 and the pet art audit's 10 pass file-locally first. Backend
181/181 (profile/templates gating touched). Production build compiles.
Committed `cc5dd69` and pushed to GitHub.

## 2026-10-17 — E2EE retired, Top Dogs, Announcements/Guides simplification, donations, visible cards

### End-to-end encryption is gone — on purpose

The wrapped-key chat was failing its own users: a member on a second device, or
one member whose key never arrived, saw other people's messages as "Encrypted
message" forever, because there was no honest way to fetch a key the server did
not have. The site is a public community, not Signal. So:

- `chat_messages` now stores plain `body` text. The `chat_keys` and
  `chat_thread_keys` tables are dropped by the migrations; a database that lived
  through the E2EE era comes out the same shape as a fresh one, with the old
  ciphertext columns emptied rather than dropped (their text was honestly
  unrecoverable and now renders as a notice in the bubble).
- All key routes (`/api/chat/key`, `/threads/:id/keys`) and the whole
  `lib/e2ee` crypto library are deleted. A conversation opens and sends with
  one request each; nothing can strand a message.
- Admin moderation still lives nowhere but the public rooms — which now apply
  to both rooms, since both are server-readable.

### The rooms: Top Dogs

`top-dogs` is the new built-in room sitting above General: every chat-capable
account (the gate IS the membership list) is in it, no join, no invites. The old
`general_e2ee` room is gone. Both rooms share one component, which now reads its
title from the room id. Announcements subtab removed from the Social page (the
admin AnnouncementManager and the site banner keep working); direct messages are
no longer a sidebar section — they open from the **Friends** tab.

### Donations & Premium

- `POST /api/billing/donate` — a one-time Stripe payment ($1–$500), which the
  webhook records as `users.donated_cents` (paid the Donator badge,
  `type: auto`). A donation can never buy Premium; the checkout is distinguished
  by metadata kind.
- New **/!/donate** page: presets + custom amount, copyable crypto addresses
  (env-configured), a return-to-thanks state, and a nudge to Premium instead.
- **Pricing** page now has an already-Premium state ("Active on this account" +
  billing-portal manage), greets `?upgrade=success/cancelled`, and links to
 Donate.

### The image upload speaks

`POST /api/upload` returns and stores `metadata` (width, height, format,
bytes, duration for video) in `files.metadata` JSONB — measured by Cloudinary,
so a chat bubble or card can size media before downloading it.

### Cards that are visible

`.glass`/`.glass-strong` backgrounds were ~2% white on black: invisible on most
monitors. Borders are now 3× stronger (alpha 0.13–0.14), fill lifted to the
surface colour, soft drop shadow and inset hairline added.

### Rounding preference

Settings → Interface rounding: Sharp/Soft/Default/Round/Pill, stored per device
in localStorage (`swats_rounding`), applied app-wide pre-paint through the
`--sw-radius` custom property. Backed by `lib/appearance` and its tests.

### Removed: the fake language dropdown

The sidebar's language select only toasted "Interface language set to …" and
changed nothing. Gone, along with its test.

Verified: 181 backend tests, 347 frontend tests, production build compiled.

## 2026-10-16 — Two General rooms, media in the public one, and admin moderation

### Two rooms, on purpose, side by side

The Social page now opens with two rooms rather than one:

- **General** — stored as plain text, readable by an admin and by anybody with a
  database dump. The page says this in the header ("Public room — messages are
  stored as text") and marks itself "Not encrypted", because the difference
  between the two rooms is the whole reason both exist.
- **General (encrypted)** — an ordinary group thread with everybody auto-joined,
  so it runs through the existing E2EE machinery (wrapped keys, the per-device
  identity, the safety number) instead of a second implementation.

The public room lives in its own table ([db.js](backend/db.js),
`global_messages`) rather than as a flag on `chat_messages`. That table's promise
is that a row is a ciphertext the database cannot read; a boolean a future code
path could get wrong would put a plaintext body in it, and there is no such
column to put one in.

### Key brokering: a room everybody is in

A room nobody is individually invited to has a membership but no wrapped key for
most of its members, and a member holding no key reads nothing — silently, since
there is no error to show. So opening a group now hands the key to every member
who has none (`wrapForRecipient`), and the Inbox test suite pins that
([Inbox.test.jsx](frontend/src/pages/dashboard/Inbox.test.jsx)).

### Media in the public room

Pictures go up through the usual `/api/upload` and are linked (only a path this
site serves, no dot-segments — a job for `parsePublicMessage` in
[globalRooms.js](backend/globalRooms.js)). GIFs are searched through our own
backend, so the provider key stays a server secret instead of riding in the
bundle, and the picker says "GIF search is not configured" when the key is
missing rather than showing an empty grid.

**The provider is GIPHY, not Tenor.** Google switched the Tenor API off on 30
June 2026 — new clients were refused from 13 January 2026
([notice](https://support.google.com/tenor/answer/10455265?hl=en)) — so the
integration was migrated to GIPHY's Tenor-compatibility layer, which is the same
request and the same response object under a different host (`api.giphy.com`
instead of `tenor.googleapis.com`). Two things were fixed on the way through:

- `media_filter` now asks for **both** the tiny preview and the full `gif`. The
  provider returns only the renditions you ask for, so the old tiny-only request
  meant `media_formats.gif` arrived missing and the full-size fallback silently
  became the 100px thumbnail — the room would have received a blurry tile as the
  message.
- `contentfilter=high` (G-rated) is sent. The provider defaults to `off`, which
  returns every rating, and this is a public room anybody can walk into.

Media URLs are allowed by **domain suffix** (`giphy.com`), not by a fixed list of
hostnames: GIPHY rotates across `media1…media4` by itself, and a fixed list would
start refusing the provider's own results the day it adds a fifth. The parser
reads both response shapes (the Tenor-compatible `media_formats` and the native
`images`), so a compatibility layer that changes its mind degrades to an empty
search rather than to a crash.

**Deploy step:** set `GIPHY_API_KEY` in the host's env panel, from
[the GIPHY developer dashboard](https://developers.giphy.com/dashboard/).
Everything else works without it.

**One caveat worth knowing:** GIPHY's docs ask that search and trending be called
from the client rather than proxied, and this proxies. The key staying on the
server is the shape the rest of this codebase uses for every provider key, and it
is what the picker's "not configured" state depends on — but if GIPHY would
rather the call came from the browser, that is a decision to take deliberately
(and asking them for written approval is the cheap way to find out). Attribution
is not optional in either case: the picker carries "Powered by GIPHY" and labels
the field "Search GIPHY".

### Moderation: silence, edit, delete

- A **silence** is not a ban. The member keeps reading and is shown a banner
  with the reason an admin wrote; one row in `chat_bans` undoes it. It is asked
  for in the room rather than in a modal, because the reason is read by the
  person silenced.
- **Edit** is the one verb that rewrites what somebody said, so it is stamped:
  `edited_at` / `edited_by` on the row, an "edited" marker next to the message,
  and `parseEditedMessage` refuses to attach a picture to a message the room has
  already read.
- All three are reached by right-clicking a message, through the site-wide menu
  ([ContextMenu.jsx](frontend/src/components/ContextMenu.jsx)), which is where
  every other per-object verb lives. A plain member's menu has "Copy message"
  and nothing else; the room declares whether the viewer moderates, so the menu
  never has to know who is signed in.
- There is deliberately no equivalent for the encrypted room: nobody — including
  an admin — can read what they would be deleting.

### The room is live

The public room polls for new messages, so it actually receives, and for an
admin's edit or deletion to reach the people it was made for. It idles while the
tab is hidden, and a failed poll stays silent rather than toasting every five
seconds.

## 2026-10-15 — Decoration catalogue, dashboard overview cleanup, plus the earlier admin/inbox/effects batch

### Avatar decorations: the curated catalogue replaces the 671 bundled frames

The old picker offered 671 numbered PNGs copied into `/public/frames` and named
"Discord Frame #432". That list, and its UI, are retired from the picker:

- The catalogue now runs off
  [effects.json](frontend/public/decorations/effects.json) — the curated list in
  the shape the open Discord Avatar Decoration catalogue publishes:
  `{ id, label, url }`, the url pointing at Discord's own
  `avatar-decoration-presets` CDN. 195 valid presets, real names ("Phoenix",
  "RamonBowl", "Swat Drops", …).
- Discord's preset endpoint serves animated (APNG) art behind the same `.png`
  URL as still presets, so the picker animates by simply loading the image — no
  conversion, no per-frame code. Static PNG and APNG entries render identically
  through one `<img>` layer.
- Entry shape: no more bundle-guessing. The saved `avatar_decoration` is the
  preset url itself — the same string a member's real Discord decoration
  already stores — so old and new selections render through one path. The
  bundled `/frames/*.png` library stays on disk unchanged for profiles that
  wear one, but nothing offers it any more.
- The picker got its own preview panel: the chosen decoration layered over the
  member's actual avatar, a hue dial (0–360°), and a Confirm that only applies
  what was previewed. A Clear button removes the decoration outright.
- `avatar_decoration_hue` rides as a new profile field, applied as a CSS
  `hue-rotate` on the avatar layer. 0 keeps the art untouched.
- [frames.js](frontend/src/constants/frames.js) now only carries the count,
  pinned by [effects-frames.test.js](frontend/src/constants/effects-frames.test.js)
  against the catalogue file itself; the marketing copy and the catalogue cannot
  drift apart.

### The Profile tab, simplified

The editor's Profile tab was a wall of square upload boxes and five-pickers-per-
section. It is now the simple vertical string from the reference (avatar +
Change Avatar, Decoration + Change/Remove, Background with Color/Media
segmented control, Banner, Display Name, Bio) with the live preview still to
the right. Choosing the colour half shows a colour picker; choosing the media
half reveals the old opacity/dim sliders and a tint picket. The row test pins
one testid per row ([dashboard.test.js](frontend/src/pages/dashboard/dashboard.test.js)).

### Carried over from the previous machine's batch (all verified green)

- Users tab (admin): the bot table and the User Manager are one page — Discord
  auth info, guild state, refresh/unlink, booster sync, multi-select rows with
  bulk tier change and bulk delete.
- Inbox: outgoing friend requests with withdrawal, add people to group chats
  (with a re-wrap of the conversation key for the newcomer), and hover profile
  previews on friends / requests / thread headers / group message senders.
- Effects: rain is real falling streaks, VHS is scan lines only (no PLAY caption,
  no sparkle noise), dotters is a full dot-grid overlay, frost is branch-led with
  the white fog dialed down, snow piles low and even.
- Slideshow no longer force-scrolled; 18+ gate retired; Connect Google removed;
  Overview reduced to the quiet strip + checklist + connections.
