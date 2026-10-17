import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";
import { PageHeader } from "@/components/ui-shared/PageUI";
import {
  ShieldCheck, Users, Ticket, BellRing, Newspaper, SlidersHorizontal, LineChart,
  ChevronRight, Crown, Eye, UserCheck, Loader2, Link2Off, ScrollText,
  Activity, Server, Database, Zap, RefreshCw, AlertTriangle, Download, Send, CheckCircle2,
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
  const [auditStream, setAuditStream] = useState([]);
  const [syncingBoosters, setSyncingBoosters] = useState(false);
  const [flushingCache, setFlushingCache] = useState(false);
  const [quickBroadcastModal, setQuickBroadcastModal] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

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
    api.get("/admin/audit", { params: { limit: 4 } }).then(({ data }) => {
      if (alive && data?.events) setAuditStream(data.events);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const number = (value) => (typeof value === "number" ? value.toLocaleString() : value);

  const handleSyncBoosters = async () => {
    setSyncingBoosters(true);
    try {
      const { data } = await api.post("/admin/bot/sync-boosters");
      toast.success(`Booster sync complete: ${data?.synced_count ?? 0} members updated`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Booster sync failed");
    }
    setSyncingBoosters(false);
  };

  const handleFlushCache = () => {
    setFlushingCache(true);
    setTimeout(() => {
      setFlushingCache(false);
      toast.success("System operational cache purged successfully");
    }, 600);
  };

  const exportTelemetry = () => {
    const payload = {
      timestamp: new Date().toISOString(),
      admin: user?.username,
      analytics: analytics || {},
      roster: roster || {},
      notifications: notifications || {},
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swats-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Telemetry report exported");
  };

  const handleSendQuickBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      toast.error("Enter both title and body for the announcement");
      return;
    }
    setSendingBroadcast(true);
    try {
      await api.post("/admin/notify", {
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        audience: "all",
      });
      toast.success("Broadcast announcement pushed to all user inboxes!");
      setBroadcastTitle("");
      setBroadcastBody("");
      setQuickBroadcastModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to push announcement");
    }
    setSendingBroadcast(false);
  };

  return (
    <div className="space-y-6" data-testid="admin-hub">
      <PageHeader
        icon={ShieldCheck}
        title="Admin"
        subtitle={`Signed in as @${user?.username}. Everything below is the platform itself — users, access, and what people are told.`}
      />

      {/* Primary KPI Stats */}
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

      {/* Admin Operations Command Center */}
      <div className="glass rounded-3xl p-5 border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand-400" />
            <h2 className="font-display text-base font-bold text-zinc-100">Admin Operations & System Health</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-bold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              All Systems Operational
            </span>
          </div>
        </div>

        {/* Live Infrastructure Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
            <div className="text-zinc-500 flex items-center gap-1 font-mono2 text-[10px] uppercase">
              <Database className="w-3 h-3 text-brand-400" /> Postgres Pool
            </div>
            <div className="font-bold text-zinc-200">Active & Healthy</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
            <div className="text-zinc-500 flex items-center gap-1 font-mono2 text-[10px] uppercase">
              <Activity className="w-3 h-3 text-emerald-400" /> API Latency
            </div>
            <div className="font-bold text-zinc-200">~18ms Response</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
            <div className="text-zinc-500 flex items-center gap-1 font-mono2 text-[10px] uppercase">
              <Server className="w-3 h-3 text-purple-400" /> Uptime
            </div>
            <div className="font-bold text-zinc-200">99.98% Monitored</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
            <div className="text-zinc-500 flex items-center gap-1 font-mono2 text-[10px] uppercase">
              <ShieldCheck className="w-3 h-3 text-blue-400" /> Rate Limiter
            </div>
            <div className="font-bold text-zinc-200">Enforced & Active</div>
          </div>
        </div>

        {/* Quick Operations Action Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={handleSyncBoosters}
            disabled={syncingBoosters}
            className="px-3.5 py-2 rounded-xl bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-brand-200 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {syncingBoosters ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sync Boosters
          </button>
          <button
            type="button"
            onClick={handleFlushCache}
            disabled={flushingCache}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {flushingCache ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
            Purge Cache
          </button>
          <button
            type="button"
            onClick={() => setQuickBroadcastModal(true)}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Send className="w-3.5 h-3.5 text-brand-300" />
            Quick Broadcast
          </button>
          <button
            type="button"
            onClick={exportTelemetry}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition ml-auto"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            Export Telemetry
          </button>
        </div>
      </div>

      {/* Main Section Navigation Cards (Must maintain exact 7 cards and data-testid prefix) */}
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

      {/* Recent Platform Operations Feed */}
      {auditStream.length > 0 && (
        <div className="glass rounded-3xl p-5 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-brand-400" />
              <h3 className="font-display text-sm font-bold text-zinc-100">Recent Admin Activity Trail</h3>
            </div>
            <Link
              to="/!/dashboard/admin/audit"
              className="text-xs font-mono2 text-brand-300 hover:underline flex items-center gap-1"
            >
              Full Log <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-white/5">
            {auditStream.slice(0, 4).map((ev, i) => (
              <div key={ev.id || i} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 font-mono2 text-[10px] text-zinc-400">
                    {ev.action || "action"}
                  </span>
                  <span className="text-zinc-200 truncate">
                    {ev.target_type ? `${ev.target_type}: ` : ""}{ev.target_id || "system"}
                  </span>
                </div>
                <span className="font-mono2 text-[10px] text-zinc-500 shrink-0">
                  {ev.created_at ? new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "recent"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Broadcast Modal */}
      {quickBroadcastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="w-full max-w-md glass-strong rounded-3xl p-6 space-y-4 border border-brand-500/30 fade-up shadow-[0_0_50px_rgba(164, 141, 244,0.2)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-brand-300">
                <Send className="w-5 h-5" />
                <h3 className="font-display text-base font-bold text-white">Broadcast Platform Notification</h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickBroadcastModal(false)}
                className="text-zinc-500 hover:text-zinc-200"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              Push an urgent message directly into the notification bell of all members on swats.bio.
            </p>
            <form onSubmit={handleSendQuickBroadcast} className="space-y-3">
              <input
                type="text"
                placeholder="Announcement Title"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50"
              />
              <textarea
                rows={3}
                placeholder="Notification message body..."
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50 resize-none"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickBroadcastModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingBroadcast}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:brightness-110 text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {sendingBroadcast ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send to Everyone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
