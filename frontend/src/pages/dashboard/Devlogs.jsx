import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";
import { SmartSelect } from "@/components/ui-shared/SmartSelect";
import { PageHeader, EmptyState } from "@/components/ui-shared/PageUI";
import UserPicker from "@/components/UserPicker";
import {
  Newspaper, Loader2, Send, Trash2, Pin, PinOff, Eye, EyeOff, Users, BellRing,
} from "lucide-react";

const TAG_OPTIONS = [
  { value: "Update", label: "Update" },
  { value: "Feature", label: "New feature" },
  { value: "Fix", label: "Fix" },
  { value: "Maintenance", label: "Maintenance" },
  { value: "Community", label: "Community" },
];

const AUDIENCE_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "free", label: "Free accounts only" },
  { value: "premium", label: "Premium accounts only" },
  { value: "discord", label: "Linked Discord" },
  { value: "no_discord", label: "No Discord linked" },
  { value: "admins", label: "Admins & owner" },
  { value: "specific", label: "Specific people…" },
];

const Toggle = ({ checked, onChange, label, hint, testid }) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" data-testid={testid} />
    {/* The tick is an ::after on the sibling span, because `peer-checked:variant`
        only reaches siblings of the hidden input — a nested element would never
        match and the box would tick for nobody. */}
    <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border border-zinc-600 bg-transparent transition after:h-1.5 after:w-1.5 after:rounded-sm after:bg-white after:opacity-0 after:content-[''] peer-checked:border-brand-400 peer-checked:bg-brand-500 peer-checked:after:opacity-100" />
    <span className="min-w-0">
      <span className="block text-xs font-semibold text-zinc-200">{label}</span>
      {hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">{hint}</span>}
    </span>
  </label>
);

