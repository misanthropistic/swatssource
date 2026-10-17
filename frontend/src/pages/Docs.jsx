import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { CONTACT_EMAIL } from "@/lib/api";
import {
  BookOpen, UserRound, Link2, LayoutGrid, Palette, Sparkles, Trophy,
  CreditCard, Bot, ShieldCheck, LifeBuoy, Search, ChevronRight, Music,
  LayoutTemplate, Crosshair, MousePointerClick, BarChart3, Compass, Scale,
  Gift, Cable, BadgeCheck, ScrollText,
} from "lucide-react";

export const DOC_GROUPS = [
  {
    label: "Getting started",
    sections: [
      {
        id: "overview",
        icon: BookOpen,
        title: "Platform overview",
        summary: "What swats.bio is and how the pieces fit together.",
        blocks: [
          ["One page for everything", "swats.bio is a bio-link platform. Every account owns a single public page at swats.bio/yourname that holds your identity, links, live widgets, music, badges and visual effects."],
          ["Claiming your handle", "Type a name into the pill on the homepage. A green tick means the handle is free; Claim takes you to registration with that name pre-filled. Handles are case-insensitive and reserved names (admin, api, dashboard and similar) cannot be claimed."],
          ["The dashboard", "Everything you edit lives under /!/dashboard: Overview, Stats, Rewards, Badges, Leaderboard, Editor, Links, Widgets & Music, Templates and Settings. Changes are previewed live and saved with the Save button in the editor."],
          ["Public surfaces", "Besides your page there are four public areas: Explore (/!/explore) for discovery, the Leaderboard (/!/ranked) for ranking, Templates for community designs, and the Docs and Legal sections you are reading now."],
        ],
      },
      {
        id: "account",
        icon: UserRound,
        title: "Account management",
        summary: "Registration, sign-in, usernames and linked accounts.",
        blocks: [
          ["Creating an account", "Registration needs a username, an email and a password. Your page is live as soon as the account exists — the editor is where you make it yours."],
          ["Changing your username", "Settings → Change username. The new handle must pass the same availability rules as registration, and the old one is released only when the change succeeds. Rate limits apply to prevent handle squatting."],
          ["Linked accounts", "You can link Discord for member and booster badges, and pair a second swats account to switch between them from the dashboard menu without signing out. Pairing is recorded in the audit log."],
          ["Email and password", "Password changes happen in Settings and require your current password. The site never displays your password back to you, and uploads or profile data are never shared with third parties beyond the processors listed in the Legal section."],
        ],
      },
    ],
  },
  {
    label: "Your page",
    sections: [
      {
        id: "profile",
        icon: ScrollText,
        title: "Profile & assets",
        summary: "Name, bio, images and metadata.",
        blocks: [
          ["Identity", "Display name, bio, location and accent colour live in the editor's Profile & Assets tab. The display name is separate from your @username, so you can change how you are presented without breaking links."],
          ["Images", "Avatar, banner and page background accept image uploads; Premium accounts can also use video backgrounds. Every upload is validated by type and size, stored on the media host, and registered against your account."],
          ["Background presentation", "Background opacity, dim and tint controls sit under the background upload. Banner treatment (Fade, Dim, Vignette, None) is a separate choice and applies only to the banner image."],
          ["Metadata", "Metadata controls the title, description and embed image used by search engines and link unfurls. Empty fields fall back to your display name, bio and avatar, so leaving them alone is valid."],
        ],
      },
      {
        id: "layouts",
        icon: LayoutTemplate,
        title: "Layouts & sections",
        summary: "The four card layouts and how sections behave.",
        blocks: [
          ["Available layouts", "Minimal is a wide card with the avatar on the left. Floating Avatar centres a narrow card with the picture half off the top. Banner leads with a hero image and an overlapping avatar. Slideshow (Premium) turns the page into full-screen scrolling slides."],
          ["Sections", "Every layout draws the same blocks — identity, links, widgets and the player — so switching layout never drops a section. Order within the card follows how you arrange links and widgets."],
          ["Reveal animations", "Section reveal animations and section folding are Premium. They animate blocks into view as a visitor scrolls; they never hide content from a visitor who has reduced motion enabled."],
          ["Defaults", "A profile saved on a layout that no longer exists is resolved to Minimal rather than rendered blank. The same rule applies server-side when a profile is saved."],
        ],
      },
      {
        id: "links",
        icon: Link2,
        title: "Links",
        summary: "Adding, styling and ordering links.",
        blocks: [
          ["Adding links", "Links take a label, a URL and an optional platform icon. Each can render as a button or as an icon tile, and the list can be reordered by dragging."],
          ["Validation", "Only http(s) links are accepted; empty labels fall back to the URL's hostname. A profile is capped at 60 links."],
          ["Platform icons", "The icon picker covers the platforms the site supports (Discord, Spotify, GitHub, YouTube, Steam, TikTok, SoundCloud and more). Choosing an icon does not change where the link points."],
        ],
      },
      {
        id: "widgets",
        icon: LayoutGrid,
        title: "Widgets",
        summary: "Live third-party data on your page.",
        blocks: [
          ["Available widgets", "Discord, Spotify, Valorant, Roblox, GitHub, YouTube, Steam, TikTok, SoundCloud, Timezone and Account Date. Custom Code is Premium."],
          ["Live data", "Widgets read from the backend proxy, not from the visitor's browser. Third-party keys stay on the server and are never exposed to visitors. A provider being down can temporarily blank a widget without breaking the page."],
          ["Limits", "A profile can hold up to 40 widgets. Identical widget types can be repeated where the provider allows it."],
        ],
      },
      {
        id: "music",
        icon: Music,
        title: "Music & player",
        summary: "Tracks, player styles and background audio.",
        blocks: [
          ["Tracks", "Add up to 30 tracks with a title, artist and an audio or video file. The player renders the current track with a scrubber and play controls."],
          ["Player styles", "Three styles exist: Mini Bar (a single slim line), Compact (the default card) and Corner Icon (a speaker glyph in the corner that expands on hover)."],
          ["Entry and autoplay", "Browsers require a gesture before audio can play. If your page has an entry screen, the click that enters the page is what starts playback."],
        ],
      },
    ],
  },
  {
    label: "Customization",
    sections: [
      {
        id: "appearance",
        icon: Palette,
        title: "Appearance",
        summary: "Fonts, card surfaces, colours and motion.",
        blocks: [
          ["Fonts", "Separate fonts can be set for the display name, the @alias line and the bio. Some fonts are Premium; the free set is always usable and never silently replaced."],
          ["Card style", "Classic, Frosted, Frosted soft, Outlined, Aurora and Transparent. The surface background can be switched off independently, and the transparent style removes the card plate entirely."],
          ["Colours", "The accent colour drives links, glows and highlights. Colour pickers are used anywhere a colour can be set, including the background tint and text effects that accept a colour."],
          ["Motion", "3D card tilt follows the pointer and has its own intensity slider. All animation respects the visitor's reduced-motion preference by slowing rather than deleting the effect."],
        ],
      },
      {
        id: "text-effects",
        icon: Sparkles,
        title: "Text effects",
        summary: "Effects for your name and bio.",
        blocks: [
          ["Where they apply", "Display name and bio each choose their own text effect, and the name effect can be extended to the @username with a toggle. Text effects also power hover tooltips where enabled."],
          ["Tuning", "Effects that support tuning expose their own controls (speed, intensity, colour) in the picker, and the tuning is saved with the profile so visitors see exactly what you designed."],
          ["Premium effects", "Free accounts can use the plain effects. Premium unlocks the full set, including glitch, flames, shimmer and the animated sparkle variants."],
        ],
      },
      {
        id: "backgrounds",
        icon: Sparkles,
        title: "Background effects",
        summary: "The thirteen animated page backgrounds.",
        blocks: [
          ["The full list", "Rain, Snow v1, Snow v2, Shooting Stars, Thunder, Constellation, Galaxy, Rain Fall, Love Fall, Bleeding, TV, Snow Flake and Frosted. Nothing else is offered, and every listed effect paints."],
          ["One at a time", "A page runs one background effect at a time. Each is drawn on a single canvas at device pixel ratio capped at 2, with a hard particle cap, so a profile stays smooth on a laptop."],
          ["Premium gating", "Rain, Snow v1, Thunder and Snow Flake are free. The rest are Premium and are locked in the picker rather than silently ignored."],
        ],
      },
      {
        id: "overlays",
        icon: Sparkles,
        title: "Overlays",
        summary: "The six layers that sit above your card.",
        blocks: [
          ["The full list", "Snow, Rain, VHS, Grain, Spotlight and Dotters. Dotters draws a dense field of small twinkling dots across the entire viewport."],
          ["Combining layers", "An overlay stacks on top of the background effect, which is how a page gets depth: Galaxy behind, VHS in front, for example."],
          ["Transparency", "The overlay transparency slider fades the entire layer from 0 to 100%. Spotlight follows the pointer and drifts slowly while idle."],
        ],
      },
      {
        id: "crosshair",
        icon: Crosshair,
        title: "Crosshair uploads",
        summary: "Use your own pointer image on your page.",
        blocks: [
          ["Uploading", "Profile & Assets → Crosshair. The image must be PNG, WEBP, GIF or JPEG and no larger than 1MB; the server enforces both, not just the form."],
          ["Scale", "The scale slider resizes the artwork from 40% to 250%. The rendered cursor is capped at 128px, which is the largest size browsers accept, so very large uploads are downscaled rather than rejected."],
          ["Hotspot", "Hotspot X and Y set the pixel that actually clicks. Centre resets both to the middle of the image. The preview shows the live size and the hotspot marker before you save."],
          ["Where it applies", "The crosshair replaces the pointer on your public page only. Navigating away restores the normal cursor, and removing the image restores the default arrow."],
        ],
      },
      {
        id: "entry",
        icon: MousePointerClick,
        title: "Entry screen",
        summary: "A gate before your page is shown.",
        blocks: [
          ["Styles", "Bubble Pill and Text Button are click-to-enter gates with your own label. Code Lock asks the visitor for a 4-digit PIN before the page opens."],
          ["PIN", "With Code Lock selected, the entry text is the 4-digit PIN (digits only). A wrong PIN is refused; an empty PIN makes the gate click-to-enter so a page cannot lock its owner out."],
          ["Why use one", "An entry screen gives the page a deliberate first impression and provides the user gesture that lets music start."],
        ],
      },
    ],
  },
  {
    label: "Growth",
    sections: [
      {
        id: "views",
        icon: BarChart3,
        title: "Profile views",
        summary: "How a view is counted.",
        blocks: [
          ["Validated views only", "A view is counted after a real visitor dwells on the page and passes a lightweight proof-of-work challenge. Refreshing, scripted traffic and the owner's own visits are not counted."],
          ["Uniqueness window", "The same visitor is counted at most once per hour, identified by a keyed hash of network and browser details rather than a tracking cookie."],
          ["Where views appear", "Your lifetime total appears on your profile, the Stats page, the leaderboard and the rewards ladder. Daily history is shown on the overview and Stats."],
        ],
      },
      {
        id: "rewards",
        icon: Gift,
        title: "View rewards",
        summary: "Premium time for crossing view milestones.",
        blocks: [
          ["How it works", "Staff configure milestones — a number of lifetime views and a number of Premium days. Crossing one grants that Premium time automatically, once per account."],
          ["Stacking", "A milestone extends a running Premium period instead of replacing it. A permanent Premium account collects no extra days, and the milestone is marked as handled."],
          ["Where to see progress", "Dashboard → Rewards shows the ladder, what is claimed, and exactly how many views remain until the next reward. The overview carries a compact version."],
          ["If no milestones exist", "The Rewards page says so plainly. Views still count and still rank you; rewards simply are not being granted at that moment."],
        ],
      },
      {
        id: "leaderboard",
        icon: Trophy,
        title: "Leaderboard",
        summary: "Global ranking and the profile spotlight.",
        blocks: [
          ["Ranking", "The public leaderboard at /!/ranked orders pages by lifetime validated views. Your position is computed in SQL, so it is the same number your profile and overview show."],
          ["Spotlight", "The top profiles appear in a centred card with the next two visible behind it on either side. The selection advances automatically; hovering pauses it, clicking a side card brings it forward, and the arrows or dots move it manually."],
          ["Your standing", "The dashboard leaderboard and the RankCard on the overview show your position and the players immediately around you."],
        ],
      },
      {
        id: "explore",
        icon: Compass,
        title: "Explore",
        summary: "Discovering other pages.",
        blocks: [
          ["Browsing", "Explore lists real profiles as full cards with banner, avatar, bio, view count and tier. Search matches usernames and display names; sort by most viewed or newest; filter by tier or badge."],
          ["Card actions", "Hovering a card raises a contextual menu with View and Copy link. Right-clicking a card opens the site-wide menu with the same actions plus the universal browser items."],
          ["Accuracy", "Explore is a live query, not a curated list. A new profile appears as soon as it exists, and empty states say so instead of faking results."],
        ],
      },
      {
        id: "badges",
        icon: BadgeCheck,
        title: "Badges",
        summary: "Earning, equipping and creating badges.",
        blocks: [
          ["Owned vs equipped", "Badges are stored on the account; equipping chooses which ones show on the card. You can own many and display a few."],
          ["Granted badges", "Staff and automatic grants include Verified, OG, Media, Premium, Staff and seasonal event badges. Server-granted badges cannot be self-assigned."],
          ["Custom badges", "Premium accounts can create custom badges, which are owned and equipped exactly like granted ones."],
        ],
      },
      {
        id: "templates",
        icon: LayoutTemplate,
        title: "Templates",
        summary: "Save and apply complete designs.",
        blocks: [
          ["Community templates", "Templates store a whole look — layout, fonts, colours, effects and card style — and can be applied in one step. Applying a template does not delete your links or widgets."],
          ["Publishing", "A template you publish is listed with its author and apply count. Any premium value inside a template makes the template Premium, so a free account cannot apply one to bypass a lock."],
          ["Limits", "Free accounts can save a small number of templates; Premium raises the cap to five."],
        ],
      },
    ],
  },
  {
    label: "Account & billing",
    sections: [
      {
        id: "security",
        icon: ShieldCheck,
        title: "Security",
        summary: "Passwords, two-factor and sessions.",
        blocks: [
          ["Two-factor authentication", "Settings → Two-factor issues a TOTP secret for an authenticator app, plus one-time recovery codes. Enable it with a code from the app; save the recovery codes somewhere safe."],
          ["Sessions", "Signing out ends the current session. A separate action ends every session on the account, which is the right move after a password change on a shared device."],
          ["Rate limits and auditing", "Sign-in attempts, uploads and privileged actions are rate-limited. Privileged actions are written to the audit log with actor, target and time."],
        ],
      },
      {
        id: "pricing",
        icon: CreditCard,
        title: "Pricing & billing",
        summary: "Free, Premium and donations.",
        blocks: [
          ["Free", "Your own page, the free fonts, colours and layouts, links, standard widgets, badges and view analytics."],
          ["Premium", "Every premium font and effect, background, overlay and avatar effect, video backgrounds, the Slideshow layout, custom code widgets, custom crosshairs, custom badges, extra templates and messaging features. Billing is handled by Stripe."],
          ["Managing billing", "Pricing → Manage billing opens the Stripe portal for payment details and cancellation. Cancelling stops the renewal and keeps Premium until the paid period ends."],
          ["Donations", "One-time support is available at /!/donate and is separate from a subscription. Refund terms are in the Legal section."],
        ],
      },
    ],
  },
  {
    label: "Platform",
    sections: [
      {
        id: "integrations",
        icon: Cable,
        title: "Integrations & bots",
        summary: "Discord linking and third-party connections.",
        blocks: [
          ["Discord", "Linking Discord proves account ownership and unlocks member and booster badges. The bot maintains a presence and can sync roles; unlinking removes the connection and the badges that depended on it."],
          ["OAuth providers", "Spotify and Discord connect through OAuth. Tokens are stored server-side and are used only to render your widgets."],
          ["Third-party widgets", "GitHub, Roblox, Valorant and the rest read public provider data through the backend. If a provider is unreachable the widget shows an unavailable state rather than inventing data."],
        ],
      },
      {
        id: "admin",
        icon: ShieldCheck,
        title: "Administration",
        summary: "The staff tools.",
        blocks: [
          ["Admin hub", "Staff reach /!/dashboard/admin. Its tabs cover Users, Invites, Notify, Devlogs, Site settings, Analytics and the Audit log. Every admin page also requires the admin role on the API."],
          ["Users", "Search the roster, adjust views, grant or remove badges, change tier and manage the Discord half of an account."],
          ["Site settings", "Announcements, invite codes, bot configuration and the view-reward milestones are configured here. Reward changes take effect on the next view that crosses a milestone."],
          ["Audit log", "Privileged actions are recorded with actor, target, IP and user agent. The log can be filtered by action and exported as CSV."],
        ],
      },
      {
        id: "troubleshooting",
        icon: LifeBuoy,
        title: "Troubleshooting",
        summary: "Common problems and their fixes.",
        blocks: [
          ["My changes are not showing", "Save in the editor, then hard-refresh the public page. The public page reads saved data, not the editor's live preview."],
          ["A widget is empty", "Re-check the connected account under Widgets & Music. Third-party rate limits and outages can blank a widget for a few minutes."],
          ["My crosshair does not appear", "Only the public page shows it, and only after saving. If it is very large, lower the scale — browsers refuse cursors bigger than 128px."],
          ["Views are not increasing", "Views require a real visit that passes the challenge, are capped at one per visitor per hour, and exclude your own visits. A private browser or blocked script can prevent a count."],
          ["Still stuck", `Email ${CONTACT_EMAIL} with your username, the page URL and what you expected to happen.`],
        ],
      },
      {
        id: "legal",
        icon: Scale,
        title: "Policies",
        summary: "Terms, privacy, refunds and notices.",
        blocks: [
          ["Legal center", "Terms of Service, Privacy Policy, Refund Policy, DMCA, Cookie Notice and the platform disclaimer all live on the Legal page."],
          ["Contact", `Legal, privacy and billing questions go to ${CONTACT_EMAIL}. Include your username and, for billing, the transaction reference from Stripe.`],
        ],
      },
    ],
  },
];

