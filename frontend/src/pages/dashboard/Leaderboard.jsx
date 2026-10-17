import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { BADGE_META } from "@/constants/badges";
import { Trophy, Eye, Crown, Search, Users, Award, Target, ExternalLink } from "lucide-react";
import { PageHeader, EmptyState, SkeletonRows } from "@/components/ui-shared/PageUI";
import { SmartSelect } from "@/components/ui-shared/SmartSelect";
import { BadgeChip } from "@/components/BadgeChip";

const SORTS = [
  { value: "views", label: "Most viewed" },
  { value: "badges", label: "Most badges" },
  { value: "newest", label: "Newest" },
  { value: "name", label: "A–Z" },
];

/* Medal treatment for the top three — a rank number alone made first place look
   identical to fourth. */
const MEDAL = {
  0: "from-amber-300/25 to-amber-500/5 border-amber-400/40 text-amber-300",
  1: "from-zinc-200/20 to-zinc-400/5 border-zinc-300/30 text-zinc-200",
  2: "from-orange-400/20 to-orange-600/5 border-orange-400/30 text-orange-300",
};

/* The board's own ordering, repeated here: most views first, then username.
   It has to match the API's `ORDER BY views DESC, LOWER(username) ASC` — a
   tie-broken client sort is what keeps a row's printed rank equal to the rank
   the server would give it, even when two profiles share a view count. */
const byViews = (a, b) =>
  (b.views || 0) - (a.views || 0) ||
  String(a.username || "").localeCompare(String(b.username || ""), undefined, { sensitivity: "base" });

const byName = (a, b) =>
  String(a.display_name || a.username || "").localeCompare(
    String(b.display_name || b.username || ""),
    undefined,
    { sensitivity: "base" },
  );

const whenOf = (u) => {
  const t = Date.parse(u?.created_at || "");
  return Number.isFinite(t) ? t : 0;
};

