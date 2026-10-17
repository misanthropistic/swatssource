import { useEffect, useState, useRef } from "react";
import { NavLink, Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/landing/Navbar";
import { api, fileUrl } from "@/lib/api";
import { FaDiscord } from "react-icons/fa6";
import NotificationBell from "@/components/NotificationBell";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import AuthGateNotice from "@/components/AuthGateNotice";
import {
  LayoutDashboard, Paintbrush, Link2, Award, LayoutGrid, Settings, LayoutTemplate,
  Trophy, BarChart3, Users, Ticket, SlidersHorizontal, LineChart, LogOut,
  ExternalLink, Crown,  ChevronDown, Sparkles, BellRing, Newspaper, ShieldCheck, Plus,
  ScrollText, Loader2, Gift,
} from "lucide-react";
import PremiumPlansModal from "@/components/PremiumPlansModal";
import DevlogFeedModal from "@/components/DevlogFeedModal";

const DISCORD_INVITE = "https://discord.gg/a9uwptuepD";

/* ---------------------------------------------------------------------------
   The sidebar is grouped into collapsible categories, and the content header
   shows that category's tabs — so the shell reads "here is the area I am in"
   instead of one flat wall of eleven links. A category can be folded away, but
   the one holding the current page never collapses, so a route is never hidden.
   --------------------------------------------------------------------------- */
const NAV_GROUPS = [
  {
    id: "account",
    label: "Account",
    tabs: [
      { to: "/!/dashboard", end: true, label: "Overview", icon: LayoutDashboard, testid: "tab-overview" },
      // Social: friends, requests, the announcement board and — on Premium —
      // the encrypted messages. It sits with the account rather than with the
      // customization pages: friends and conversations belong to the person,
      // not to the profile they are decorating. The route stays `/inbox` so
      { to: "/!/dashboard/stats", label: "Stats", icon: BarChart3, testid: "tab-stats" },
      { to: "/!/dashboard/badges", label: "Badges", icon: Award, testid: "tab-badges" },
      { to: "/!/dashboard/settings", label: "Settings", icon: Settings, testid: "tab-settings" },
    ],
  },
  {
    id: "customization",
    label: "Customization",
    tabs: [
      { to: "/!/dashboard/editor", label: "Editor", icon: Paintbrush, testid: "tab-editor" },
      { to: "/!/dashboard/links", label: "Links", icon: Link2, testid: "tab-links" },
      { to: "/!/dashboard/widgets", label: "Widgets & Music", icon: LayoutGrid, testid: "tab-widgets" },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    tabs: [
      { to: "/!/dashboard/rewards", label: "Rewards", icon: Gift, testid: "tab-rewards" },
      { to: "/!/dashboard/leaderboard", label: "Leaderboard", icon: Trophy, testid: "tab-leaderboard" },
      { to: "/!/dashboard/templates", label: "Templates", icon: LayoutTemplate, testid: "tab-templates" },
      // The build log is deliberately NOT a page in this strip. It opens as a
      // popup from the sidebar, so the feed is read in place instead of handing
      // someone to the public changelog — a page written for visitors, not for
      // a person mid-edit. /!/dashboard/devlogs still resolves for bookmarks.
    ],
  },
];

/* Admin is ONE sidebar destination, not seven.

   Every admin page used to be its own top-level link, which is why the sidebar
   read as a wall of unrelated items the moment an admin signed in. The whole area
   now lives under a single /!/dashboard/admin entry, and its pages are the tab
   strip of that one category — the same strip every other group already uses. The
   `group` object doubles as a nav item (`to`/`icon`/`testid`), so the sidebar and
   the mobile chips can render it with the ordinary link components. */
const ADMIN_SECTIONS = [
  { to: "/!/dashboard/admin", end: true, label: "Overview", icon: ShieldCheck, testid: "tab-admin-overview" },
  // The old Bot tab lives inside Users now: the roster endpoint carries the
  // Discord half of every account, so one page owns both jobs.
  { to: "/!/dashboard/admin/users", label: "Users", icon: Users, testid: "tab-admin-users" },
  { to: "/!/dashboard/admin/invites", label: "Invites", icon: Ticket, testid: "tab-admin-invites" },
  { to: "/!/dashboard/admin/notify", label: "Notify", icon: BellRing, testid: "tab-admin-notify" },
  { to: "/!/dashboard/admin/devlogs", label: "Devlogs", icon: Newspaper, testid: "tab-admin-devlogs" },
  { to: "/!/dashboard/admin/site", label: "Site", icon: SlidersHorizontal, testid: "tab-admin-site" },
  { to: "/!/dashboard/admin/analytics", label: "Analytics", icon: LineChart, testid: "tab-admin-analytics" },
  { to: "/!/dashboard/admin/audit", label: "Audit", icon: ScrollText, testid: "tab-admin-audit" },
];

const ADMIN_GROUP = {
  id: "admin",
  label: "Admin",
  to: "/!/dashboard/admin",
  end: true,
  icon: ShieldCheck,
  testid: "tab-admin",
  tabs: ADMIN_SECTIONS,
};

// Every navigable destination, including the admin entry itself and each of its
// sections, so the active-group lookup and the header title work off one list.
const ALL_TABS = [
  ...NAV_GROUPS.flatMap((g) => g.tabs),
  { to: ADMIN_GROUP.to, end: true, label: ADMIN_GROUP.label, icon: ADMIN_GROUP.icon, testid: ADMIN_GROUP.testid },
  ...ADMIN_GROUP.tabs,
];

const spring = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 };

const groupFor = (pathname) => {
  // The admin entry's own path is also the first section's path, so it resolves to
  // the admin group through the tab list below rather than by special-casing.
  const exact = ALL_TABS.find((t) => t.to === pathname);
  if (exact) return NAV_GROUPS.find((g) => g.tabs.includes(exact)) || ADMIN_GROUP;
  const partial = ALL_TABS.find((t) => t.to !== "/!/dashboard" && pathname.startsWith(t.to));
  if (partial) return NAV_GROUPS.find((g) => g.tabs.includes(partial)) || ADMIN_GROUP;
  return null;
};

const tabFor = (pathname) =>
  ALL_TABS.find((t) => t.to === pathname) ||
  ALL_TABS.find((t) => t.to !== "/!/dashboard" && pathname.startsWith(t.to)) ||
  null;

const TabLink = ({ t }) => (
  <NavLink
    to={t.to}
    end={t.end}
    data-testid={t.testid}
    className={({ isActive }) =>
      `group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
        isActive ? "text-brand-100" : "text-zinc-400 hover:text-zinc-100"
      }`
    }
  >
    {({ isActive }) => (
      <>
        {isActive ? (
          <motion.span
            layoutId="dash-nav-active"
            transition={spring}
            className="absolute inset-0 rounded-xl border border-brand-400/25 bg-brand-500/15"
          />
        ) : (
          <span className="absolute inset-0 rounded-xl bg-white/0 transition-colors duration-200 group-hover:bg-white/[0.04]" />
        )}
        <t.icon
          className={`relative z-10 w-4 h-4 shrink-0 transition-transform duration-200 ${
            isActive ? "scale-110" : "group-hover:scale-105"
          }`}
        />
        <span className="relative z-10 truncate">{t.label}</span>
        {isActive && (
          <motion.span
            layoutId="dash-nav-marker"
            transition={spring}
            className="relative z-10 ml-auto h-1.5 w-1.5 rounded-full bg-brand-300"
          />
        )}
      </>
    )}
  </NavLink>
);

/* A foldable category. The chevron rotates, the list animates its height and a
   dot marks the folded category that holds the page you are on, so folding the
   sidebar can never lose your route. */
function NavGroup({ group, open, onToggle, containsActive }) {
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        data-testid={`navgroup-${group.id}`}
        className="group flex w-full items-center gap-2 rounded-xl px-3.5 py-2 text-left outline-none transition-colors duration-200 hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-brand-500/50"
      >
        <span className="font-mono2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors duration-200 group-hover:text-zinc-300">
          {group.label}
        </span>
        {containsActive && !open && <span className="h-1 w-1 rounded-full bg-brand-400" />}
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform duration-300 ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-1 pt-1">
              {group.tabs.map((t) => (
                <TabLink key={t.to} t={t} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CommunityCard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get("/stats").then(({ data }) => { if (alive) setStats(data); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <a
      href={DISCORD_INVITE}
      target="_blank"
      rel="noreferrer"
      data-testid="discord-card"
      className="group mt-4 block rounded-2xl border border-white/[0.06] bg-gradient-to-br from-brand-500/[0.12] to-white/[0.02] p-4 transition-colors duration-200 hover:border-brand-400/30"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] border border-white/10 transition-transform duration-300 group-hover:scale-105">
          <FaDiscord className="h-4 w-4 text-white" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-bold text-zinc-100">Join our Discord</div>
          <div className="truncate font-mono2 text-[10px] text-zinc-500">discord.gg/a9uwptuepD</div>
        </div>
        <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-600 transition-colors duration-200 group-hover:text-brand-300" />
      </div>
      {stats && Number.isFinite(stats.bio_links) && (
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-zinc-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {stats.bio_links.toLocaleString()} profiles · {Number(stats.total_views || 0).toLocaleString()} views
        </div>
      )}
    </a>
  );
}

function UserCard({ user, onLogout }) {
  const initial = (user.display_name || user.username || "?")[0]?.toUpperCase();
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-800 text-sm ring-1 ring-white/10">
        {user.profile?.avatar_url ? (
          <img src={fileUrl(user.profile.avatar_url)} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-bold text-zinc-400">{initial}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-zinc-100">{user.display_name || user.username}</div>
        <div className="truncate font-mono2 text-[11px] text-zinc-500">
          @{user.username}
          {Number.isFinite(user.uid_number) && <span className="text-zinc-600"> · UID {user.uid_number}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={onLogout}
        data-testid="logout-btn"
        title="Log out"
        aria-label="Log out"
        className="group shrink-0 rounded-xl p-2 text-zinc-500 outline-none transition-colors duration-200 hover:bg-red-500/10 hover:text-red-300 focus-visible:ring-2 focus-visible:ring-red-500/40"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

/* The top-right account menu: a click on the avatar opens every account this
   session can reach — the current one, the paired accounts to swap between,
   an inline form that pairs a new one (signing into it once verifies it), and
   the sign-out. The paired accounts stay mutual-only, so the menu can never
   show an account the other side has not agreed to. */
function AccountMenu({ user }) {
  const { switchable, loadSwitchable, switchAccount, startPair, unlinkAccount, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  // Auto-close menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        !buttonRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("touchstart", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("touchstart", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Re-read the pairing when the menu opens, so a link made in another tab is
  // here too.
  useEffect(() => {
    if (open) loadSwitchable();
  }, [open, loadSwitchable]);

  const doSwitch = async (targetId) => {
    setBusy(true);
    const res = await switchAccount(targetId);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setOpen(false);
    window.location.reload();
  };

  /* Add another account the only way this site has accounts: Discord.
   *
   * It used to ask for an email and password, which could never work here — an
   * account created through Discord has no password hash at all, so the server
   * refused every attempt with "This account signs in with Discord". The button
   * now starts a Discord sign-in for the SECOND account; the callback links the
   * two, and the session on screen does not change. */
  const doPair = async () => {
    setBusy(true);
    setError("");
    const res = await startPair();
    setBusy(false);
    if (!res.ok) setError(res.error || "Could not start the Discord sign-in");
  };

  const initial = (name) => (name || "?")[0]?.toUpperCase();
  const avatar = (acc, sizeClass) => (
    <div className={`${sizeClass} shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-white/10`}>
      {acc.avatar_url ? (
        <img src={fileUrl(acc.avatar_url)} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className={`flex h-full w-full items-center justify-center text-zinc-400`}>{initial(acc.display_name)}</span>
      )}
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        data-testid="account-menu-button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={`${user.display_name || user.username} — account menu`}
        className="hidden h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-zinc-800 text-sm ring-1 ring-white/10 transition-transform duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-brand-500/60 sm:flex"
      >
        {user.profile?.avatar_url ? (
          <img src={fileUrl(user.profile.avatar_url)} alt="" className="h-full w-full object-cover" />
        ) : (
          initial(user.display_name || user.username)
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={menuRef}
            data-testid="account-menu"
            className="absolute right-0 top-10 z-50 w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#101014] shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
          >
            <div data-testid="account-switcher" className="max-h-72 overflow-y-auto p-2">
              {switchable.map((acc) => {
                const current = acc.id === user.id;
                return (
                  <div key={acc.id} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2">
                    {avatar(acc, "h-8 w-8")}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-zinc-100">{acc.display_name}</div>
                      <div className="truncate font-mono2 text-[10px] text-zinc-500">@{acc.username}</div>
                    </div>
                    {current ? (
                      <span className="shrink-0 rounded-full bg-brand-500/15 px-2 py-0.5 text-[9px] font-bold uppercase text-brand-300">current</span>
                    ) : (
                      <button
                        type="button"
                        data-testid={`switch-account-${acc.username}`}
                        disabled={busy}
                        onClick={() => doSwitch(acc.id)}
                        className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-zinc-300 transition hover:border-brand-500/40 hover:text-brand-200 disabled:opacity-50"
                      >
                        Switch
                      </button>
                    )}
                  </div>
                );
              })}

              {!adding ? (
                <button
                  type="button"
                  data-testid="add-account"
                  onClick={() => { setAdding(true); setError(""); }}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.04]"
                >
                  <Plus className="h-3.5 w-3.5 text-brand-400" /> Add another account
                </button>
              ) : (
                <div data-testid="link-account-form" className="mt-1 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] leading-relaxed text-zinc-400">
                    Sign in with the <span className="font-semibold text-zinc-200">other Discord account</span>. We link
                    the two accounts so you can switch between them here — no password needed.
                  </p>
                  {error && <p className="text-[10px] text-red-400">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid="pair-discord"
                      onClick={doPair}
                      disabled={busy}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#5865F2] px-3 py-1.5 text-[11px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FaDiscord className="h-3.5 w-3.5" />}
                      Continue with Discord
                    </button>
                    <button type="button" onClick={() => { setAdding(false); setError(""); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-white/10 p-2">
              <a
                href={`/${user.username}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.04]"
              >
                <ExternalLink className="h-3.5 w-3.5 text-brand-400" /> View public profile
              </a>
              <button
                type="button"
                onClick={async () => { await logout(); window.location.href = "/"; }}
                data-testid="account-menu-logout"
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10"
              >
                <LogOut className="h-3.5 w-3.5" /> Log out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [collapsed, setCollapsed] = useState({});
  // Which in-dashboard popup is open: null, "premium" or "devlog".
  const [popup, setPopup] = useState(null);

  if (!user || user === false) return null;

  const isAdmin = user.role === "admin";
  const groups = isAdmin ? [...NAV_GROUPS, ADMIN_GROUP] : NAV_GROUPS;
  const activeGroup = groupFor(pathname);
  const activeTab = tabFor(pathname);
  const strip = activeGroup?.tabs || [];

  const handleLogout = () => { logout(); navigate("/"); };

  return (
    /* sw-page-bg, not a flat fill: the page darkens from a lifted grey at the top
       to near-black at the bottom, so the rounded panels have something to sit on. */
    <div className="dash-font flex min-h-screen sw-page-bg text-zinc-100">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-white/[0.06] bg-gradient-to-b from-white/[0.05] via-white/[0.012] to-black/40 p-5 lg:flex">
        <div className="px-2 py-2">
          <Logo />
        </div>

        <UserCard user={user} onLogout={handleLogout} />

        <nav className="mt-6 flex-1 overflow-y-auto pr-1">
          {groups.map((group) => {
            // Admin is a single destination rather than a foldable category, and it
            // stays lit for its whole subtree (end:false), so arriving on
            // /!​/dashboard/admin/users still shows which entry you are inside.
            if (group.to) return <TabLink key={group.id} t={{ ...group, end: false }} />;

            const containsActive = activeGroup?.id === group.id;
            const isOpen = !collapsed[group.id];
            return (
              <NavGroup
                key={group.id}
                group={group}
                open={isOpen}
                containsActive={containsActive}
                onToggle={() => setCollapsed((c) => ({ ...c, [group.id]: isOpen }))}
              />
            );
          })}

          {/* Standalone destinations that are not part of a category.

              Premium and Devlog open popups rather than leaving the dashboard.
              Premium used to load /!/pricing — the marketing page, written for
              people who do not have an account — and Devlog loaded /!/devlogs,
              the public changelog. Someone inside their own dashboard wants the
              plans and the build notes where they are, so both are buttons now. */}
          <div className="mt-2 space-y-1 border-t border-white/5 pt-3">
            <button
              type="button"
              onClick={() => setPopup("premium")}
              data-testid="premium-link"
              className="group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-zinc-400 outline-none transition-colors duration-200 hover:bg-white/[0.04] hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-brand-400/80 transition-transform duration-200 group-hover:scale-110" />
              <span className="truncate">Premium</span>
              <Crown className="ml-auto h-3.5 w-3.5 shrink-0 text-brand-400/70" />
            </button>
            <button
              type="button"
              onClick={() => setPopup("devlog")}
              data-testid="devlog-link"
              className="group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-zinc-400 outline-none transition-colors duration-200 hover:bg-white/[0.04] hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              <Newspaper className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className="truncate">Devlog</span>
              <span className="ml-auto shrink-0 font-mono2 text-[10px] text-zinc-600">what's new</span>
            </button>
            <Link
              to={`/${user.username}`}
              target="_blank"
              data-testid="view-public-btn"
              className="group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-zinc-400 outline-none transition-colors duration-200 hover:bg-white/[0.04] hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              <ExternalLink className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className="truncate">View profile</span>
              <span className="ml-auto shrink-0 font-mono2 text-[10px] text-zinc-600">swats.bio/{user.username}</span>
            </Link>
          </div>
        </nav>

        <div className="mt-4 border-t border-white/5 pt-4">
          <CommunityCard />
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-white/5 glass-strong">
          <div className="flex items-center justify-between gap-3 px-6 pt-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <Logo size="text-base" />
              </div>
              <motion.h1
                key={activeGroup?.id || pathname}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="truncate font-display text-2xl font-black tracking-tight text-zinc-50"
              >
                {activeGroup?.label || activeTab?.label || "Dashboard"}
              </motion.h1>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {/* The bell stays visible on mobile: a notification nobody sees on a
                  phone may as well not exist. */}
              <NotificationBell />
              {user.tier !== "free" && (
                <span className="hidden items-center gap-1 rounded-full bg-brand-500/15 px-2.5 py-1 text-[10px] font-bold uppercase text-brand-300 sm:inline-flex">
                  <Crown className="h-3 w-3" /> {user.tier}
                </span>
              )}
              <AccountMenu user={user} />
            </div>
          </div>

          {/* Section tabs — the pages of the category you are inside. */}
          {strip.length > 0 && (
            <nav className="-mb-px flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {strip.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  // Prefixed so a strip tab is never confused with the sidebar item
                  // that shares its testid (tab-overview exists in both places).
                  data-testid={t.testid ? `strip-${t.testid}` : undefined}
                  className={({ isActive }) =>
                    `relative shrink-0 px-3.5 pb-3 pt-3 text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
                      isActive ? "text-brand-200" : "text-zinc-500 hover:text-zinc-200"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {t.label}
                      {isActive && (
                        <motion.span
                          layoutId="dash-section-underline"
                          transition={spring}
                          className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-400"
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          )}
        </header>

        {/* Admin "Auth check" and live announcements, above the page content so
            they are read before whatever the page itself says. */}
        <AuthGateNotice />
        {/* Renders nothing (no padding, no border) when nothing is live. */}
        <AnnouncementBanner className="border-b border-white/5 bg-white/[0.01] px-6 py-3" />

        {/* Mobile tabs: every destination, since the sidebar is hidden. */}
        <div className="flex snap-x gap-2 overflow-x-auto border-b border-white/5 px-5 py-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          {[...NAV_GROUPS.flatMap((g) => g.tabs), ...(isAdmin ? [ADMIN_GROUP] : [])].map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium outline-none transition-colors duration-200 ${
                  isActive
                    ? "bg-brand-500/20 text-brand-100 ring-1 ring-brand-400/30"
                    : "bg-white/[0.04] text-zinc-400 hover:text-zinc-100"
                }`
              }
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </NavLink>
          ))}
        </div>

        <main id="dashboard-main" className="mx-auto w-full flex-1 p-5 sm:p-8">
          <Outlet />
        </main>
      </div>

      {/* The dashboard's own popups. Mounted once here so the sidebar, the
          notification footer and any page all open the same instance. */}
      <PremiumPlansModal open={popup === "premium"} onClose={() => setPopup(null)} />
      <DevlogFeedModal open={popup === "devlog"} onClose={() => setPopup(null)} />
    </div>
  );
}