const SECTIONS = DOC_GROUPS.flatMap((g) => g.sections);

const Block = ({ heading, body }) => (
  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-colors hover:border-brand-500/25">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
      <ChevronRight className="h-4 w-4 shrink-0 text-brand-400" /> {heading}
    </h3>
    <p className="mt-1.5 pl-6 text-sm leading-relaxed text-zinc-400">{body}</p>
  </div>
);

export default function Docs() {
  const { section } = useParams();
  const navigate = useNavigate();
  const topRef = useRef(null);
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return null;
    return SECTIONS.filter((s) =>
      [s.title, s.summary, ...s.blocks.flat()].join(" ").toLowerCase().includes(term),
    );
  }, [q]);

  const activeId = useMemo(
    () => (section && SECTIONS.some((s) => s.id === section) ? section : SECTIONS[0].id),
    [section],
  );
  const active = SECTIONS.find((s) => s.id === activeId) || SECTIONS[0];
  const index = SECTIONS.indexOf(active);
  const prev = index > 0 ? SECTIONS[index - 1] : null;
  const next = index < SECTIONS.length - 1 ? SECTIONS[index + 1] : null;

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeId]);

  const go = (id) => navigate(`/!/docs/${id}`);

  return (
    <div className="min-h-screen sw-page-bg text-zinc-100 grain" data-testid="docs-page">
      <Navbar />
      <main ref={topRef} className="relative z-10 mx-auto max-w-6xl scroll-mt-24 px-4 pb-20 pt-32">
        <div className="mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full glass px-3 py-1 font-mono2 text-xs text-brand-300">
            <BookOpen className="h-3.5 w-3.5" /> Documentation
          </div>
          <h1 className="font-display text-4xl font-black text-zinc-50 sm:text-5xl">swats.bio Docs</h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-500">
            Everything about the platform — accounts, pages, widgets, customization, effects,
            crosshairs, rewards, pricing and administration. Written from the implementation.
          </p>
          <div className="mt-6 max-w-md">
            <label className="flex items-center gap-2 rounded-full border border-white/10 glass-strong px-5 py-2.5 focus-within:border-brand-500/50">
              <Search className="h-4 w-4 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                data-testid="docs-search"
                placeholder="Search the docs…"
                className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder-zinc-600"
              />
              {q ? (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="font-mono2 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-200"
                >
                  Clear
                </button>
              ) : null}
            </label>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="self-start lg:sticky lg:top-28">
            <nav data-testid="docs-nav" className="rounded-2xl border border-white/10 glass p-2">
              {results ? (
                <div data-testid="docs-results" className="p-1">
                  <div className="px-2 pb-1 pt-1 font-mono2 text-[10px] uppercase tracking-widest text-zinc-600">
                    {results.length} match{results.length === 1 ? "" : "es"}
                  </div>
                  {results.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => go(s.id)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100"
                    >
                      <s.icon className="h-4 w-4 shrink-0 text-brand-400/70" />
                      <span className="truncate">{s.title}</span>
                    </button>
                  ))}
                  {results.length === 0 && (
                    <p className="px-3 py-4 text-xs text-zinc-500">No docs match that search.</p>
                  )}
                </div>
              ) : null}
              {!results && DOC_GROUPS.map((group) => (
                <div key={group.label} className="mb-1 last:mb-0">
                  <div className="px-3 pb-1 pt-2 font-mono2 text-[10px] uppercase tracking-widest text-zinc-600">
                    {group.label}
                  </div>
                  {group.sections.map((s) => (
                    <Link
                      key={s.id}
                      to={`/!/docs/${s.id}`}
                      data-testid={`docs-nav-${s.id}`}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                        activeId === s.id
                          ? "bg-brand-500/15 text-brand-200"
                          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                      }`}
                    >
                      <s.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{s.title}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
          </aside>

          <article className="min-w-0">
            <section key={active.id} data-testid={`docs-section-${active.id}`}>
              <div className="mb-2 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl glass text-brand-400">
                  <active.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-mono2 text-[10px] uppercase tracking-widest text-zinc-600">
                    {DOC_GROUPS.find((g) => g.sections.includes(active))?.label}
                  </div>
                  <h2 className="font-display text-2xl font-extrabold text-zinc-100">{active.title}</h2>
                </div>
              </div>
              <p className="mb-6 text-sm text-zinc-500">{active.summary}</p>
              <div className="space-y-3">
                {active.blocks.map(([heading, body]) => (
                  <Block key={heading} heading={heading} body={body} />
                ))}
              </div>
            </section>

            <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
              {prev ? (
                <button
                  onClick={() => go(prev.id)}
                  data-testid="docs-prev"
                  className="group flex items-center gap-2 text-left text-sm text-zinc-400 transition hover:text-brand-300"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                  <span>
                    <span className="block font-mono2 text-[10px] uppercase tracking-widest text-zinc-600">Previous</span>
                    {prev.title}
                  </span>
                </button>
              ) : <span />}
              {next ? (
                <button
                  onClick={() => go(next.id)}
                  data-testid="docs-next"
                  className="group flex items-center gap-2 text-right text-sm text-zinc-400 transition hover:text-brand-300 sm:ml-auto"
                >
                  <span>
                    <span className="block font-mono2 text-[10px] uppercase tracking-widest text-zinc-600">Next</span>
                    {next.title}
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
