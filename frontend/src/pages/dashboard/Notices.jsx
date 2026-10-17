import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";
import { SmartSelect } from "@/components/ui-shared/SmartSelect";
import { PageHeader, EmptyState } from "@/components/ui-shared/PageUI";
import UserPicker from "@/components/UserPicker";
import {
  BellRing, Loader2, Send, Trash2, Users, Mail, Newspaper, Megaphone, MailOpen,
} from "lucide-react";

/* Audience choices, in the order an admin is most likely to want them. `value`
   matches the backend's AUDIENCE_SQL keys exactly — a typo here would silently
   fall back to "everyone" on the server, which is the one mistake this page must
   never make. */
const AUDIENCE_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "free", label: "Free accounts only" },
  { value: "premium", label: "Premium accounts only" },
  { value: "discord", label: "Linked Discord" },
  { value: "no_discord", label: "No Discord linked" },
  { value: "admins", label: "Admins & owner" },
  { value: "specific", label: "Specific people…" },
];

const KIND_ICON = { inbox: Mail, devlog: Newspaper, announcement: Megaphone, system: BellRing };

const timeAgo = (iso) => {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
};

export default function Notices() {
  const [audience, setAudience] = useState("all");
  const [counts, setCounts] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", href: "" });
  const [sending, setSending] = useState(false);

  const [specific, setSpecific] = useState([]); // picked user ids

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadAudiences = () =>
    api.get("/admin/notify/audiences").then(({ data }) => setCounts(data.counts)).catch(() => {});

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get("/admin/notify/history");
      setHistory(data);
    } catch {
      toast.error("Failed to load sent messages");
    }
    setHistoryLoading(false);
  };

  useEffect(() => {
    loadAudiences();
    loadHistory();
  }, []);

  const recipientCount = useMemo(() => {
    if (audience === "specific") return specific.length;
    return counts?.[audience] ?? null;
  }, [audience, counts, specific]);

  const send = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Give the message a title — the bell shows it as the headline.");
      return;
    }
    if (audience === "specific" && specific.length === 0) {
      toast.error("Pick at least one person.");
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post("/admin/notify", {
        title: form.title.trim(),
        body: form.body.trim() || null,
        href: form.href.trim() || null,
        audience,
        user_ids: specific,
      });
      toast.success(`Sent to ${data.sent} ${data.sent === 1 ? "person" : "people"}`);
      setForm({ title: "", body: "", href: "" });
      setSpecific([]);
      loadHistory();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send");
    }
    setSending(false);
  };

  const recall = async (batch) => {
    if (!window.confirm(`Recall "${batch.title}"? It disappears from ${batch.recipients} inbox${batch.recipients === 1 ? "" : "es"}.`)) return;
    try {
      await api.delete(`/admin/notify/batch/${batch.batch_id}`);
      setHistory((prev) => prev.filter((h) => h.batch_id !== batch.batch_id));
      toast.success("Message recalled");
    } catch {
      toast.error("Failed to recall that message");
    }
  };

  return (
    <div className="space-y-5" data-testid="notices-page">
      <PageHeader
        icon={BellRing}
        title="Notify & Inbox"
        subtitle="Send a message straight into someone's notification bell. Pick an audience or hand-pick people — it lands in the top-right bell with a ping."
        testid="notices-header"
      />

      <form onSubmit={send} className="glass space-y-5 rounded-2xl p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-300" htmlFor="notice-title">Title</label>
            <input
              id="notice-title"
              data-testid="notice-title"
              value={form.title}
              maxLength={120}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Premium is half price this weekend"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand-500/50"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-300">Audience</label>
            <SmartSelect
              value={audience}
              onChange={setAudience}
              options={AUDIENCE_OPTIONS}
              ariaLabel="Message audience"
              testid="notice-audience"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold text-zinc-300" htmlFor="notice-body">Message</label>
          <textarea
            id="notice-body"
            data-testid="notice-body"
            value={form.body}
            rows={3}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Short and specific. Inbox messages stay short better than essays."
            className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand-500/50"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold text-zinc-300" htmlFor="notice-href">Link (optional)</label>
          <input
            id="notice-href"
            data-testid="notice-href"
            value={form.href}
            onChange={(e) => setForm({ ...form, href: e.target.value })}
            placeholder="/!/dashboard/editor or https://…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand-500/50"
          />
        </div>

        {audience === "specific" && (
          <UserPicker selected={specific} onChange={setSpecific} testid="notice-user-picker" />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Users className="h-3.5 w-3.5 text-brand-400" />
            {recipientCount === null ? "Counting…" : `${recipientCount} ${recipientCount === 1 ? "recipient" : "recipients"}`}
          </div>
          <button
            type="submit"
            disabled={sending}
            data-testid="notice-send"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(164, 141, 244,0.3)] transition hover:brightness-110 disabled:opacity-60"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to inbox
          </button>
        </div>
      </form>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
          <MailOpen className="h-4 w-4 text-brand-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Sent messages</h2>
          <span className="ml-auto font-mono2 text-[10px] uppercase tracking-wider text-zinc-500">
            grouped by send
          </span>
        </div>

        {historyLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : history.length === 0 ? (
          <EmptyState icon={Mail} title="Nothing sent yet" hint="Everything you send — inbox messages, devlogs and announcements — shows up here with a read count." />
        ) : (
          <ul className="divide-y divide-white/5">
            {history.map((h) => {
              const Icon = KIND_ICON[h.kind] || Mail;
              const readPct = h.recipients ? Math.round(((h.recipients - h.unread) / h.recipients) * 100) : 0;
              return (
                <li key={h.batch_id} className="flex items-start gap-3 px-5 py-4" data-testid="notice-history-row">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
                    <Icon className="h-4 w-4 text-brand-300" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-zinc-100">{h.title}</span>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono2 text-[10px] uppercase tracking-wide text-zinc-400">
                        {h.kind}
                      </span>
                    </div>
                    {h.body && <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{h.body}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 font-mono2 text-[10px] uppercase tracking-wide text-zinc-500">
                      <span>{h.recipients} sent</span>
                      <span>{h.unread} unread</span>
                      <span>{readPct}% opened</span>
                      <span>{timeAgo(h.created_at)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => recall(h)}
                    title="Recall this message"
                    className="shrink-0 rounded-lg bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20 hover:text-red-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
