import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, fileUrl } from "@/lib/api";
import { toast } from "@/lib/notify";
import { ProfilePreview } from "@/components/ProfilePreview";
import { Switch } from "@/components/ui/switch";
import { Check, Wand2, Plus, Trash2, Download, X, User, Eye, Lock, Link2, LayoutGrid, Pencil } from "lucide-react";
import { registerMenuAction } from "@/lib/menuActions";

/* The groups the backend filters by (see PROFILE_GROUPS in
   backend/routes/templates.js). Applying used to copy the whole profile, so a
   stranger's avatar, audio and Discord tags landed on your page whether you
   wanted them or not; these are the switches that decide now.
   Everything starts on — one press still means "take the whole theme" — and
   turning something off keeps whatever you already had. */
const INCLUDE_GROUPS = [
  { id: "theme", label: "Colours, fonts & cards", hint: "The overall look" },
  { id: "background", label: "Background", hint: "Image, dim, opacity" },
  { id: "effects", label: "Effects", hint: "Name, bio, cursor and overlays" },
  { id: "text", label: "Bio & display name", hint: "Replaces your own wording" },
  { id: "avatar", label: "Profile picture", hint: "Off keeps your own avatar" },
  { id: "audio", label: "Audio settings", hint: "Player controls and volume" },
  { id: "tracks", label: "Tracks", hint: "Replaces your playlist" },
];

/* Links and widgets are deliberately NOT in this list, and the backend refuses
   to copy them even when asked (see NEVER_COPIED in routes/templates.js).

   A template is a look. It used to snapshot the author's whole profile, so
   applying one dropped their Discord invite and their Roblox card onto your page
   and replaced the links you had written yourself. Whatever links and widgets are
   on your page after an apply are the ones that were on it before. */
const ALWAYS_YOURS = [
  { label: "Links", hint: "Your own links stay exactly as they are" },
  { label: "Widgets", hint: "Your Roblox, Discord and Spotify cards stay yours" },
];

const ALL_GROUPS_ON = Object.fromEntries(INCLUDE_GROUPS.map((g) => [g.id, true]));

