import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { api, setToken } from "@/lib/api";
import { toast } from "@/lib/notify";
import RankCard from "@/components/RankCard";
import { FaDiscord } from "react-icons/fa6";
import {
  AtSign, Award, Check, ChevronRight, Crown, Eye, Image as ImageIcon,
  LayoutTemplate, Loader2, Pencil, Settings, ShieldCheck, Sparkles, UserRound,
} from "lucide-react";

const EASE = [0.16, 1, 0.3, 1];

/* The dashboard's front door, kept deliberately quiet.
 *
 * It used to read like a telemetry export: six interactive stat tiles (each one
 * opening yet another explanatory dialog stuffed with label rows) plus the
 * checklist and the quick actions. All the numbers a member actually checks are
 * on Stats and Badges, so this page now shows one compact strip of facts —
 * username, tier, views, badges — and the two things worth doing from here:
 * finish the profile, and connect Discord.
 */
const Reveal = ({ children, delay = 0, className = "" }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay, ease: EASE }}
    className={className}
  >
    {children}
  </motion.div>
);

const SectionTitle = ({ children, action }) => (
  <div className="mb-5 flex items-center justify-between gap-3">
    <h2 className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight text-zinc-100">
      {/* A short accent bar — the quiet way to brand a heading without a wall
          of shouting the page used to lack entirely. */}
      <span className="h-5 w-1 rounded-full bg-gradient-to-b from-brand-400 to-brand-600" />
      {children}
    </h2>
    {action}
  </div>
);

const CheckRow = ({ icon: Icon, label, done, to }) => (
  <Link
    to={to}
    className="group flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-3 outline-none transition-colors duration-200 hover:border-white/10 hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-brand-500/50"
  >
    <Icon className={`h-4 w-4 shrink-0 ${done ? "text-brand-400/70" : "text-zinc-500"}`} />
    <span className={`min-w-0 flex-1 truncate text-sm ${done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
      {label}
    </span>
    <span
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors duration-300 ${
        done ? "bg-emerald-500 text-white" : "border border-zinc-700 text-transparent"
      }`}
    >
      <Check className="h-3 w-3" />
    </span>
  </Link>
);

const QuickAction = ({ icon: Icon, label, onClick, testid }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testid}
    className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-zinc-200 outline-none transition-colors duration-200 hover:border-brand-400/25 hover:bg-brand-500/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-500/50"
  >
    <Icon className="h-4 w-4 shrink-0 text-zinc-400 transition-colors duration-200 group-hover:text-brand-300" />
    <span className="min-w-0 flex-1 truncate">{label}</span>
    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-300" />
  </button>
);

/* One quiet fact chip. No click target, no dialog behind it, no sub-caption —
 * the value and its label are the whole story. */
const StatChip = ({ icon: Icon, label, value, to, testid }) => {
  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-brand-300/80" />
      <span className="truncate font-display text-lg font-extrabold tabular-nums text-zinc-50">
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
      <span className="truncate font-mono2 text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
    </>
  );
  // A gradient tile with a hover lift: the flat near-black boxes made the top
  // of the page read as a spreadsheet header. The accent glow only wakes on
  // hover so the strip stays quiet by default.
  const cls =
    "flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-transparent px-4 py-3 shadow-[0_4px_18px_rgba(0,0,0,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400/25 hover:shadow-[0_10px_28px_rgba(255,127,188,0.10)]";
  return to ? (
    <Link to={to} className={`${cls} outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50`} data-testid={testid}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-testid={testid}>{body}</div>
  );
};

