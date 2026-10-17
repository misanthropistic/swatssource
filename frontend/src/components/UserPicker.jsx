import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";
import { Check, Loader2, Search } from "lucide-react";

/* Hand-picking recipients.
 *
 * Reads the same search as the admin roster, so what an admin can see is exactly
 * what they can target. Debounced, because this fires on every keystroke, and the
 * request is aborted by an `alive` flag when the search changes mid-flight.
 */
export default function UserPicker({ selected = [], onChange, testid = "user-picker", emptyHint }) {
  const [search, setSearch] = useState("");
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api.get("/admin/discord/roster", { params: { search, limit: 50 } })
        .then(({ data }) => { if (alive) setRoster(data.users || []); })
        .catch(() => { if (alive) toast.error("Failed to load users"); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [search]);

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4" data-testid={testid}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-zinc-200">
          Pick people
          {selected.length > 0 && <span className="ml-2 text-brand-300">{selected.length} selected</span>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username or email"
              data-testid={`${testid}-search`}
              className="w-44 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-600"
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(roster.map((u) => u.id))}
            className="rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/10"
          >
            Select shown
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/10"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-xl border border-white/5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading users…
          </div>
        ) : roster.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500">{emptyHint || "No users match that search."}</div>
        ) : (
          roster.map((u) => {
            const picked = selected.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                data-testid={`${testid}-option`}
                className={`flex w-full items-center gap-3 border-b border-white/[0.04] px-3 py-2.5 text-left transition last:border-b-0 hover:bg-white/[0.03] ${
                  picked ? "bg-brand-500/10" : ""
                }`}
              >
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                    picked ? "border-brand-400 bg-brand-500 text-white" : "border-zinc-600 text-transparent"
                  }`}
                >
                  <Check className="h-3 w-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-zinc-100">
                    @{u.username}
                    {u.discord_username && (
                      <span className="ml-2 font-normal text-zinc-500">discord: {u.discord_username}</span>
                    )}
                  </span>
                  <span className="block truncate font-mono2 text-[10px] text-zinc-500">
                    {u.tier} · {u.email}
                  </span>
                </span>
                {!u.discord_linked && (
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 font-mono2 text-[9px] uppercase tracking-wide text-amber-300">
                    no discord
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
