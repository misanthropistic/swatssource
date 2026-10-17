import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, Eye, Gift, Loader2, Lock, Sparkles, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const EASE = [0.16, 1, 0.3, 1];

const Card = ({ children, className = "", delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45, delay, ease: EASE }}
    className={`rounded-3xl glass p-5 sm:p-6 ${className}`}
  >
    {children}
  </motion.div>
);

const fmt = (n) => Number(n || 0).toLocaleString();

export default function Rewards() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api.get("/me/rewards")
      .then(({ data: body }) => { if (alive) setData(body); })
      .catch((err) => { if (alive) setError(err.response?.data?.detail || "Could not load rewards"); });
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <div className="rounded-3xl glass p-8 text-center text-sm text-red-300" data-testid="rewards-error">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex justify-center py-24" data-testid="rewards-loading">
        <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
      </div>
    );
  }

  const next = data.next;
  const pct = next ? Math.min(100, Math.round((data.views / next.views) * 100)) : 100;
  const premiumUntil = data.premium_until ? new Date(data.premium_until) : null;

  return (
    <div className="space-y-7" data-testid="rewards-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 font-mono2 text-[10px] uppercase tracking-widest text-brand-300">
            <Gift className="h-3.5 w-3.5" /> View rewards
          </div>
          <h1 className="mt-3 font-display text-3xl font-black text-zinc-50">Rewards</h1>
          <p className="mt-1.5 max-w-xl text-sm text-zinc-500">
            Every validated view on your page moves your lifetime total. Crossing a milestone
            grants Premium time automatically — once per milestone, on real views only.
          </p>
        </div>
        <Link
          to="/!/dashboard/stats"
          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-brand-400/30 hover:bg-brand-500/10"
        >
          <Eye className="h-3.5 w-3.5" /> View stats
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card delay={0.02}>
          <div className="flex items-center gap-2 text-xs text-zinc-500"><Eye className="h-4 w-4 text-brand-300" /> Lifetime views</div>
          <div className="mt-2 font-display text-3xl font-black tabular-nums text-zinc-50" data-testid="rewards-views">
            {fmt(data.views)}
          </div>
        </Card>
        <Card delay={0.06}>
          <div className="flex items-center gap-2 text-xs text-zinc-500"><Crown className="h-4 w-4 text-brand-300" /> Tier</div>
          <div className="mt-2 font-display text-3xl font-black capitalize text-zinc-50" data-testid="rewards-tier">
            {data.tier === "admin" ? "Admin" : data.tier || "free"}
          </div>
          {premiumUntil ? (
            <div className="mt-1 text-[11px] text-brand-200">
              Premium until {premiumUntil.toLocaleDateString()}
            </div>
          ) : null}
        </Card>
        <Card delay={0.1}>
          <div className="flex items-center gap-2 text-xs text-zinc-500"><Trophy className="h-4 w-4 text-brand-300" /> Milestones claimed</div>
          <div className="mt-2 font-display text-3xl font-black tabular-nums text-zinc-50" data-testid="rewards-claimed">
            {data.claimed.length}
            <span className="text-base font-semibold text-zinc-600">/{data.milestones.length}</span>
          </div>
        </Card>
      </div>

      {!data.enabled ? (
        <Card className="text-center" data-testid="rewards-disabled">
          <Sparkles className="mx-auto h-7 w-7 text-zinc-600" />
          <h2 className="mt-3 font-display text-lg font-bold text-zinc-100">View rewards are paused</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-500">
            Staff have not configured any milestones right now. Your views still count and the
            leaderboard still ranks you — rewards simply are not being granted at the moment.
          </p>
        </Card>
      ) : next ? (
        <Card className="border border-brand-500/25 bg-gradient-to-br from-brand-500/[0.12] to-transparent" data-testid="rewards-next">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono2 text-[10px] uppercase tracking-widest text-brand-300">Next reward</div>
              <h2 className="mt-1 font-display text-xl font-black text-zinc-50">
                {next.premium_days} day{next.premium_days === 1 ? "" : "s"} of Premium at {fmt(next.views)} views
              </h2>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl font-black tabular-nums text-brand-200">{pct}%</div>
              <div className="text-[11px] text-zinc-500">{fmt(data.remaining)} views to go</div>
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.9, ease: EASE }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono2 text-[10px] text-zinc-500">
            <span>{fmt(data.views)} views</span>
            <span>{fmt(next.views)} views</span>
          </div>
        </Card>
      ) : data.milestones.length ? (
        <Card className="border border-emerald-500/25 bg-emerald-500/[0.06]" data-testid="rewards-all-claimed">
          <h2 className="font-display text-lg font-bold text-emerald-200">Every milestone claimed</h2>
          <p className="mt-1 text-sm text-emerald-100/70">
            You have crossed all {data.milestones.length} configured milestones. Nothing left to collect.
          </p>
        </Card>
      ) : null}

      <div>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-zinc-100">
          <span className="h-5 w-1 rounded-full bg-gradient-to-b from-brand-400 to-brand-600" />
          Milestone ladder
        </h2>
        {(data.milestones || []).length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-8 text-center text-sm text-zinc-500">
            No milestones have been configured yet.
          </div>
        ) : (
          <ol className="space-y-2" data-testid="rewards-ladder">
            {data.milestones.map((m) => {
              const reached = data.views >= m.views;
              return (
                <li
                  key={m.views}
                  data-testid={`reward-milestone-${m.views}`}
                  className={`flex items-center gap-4 rounded-2xl border px-4 py-3.5 transition ${
                    m.claimed
                      ? "border-emerald-500/25 bg-emerald-500/[0.06]"
                      : reached
                        ? "border-brand-400/30 bg-brand-500/[0.07]"
                        : "border-white/5 bg-white/[0.02]"
                  }`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                    m.claimed ? "bg-emerald-500/15 text-emerald-300" : reached ? "bg-brand-500/20 text-brand-200" : "bg-white/5 text-zinc-500"
                  }`}>
                    {m.claimed ? <Crown className="h-4 w-4" /> : reached ? <Gift className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-zinc-100">
                      {fmt(m.views)} views · {m.premium_days} day{m.premium_days === 1 ? "" : "s"} of Premium
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
                      <div
                        className={`h-full rounded-full ${m.claimed ? "bg-emerald-400" : "bg-brand-400"}`}
                        style={{ width: `${m.claimed ? 100 : Math.min(100, m.progress)}%` }}
                      />
                    </div>
                  </div>
                  <span className={`shrink-0 font-mono2 text-[10px] uppercase tracking-wider ${
                    m.claimed ? "text-emerald-300" : reached ? "text-brand-200" : "text-zinc-500"
                  }`}>
                    {m.claimed ? "Claimed" : reached ? "Unclaimed" : `${Math.min(100, m.progress)}%`}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Views are counted only after a real visitor passes the view challenge; refreshing or
        scripted traffic is not counted. Rewards are granted once per milestone per account, and a
        running Premium period is extended rather than replaced. Signed in as @{user?.username}.
      </p>
    </div>
  );
}