export default function Leaderboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [mine, setMine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("views");

  useEffect(() => {
    let alive = true;
    api
      .get("/leaderboard")
      .then(({ data }) => {
        if (alive) setRows(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (alive) setRows([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    /* Where the signed-in account sits is a separate question with a separate
       answer: it is knowable even when the account is nowhere near the top 100
       the board itself loads. It is allowed to fail quietly — a signed-out
       visitor simply has no rank, and that is not an error worth a toast. */
    api
      .get("/me/leaderboard", { silent: true })
      .then(({ data }) => {
        if (alive && data && typeof data.rank === "number") setMine(data);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  /* The API ships every row's board rank. A payload without one (an older
     backend, a cached response) falls back to the row's position in the list,
     which is the same number because the API answers in rank order. */
  const rankOf = useMemo(() => {
    const fromApi = new Map();
    rows.forEach((u, i) => fromApi.set(u.username, Number(u.rank) || i + 1));
    return (u) => Number(u?.rank) || fromApi.get(u?.username) || null;
  }, [rows]);

  // The widest row on the board, for the share bars below. Only the loaded
  // window is known, so the bar reads as "relative to the top profile" rather
  // than as an absolute percentage of the site.
  const topViews = useMemo(
    () => rows.reduce((max, u) => Math.max(max, Number(u.views) || 0), 1),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (u) =>
            String(u.username || "").toLowerCase().includes(q) ||
            String(u.display_name || "").toLowerCase().includes(q),
        )
      : rows;

    const sorted = [...filtered];
    if (sort === "name") sorted.sort(byName);
    else if (sort === "badges") sorted.sort((a, b) => (b.badges?.length || 0) - (a.badges?.length || 0) || byViews(a, b));
    else if (sort === "newest") sorted.sort((a, b) => whenOf(b) - whenOf(a) || byViews(a, b));
    else sorted.sort(byViews);
    return sorted;
  }, [rows, query, sort]);

  // The podium is only honest on the untouched "who is actually top" view, and
  // only when there are three people to put on it. The rows below used to be
  // sliced by `podium.length` rather than by whether the podium was actually
  // rendered, so a leaderboard with one or two members hid every row and
  // announced "Top 3 shown above" over an empty list.
  const showPodium = !query.trim() && sort === "views" && visible.length >= 3;
  const podium = showPodium ? visible.slice(0, 3) : [];
  const listRows = showPodium ? visible.slice(3) : visible;

  // The API answers with a flattened `avatar_url` (see routes/public.js), not a
  // nested profile — reading `u.profile.avatar_url` meant every row and every
  // podium slot fell through to the initial letter, so nobody's picture showed.
  // The nested form is still honoured for anything that sends a whole user.
  const avatarOf = (u) => fileUrl(u?.avatar_url || u?.profile?.avatar_url || "");

  const badgeRow = (u, size = "sm") => (
    <div className="flex items-center gap-1">
      {(u.badges || []).slice(0, 4).map((b) => (
        <BadgeChip key={b} id={b} meta={BADGE_META[b]} size={size} />
      ))}
    </div>
  );

  const avatarBox = (u, className) => (
    <div className={`shrink-0 overflow-hidden rounded-full bg-zinc-800 ${className}`}>
      {avatarOf(u) ? (
        <img
          src={avatarOf(u)}
          alt={`${u.display_name || u.username} avatar`}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-bold text-zinc-400">
          {(u.display_name || u.username || "?")[0]?.toUpperCase()}
        </span>
      )}
    </div>
  );

  // Rank of the signed-in account: the exact one from the API when we have it,
  // otherwise the rank of their row if they happen to be on this page.
  const myLoaded = rows.find((u) => u.username === user?.username);
  const myRank = mine?.rank ?? (myLoaded ? rankOf(myLoaded) : null);
  const totalRanked = mine?.total || null;

  return (
    <div data-testid="leaderboard-page">
      <PageHeader
        icon={Trophy}
        title="Leaderboard"
        subtitle="The most-viewed profiles on swats.bio. Views are counted on real, dwelled visits only."
        actions={
          <SmartSelect
            testid="leaderboard-sort"
            ariaLabel="Sort leaderboard"
            value={sort}
            onChange={setSort}
            options={SORTS}
          />
        }
      />

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="leaderboard-search"
          placeholder="Search by name or @username…"
          className="w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-sm text-zinc-100 outline-none transition-colors duration-200 placeholder:text-zinc-600 focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      {/* Your own standing, before the board. Reading your rank off a list of a
          hundred strangers was the one thing this page could not do — and for
          most accounts the honest answer is "you are not in the top 100", which
          is exactly what this line says. */}
      {typeof myRank === "number" ? (
        <div
          data-testid="leaderboard-my-rank"
          className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-brand-500/25 bg-brand-500/[0.07] px-4 py-3 text-xs text-zinc-300"
        >
          <span className="inline-flex items-center gap-1.5 font-semibold text-brand-200">
            <Target className="h-3.5 w-3.5" /> You are #{myRank.toLocaleString()}
          </span>
          {totalRanked ? <span className="text-zinc-400">of {totalRanked.toLocaleString()} profiles</span> : null}
          {mine?.percentile ? (
            <span className="rounded-full bg-brand-500/15 px-2 py-0.5 font-mono2 text-[10px] font-bold uppercase tracking-wide text-brand-200">
              Top {mine.percentile}%
            </span>
          ) : null}
          <span className="ml-auto text-zinc-500">
            {(mine?.views ?? myLoaded?.views ?? 0).toLocaleString()} views
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="glass overflow-hidden rounded-3xl">
          <SkeletonRows rows={6} />
        </div>
      ) : visible.length === 0 ? (
        <div className="glass overflow-hidden rounded-3xl">
          <EmptyState
            icon={rows.length === 0 ? Users : Search}
            title={rows.length === 0 ? "No ranked profiles yet" : "No profiles match that search"}
            hint={
              rows.length === 0
                ? "Be the first — claim your link and start collecting views."
                : "Try a different name or clear the search."
            }
          />
        </div>
      ) : (
        <>
          {showPodium && (
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              {podium.map((u, i) => (
                <Link
                  key={u.username}
                  to={`/${encodeURIComponent(u.username)}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`group relative overflow-hidden rounded-3xl border bg-gradient-to-b p-5 text-center transition duration-200 hover:brightness-110 ${MEDAL[i]}`}
                  data-testid={`leaderboard-podium-${i}`}
                >
                  <div className="mb-1 font-display text-3xl font-black">#{rankOf(u) || i + 1}</div>
                  <div className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-white/10">
                    {avatarOf(u) ? (
                      <img
                        src={avatarOf(u)}
                        alt={`${u.display_name || u.username} avatar`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-lg font-bold text-zinc-400">
                        {(u.display_name || u.username || "?")[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-sm font-bold text-zinc-50">{u.display_name}</div>
                  <div className="truncate font-mono2 text-[11px] text-zinc-500">@{u.username}</div>
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-zinc-200">
                    <Eye className="h-3.5 w-3.5 text-zinc-500" />
                    {(u.views || 0).toLocaleString()}
                  </div>
                  <div className="mt-2 flex justify-center">{badgeRow(u)}</div>
                  <ExternalLink className="absolute right-3 top-3 h-3.5 w-3.5 text-zinc-400 opacity-0 transition group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          )}

          <div className="glass overflow-hidden rounded-3xl">
            {listRows.map((u, i) => {
              const rank = rankOf(u) || (showPodium ? i + 4 : i + 1);
              const mineRow = u.username === user?.username;
              const share = Math.max(2, Math.round(((Number(u.views) || 0) / topViews) * 100));
              return (
                <Link
                  key={u.username}
                  to={`/${encodeURIComponent(u.username)}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open @${u.username}'s profile`}
                  data-testid={`leaderboard-row-${i}`}
                  /* Right-click: open the profile or copy the handle, instead of
                     the universal menu every bare element used to get. */
                  data-menu-id="user"
                  data-menu-name={u.username}
                  className={`group relative flex items-center gap-4 border-b border-white/5 p-5 last:border-b-0 transition-colors duration-200 hover:bg-white/[0.04] ${
                    mineRow ? "bg-brand-500/[0.07]" : ""
                  }`}
                >
                  <div
                    className={`w-9 shrink-0 text-center font-display font-black ${
                      rank <= 3 ? "text-amber-400" : "text-zinc-600"
                    }`}
                  >
                    #{rank}
                  </div>
                  {avatarBox(u, "h-11 w-11")}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate text-sm font-semibold text-zinc-100">
                      <span className="truncate">{u.display_name}</span>
                      {mineRow && (
                        <span className="shrink-0 rounded-full bg-brand-500/20 px-2 py-0.5 text-[9px] font-bold uppercase text-brand-200">
                          You
                        </span>
                      )}
                      {u.tier !== "free" && <Crown className="h-3.5 w-3.5 shrink-0 text-brand-400" />}
                    </div>
                    <div className="truncate font-mono2 text-xs text-zinc-500">@{u.username}</div>
                    {/* How far ahead of the pack this row is, drawn instead of
                        described: the bar is relative to the top profile. */}
                    <div className="mt-2 h-[3px] w-full max-w-[16rem] overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        data-testid={`leaderboard-share-${i}`}
                        className="h-full rounded-full bg-gradient-to-r from-brand-500/70 to-brand-400/40"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                  <div className="hidden sm:block">{badgeRow(u)}</div>
                  <div className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums text-zinc-300">
                    <Eye className="h-4 w-4 text-zinc-500" />
                    {(u.views || 0).toLocaleString()}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition group-hover:text-brand-300" />
                </Link>
              );
            })}
            {listRows.length === 0 && showPodium && (
              <EmptyState
                icon={Award}
                title="Top 3 shown above"
                hint="Everyone else appears here as views come in."
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
