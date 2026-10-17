import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";
import { SmartSelect } from "@/components/ui-shared/SmartSelect";
import UserPicker from "@/components/UserPicker";
import { Megaphone, Loader2, Plus, Trash2, Eye, EyeOff, Check, X } from "lucide-react";

/* The announcement system.
 *
 * Replaces the single free-text banner that used to live in Site Settings: an
 * announcement now has a level (so a maintenance notice can look different from
 * a giveaway), an audience, an optional end date, and can push itself into
 * inboxes. The old free-text value is kept as the fallback below, because an
 * announcement that was already written into it must not vanish silently.
 */
const LEVELS = [
  { value: "info", label: "Info — neutral, sky blue" },
  { value: "success", label: "Success — green" },
  { value: "warning", label: "Warning — amber" },
  { value: "critical", label: "Critical — red" },
];

const AUDIENCES = [
  { value: "all", label: "Everyone" },
  { value: "premium", label: "Premium accounts only" },
  { value: "free", label: "Free accounts only" },
  { value: "discord", label: "Linked Discord" },
  { value: "no_discord", label: "No Discord linked" },
  { value: "admins", label: "Admins & owner" },
  { value: "specific", label: "Specific people (inbox only)…" },
];

const LEVEL_TINT = {
  info: "text-sky-300 bg-sky-500/12",
  success: "text-emerald-300 bg-emerald-500/12",
  warning: "text-amber-300 bg-amber-500/12",
  critical: "text-rose-300 bg-rose-500/12",
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand-500/50";

const emptyDraft = {
  message: "",
  level: "info",
  audience: "all",
  href: "",
  href_label: "",
  ends_at: "",
  notify: false,
  user_ids: [],
};

export default function AnnouncementManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/announcements");
      setItems(data);
    } catch {
      toast.error("Failed to load announcements");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!draft.message.trim()) {
      toast.error("Write the message people will actually read.");
      return;
    }
    if (draft.audience === "specific" && draft.user_ids.length === 0) {
      toast.error("Pick at least one person — a specific-audience banner shows to nobody on its own.");
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post("/admin/announcements", {
        message: draft.message.trim(),
        level: draft.level,
        audience: draft.audience,
        href: draft.href.trim() || null,
        href_label: draft.href_label.trim() || null,
        ends_at: draft.ends_at || null,
        notify: draft.notify,
        user_ids: draft.user_ids,
      });
      setItems((prev) => [data, ...prev]);
      setDraft({ ...emptyDraft, level: draft.level });
      toast.success(
        data.notified > 0 ? `Announcement live — ${data.notified} inboxes notified` : "Announcement is live",
      );
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create the announcement");
    }
    setCreating(false);
  };

  const toggleActive = async (a) => {
    try {
      const { data } = await api.patch(`/admin/announcements/${a.id}`, { active: !a.active });
      setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...data } : x)));
    } catch {
      toast.error("Could not change that announcement");
    }
  };

  const remove = async (a) => {
    if (!window.confirm("Delete this announcement? It disappears from every banner immediately.")) return;
    try {
      await api.delete(`/admin/announcements/${a.id}`);
      setItems((prev) => prev.filter((x) => x.id !== a.id));
      toast.success("Announcement deleted");
    } catch {
      toast.error("Failed to delete the announcement");
    }
  };

  const isLive = (a) => a.active && (!a.ends_at || new Date(a.ends_at) > new Date());

  return (
    <div className="glass rounded-2xl p-6" data-testid="announcement-manager">
      <div className="mb-4 flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-zinc-100">Announcement banners</h2>
        <span className="ml-auto font-mono2 text-[10px] uppercase tracking-wider text-zinc-500">
          shown on the landing page and dashboard
        </span>
      </div>

      <form onSubmit={create} className="space-y-3">
        <textarea
          rows={2}
          data-testid="announcement-message"
          value={draft.message}
          maxLength={400}
          onChange={(e) => setDraft({ ...draft, message: e.target.value })}
          placeholder="e.g. Scheduled maintenance tonight at 02:00 UTC — profiles stay online, uploads pause."
          className={`${inputClass} resize-y`}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Level</label>
            <SmartSelect
              value={draft.level}
              onChange={(level) => setDraft({ ...draft, level })}
              options={LEVELS}
              size="sm"
              ariaLabel="Announcement level"
              testid="announcement-level"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Audience</label>
            <SmartSelect
              value={draft.audience}
              onChange={(audience) => setDraft({ ...draft, audience })}
              options={AUDIENCES}
              size="sm"
              ariaLabel="Announcement audience"
              testid="announcement-audience"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Ends (optional)
            </label>
            <input
              type="datetime-local"
              data-testid="announcement-ends"
              value={draft.ends_at}
              onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
              className={`${inputClass} py-2 text-xs`}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={draft.href}
            data-testid="announcement-href"
            onChange={(e) => setDraft({ ...draft, href: e.target.value })}
            placeholder="Link (optional) — /!/devlogs or https://…"
            className={`${inputClass} py-2 text-xs`}
          />
          <input
            value={draft.href_label}
            data-testid="announcement-href-label"
            onChange={(e) => setDraft({ ...draft, href_label: e.target.value })}
            placeholder="Link label (e.g. Read the devlog)"
            className={`${inputClass} py-2 text-xs`}
          />
        </div>

        {draft.audience === "specific" && (
          <UserPicker
            selected={draft.user_ids}
            onChange={(user_ids) => setDraft({ ...draft, user_ids })}
            testid="announcement-user-picker"
          />
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
          <input
            type="checkbox"
            checked={draft.notify}
            onChange={(e) => setDraft({ ...draft, notify: e.target.checked })}
            className="sr-only peer"
            data-testid="announcement-notify"
          />
          <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border border-zinc-600 transition after:h-1.5 after:w-1.5 after:rounded-sm after:bg-white after:opacity-0 after:content-[''] peer-checked:border-brand-400 peer-checked:bg-brand-500 peer-checked:after:opacity-100" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-zinc-200">Also send to inboxes</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">
              A bell notification with a ping, for people who never look at the top of the page.
            </span>
          </span>
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={creating}
            data-testid="announcement-create"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Post announcement
          </button>
        </div>
      </form>

      <div className="mt-5 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-4 text-center text-xs text-zinc-500">
            No announcements. Anything you post here appears at the top of the site.
          </p>
        ) : (
          items.map((a) => (
            <div
              key={a.id}
              data-testid="announcement-row"
              className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
            >
              <span className={`mt-0.5 rounded-full px-2 py-0.5 font-mono2 text-[10px] font-bold uppercase ${LEVEL_TINT[a.level] || LEVEL_TINT.info}`}>
                {a.level}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-relaxed text-zinc-200">{a.message}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 font-mono2 text-[10px] uppercase tracking-wide text-zinc-500">
                  <span className="inline-flex items-center gap-1">
                    {isLive(a) ? <Eye className="h-3 w-3 text-emerald-400" /> : <EyeOff className="h-3 w-3" />}
                    {isLive(a) ? "live" : a.active ? "expired" : "paused"}
                  </span>
                  <span>{a.audience}</span>
                  {a.ends_at && <span>ends {new Date(a.ends_at).toLocaleString()}</span>}
                  {!a.starts_at && <span>no start date</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleActive(a)}
                  title={a.active ? "Pause" : "Resume"}
                  className="rounded-lg bg-white/5 p-2 text-zinc-300 transition hover:bg-white/10"
                >
                  {a.active ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => remove(a)}
                  title="Delete"
                  className="rounded-lg bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20 hover:text-red-200"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
