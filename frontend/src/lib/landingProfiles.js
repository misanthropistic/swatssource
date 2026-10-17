import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/* ---------------------------------------------------------------------------
   One leaderboard read for the whole landing page.

   Two bands now draw from real profiles — the full-size showcase and the live
   widgets — and neither should cost the visitor its own copy of the same
   queries. The in-flight promise is cached at module scope, so however many
   components ask, the leaderboard and its profile payloads are fetched once.
   --------------------------------------------------------------------------- */

const cache = new Map(); // limit -> { promise }

function load(limit) {
  const hit = cache.get(limit);
  if (hit) return hit.promise;

  const promise = api
    .get("/leaderboard", { params: { limit } })
    .then(async ({ data }) => {
      const top = (Array.isArray(data) ? data : []).filter((u) => u && u.username).slice(0, limit);
      if (!top.length) return [];
      // allSettled: one unreadable profile must not cost the batch the rest.
      const settled = await Promise.allSettled(
        top.map(async (u, i) => {
          const { data: full } = await api.get(`/u/${encodeURIComponent(u.username)}`);
          if (!full?.username) throw new Error("no profile");
          return { ...full, rank: i + 1, views: full.views ?? u.views ?? 0 };
        })
      );
      return settled
        .filter((s) => s.status === "fulfilled")
        .map((s) => s.value)
        // Rank is the leaderboard's, not the surviving order's: a skipped profile
        // must not renumber everyone below it.
        .sort((a, b) => a.rank - b.rank);
    })
    .catch(() => []);

  cache.set(limit, { promise });
  return promise;
}

/** The top `limit` profiles, whole. `loading` is only true before the first answer. */
export function useTopProfiles(limit = 6) {
  const [state, setState] = useState({ loading: true, profiles: [] });

  useEffect(() => {
    let alive = true;
    load(limit).then((profiles) => {
      if (alive) setState({ loading: false, profiles });
    });
    return () => {
      alive = false;
    };
  }, [limit]);

  return state;
}

/** Test-only: drop the memoised batch so each test starts from a clean network. */
export function resetTopProfiles() {
  cache.clear();
}
