import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui-shared/PageUI";
import {
  ShieldCheck, Users, Ticket, BellRing, Newspaper, SlidersHorizontal, LineChart,
  ChevronRight, Crown, Eye, UserCheck, Loader2, Link2Off, ScrollText,
} from "lucide-react";

/* The admin hub.
 *
 * Admin used to be seven sidebar links with no landing page, so "where do I
 * start" had no answer. This is that answer: the numbers an admin actually checks
 * (who is here, who paid, who linked Discord, what the site is serving) and a card
 * per section. Each card is the same destination as the tab strip above it — the
 * cards exist for orientation, not as a second navigation system.
 */
const SECTIONS = [
  {
    to: "/!/dashboard/admin/users",
    icon: Users,
    title: "Users",
    body: "Every account, its Discord link, roles, tiers, badges and views — plus the bot's refresh and booster sync.",
  },
  {
    to: "/!/dashboard/admin/invites",
    icon: Ticket,
    title: "Invite codes",
    body: "Generate codes, cap their uses, and mark one to hand out Premium on sign-up.",
  },
  {
    to: "/!/dashboard/admin/notify",
    icon: BellRing,
    title: "Notify",
    body: "Send straight to people's notification bell — everyone, a tier, or a hand-picked list.",
  },
  {
    to: "/!/dashboard/admin/devlogs",
    icon: Newspaper,
    title: "Devlogs",
    body: "Post what shipped and push it into inboxes, or leave it as a draft.",
  },
  {
    to: "/!/dashboard/admin/site",
    icon: SlidersHorizontal,
    title: "Site",
    body: "Registration, invite-only, maintenance mode, announcements, and the Discord sign-in rules.",
  },
  {
    to: "/!/dashboard/admin/analytics",
    icon: LineChart,
    title: "Analytics",
    body: "Signups over the last 30 days alongside totals for users, views and premium.",
  },
  {
    to: "/!/dashboard/admin/audit",
    icon: ScrollText,
    title: "Audit log",
    body: "Every admin change, sign-in, pairing, reward and payment — with who, what, before and after.",
  },
];

const Stat = ({ icon: Icon, label, value, hint, testid }) => (
  <div className="glass rounded-2xl p-4" data-testid={testid}>
    <div className="flex items-center gap-2 font-mono2 text-[10px] uppercase tracking-wider text-zinc-500">
      <Icon className="h-3.5 w-3.5 text-brand-400" /> {label}
    </div>
    <div className="mt-2 font-display text-2xl font-black tracking-tight text-zinc-50">
      {value === null || value === undefined ? <Loader2 className="h-4 w-4 animate-spin text-zinc-600" /> : value}
    </div>
    {hint && <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>}
  </div>
);

export default function Admin() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [roster, setRoster] = useState(null);
  const [notifications, setNotifications] = useState(null);

  useEffect(() => {
    let alive = true;
    // Three independent panels: one failing must not blank the others, so each
    // request settles on its own and only its own card shows a spinner forever.
    api.get("/admin/analytics").then(({ data }) => { if (alive) setAnalytics(data); }).catch(() => {});
    api.get("/admin/discord/roster", { params: { limit: 1 } }).then(({ data }) => { if (alive) setRoster(data.stats); }).catch(() => {});
    api.get("/admin/notify/history").then(({ data }) => {
      if (!alive) return;
      const sent = Array.isArray(data) ? data.reduce((sum, row) => sum + (row.recipients || 0), 0) : 0;
      setNotifications({ sends: Array.isArray(data) ? data.length : 0, recipients: sent });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const number = (value) => (typeof value === "number" ? value.toLocaleString() : value);

  return (
    <div className="space-y-5" data-testid="admin-hub">
      <PageHeader
        icon={ShieldCheck}
        title="Admin"
        subtitle={`Signed in as @${user?.username}. Everything below is the platform itself — users, access, and what people are told.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Users}
          label="Accounts"
          value={analytics ? number(analytics.total_users) : null}
          hint={roster ? `${number(roster.discord_linked)} with Discord linked` : "counting…"}
          testid="admin-stat-users"
        />
        <Stat
          icon={Crown}
          label="Premium"
          value={analytics ? number(analytics.premium_users) : null}
          hint="Premium and admin tiers"
          testid="admin-stat-premium"
        />
        <Stat
          icon={Eye}
          label="Total views"
          value={analytics ? number(analytics.total_views) : null}
          hint="Across every profile"
          testid="admin-stat-views"
        />
        <Stat
          icon={notifications ? BellRing : Link2Off}
          label="Messages sent"
          value={notifications ? number(notifications.sends) : null}
          hint={notifications ? `${number(notifications.recipients)} inbox deliveries` : "loading…"}
          testid="admin-stat-sends"
        />
      </div>

      {roster && roster.discord_missing > 0 && (
        <div className="glass flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-4 py-3" data-testid="admin-discord-gap">
          <UserCheck className="h-4 w-4 shrink-0 text-amber-300" />
          <p className="text-xs text-zinc-300">
            <strong className="font-semibold text-zinc-100">{number(roster.discord_missing)}</strong>{" "}
            {roster.discord_missing === 1 ? "account has" : "accounts have"} no Discord linked. "Auth check" in Site
            settings blocks their profile edits until they connect it.
          </p>
          <Link
            to="/!/dashboard/admin/users"
            className="ml-auto flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-300 transition-colors duration-200 hover:text-brand-200"
          >
            Review them <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map(({ to, icon: Icon, title, body }) => (
          <Link
            key={to}
            to={to}
            data-testid={`admin-card-${title.toLowerCase().split(" ")[0]}`}
            className="group glass relative flex items-start gap-3.5 overflow-hidden rounded-2xl p-5 transition-colors duration-200 hover:border-brand-400/25"
          >
            {/* The only decoration: a soft pink wash that fades down the card. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand-500/[0.09] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
              <Icon className="h-4 w-4 text-brand-300" />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-display text-sm font-bold tracking-tight text-zinc-50">
                {title}
                <ChevronRight className="h-3.5 w-3.5 text-zinc-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-300" />
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{body}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