export default function Overview() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  /* The leaderboard position, read from the endpoint that computes it in SQL
     rather than by finding this account in a 100-row page: your position on the
     board and the position a visitor sees on your profile are then the same
     number, even when you are far outside the loaded window. */
  const [placement, setPlacement] = useState(null);

  useEffect(() => {
    api.get("/me/leaderboard")
      .then(({ data }) => setPlacement(data || null))
      .catch(() => {});
  }, [user.username]);

  const rank = placement?.rank ? `#${placement.rank}` : "—";

  const p = user.profile || {};
  const links = p.links || [];
  const ownedBadges = user.badges || [];
  const equipped = user.equipped_badges || [];

  const checklist = [
    { icon: UserRound, label: "Upload an avatar", done: !!p.avatar_url, to: "/!/dashboard/editor" },
    { icon: ImageIcon, label: "Add a background", done: !!p.background_url, to: "/!/dashboard/editor" },
    { icon: AtSign, label: "Write your bio", done: !!p.bio, to: "/!/dashboard/editor" },
    { icon: Award, label: "Unlock a badge", done: ownedBadges.length > 0, to: "/!/dashboard/badges" },
    { icon: Eye, label: "Reach 10 profile views", done: (user.views || 0) >= 10, to: "/!/dashboard/stats" },
    { icon: FaDiscord, label: "Link Discord account", done: !!user.discord?.linked, to: "/!/dashboard" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checklist.length) * 100);

  const linkDiscord = async () => {
    try {
      const token = localStorage.getItem("swats_token");
      const { data } = await api.get("/auth/discord/login", { params: { mode: "link", token } });
      window.location.href = data.url;
    } catch {
      toast.error("Could not start Discord link");
    }
  };

  const tierLabel = user.tier === "admin" ? "Admin" : user.tier === "premium" ? "Premium" : "Free";

  /* ----------------------------- Redeem invite code --------------------------
   * The card a fresh signup is promised: paste an invite code *after*
   * registering and the account's tier moves — permanently, or for the number
   * of days the admin put on the code — and/or the badges the code carries
   * (Verified, Media, OG, …) are added to the shelf. It is shown to every
   * account, admins included: an admin can hold a badge-carrying code too, and
   * hiding the box from them is exactly why they could never find it.
   * ------------------------------------------------------------------------- */
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const redeemPremium = async (e) => {
    e.preventDefault();
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    try {
      const { data } = await api.post("/me/redeem-invite", { code: redeemCode.trim() });
      // The tier rode in the old JWT; the fresh one the backend mints keeps the
      // session reading Premium immediately.
      if (data.token) setToken(data.token);
      if (data.user) setUser(data.user);
      setRedeemCode("");
      const unlocked = [
        data.premium_days
          ? `Premium for ${data.premium_days} day${data.premium_days === 1 ? "" : "s"}`
          : data.premium_days === null && data.user?.tier === "premium"
            ? "Permanent Premium"
            : null,
        (data.badges_added || []).length
          ? `${data.badges_added.length} badge${data.badges_added.length === 1 ? "" : "s"}`
          : null,
      ].filter(Boolean);
      toast.success(unlocked.length ? `${unlocked.join(" + ")} unlocked! 🎉` : "Code redeemed!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not redeem that code");
    }
    setRedeeming(false);
  };

  const trialEnds = user.premium_until ? new Date(user.premium_until).toLocaleDateString() : null;

  return (
    <div className="space-y-8" data-testid="overview-page">
      {/* The facts, one quiet strip: profile, tier, views, badges, rank. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatChip
          icon={AtSign}
          label="Profile"
          value={`@${user.username}`}
          to={`/${user.username}`}
          testid="stat-username"
        />
        <StatChip icon={Crown} label="Tier" value={tierLabel} to="/!/pricing" testid="stat-tier" />
        <StatChip icon={Eye} label="Views" value={user.views || 0} to="/!/dashboard/stats" testid="stat-views" />
        <StatChip
          icon={Award}
          label="Badges"
          value={ownedBadges.length}
          to="/!/dashboard/badges"
          testid="stat-badges"
        />
        <StatChip icon={ShieldCheck} label="Rank" value={rank} to="/!/dashboard/leaderboard" testid="stat-rank" />
      </div>

      {/* Rank and the badges behind it, then the page itself. The rank box sits
          above the checklist because it is the summary of all of it: the
          checklist is how you move the rank. */}
      <section>
        <SectionTitle
          action={
            <Link
              to="/!/dashboard/leaderboard"
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-zinc-200 outline-none transition-colors duration-200 hover:border-brand-400/30 hover:bg-brand-500/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              Leaderboard <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          Your standing
        </SectionTitle>
        <RankCard />
      </section>

      {/* Getting the page finished */}
      <section>
        <SectionTitle
          action={
            <Link
              to="/!/dashboard/editor"
              data-testid="analytics-view-more"
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-zinc-200 outline-none transition-colors duration-200 hover:border-brand-400/30 hover:bg-brand-500/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              Open the editor <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          Finish your profile
        </SectionTitle>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Reveal delay={0.05}>
            <div className="rounded-3xl p-5 glass" data-testid="completion-card">
              <div className="flex items-center gap-3">
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <motion.div
                    className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-brand-500 to-brand-400"
                    initial={{ width: "0%" }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
                  />
                </div>
                <span className="shrink-0 font-mono2 text-xs text-brand-300">{pct}%</span>
              </div>

              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {checklist.map((c) => (
                  <CheckRow key={c.label} {...c} />
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="space-y-5" data-testid="connect-card">
              {/* Redeem — the invite-code door, right on the front page. */}
              <div className="rounded-3xl p-5 glass" data-testid="redeem-premium-card">
                  <h3 className="flex items-center gap-2 font-display text-base font-bold text-zinc-100">
                    <Sparkles className="h-4 w-4 text-brand-300" /> Redeem invite code
                  </h3>
                  <p className="mt-1 text-xs text-zinc-400">
                    Have an invite code? Paste it here to unlock Premium and the
                    badges the code carries.
                  </p>
                  <form onSubmit={redeemPremium} className="mt-3 flex gap-2">
                    <input
                      type="text"
                      data-testid="redeem-premium-input"
                      value={redeemCode}
                      onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                      placeholder="SWATS-XXXXXX"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 font-mono2 text-sm uppercase tracking-wide text-zinc-100 placeholder-zinc-600 outline-none focus:border-brand-500/50"
                    />
                    <button
                      type="submit"
                      disabled={redeeming || !redeemCode.trim()}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-40"
                    >
                      {redeeming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crown className="h-3.5 w-3.5" />}
                      Redeem
                    </button>
                  </form>
                  {user.tier === "premium" && (
                    <p className="mt-2 text-[11px] text-brand-200">
                      {trialEnds ? `Your Premium trial runs until ${trialEnds}.` : "You have Premium."}
                    </p>
                  )}
                </div>

              {/* Account shortcuts */}
              <div className="rounded-3xl p-5 glass">
                <h3 className="font-display text-base font-bold text-zinc-100">Account</h3>
                <div className="mt-4 space-y-2.5">
                  <QuickAction
                    icon={Pencil}
                    label="Change Username"
                    testid="qa-username"
                    onClick={() => navigate("/!/dashboard/settings")}
                  />
                  <QuickAction icon={LayoutTemplate} label="Customize" testid="qa-layout" onClick={() => navigate("/!/dashboard/templates")} />
                  <QuickAction icon={Settings} label="Settings" testid="qa-settings" onClick={() => navigate("/!/dashboard/settings")} />
                </div>
              </div>

              {/* The single live connection */}
              <div className="rounded-3xl p-5 glass">
                <h3 className="font-display text-base font-bold text-zinc-100">Connections</h3>
                <p className="mt-1 text-xs text-zinc-400">Connect your accounts to swats.bio</p>

                <div className="mt-4">
                  {user.discord?.linked ? (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] pl-3 pr-3 py-2.5">
                      <FaDiscord className="h-4 w-4 shrink-0 text-brand-200" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">
                        {user.discord.username ? `@${user.discord.username}` : "Discord"}
                      </span>
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={linkDiscord}
                      data-testid="connect-discord-btn"
                      className="flex w-full items-center gap-2 rounded-xl border border-brand-400/30 bg-brand-500/12 px-3 py-2.5 text-sm font-semibold text-zinc-100 outline-none transition-colors duration-200 hover:bg-brand-500/20 focus-visible:ring-2 focus-visible:ring-brand-500/60"
                    >
                      <FaDiscord className="h-4 w-4 shrink-0 text-brand-200" />
                      Connect Discord
                    </button>
                  )}
                  {equipped.length > 0 && (
                    <p className="mt-2 text-[11px] text-zinc-500">
                      {equipped.length} badge{equipped.length === 1 ? "" : "s"} showing on your public page.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

/* A tiny loading affordance some pages embed. Kept out of the default tree;
 * defined here so the module stays import-compatible for older callers. */
export const OverviewSpinner = () => <Loader2 className="h-4 w-4 animate-spin text-brand-400" />;