export default function Templates() {
  const { user, setUser } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState("");
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishDesc, setPublishDesc] = useState("");
  const [publishing, setPublishing] = useState(false);
  /* Slots used, from the server. Counting them off the marketplace page looked
     right and was wrong: that page is ordered by downloads and capped at fifty,
     so an author whose template had slipped off it was shown "0/1", would try
     to publish again, and be refused by a limit nothing on screen mentioned. */
  const [mine, setMine] = useState({ count: 0, limit: 3, unlimited: false, templates: [] });
  const [editing, setEditing] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  // The template being previewed, plus which of its parts will be taken.
  const [viewing, setViewing] = useState(null);
  const [include, setInclude] = useState(ALL_GROUPS_ON);

  const navigate = useNavigate();
  const isPremium = user?.tier === "premium" || user?.tier === "admin" || user?.is_owner;
  const isAdmin = user?.role === "admin" || user?.is_owner;

  // A template is tagged by what it asks you to wear (see templateTier on the
  // backend). A free account can look at a Premium one and cannot apply it.
  const locked = (t) => t?.tier === "premium" && !isPremium;

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/templates");
      setTemplates(data || []);
    } catch {
      toast.error("Failed to load community templates");
    }
    setLoading(false);
  };

  const loadMine = async () => {
    try {
      const { data } = await api.get("/templates/mine");
      setMine({
        count: Number(data?.count || 0),
        limit: data?.limit ?? null,
        unlimited: !!data?.unlimited,
        premium: !!data?.premium,
        templates: Array.isArray(data?.templates) ? data.templates : [],
      });
    } catch {
      /* Browsing the marketplace must not depend on this read. If it fails the
         publish form still reports whatever the server says when it submits. */
    }
  };

  useEffect(() => {
    fetchTemplates();
    loadMine();
  }, []);

  const applyTemplate = async (t, groups) => {
    // Premium templates make it explicit where to go instead of firing a request
    // that comes back 403.
    if (locked(t)) {
      navigate("/!/pricing");
      return;
    }
    setApplying(t.id);
    try {
      const { data } = await api.post(`/templates/${t.id}/apply`, { include: groups });
      setUser(data);
      const kept = groups ? Object.values(groups).filter((on) => !on).length : 0;
      toast.success(
        kept
          ? `Applied "${t.title}" — ${kept} part${kept > 1 ? "s" : ""} of yours kept as they were`
          : `Applied template "${t.title}" to your profile!`,
        { description: "Your own links and widgets were left alone." }
      );
      // Update download count locally
      setTemplates((prev) =>
        prev.map((item) => (item.id === t.id ? { ...item, downloads_count: (item.downloads_count || 0) + 1 } : item))
      );
      setViewing(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not apply template");
    }
    setApplying("");
  };

  const openView = (t) => {
    setInclude(ALL_GROUPS_ON);
    setViewing(t);
  };

  /* The template card's right-click menu previews through this page's own state,
     which is where "preview" lives — the id alone is not a URL. */
  useEffect(() => {
    return registerMenuAction("template-preview", ({ templateId }) => {
      const template = templates.find((t) => String(t.id) === String(templateId));
      if (template) openView(template);
    });
  }, [templates]);

  const deleteTemplate = async (id, title) => {
    if (!confirm(`Are you sure you want to delete template "${title}"?`)) return;
    try {
      await api.delete(`/templates/${id}`);
      toast.success("Template deleted");
      setTemplates((prev) => prev.filter((item) => item.id !== id));
      // Deleting is how a full author frees a slot, so the count has to follow.
      await loadMine();
    } catch {
      toast.error("Failed to delete template");
    }
  };

  const handlePublish = async (e) => {
    e.preventDefault();
    if (!publishTitle.trim()) {
      toast.error("Template title is required");
      return;
    }
    setPublishing(true);
    try {
      const { data } = await api.post("/templates", {
        title: publishTitle,
        description: publishDesc,
      });
      toast.success("Published template to the community!");
      setShowPublishModal(false);
      setPublishTitle("");
      setPublishDesc("");
      setTemplates((prev) => [data, ...prev]);
      // The slot count is the server's, so it is re-read rather than guessed.
      await loadMine();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to publish template");
    }
    setPublishing(false);
  };

  const openEdit = (t) => {
    setEditing(t);
    setEditTitle(t.title || "");
    setEditDesc(t.description || "");
  };

  /* Renaming or re-describing your own submission. The look itself is not
     editable here on purpose (see PATCH /templates/:id): people are already
     wearing the snapshot, and changing it underneath them would change what
     they applied. */
  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    if (!editTitle.trim()) {
      toast.error("Template title is required");
      return;
    }
    setSavingEdit(true);
    try {
      const { data } = await api.patch(`/templates/${editing.id}`, {
        title: editTitle,
        description: editDesc,
      });
      setTemplates((prev) => prev.map((item) => (item.id === editing.id ? { ...item, ...data } : item)));
      setMine((prev) => ({
        ...prev,
        templates: prev.templates.map((item) => (item.id === editing.id ? { ...item, ...data } : item)),
      }));
      toast.success("Template updated");
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not update the template");
    }
    setSavingEdit(false);
  };

  // Both from the server's answer, never counted off the visible page.
  const slotsFull = mine.limit !== null && mine.count >= mine.limit;
  const slotLabel = mine.limit === null ? `${mine.count} published` : `${mine.count}/${mine.limit}`;
  const slotReason = mine.unlimited
    ? ""
    : `All ${mine.limit} of your template slots are used. Delete one below to publish another.`;

  // The preview renders the template's own profile blob through the same
  // component the public page uses, so what is on screen is what would be
  // applied rather than an illustration of it.
  const previewData = useMemo(() => {
    if (!viewing) return null;
    const config = viewing.config || {};
    return {
      username: viewing.author_username,
      display_name: config.display_name || viewing.title,
      profile: config,
      badges: [],
      views: viewing.downloads_count || 0,
    };
  }, [viewing]);

  return (
    <div className="space-y-5" data-testid="templates-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-black text-zinc-50 flex items-center gap-2.5">
            <Wand2 className="w-6 h-6 text-brand-400" /> Community Templates
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Browse and apply themes created by the swats.bio community, or share your own design!
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <button
            onClick={() => setShowPublishModal(true)}
            disabled={slotsFull}
            data-testid="template-publish-open"
            title={slotsFull ? slotReason : "Publish your current look to the community marketplace"}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-xs font-semibold flex items-center gap-2 hover:brightness-110 transition shadow-[0_0_20px_rgba(255,127,188,0.3)] self-start sm:self-auto disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
          >
            <Plus className="w-4 h-4" /> {slotsFull ? "All slots used" : "Publish Your Design"} ({slotLabel})
          </button>
          {/* The reason, in the open rather than in a tooltip: the button being
              dead with no explanation is what reads as "publishing is broken". */}
          {slotsFull && (
            <p className="max-w-xs text-[11px] text-amber-300/90 sm:text-right" data-testid="template-slot-notice">
              {slotReason}
            </p>
          )}
        </div>
      </div>

      {/* Your own submissions. They are the only templates you can rename or
          delete, and they are listed here rather than only in the marketplace
          grid, where a template with few applies is buried on a later page. */}
      {mine.templates.length > 0 && (
        <div className="glass rounded-2xl p-4" data-testid="template-mine">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold text-zinc-100">
            <User className="h-4 w-4 text-brand-300" /> Your templates
            <span className="font-mono2 text-[10px] uppercase tracking-wider text-zinc-500">
              {mine.limit === null ? `${mine.count} published` : `${mine.count} of ${mine.limit} slots`}
            </span>
          </h2>

          <ul className="mt-3 space-y-2">
            {mine.templates.map((t) => (
              <li
                key={t.id}
                data-testid={`my-template-${t.id}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
              >
                <span
                  className="h-8 w-12 shrink-0 rounded-lg border border-white/10"
                  style={{ background: t.background_preview || "#FF7FBC" }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-zinc-100">{t.title}</div>
                  <div className="font-mono2 text-[10px] uppercase tracking-wider text-zinc-500">
                    {(t.tier || "free") === "premium" ? "Premium" : "Free"} · {t.downloads_count || 0} applies
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(t)}
                  data-testid={`my-template-${t.id}-edit`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:border-brand-400/30 hover:text-white"
                >
                  <Pencil className="h-3 w-3" /> Rename
                </button>
                <button
                  type="button"
                  onClick={() => deleteTemplate(t.id, t.title)}
                  data-testid={`my-template-${t.id}-delete`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/20"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass rounded-2xl h-64 animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Wand2 className="w-10 h-10 text-brand-400/50 mx-auto mb-3" />
          <h3 className="text-base font-bold text-zinc-200">No Community Templates Yet</h3>
          <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
            Be the first to publish your custom profile theme to the community marketplace!
          </p>
          <button
            onClick={() => setShowPublishModal(true)}
            className="mt-4 px-4 py-2 rounded-xl bg-brand-500/20 text-brand-200 text-xs font-semibold hover:bg-brand-500/30 transition inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Publish Design
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => {
            const bgUrl = fileUrl(t.background_preview);
            const avatarUrl = fileUrl(t.author_avatar);
            const isOwnerOrAdmin = t.creator_id === user?.id || isAdmin;

            return (
              <div
                key={t.id}
                data-testid={`template-${t.id}`}
                /* Right-click: preview this template, not the browser's menu. */
                data-menu-id="template"
                data-menu-template-id={t.id}
                data-menu-template-title={t.title}
                className="glass rounded-2xl overflow-hidden group flex flex-col border border-white/10 hover:border-brand-500/40 transition duration-300 shadow-lg"
              >
                {/* Background Banner Preview */}
                <div
                  className="h-32 relative overflow-hidden bg-cover bg-center flex items-center justify-center"
                  style={{
                    background: bgUrl && !bgUrl.startsWith("#")
                      ? `url(${bgUrl}) center/cover no-repeat`
                      : `linear-gradient(135deg, ${t.background_preview || "#FF7FBC"}, #3b0764)`
                  }}
                >
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

                  {/* Creator Avatar Badge */}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-brand-500 to-brand-400 shadow-md">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <div className="w-full h-full rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300">
                          {t.author_username?.[0]?.toUpperCase() || <User className="w-4 h-4" />}
                        </div>
                      )}
                    </div>
                    <span className="mt-1 text-[10px] font-medium text-white/90 bg-black/60 px-2 py-0.5 rounded-full backdrop-blur">
                      @{t.author_username}
                    </span>
                  </div>

                  {/* Usage Badge */}
                  <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 backdrop-blur text-[10px] font-mono2 text-zinc-300 border border-white/10">
                    <Download className="w-3 h-3 text-brand-400" /> {t.downloads_count || 0}
                  </div>

                  {/* The tag: what this template asks you to wear. */}
                  <div
                    data-testid={`template-${t.id}-tier`}
                    data-tier={t.tier || "free"}
                    className={`absolute top-2.5 left-2.5 z-10 flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur ${
                      t.tier === "premium"
                        ? "border-brand-400/40 bg-brand-500/25 text-brand-100"
                        : "border-white/15 bg-black/60 text-zinc-300"
                    }`}
                  >
                    {t.tier === "premium" ? <Lock className="h-3 w-3" /> : null}
                    {t.tier === "premium" ? "Premium" : "Free"}
                  </div>

                  {/* View — opens the template itself, not the card */}
                  <button
                    type="button"
                    onClick={() => openView(t)}
                    data-testid={`template-${t.id}-view`}
                    className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100 outline-none"
                  >
                    <span className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white backdrop-blur">
                      <Eye className="w-3.5 h-3.5" /> View template
                    </span>
                  </button>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100 group-hover:text-brand-300 transition">
                      {t.title}
                    </h3>
                    {t.description && (
                      <p className="text-xs text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                        {t.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                    {isOwnerOrAdmin ? (
                      <button
                        onClick={() => deleteTemplate(t.id, t.title)}
                        className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition text-xs flex items-center gap-1"
                        title="Delete Template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div />
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openView(t)}
                        data-testid={`template-${t.id}-view-button`}
                        className="px-3 py-1.5 rounded-xl glass text-xs font-semibold text-zinc-300 hover:text-white transition flex items-center gap-1.5 border border-white/10"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>

                      <button
                        onClick={() => applyTemplate(t)}
                        disabled={applying === t.id}
                        data-testid={`template-${t.id}-apply`}
                        title={locked(t) ? "Premium template — upgrade to apply it" : "Apply this template"}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50 border ${
                          locked(t)
                            ? "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
                            : "border-brand-500/30 bg-brand-500/20 text-brand-200 hover:bg-brand-500/30"
                        }`}
                      >
                        {applying === t.id ? (
                          "Applying..."
                        ) : locked(t) ? (
                          <>
                            <Lock className="w-3.5 h-3.5" /> Premium
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5 text-brand-400" /> Apply Theme
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rename / re-describe one of your own */}
      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#0b0b0d]/95 p-5 backdrop-blur-2xl animate-in zoom-in-95 duration-200">
            <h3 className="font-display text-base font-bold text-zinc-100">Edit "{editing.title}"</h3>
            <p className="mt-1 text-[11px] text-zinc-500">
              The look itself stays as published — people are already wearing this snapshot.
            </p>

            <form onSubmit={saveEdit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1" htmlFor="template-edit-title">
                  Template Title
                </label>
                <input
                  id="template-edit-title"
                  type="text"
                  required
                  maxLength={50}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  data-testid="template-edit-title"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 outline-none focus:border-brand-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1" htmlFor="template-edit-desc">
                  Description
                </label>
                <textarea
                  id="template-edit-desc"
                  rows={3}
                  maxLength={200}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  data-testid="template-edit-desc"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-zinc-100 outline-none focus:border-brand-500/50 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-xl glass text-xs font-semibold text-zinc-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  data-testid="template-edit-save"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-xs font-semibold hover:brightness-110 transition disabled:opacity-50"
                >
                  {savingEdit ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View / apply-options modal */}
      {viewing && (
        <div
          data-testid="template-view-modal"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setViewing(null); }}
        >
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/15 bg-[#0b0b0d]/95 shadow-[0_25px_90px_rgba(0,0,0,0.95),0_0_40px_rgba(255,127,188,0.12)] backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate font-display text-base font-bold text-zinc-100">{viewing.title}</h3>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 font-mono2 text-[10px] uppercase tracking-widest text-zinc-500">
                  <span>by @{viewing.author_username} · {viewing.downloads_count || 0} applies</span>
                  <span
                    data-testid="template-view-tier"
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${
                      viewing.tier === "premium"
                        ? "border-brand-400/40 bg-brand-500/20 text-brand-200"
                        : "border-white/15 bg-white/[0.04] text-zinc-400"
                    }`}
                  >
                    {viewing.tier === "premium" ? <Lock className="h-2.5 w-2.5" /> : null}
                    {viewing.tier === "premium" ? "Premium" : "Free"}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setViewing(null)}
                aria-label="Close template preview"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid max-h-[75vh] gap-0 overflow-y-auto lg:grid-cols-[1.35fr_1fr]">
              {/* The template rendered by the same component the public page uses */}
              <div className="border-b border-white/10 bg-[#050505] p-3 lg:border-b-0 lg:border-r">
                <ProfilePreview data={previewData} embedded />
              </div>

              {/* What to take from it */}
              <div className="space-y-4 p-5">
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">What to include</h4>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    Anything you switch off keeps what is already on your page — your avatar,
                    your playlist, your links.
                  </p>
                </div>

                {/* Not switches: these two are the visitor's by definition. */}
                <ul className="space-y-1.5" data-testid="template-always-yours">
                  {ALWAYS_YOURS.map((item) => (
                    <li
                      key={item.label}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2"
                    >
                      {item.label === "Links" ? (
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      ) : (
                        <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-300">{item.label}</div>
                        <div className="text-[11px] text-zinc-500">{item.hint}</div>
                      </div>
                      <span className="ml-auto shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 font-mono2 text-[9px] uppercase text-zinc-500">
                        yours
                      </span>
                    </li>
                  ))}
                </ul>

                <div>
                  <h4 className="text-sm font-bold text-zinc-100">What to take</h4>
                </div>

                <ul className="space-y-1.5" data-testid="template-include-groups">
                  {INCLUDE_GROUPS.map((group) => (
                    <li
                      key={group.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-200">{group.label}</div>
                        <div className="text-[11px] text-zinc-500">{group.hint}</div>
                      </div>
                      <Switch
                        data-testid={`template-include-${group.id}`}
                        aria-label={`Include ${group.label}`}
                        checked={include[group.id] !== false}
                        onCheckedChange={(v) => setInclude((prev) => ({ ...prev, [group.id]: v }))}
                        className="data-[state=checked]:bg-brand-500 data-[state=unchecked]:bg-zinc-700"
                      />
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setInclude(ALL_GROUPS_ON)}
                    className="text-[11px] font-semibold text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
                  >
                    Reset to everything
                  </button>
                  <button
                    type="button"
                    onClick={() => setInclude(Object.fromEntries(INCLUDE_GROUPS.map((g) => [g.id, false])))}
                    className="text-[11px] font-semibold text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
                  >
                    Clear all
                  </button>
                </div>

                {locked(viewing) && (
                  <p
                    data-testid="template-premium-notice"
                    className="rounded-xl border border-brand-500/25 bg-brand-500/10 px-3 py-2 text-[11px] leading-relaxed text-brand-100"
                  >
                    This template wears Premium features — its layout, fonts or effects. You can
                    view all of it here; applying it needs Premium.
                  </p>
                )}

                <button
                  onClick={() => applyTemplate(viewing, include)}
                  disabled={applying === viewing.id || (!locked(viewing) && !Object.values(include).some(Boolean))}
                  data-testid="template-apply-selected"
                  className={`w-full rounded-xl px-4 py-2.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${
                    locked(viewing)
                      ? "bg-white/[0.06] border border-white/15"
                      : "bg-gradient-to-r from-brand-500 to-brand-600"
                  }`}
                >
                  {applying === viewing.id
                    ? "Applying..."
                    : locked(viewing)
                      ? "Unlock Premium templates"
                      : "Apply selected parts"}
                </button>
                <p className="text-center text-[11px] text-zinc-500">
                  {Object.values(include).filter(Boolean).length} of {INCLUDE_GROUPS.length} parts selected
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Publish Modal */}
      {showPublishModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPublishModal(false); }}
        >
          <div className="bg-[#0b0b0d]/95 backdrop-blur-2xl rounded-3xl p-5 max-w-md w-full relative shadow-[0_25px_90px_rgba(0,0,0,0.95),0_0_40px_rgba(255,127,188,0.15)] border border-white/15 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-brand-400" />
                <h3 className="font-display text-base font-bold text-zinc-100">Publish Community Template</h3>
              </div>
              <button
                onClick={() => setShowPublishModal(false)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePublish} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Template Title</label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  placeholder="e.g. Quiet Dusk"
                  value={publishTitle}
                  onChange={(e) => setPublishTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 outline-none focus:border-brand-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Description (Optional)</label>
                <textarea
                  rows={3}
                  maxLength={200}
                  placeholder="Describe your design aesthetics, fonts, and vibe..."
                  value={publishDesc}
                  onChange={(e) => setPublishDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-zinc-100 outline-none focus:border-brand-500/50 resize-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-xs text-zinc-300">
                <p>
                  This snapshots your layout, colours, fonts and effects so other people can wear
                  your aesthetic.
                </p>
                <p className="mt-1">
                  Your <span className="font-semibold text-zinc-200">links</span> and{" "}
                  <span className="font-semibold text-zinc-200">widgets</span> are never included —
                  they stay on your page, and anyone who applies this keeps their own.
                </p>
                <p className="mt-1 font-mono2 text-[10px] text-brand-300" data-testid="template-slot-line">
                  Slots used: {mine.count} / {mine.limit === null ? "unlimited" : mine.limit} (
                  {isPremium ? "Premium Tier" : "Free Tier"})
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPublishModal(false)}
                  className="px-4 py-2 rounded-xl glass text-xs font-semibold text-zinc-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={publishing || slotsFull}
                  data-testid="template-publish-submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-xs font-semibold hover:brightness-110 transition disabled:opacity-50 disabled:hover:brightness-100"
                >
                  {slotsFull ? "No slots left" : publishing ? "Publishing..." : "Publish template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
