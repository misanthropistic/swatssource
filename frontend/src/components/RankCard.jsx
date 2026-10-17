import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, ChevronRight, Loader2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { BadgeChip } from "@/components/BadgeChip";
import { badgeMeta, eventOfBadge, EVENT_BADGE_ART } from "@/constants/badges";

/* ---------------------------------------------------------------------------
   The rank box

   One box on the overview that answers "where am I, and what am I working
   towards": the rank, how far into it, what the next one costs, and the badges
   that helped get there. The badges are the point — a rank is a summary of
   them, so the shelf sits inside the same box rather than on another page.

   Everything is read from /me/rank, which derives it from the account on the
   fly (backend/ranks.js); nothing here recomputes the curve, so the number the
   server would report to anyone else is the number shown here.

   A failed read must not look like a rank of zero: the box says it could not
   load instead of drawing an empty bar, because "Rookie, 0 XP" is a claim about
   the account and an error is not.
   --------------------------------------------------------------------------- */

const RANK_FALLBACK = { name: "Rookie", color: "#a1a1aa", blurb: "" };

const Bar = ({ percent, color }) => (
  <div
    className="h-2 w-full overflow-hidden rounded-full bg-white/[0.07]"
    role="progressbar"
    aria-valuenow={percent}
    aria-valuemin={0}
    aria-valuemax={100}
    data-testid="rank-progress"
    data-percent={percent}
  >
    <div
      className="h-full rounded-full transition-[width] duration-700"
      style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: `linear-gradient(90deg, ${color}, #FF7FBC)` }}
    />
  </div>
);

/* The seasonal badge that can be earned next, or the one live right now. It is
   the only thing in the box that is about the future, which is why it gets the
   quieter type. */
const NextEvent = ({ events }) => {
  const entry = events.find((e) => e.live) || events[0];
  if (!entry) return null;
  return (
    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-500" data-testid="rank-next-event">
      <Sparkles className="h-3 w-3 shrink-0 text-amber-300/80" />
      {entry.live ? (
        <>
          <span className="text-amber-200/90">{entry.hint}</span>
          <span>— earn it now</span>
        </>
      ) : (
        <>
          {entry.hint}
          {typeof entry.opensInDays === "number" ? ` — in ${entry.opensInDays} day${entry.opensInDays === 1 ? "" : "s"}` : ""}
        </>
      )}
    </p>
  );
};

/* The seasonal calendar, drawn as the badges themselves. The box used to name
   one event in a single grey line, which read as "there is no event system" —
   the calendar exists on the server (backend/eventBadges.js) and is handed to
   this component, so all three windows are shown: live, opening in N days, or
   already earned by this account. */
const SEASONAL = Object.entries(EVENT_BADGE_ART).map(([id, meta]) => ({ id, ...meta }));
const eventArt = (id) => {
  const base = EVENT_BADGE_ART[String(id || "").split("_")[0]];
  return base ? `${process.env.PUBLIC_URL || ""}/badges/${base.src}` : "";
};