export default function Devlogs() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // `channel` is which devlog the post belongs to: the public changelog at
  // /!/devlogs, or the build log the dashboard reads at /!/dashboard/devlogs.
  const [form, setForm] = useState({ title: "", tag: "Update", body: "", channel: "public", pinned: false, published: true });
  const [notify, setNotify] = useState(true);
  const [audience, setAudience] = useState("all");
  const [specific, setSpecific] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/devlogs");
      setPosts(data);
    } catch {
      toast.error("Failed to load devlogs");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const publish = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("A devlog needs a title.");
      return;
    }
    if (notify && audience === "specific" && specific.length === 0) {
      toast.error("Pick at least one person to notify, or switch the notification off.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/admin/devlogs", {
        ...form,
        title: form.title.trim(),
        body: form.body.trim(),
        notify,
        audience,
        user_ids: specific,
      });
      setPosts((prev) => [data, ...prev]);
      setForm({ title: "", tag: form.tag, body: "", channel: form.channel, pinned: false, published: true });
      setSpecific([]);
      toast.success(
        data.notified > 0
          ? `Published — ${data.notified} ${data.notified === 1 ? "person" : "people"} notified`
          : "Devlog published",
      );
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to publish");
    }
    setSaving(false);
  };

  const patch = async (post, changes) => {
    try {
      const { data } = await api.patch(`/admin/devlogs/${post.id}`, changes);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, ...data } : p)));
    } catch {
      toast.error("Could not update that devlog");
    }
  };

  const remove = async (post) => {
    if (!window.confirm(`Delete "${post.title}"? Bell entries pointing at it are removed too.`)) return;
    try {
      await api.delete(`/admin/devlogs/${post.id}`);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      toast.success("Devlog deleted");
    } catch {
      toast.error("Failed to delete the devlog");
    }
  };

  return (
    <div className="space-y-5" data-testid="devlogs-admin-page">
      <PageHeader
        icon={Newspaper}
        title="Devlogs"
        subtitle="Post what changed. Publishing can push it into people's notification bells — everyone, a tier, or a hand-picked list. Each post goes to one of two feeds: the public changelog, or the dashboard build log."
      />

      <form onSubmit={publish} className="glass space-y-5 rounded-2xl p-5">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-300" htmlFor="devlog-title">Title</label>
            <input
              id="devlog-title"
              data-testid="devlog-title"
              value={form.title}
              maxLength={140}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Custom code widgets are live"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand-500/50"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-300">Tag</label>
            <SmartSelect
              value={form.tag}
              onChange={(tag) => setForm({ ...form, tag })}
              options={TAG_OPTIONS}
              ariaLabel="Devlog tag"
              testid="devlog-tag"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold text-zinc-300">Which devlog</label>
          <div className="grid gap-2.5 sm:grid-cols-2" data-testid="devlog-channel">
            {[
              { id: "public", label: "Public changelog", desc: "Shown at /!/devlogs and linked from the top nav." },
              { id: "dashboard", label: "Dashboard build log", desc: "Shown at /!/dashboard/devlogs, for signed-in members." },
            ].map((c) => {
              const active = (form.channel || "public") === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`devlog-channel-${c.id}`}
                  onClick={() => setForm({ ...form, channel: c.id })}
                  className={`rounded-2xl border p-3.5 text-left transition-colors duration-200 ${
                    active ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 hover:border-white/25 hover:bg-white/[0.04]"
                  }`}
                >
                  <span className={`block text-xs font-bold ${active ? "text-brand-200" : "text-zinc-200"}`}>{c.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">{c.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold text-zinc-300" htmlFor="devlog-body">
            Body
          </label>
          <textarea
            id="devlog-body"
            data-testid="devlog-body"
            value={form.body}
            rows={7}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder={"What changed, and what it means for people using the site.\n\nBlank lines separate paragraphs on the public page."}
            className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand-500/50"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            checked={form.published}
            onChange={(published) => setForm({ ...form, published })}
            label="Publish immediately"
            hint="Off saves it as a draft only you can see here."
            testid="devlog-published"
          />
          <Toggle
            checked={form.pinned}
            onChange={(pinned) => setForm({ ...form, pinned })}
            label="Pin to the top"
            hint="Pinned posts sit above everything else on the public devlog."
            testid="devlog-pinned"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <Toggle
            checked={notify}
            onChange={setNotify}
            label="Send it to inboxes"
            hint="Adds a bell notification with a ping, so the post is not just a page nobody opens."
            testid="devlog-notify"
          />

          {notify && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold text-zinc-300">Who gets notified</label>
                <SmartSelect
                  value={audience}
                  onChange={setAudience}
                  options={AUDIENCE_OPTIONS}
                  ariaLabel="Devlog audience"
                  testid="devlog-audience"
                />
              </div>
              {audience === "specific" && (
                <UserPicker selected={specific} onChange={setSpecific} testid="devlog-user-picker" />
              )}
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <BellRing className="h-3.5 w-3.5 text-brand-400" />
                {audience === "specific"
                  ? `${specific.length} ${specific.length === 1 ? "person" : "people"} will get a ping`
                  : "Everyone in that group gets a bell notification"}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            data-testid="devlog-publish"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(164, 141, 244,0.3)] transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish devlog
          </button>
        </div>
      </form>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
          <Users className="h-4 w-4 text-brand-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Published devlogs</h2>
          <span className="ml-auto font-mono2 text-[10px] uppercase tracking-wider text-zinc-500">
            {posts.length} total
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : posts.length === 0 ? (
          <EmptyState icon={Newspaper} title="No devlogs yet" hint="Your first post will show up on the public devlog page and, if you leave the notification on, in everyone's bell." />
        ) : (
          <ul className="divide-y divide-white/5">
            {posts.map((post) => (
              <li key={post.id} className="flex flex-wrap items-start gap-3 px-5 py-4" data-testid="devlog-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-zinc-100">{post.title}</span>
                    {post.tag && (
                      <span className="rounded-full bg-brand-500/12 px-2 py-0.5 font-mono2 text-[10px] uppercase tracking-wide text-brand-300">
                        {post.tag}
                      </span>
                    )}
                    {post.pinned && (
                      <span className="rounded-full bg-amber-500/12 px-2 py-0.5 font-mono2 text-[10px] uppercase tracking-wide text-amber-300">
                        pinned
                      </span>
                    )}
                    {!post.published && (
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono2 text-[10px] uppercase tracking-wide text-zinc-400">
                        draft
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono2 text-[10px] uppercase tracking-wide ${
                        (post.channel || "public") === "dashboard"
                          ? "bg-sky-500/12 text-sky-300"
                          : "bg-emerald-500/12 text-emerald-300"
                      }`}
                    >
                      {(post.channel || "public") === "dashboard" ? "build log" : "public"}
                    </span>
                  </div>
                  {post.body && <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{post.body}</p>}
                  <div className="mt-1.5 font-mono2 text-[10px] uppercase tracking-wide text-zinc-600">
                    {new Date(post.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => patch(post, { pinned: !post.pinned })}
                    title={post.pinned ? "Unpin" : "Pin to top"}
                    className="rounded-lg bg-white/5 p-2 text-zinc-300 transition hover:bg-white/10"
                  >
                    {post.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => patch(post, { published: !post.published })}
                    title={post.published ? "Unpublish" : "Publish"}
                    className="rounded-lg bg-white/5 p-2 text-zinc-300 transition hover:bg-white/10"
                  >
                    {post.published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(post)}
                    title="Delete"
                    className="rounded-lg bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20 hover:text-red-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
