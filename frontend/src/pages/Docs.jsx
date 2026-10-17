import { useState, useMemo } from "react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { CONTACT_EMAIL } from "@/lib/api";
import {
  BookOpen, User, Link2, LayoutGrid, Palette, Sparkles, Trophy,
  CreditCard, Bot, ShieldCheck, LifeBuoy, Search, ChevronRight,
} from "lucide-react";

const SECTIONS = [
  {
    id: "getting-started", icon: BookOpen, title: "Getting Started",
    blocks: [
      ["What is swats.bio?", "swats.bio is a bio-link platform: one page for everything you are. Claim a username, customise a page with widgets, effects and badges, and share a single swats.bio/you link."],
      ["Claiming your name", "On the homepage type a username into the claim pill. A green check means it's free — click Claim to register and set a password. Your page goes live instantly at swats.bio/yourname."],
      ["The dashboard", "Everything you edit lives under /!/dashboard: the Overview, Editor, Links, Widgets, Badges, Templates, Leaderboard, Stats and Settings."],
    ],
  },
  {
    id: "account", icon: User, title: "Account Management",
    blocks: [
      ["Profile basics", "Set your display name, bio, avatar and banner in the Editor. Your username can be changed from Settings (rate-limited to prevent squatting)."],
      ["Two-factor auth", "Enable TOTP from Settings for an authenticator-app code at login, with one-time recovery codes stored securely."],
      ["Linked accounts", "Link a Discord account for booster/member badges, and pair multiple swats accounts to switch between them from the dashboard menu."],
    ],
  },
  {
    id: "profiles", icon: Link2, title: "Profiles & Pages",
    blocks: [
      ["Your public page", "Visitors see your avatar, bio, links, widgets and effects. The layout and card style are picked in the Editor."],
      ["Links", "Add social and custom links under Links. Each link can render as a button or an icon; drag to reorder."],
      ["Discovery", "Your page can appear in Explore and on the Leaderboard, ranked by real profile views."],
    ],
  },
  {
    id: "widgets", icon: LayoutGrid, title: "Widgets",
    blocks: [
      ["Available widgets", "Discord, Spotify, Valorant, Roblox, GitHub, YouTube, Steam, TikTok, SoundCloud, Timezone and Account Date. Custom Code is available on Premium."],
      ["Live data", "Widgets pull real third-party data through the backend proxy — your API keys stay server-side and are never exposed to visitors."],
    ],
  },
  {
    id: "customization", icon: Palette, title: "Customization",
    blocks: [
      ["Colours & fonts", "Choose a theme colour, accent colour and fonts for your name, headings and bio. Colour pickers are available wherever a colour can be set."],
      ["Layout & cards", "Switch between layouts (floating, etc.) and card styles (aurora and more) to change the whole feel of your page."],
      ["Corner radius", "A per-device rounding preference (Sharp → Pill) is set in Settings and applies across the site."],
    ],
  },
  {
    id: "effects", icon: Sparkles, title: "Effects & Overlays",
    blocks: [
      ["Background effects", "Animated page backdrops rendered on a canvas (rain, snow, thunder and more). One background plays at a time."],
      ["Overlays", "A lighter layer on top of your page — snow, rain, VHS, dotters and others. Combine with a background for depth."],
      ["Text & cursor effects", "Animate your name/heading text and the visitor's cursor trail. Some effects are Premium."],
    ],
  },
  {
    id: "rewards", icon: Trophy, title: "Rewards & Views",
    blocks: [
      ["How views work", "A view is only counted for a real, dwelled visitor that passes a lightweight proof-of-work challenge — bots and refresh-spam don't inflate your count."],
      ["View milestones", "Crossing view milestones can grant timed Premium and badges automatically. Each milestone pays out once per account."],
      ["Badges", "Earn or be granted badges (Verified, OG, Premium, Team…) and equip the ones you want shown on your page."],
    ],
  },
  {
    id: "pricing", icon: CreditCard, title: "Pricing & Premium",
    blocks: [
      ["Free vs Premium", "Free covers the essentials. Premium unlocks the full effect/overlay/cursor catalog, custom code widgets and more."],
      ["Billing", "Payments are processed securely by Stripe. Premium features unlock the moment payment succeeds."],
      ["Refunds", "See the Legal page for the refund policy. For billing questions email " + CONTACT_EMAIL + "."],
    ],
  },
  {
    id: "bots", icon: Bot, title: "Bots & Integrations",
    blocks: [
      ["Discord presence", "The swats Discord bot maintains a live presence and powers Discord-linked badges (member/booster) on profiles."],
      ["Integrations", "Connect Discord and Spotify via OAuth; widgets for GitHub, Roblox, Valorant and others use per-user keys stored server-side."],
    ],
  },
  {
    id: "admin", icon: ShieldCheck, title: "Administration",
    blocks: [
      ["Admin hub", "Admins manage users, invite codes, announcements, devlogs, site settings, analytics and the audit log from /!/dashboard/admin."],
      ["Audit log", "Privileged actions (bans, grants, pairings, automatic rewards) are recorded with the actor, target and timestamp."],
    ],
  },
  {
    id: "troubleshooting", icon: LifeBuoy, title: "Troubleshooting",
    blocks: [
      ["My page looks empty", "Make sure you've saved changes in the Editor and that your links/widgets are enabled. A hard refresh picks up new saves."],
      ["Widget shows no data", "Re-check the connected account or API key under Integrations; third-party rate limits can briefly blank a widget."],
      ["Still stuck?", "Email " + CONTACT_EMAIL + " with your username and a description — the more detail, the faster we can help."],
    ],
  },
];

