import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "@/lib/notify";
import { actionLabel, actionTone } from "@/constants/audit";
import {
  ScrollText, Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Download, ChevronDown, ShieldCheck, User, Clock, Globe,
} from "lucide-react";

/* The audit trail.
 *
 * One row per thing that happened — admin mutations, sign-ins, account
 * pairings, automatic rewards, payments — written by backend/auditLog.js. The
 * point of the page is triage: filter to one account or one kind of change,
 * read what changed (the row keeps the before AND after), and move on.
 *
 * Deliberately not a wall of text: the detail blob is collapsed to a one-line
 * summary, with the full JSON one click away, because "who edited this account"
 * is the question 90% of visits ask and the remaining 10% want the payload.
 */
const PAGE_SIZES = [50, 100, 200];

const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
};

/* A one-line gist of the detail object: the most informative few values, not
 * `[object Object]` and not the whole blob. */
const summarise = (detail) => {
  if (!detail || typeof detail !== "object") return "";
  const parts = [];
  if (detail.username && typeof detail.username === "object") {
    parts.push(`${detail.username.from || "?"} → ${detail.username.to || "?"}`);
  } else if (typeof detail.username === "string") {
    parts.push(detail.username);
  }
  if (detail.title) parts.push(`“${detail.title}”`);
  if (detail.message) parts.push(`“${String(detail.message).slice(0, 60)}”`);
  if (detail.mode && detail.amount !== undefined) parts.push(`${detail.mode} ${detail.amount}`);
  if (detail.audience) parts.push(`audience: ${detail.audience}`);
  if (detail.changed && Array.isArray(detail.changed)) parts.push(`changed: ${detail.changed.join(", ") || "nothing"}`);
  if (detail.milestone_views !== undefined) parts.push(`${detail.milestone_views} views → ${detail.premium_days}d Premium`);
  if (detail.amount_cents !== undefined) parts.push(`$${(Number(detail.amount_cents) / 100).toFixed(2)}`);
  if (detail.method) parts.push(String(detail.method));
  if (detail.paired_with?.username) parts.push(`paired with ${detail.paired_with.username}`);
  if (detail.removed_username) parts.push(`removed ${detail.removed_username}`);
  if (!parts.length) {
    const keys = Object.keys(detail);
    if (keys.length) parts.push(keys.slice(0, 3).join(", "));
  }
  return parts.join(" · ");
};

const TONE_DOT = {
  danger: "bg-red-400",
  accent: "bg-brand-400",
  good: "bg-emerald-400",
  neutral: "bg-zinc-500",
};