const EventShelf = ({ events, owned }) => {
  // No calendar from the server (an older backend, or the read failed): the
  // static catalogue still belongs on the card, so the seasonal badges are
  // visible even when the numbers are not.
  const rows = events.length
    ? events.map((e) => ({
        id: e.id,
        label: e.label || EVENT_BADGE_ART[e.id]?.label || e.id,
        art: badgeMeta(e.badgeId)?.art?.src || eventArt(e.id),
        live: !!e.live,
        opensInDays: e.opensInDays,
        earned: !!e.badgeId && owned.includes(e.badgeId),
      }))
    : SEASONAL.map((e) => ({ id: e.id, label: e.label, art: eventArt(e.id), live: false, opensInDays: null, earned: false }));

  if (!rows.length) return null;

  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3" data-testid="rank-event-calendar">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono2 text-[10px] uppercase tracking-wider text-zinc-500">
          <Sparkles className="h-3 w-3" /> Seasonal
        </span>
        <Link
          to="/!/dashboard/badges"
          className="text-[11px] font-semibold text-brand-300 outline-none hover:text-brand-200 focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          All events
        </Link>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {rows.map((e) => (
          <div
            key={e.id}
            data-testid={`rank-event-${e.id}`}
            data-live={e.live ? "true" : undefined}
            className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${
              e.live ? "border-amber-400/30 bg-amber-400/[0.06]" : "border-white/[0.06] bg-white/[0.02]"
            }`}
          >
            {e.art ? <img src={e.art} alt="" className="h-6 w-6 shrink-0 object-contain" /> : null}
            <span className="min-w-0">
              <span className="block truncate text-[10px] font-bold text-zinc-200">{e.label}</span>
              <span className={`block font-mono2 text-[9px] ${e.live ? "text-amber-300" : "text-zinc-500"}`}>
                {e.earned ? "Earned" : e.live ? "Live now" : typeof e.opensInDays === "number" ? `in ${e.opensInDays}d` : "—"}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function RankCard() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  // The calendar on its own, for when the rank read fails: the season is a
  // public fact, so a broken /me/rank must not turn the whole box into dashes.
  const [events, setEvents] = useState([]);
  // Bumped by the retry button: the effect re-runs and the box goes back to its
  // working state instead of staying on the error line until a page reload.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    api
      .get("/me/rank")
      .then(({ data: d }) => {
        if (alive) setData(d || {});
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        // Public endpoint, no session needed — the rows then say "Live now" /
        // "in 45d" instead of an em dash, even though the rank is unknown.
        api
          .get("/badges/events")
          .then(({ data: list }) => {
            if (alive && Array.isArray(list)) setEvents(list);
          })
          .catch(() => {});
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const rank = data?.rank || RANK_FALLBACK;
  const next = data?.next || null;
  const badges = Array.isArray(data?.badges) ? data.badges : [];
  const equipped = Array.isArray(data?.equipped_badges) ? data.equipped_badges : [];
  // Equipped order first (that is the order the profile shows), then anything
  // owned but not shown. The box is a record of what was earned, not a preview
  // of the card, so a badge nobody equipped still appears.
  const shelf = [...new Set([...equipped, ...badges])];

  if (failed) {
    return (
      <div className="glass rounded-3xl p-5" data-testid="rank-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-zinc-100">Rank</h3>
            <p className="mt-2 text-xs text-zinc-500" data-testid="rank-unavailable">
              Could not load your rank just now.
            </p>
          </div>
          <button
            type="button"
            onClick={retry}
            data-testid="rank-retry"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition-colors duration-200 hover:border-brand-400/30 hover:bg-brand-500/10 hover:text-white"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
        {/* The season does not depend on that read: the calendar is a fixed
            catalogue, so an error cannot take the event system off the page. */}
        <NextEvent events={events} />
        <EventShelf events={events} owned={[]} />
      </div>
    );
  }

  return (
    <div className="glass rounded-3xl p-5" data-testid="rank-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-zinc-100">Rank</h3>
          {data ? (
            <p className="mt-1 text-xs text-zinc-400" data-testid="rank-blurb">
              {rank.blurb}
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Working it out…
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{ background: `${rank.color}22`, boxShadow: `inset 0 0 0 1px ${rank.color}55` }}
          >
            <TrendingUp className="h-4 w-4" style={{ color: rank.color }} />
          </span>
          <div className="text-right">
            <div
              className="font-display text-lg font-extrabold leading-none"
              style={{ color: rank.color }}
              data-testid="rank-name"
            >
              {rank.name}
            </div>
            <div className="font-mono2 text-[10px] uppercase tracking-wider text-zinc-500" data-testid="rank-xp">
              {data ? `${Number(data.xp || 0).toLocaleString()} XP` : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Bar percent={data?.percent || 0} color={rank.color} />
        <div className="mt-2 flex items-baseline justify-between gap-3 text-[11px]">
          <span className="text-zinc-500" data-testid="rank-progress-label">
            {!data
              ? " "
              : next
                ? `${data.percent}% to ${next.name}`
                : "Top rank reached"}
          </span>
          {data && (
            <span className="font-mono2 text-zinc-400" data-testid="rank-to-next">
              {next ? `${Number(data.toNext || 0).toLocaleString()} XP to go` : "—"}
            </span>
          )}
        </div>
      </div>

      {/* The shelf. */}
      <div className="mt-4 border-t border-white/[0.06] pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-mono2 text-[10px] uppercase tracking-wider text-zinc-500">
            <Award className="h-3 w-3" /> Badges
          </span>
          <Link
            to="/!/dashboard/badges"
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand-300 outline-none hover:text-brand-200 focus-visible:ring-2 focus-visible:ring-brand-500/50"
            data-testid="rank-badges-link"
          >
            {badges.length} earned <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {data && shelf.length === 0 ? (
          <p className="mt-2 text-[11px] text-zinc-500" data-testid="rank-no-badges">
            No badges yet — the first one is the easiest.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="rank-badge-shelf">
            {shelf.slice(0, 14).map((id) => (
              <BadgeChip
                key={id}
                id={id}
                title={badgeMeta(id)?.label || id}
                size="lg"
                glow
                glowColor={badgeMeta(id)?.color || "#FF7FBC"}
                data-seasonal={eventOfBadge(id) ? "true" : undefined}
              />
            ))}
            {shelf.length > 14 && (
              <span className="font-mono2 text-[10px] text-zinc-500">+{shelf.length - 14}</span>
            )}
          </div>
        )}
      </div>

      {data && <NextEvent events={Array.isArray(data.events) ? data.events : []} />}
      {data && <EventShelf events={Array.isArray(data.events) ? data.events : []} owned={shelf} />}
    </div>
  );
}