export default function Docs() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      blocks: s.blocks.filter(([h, b]) => (h + " " + b).toLowerCase().includes(term)),
    })).filter((s) => s.title.toLowerCase().includes(term) || s.blocks.length);
  }, [q]);

  const scrollTo = (id) => {
    setActive(id);
    document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen sw-page-bg text-zinc-100 grain" data-testid="docs-page">
      <Navbar />
      <main className="relative z-10 max-w-6xl mx-auto px-4 pt-32 pb-20">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs font-mono2 text-zinc-300 mb-4">
            <BookOpen className="w-3.5 h-3.5 text-brand-400" /> Documentation
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-black text-zinc-50">swats.bio Docs</h1>
          <p className="mt-3 text-sm text-zinc-500 max-w-2xl">Everything about the platform — accounts, profiles, widgets, customization, effects, rewards, pricing and more.</p>
          <div className="mt-6 max-w-md glass-strong rounded-full flex items-center px-5 py-2.5 border border-white/10 focus-within:border-brand-500/50 transition">
            <Search className="w-4 h-4 text-zinc-500 mr-3" />
            <input data-testid="docs-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the docs…" className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder-zinc-600" />
          </div>
        </div>

        <div className="grid lg:grid-cols-[240px_1fr] gap-10">
          <aside className="lg:sticky lg:top-28 self-start">
            <nav data-testid="docs-nav" className="glass rounded-2xl p-2 border border-white/10">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  data-testid={`docs-nav-${s.id}`}
                  onClick={() => scrollTo(s.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition ${active === s.id ? "bg-brand-500/15 text-brand-200" : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"}`}
                >
                  <s.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="space-y-12 min-w-0">
            {filtered.map((s) => (
              <section key={s.id} id={`doc-${s.id}`} data-testid={`docs-section-${s.id}`} className="scroll-mt-28">
                <div className="flex items-center gap-3 mb-5">
                  <span className="w-10 h-10 rounded-xl glass flex items-center justify-center text-brand-400"><s.icon className="w-5 h-5" /></span>
                  <h2 className="font-display text-2xl font-extrabold text-zinc-100">{s.title}</h2>
                </div>
                <div className="space-y-4">
                  {s.blocks.map(([h, b], i) => (
                    <div key={i} className="glass rounded-xl p-5 border border-white/5 hover:border-brand-500/30 transition">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100 mb-1.5"><ChevronRight className="w-4 h-4 text-brand-400" /> {h}</h3>
                      <p className="text-sm text-zinc-400 leading-relaxed pl-6">{b}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {filtered.length === 0 && (
              <div data-testid="docs-empty" className="text-center py-20 text-zinc-500 text-sm">No docs match your search.</div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