const asCsv = (rows) => {
  const head = ["when", "action", "actor", "role", "target_type", "target_id", "ip", "detail"];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    head.join(","),
    ...rows.map((r) => [
      r.created_at, r.action, r.actor_username, r.actor_role, r.target_type, r.target_id, r.ip,
      JSON.stringify(r.detail || {}),
    ].map(escape).join(",")),
  ].join("\n");
};

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/audit", {
        params: {
          limit,
          offset,
          ...(q.trim() ? { q: q.trim() } : {}),
          ...(actor.trim() ? { actor: actor.trim() } : {}),
          ...(action ? { action } : {}),
        },
      });
      setRows(data.events || []);
      setTotal(data.total || 0);
      setActions(data.actions || []);
      setError("");
    } catch (e) {
      setError(apiError(e.response?.data?.detail) || "Could not read the audit log");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, q, actor, action]);

  useEffect(() => { load(); }, [load]);

  // A filter change starts at page one: keeping the offset would land the admin
  // on an empty page of a smaller result set.
  const resetTo = (setter) => (value) => {
    setter(value);
    setOffset(0);
  };

  const exportCsv = () => {
    if (!rows.length) {
      toast.error("Nothing to export on this page");
      return;
    }
    const blob = new Blob([asCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swats-audit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + rows.length, total);
  const canBack = offset > 0;
  const canForward = offset + rows.length < total;

  const filtersActive = Boolean(q.trim() || actor.trim() || action);
  const emptyText = useMemo(
    () => (filtersActive ? "No events match those filters." : "Nothing recorded yet."),
    [filtersActive],
  );

  return (
    <div className="space-y-4" data-testid="audit-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-zinc-50 flex items-center gap-2.5">
            <ScrollText className="w-6 h-6 text-brand-400" /> Audit log
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Every admin change, sign-in, pairing, reward and payment — newest first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            data-testid="audit-refresh"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:text-white disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            data-testid="audit-export"
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-500/40 bg-brand-500/12 px-3 py-2 text-xs font-semibold text-brand-200 transition hover:bg-brand-500/25"
          >
            <Download className="h-3.5 w-3.5" /> Export page
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl p-3 sm:p-4" data-testid="audit-filters">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-[12rem] flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-zinc-500" />
            <input
              data-testid="audit-search"
              value={q}
              onChange={(e) => resetTo(setQ)(e.target.value)}
              placeholder="Search actions, actors, targets and detail…"
              className="w-full rounded-xl border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-brand-500/50"
            />
          </label>
          <input
            data-testid="audit-actor"
            value={actor}
            onChange={(e) => resetTo(setActor)(e.target.value)}
            placeholder="Actor username"
            className="w-40 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-brand-500/50"
          />
          <div className="relative">
            <select
              data-testid="audit-action"
              value={action}
              onChange={(e) => resetTo(setAction)(e.target.value)}
              className="w-52 appearance-none rounded-xl border border-white/10 bg-[#0c0d12]/90 pl-3 pr-8 py-2 text-xs font-medium text-zinc-200 outline-none transition hover:border-brand-500/30 focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/20 cursor-pointer shadow-sm"
            >
              <option value="" className="bg-[#0c0d12] text-zinc-300">Every kind of event</option>
              {actions.map((a) => (
                <option key={a} value={a} className="bg-[#0c0d12] text-zinc-200">{actionLabel(a)} — {a}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          </div>
          <div className="relative">
            <select
              data-testid="audit-limit"
              value={limit}
              onChange={(e) => resetTo(setLimit)(Number(e.target.value))}
              className="appearance-none rounded-xl border border-white/10 bg-[#0c0d12]/90 pl-3 pr-7 py-2 text-xs font-medium text-zinc-200 outline-none transition hover:border-brand-500/30 focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/20 cursor-pointer shadow-sm"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n} className="bg-[#0c0d12] text-zinc-200">{n} / page</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
          </div>
        </div>
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        {error ? (
          <p className="p-5 text-xs text-red-300" data-testid="audit-error">{error}</p>
        ) : loading && !rows.length ? (
          <p className="flex items-center gap-2 p-5 text-xs text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the trail…
          </p>
        ) : !rows.length ? (
          <p className="p-5 text-xs text-zinc-500" data-testid="audit-empty">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]" data-testid="audit-rows">
            {rows.map((row) => {
              const expanded = open === row.id;
              const gist = summarise(row.detail);
              return (
                <li key={row.id} data-testid="audit-row" className="px-3 py-2.5 sm:px-4">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[actionTone(row.action)]}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-xs font-semibold text-zinc-100">{actionLabel(row.action)}</span>
                        <span className="font-mono2 text-[10px] text-zinc-600">{row.action}</span>
                        {row.actor_username ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                            <User className="h-3 w-3 text-zinc-600" /> {row.actor_username}
                            {row.actor_role && (
                              <span className="rounded border border-white/10 px-1 text-[9px] uppercase tracking-wide text-zinc-500">
                                {row.actor_role}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-600">system</span>
                        )}
                        <span className="ml-auto inline-flex items-center gap-1 font-mono2 text-[10px] text-zinc-500">
                          <Clock className="h-3 w-3" /> {when(row.created_at)}
                        </span>
                      </div>

                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
                        {row.target_type && (
                          <span>target {row.target_type}{row.target_id ? `:${String(row.target_id).slice(0, 12)}` : ""}</span>
                        )}
                        {row.ip && <span className="inline-flex items-center gap-1"><Globe className="h-2.5 w-2.5" /> {row.ip}</span>}
                        {gist && <span className="text-zinc-400">{gist}</span>}
                      </div>

                      <button
                        type="button"
                        data-testid="audit-detail-toggle"
                        onClick={() => setOpen(expanded ? null : row.id)}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-500 transition hover:text-zinc-300"
                      >
                        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        {expanded ? "Hide detail" : "Show detail"}
                      </button>
                      {expanded && (
                        <pre
                          data-testid="audit-detail"
                          className="mt-1 max-h-64 overflow-auto rounded-lg border border-white/10 bg-black/50 p-2 font-mono2 text-[10px] leading-relaxed text-zinc-300"
                        >
                          {JSON.stringify(row.detail ?? {}, null, 2)}
                          {row.user_agent ? `\n\nuser-agent: ${row.user_agent}` : ""}
                        </pre>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-2 sm:px-4">
          <span className="text-[10px] text-zinc-500" data-testid="audit-count">
            {total === 0 ? "0 events" : `${pageStart}–${pageEnd} of ${total}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="audit-prev"
              disabled={!canBack || loading}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition hover:text-white disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Newer
            </button>
            <button
              type="button"
              data-testid="audit-next"
              disabled={!canForward || loading}
              onClick={() => setOffset(offset + limit)}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition hover:text-white disabled:opacity-40"
            >
              Older <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[10px] text-zinc-600">
        <ShieldCheck className="h-3 w-3" /> Passwords, tokens and 2FA codes are redacted before an event is written.
      </p>
    </div>
  );
}
