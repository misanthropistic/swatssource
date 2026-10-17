import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, fileUrl } from "@/lib/api";
import { PLATFORMS } from "@/constants/platforms";
import {
  LINK_MODES, LINK_CARD_STYLES, LINK_ICON_STYLES, LINK_FOLDS,
} from "@/constants/widgets";
import { ICON_SIZES } from "@/constants/layouts";
import { toast } from "@/lib/notify";
import { useEditGate } from "@/hooks/useEditGate";
import {
  Plus, Paintbrush, Trash2, X, Save, Link as LinkIcon, Globe, Package, Edit2,
  ExternalLink, Search, Check, AlertCircle, Loader2, Upload, GripVertical,
  ChevronUp, ChevronDown,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ColorPicker } from "@/components/ColorPicker";

const CUSTOM = [
  { id: "website", name: "Website", Icon: Globe, color: "#60a5fa" },
  { id: "product", name: "Product", Icon: Package, color: "#34d399" },
];

// Every platform the picker offers: the shared icon catalogue plus the two
// generic "custom" entries.
const PLATFORM_PRESETS = [...PLATFORMS, ...CUSTOM];
const ALL_MAP = Object.fromEntries(PLATFORM_PRESETS.map((p) => [p.id, p]));

// The platforms people reach for first, surfaced on the page itself so adding a
// social link never means opening a dropdown.
const QUICK_PRESETS = [
  "discord", "tiktok", "instagram", "youtube", "twitch",
  "spotify", "x", "roblox", "github", "website",
];

// A per-platform hint so the add flow explains what it wants.
const URL_PLACEHOLDER = {
  discord: "https://discord.gg/your-invite",
  tiktok: "https://tiktok.com/@yourhandle",
  instagram: "https://instagram.com/yourhandle",
  youtube: "https://youtube.com/@yourchannel",
  twitch: "https://twitch.tv/yourchannel",
  spotify: "https://open.spotify.com/user/...",
  x: "https://x.com/yourhandle",
  roblox: "https://roblox.com/users/123456/profile",
  github: "https://github.com/yourhandle",
  steam: "https://steamcommunity.com/id/yourhandle",
  twitter: "https://x.com/yourhandle",
  website: "https://yourdomain.com",
  product: "https://yourstore.com/product",
};
const placeholderFor = (id) => URL_PLACEHOLDER[id] || "https://...";

// The global defaults. Anything a link leaves unset inherits from here, so the
// profile-wide "Global Styles" panel genuinely changes every link that follows
// it.
const readGlobals = (p = {}) => ({
  color: p.link_global_color || "",
  glow: p.link_global_glow || "",
  // Glow is opt-in since every preset used to stamp its own glow colour on each
  // link, which made a fresh page look like a neon sign.
  glowOn: p.link_glow ?? false,
  mode: p.link_global_mode || "card",
  cardStyle: p.link_global_card_style || "",
  iconStyle: p.link_global_icon_style || "bare",
  iconSize: p.link_global_icon_size || "md",
  iconFill: p.link_global_icon_fill ?? true,
});

const draftSignature = (links, globals) => JSON.stringify({ links, globals });

const selectable = (value, option) => value === option;

// A row of single-choice chips — used for every style picker. Radix-free so it
// never renders a native <select>.
function ChipRow({ label, options, value, onChange, testid }) {
  return (
    <div>
      {label && <label className="mb-2 block text-[11px] font-semibold text-zinc-400">{label}</label>}
      <div className="flex flex-wrap gap-2" data-testid={testid}>
        {options.map((o) => {
          const key = o.id === "" ? "none" : o.id;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(o.id)}
              title={o.label}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors duration-200 ${
                selectable(value, o.id)
                  ? "border-brand-500 bg-brand-500/20 text-brand-100"
                  : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/25 hover:text-zinc-200"
              }`}
            >
              {o.glyph ? `${o.glyph} ${o.label}` : o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Links() {
  const { user, setUser } = useAuth();
  const gate = useEditGate();

  const [links, setLinks] = useState(user.profile?.links || []);
  const [globals, setGlobals] = useState(() => readGlobals(user.profile));
  const [saving, setSaving] = useState(false);
  const [iconUploading, setIconUploading] = useState(false);
  // The save bar is a confirmation, not furniture: it appears while there is
  // something to save, lingers for a beat after a successful save so the owner
  // sees the save land, and then gets out of the way.
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef(null);
  const [savedSignature, setSavedSignature] = useState(() => draftSignature(user.profile?.links || [], readGlobals(user.profile)));

  // Link Popup Modal State
  const [activeModal, setActiveModal] = useState(null); // null | { isNew, index, link }
  const [showGlobalModal, setShowGlobalModal] = useState(false);
  const [platformQuery, setPlatformQuery] = useState("");
  const [dragIndex, setDragIndex] = useState(null);

  const dirty = draftSignature(links, globals) !== savedSignature;

  const filteredPlatforms = useMemo(() => {
    const q = platformQuery.trim().toLowerCase();
    if (!q) return PLATFORM_PRESETS;
    return PLATFORM_PRESETS.filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q));
  }, [platformQuery]);

  const openAddLinkModal = (platform = "website") => {
    const meta = ALL_MAP[platform] || {};
    setPlatformQuery("");
    setActiveModal({
      isNew: true,
      index: links.length,
      // Display fields are left unset so the link inherits the current global
      // defaults until the owner overrides them.
      link: {
        platform,
        label: meta.name || platform,
        url: "",
        username: "",
        color: meta.color || "#A48DF4",
        glow: "",
      },
    });
  };

  const openEditLinkModal = (i) => {
    setPlatformQuery("");
    setActiveModal({ isNew: false, index: i, link: { ...links[i] } });
  };

  const patchLink = (patch) =>
    setActiveModal((modal) => (modal ? { ...modal, link: { ...modal.link, ...patch } } : modal));

  // A custom icon is uploaded through the same endpoint the avatar uses, so it
  // lands on the owner's own storage and is served from there.
  const handleIconUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIconUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "link icon");
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      patchLink({ icon_url: data.url });
      toast.success("Icon uploaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setIconUploading(false);
    e.target.value = "";
  };

  const selectPlatform = (p) => {
    setActiveModal((modal) => {
      if (!modal) return modal;
      const previousName = ALL_MAP[modal.link.platform]?.name;
      const labelUnchanged = !modal.link.label || modal.link.label === previousName;
      return {
        ...modal,
        link: {
          ...modal.link,
          platform: p.id,
          // Only adopt the preset label/colour when the user has not written
          // their own — never clobber a custom label.
          label: labelUnchanged ? p.name : modal.link.label,
          color: p.color || modal.link.color,
        },
      };
    });
  };

  const saveModalLink = () => {
    if (!activeModal) return;
    const { isNew, index, link } = activeModal;
    if (isNew) {
      setLinks([...links, link]);
    } else {
      setLinks(links.map((l, idx) => (idx === index ? link : l)));
    }
    setActiveModal(null);
    toast.success("Link updated in draft");
  };

  const removeLink = (i) => {
    // Silent data loss otherwise — the draft list has no undo.
    const label = links[i]?.label || links[i]?.platform || "this link";
    if (!window.confirm(`Remove "${label}" from your profile?`)) return;
    setLinks(links.filter((_, idx) => idx !== i));
  };

  // Drag-to-reorder. The link order is what the profile renders, top to bottom.
  const moveLink = (from, to) => {
    if (from == null || from === to) return;
    const next = [...links];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLinks(next);
  };

  const saveAll = async () => {
    if (gate.guard("saving links")) return;
    setSaving(true);
    try {
      const { data } = await api.put("/me/profile", {
        links,
        link_glow: globals.glowOn,
        link_global_color: globals.color,
        link_global_glow: globals.glow,
        link_global_mode: globals.mode,
        link_global_card_style: globals.cardStyle,
        link_global_icon_style: globals.iconStyle,
        link_global_icon_size: globals.iconSize,
        link_global_icon_fill: globals.iconFill,
      });
      setUser(data);
      setSavedSignature(draftSignature(links, globals));
      toast.success("Links saved successfully!");
      setJustSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 2600);
    } catch {
      toast.error("Save failed");
    }
    setSaving(false);
  };

  const activeMeta = activeModal ? (ALL_MAP[activeModal.link.platform] || {}) : {};
  const ActiveIcon = activeMeta.Icon || LinkIcon;

  return (
    <div data-testid="links-page" className="space-y-8">
      {/* Header */}
      <div className="glass rounded-3xl p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2.5 font-display text-xl font-bold text-zinc-100">
              <LinkIcon className="h-5 w-5 text-brand-400" /> Links &amp; Social Media
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-zinc-400">
              Show a link as a full card or just its icon, pick a card or icon style, and give each one
              its own colour, glow and hover note. Ordering is yours.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <button
              data-testid="link-global-styles-btn"
              onClick={() => setShowGlobalModal(true)}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-brand-200 glass transition-colors duration-200 hover:bg-white/10"
              title="Global Colors & Styles"
            >
              <Paintbrush className="h-4 w-4" /> Global Styles
            </button>
            <button
              data-testid="add-link-btn"
              onClick={() => openAddLinkModal("discord")}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md transition-colors duration-200 hover:brightness-110"
            >
              <Plus className="h-4 w-4" /> Add Link
            </button>
          </div>
        </div>
      </div>

      {/* Preset quick-add */}
      <div className="glass rounded-3xl p-7" data-testid="link-presets">
        <h3 className="font-display text-base font-bold text-zinc-100">Quick add a preset</h3>
        <p className="mt-1.5 mb-5 text-sm text-zinc-400">
          One click fills in the icon, name and colours for you — no dropdown required.
        </p>

        <div className="flex flex-wrap gap-2.5">
          {QUICK_PRESETS.map((id) => {
            const preset = ALL_MAP[id];
            if (!preset) return null;
            return (
              <button
                key={id}
                type="button"
                data-testid={`link-preset-${id}`}
                onClick={() => openAddLinkModal(id)}
                title={`Add ${preset.name}`}
                className="group flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.07]"
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-xl"
                  style={{ background: `${preset.color}1f` }}
                >
                  <preset.Icon className="h-4 w-4" style={{ color: preset.color }} />
                </span>
                <span className="text-xs font-semibold text-zinc-300 transition-colors duration-200 group-hover:text-zinc-50">
                  {preset.name}
                </span>
                <Plus className="h-3 w-3 text-zinc-600 transition-colors duration-200 group-hover:text-brand-300" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Links list */}
      <div className="glass rounded-3xl p-7">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-zinc-100">Your links</h3>
          <span className="font-mono2 text-xs text-zinc-500">
            {links.length} {links.length === 1 ? "link" : "links"}
          </span>
        </div>

        <div className="space-y-3.5">
          {links.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/12 px-6 py-12 text-center">
              <LinkIcon className="mx-auto mb-3 h-6 w-6 text-zinc-600" />
              <p className="text-sm text-zinc-400">No links yet.</p>
              <p className="mt-1 font-mono2 text-xs text-zinc-600">
                Choose a preset above to create your first link card.
              </p>
            </div>
          )}

          {links.map((l, i) => {
            const meta = ALL_MAP[l.platform] || {};
            const Icon = meta.Icon || LinkIcon;
            const c = l.color || globals.color || meta.color || "#A48DF4";
            const glow = l.glow || globals.glow || "";

            return (
              <div
                key={i}
                data-testid={`link-row-${i}`}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { moveLink(dragIndex, i); setDragIndex(null); }}
                onDragEnd={() => setDragIndex(null)}
                className={`flex cursor-grab items-center justify-between gap-4 rounded-2xl border bg-white/[0.03] p-5 transition-colors duration-200 active:cursor-grabbing ${
                  dragIndex === i ? "border-brand-500/60 opacity-60" : "border-white/10 hover:border-brand-500/40"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <GripVertical className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-2xl border"
                      style={{
                        background: `${c}1f`,
                        borderColor: `${c}44`,
                        boxShadow: glow ? `0 0 18px ${glow}` : undefined,
                      }}
                    >
                      {/* The row has to show what the card shows: an uploaded icon
                          replaces the platform glyph, and the badge overlay sits
                          on top of whatever is there. */}
                      {fileUrl(l.icon_url) ? (
                        <img src={fileUrl(l.icon_url)} alt="" className="h-8 w-8 rounded-xl object-cover" />
                      ) : (
                        <Icon className="h-5 w-5" style={{ color: c }} />
                      )}
                    </span>
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-zinc-100">
                        {l.label || meta.name || l.platform}
                      </span>
                      <span className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 font-mono2 text-[9px] uppercase text-zinc-400">
                        {l.mode || globals.mode}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono2 text-xs text-zinc-400">
                      {l.url || l.username || "No URL specified yet"}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* Keyboard-accessible reorder: the drag handle only works
                      with a pointer. */}
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      data-testid={`link-up-${i}`}
                      disabled={i === 0}
                      onClick={() => moveLink(i, i - 1)}
                      aria-label={`Move ${l.label || l.platform || "link"} up`}
                      className="rounded-md bg-white/5 p-1 text-zinc-400 transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      data-testid={`link-down-${i}`}
                      disabled={i === links.length - 1}
                      onClick={() => moveLink(i, i + 1)}
                      aria-label={`Move ${l.label || l.platform || "link"} down`}
                      className="rounded-md bg-white/5 p-1 text-zinc-400 transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    data-testid={`link-edit-${i}`}
                    onClick={() => openEditLinkModal(i)}
                    className="flex items-center gap-1.5 rounded-xl bg-brand-500/15 px-3.5 py-2 text-xs font-semibold text-brand-300 transition-colors duration-200 hover:bg-brand-500/30"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    data-testid={`link-delete-${i}`}
                    onClick={() => removeLink(i)}
                    className="rounded-xl bg-red-500/10 p-2 text-red-400 transition-colors duration-200 hover:bg-red-500/20"
                    title="Delete Link"
                    aria-label={`Delete ${l.label || l.platform || "link"}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky save bar — the save action is never scrolled out of reach, but
          it only exists while there is something to save (or just afterwards,
          as the confirmation). */}
      <div className={`${dirty || justSaved ? "block" : "hidden"} sticky bottom-4 z-20`} data-testid="links-save-bar">
        <div className="glass-strong flex items-center justify-between gap-4 rounded-2xl border border-white/10 p-3.5 shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-2 text-xs">
            {dirty ? (
              <>
                <AlertCircle className="h-4 w-4 text-amber-300" />
                <span className="font-semibold text-amber-200">Unsaved changes</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                <span className="text-zinc-400">All changes saved</span>
              </>
            )}
          </div>

          <button
            data-testid="links-save-btn"
            onClick={saveAll}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-[0_0_24px_rgba(164, 141, 244,0.35)] transition-colors duration-200 hover:brightness-110 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save Links"}
          </button>
        </div>
      </div>

      {/* Link editor modal */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}
        >
          <div className="bg-[#0A0A0D]/95 backdrop-blur-2xl relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/15 p-7 shadow-[0_25px_90px_rgba(0,0,0,0.95),0_0_40px_rgba(164, 141, 244,0.15)] animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ background: `${activeMeta.color || "#A48DF4"}1f` }}
                >
                  <ActiveIcon className="h-4 w-4" style={{ color: activeMeta.color || "#A48DF4" }} />
                </span>
                <h3 className="font-display text-lg font-bold text-zinc-100">
                  {activeModal.isNew ? "Add Link Card" : "Edit Link Card"}
                </h3>
              </div>
              <button
                data-testid="link-modal-close"
                onClick={() => setActiveModal(null)}
                className="rounded-lg p-1.5 text-zinc-500 transition-colors duration-200 hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-8 pt-6">
              {/* Config */}
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-xs font-semibold text-zinc-300">Platform</label>

                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                    <input
                      data-testid="link-platform-search"
                      type="text"
                      value={platformQuery}
                      onChange={(e) => setPlatformQuery(e.target.value)}
                      placeholder={`Search ${PLATFORM_PRESETS.length} platforms…`}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-3 text-xs text-zinc-100 outline-none transition-colors duration-200 focus:border-brand-500/50"
                    />
                  </div>

                  <div
                    data-testid="link-platform-grid"
                    className="grid max-h-60 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4"
                  >
                    {filteredPlatforms.map((p) => {
                      const selected = activeModal.link.platform === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          data-testid={`link-platform-option-${p.id}`}
                          onClick={() => selectPlatform(p)}
                          title={p.name}
                          className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-[10px] font-semibold transition-colors duration-200 ${
                            selected
                              ? "border-brand-500 bg-brand-500/15 text-brand-100"
                              : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/25 hover:bg-white/[0.06]"
                          }`}
                        >
                          <p.Icon className="h-5 w-5" style={{ color: selected ? "#c4b5fd" : p.color }} />
                          <span className="w-full truncate text-center">{p.name}</span>
                        </button>
                      );
                    })}

                    {filteredPlatforms.length === 0 && (
                      <div className="col-span-full py-8 text-center text-xs text-zinc-500">
                        No platform matches “{platformQuery}”.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Display Label</label>
                  <input
                    data-testid="link-label-input"
                    type="text"
                    value={activeModal.link.label || ""}
                    onChange={(e) => patchLink({ label: e.target.value })}
                    placeholder="e.g. Join Official Discord"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs text-zinc-100 outline-none transition-colors duration-200 focus:border-brand-500/50"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-300">URL / Handle</label>
                  <input
                    data-testid="link-url-input"
                    type="text"
                    value={activeModal.link.url || ""}
                    onChange={(e) => patchLink({ url: e.target.value })}
                    placeholder={placeholderFor(activeModal.link.platform)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs text-zinc-100 outline-none transition-colors duration-200 focus:border-brand-500/50"
                  />
                </div>

                {/* Display style */}
                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Display style</div>
                  <ChipRow
                    label="Show as"
                    options={LINK_MODES}
                    value={activeModal.link.mode || globals.mode}
                    onChange={(v) => patchLink({ mode: v })}
                  />
                  {(activeModal.link.mode || globals.mode) === "icon" ? (
                    <>
                      <ChipRow
                        label="Icon shape"
                        options={LINK_ICON_STYLES}
                        value={activeModal.link.icon_style || globals.iconStyle}
                        onChange={(v) => patchLink({ icon_style: v })}
                      />
                      <ChipRow
                        label="Icon size"
                        options={ICON_SIZES}
                        value={activeModal.link.icon_size || globals.iconSize}
                        onChange={(v) => patchLink({ icon_size: v })}
                      />
                    </>
                  ) : (
                    <ChipRow
                      label="Card style"
                      options={LINK_CARD_STYLES}
                      value={activeModal.link.card_style ?? globals.cardStyle}
                      onChange={(v) => patchLink({ card_style: v })}
                    />
                  )}
                  <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                    <span>Filled icon background</span>
                    <Switch
                      checked={activeModal.link.icon_fill ?? globals.iconFill}
                      onCheckedChange={(v) => patchLink({ icon_fill: v })}
                    />
                  </label>
                </div>

                {/* Custom icon, description & glow */}
                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Custom icon &amp; description</div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                      {activeModal.link.icon_url ? (
                        <img src={fileUrl(activeModal.link.icon_url)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ActiveIcon className="h-5 w-5" style={{ color: activeMeta.color || "#A48DF4" }} />
                      )}
                    </span>
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-brand-500/30 bg-brand-500/15 px-3 py-2 text-[11px] font-semibold text-brand-100 transition-colors duration-200 hover:bg-brand-500/25">
                        {iconUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {activeModal.link.icon_url ? "Replace icon" : "Upload icon"}
                        <input
                          data-testid="link-icon-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={iconUploading}
                          onChange={handleIconUpload}
                        />
                      </label>
                      {activeModal.link.icon_url ? (
                        <button
                          type="button"
                          onClick={() => patchLink({ icon_url: "" })}
                          className="rounded-xl bg-red-500/10 p-2 text-red-400 transition-colors duration-200 hover:bg-red-500/20"
                          aria-label="Remove custom icon"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-500">PNG, JPG or SVG — replaces the platform glyph.</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Short description</label>
                    <input
                      data-testid="link-desc-input"
                      type="text"
                      value={activeModal.link.desc || ""}
                      onChange={(e) => patchLink({ desc: e.target.value })}
                      placeholder="e.g. Our community · 40k members"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs text-zinc-100 outline-none transition-colors duration-200 focus:border-brand-500/50"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Tooltip</label>
                    <input
                      data-testid="link-tooltip-input"
                      type="text"
                      value={activeModal.link.tooltip || ""}
                      onChange={(e) => patchLink({ tooltip: e.target.value })}
                      placeholder="Shown when a visitor hovers this link"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs text-zinc-100 outline-none transition-colors duration-200 focus:border-brand-500/50"
                    />
                  </div>

                  {(activeModal.link.desc || "") !== "" && (
                    <ChipRow
                      label="Description behaviour"
                      options={LINK_FOLDS}
                      value={activeModal.link.fold || ""}
                      onChange={(v) => patchLink({ fold: v })}
                    />
                  )}

                  <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                    <span>Glow around this link</span>
                    <Switch
                      checked={!!(activeModal.link.glow_on ?? globals.glowOn)}
                      onCheckedChange={(v) => patchLink({ glow_on: v })}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <ColorPicker label="Custom Color" value={activeModal.link.color || "#A48DF4"} onChange={(v) => patchLink({ color: v })} />
                  <ColorPicker label="Custom Glow" value={activeModal.link.glow || "#A48DF4"} onChange={(v) => patchLink({ glow: v })} />
                </div>
              </div>

            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-5">
              <button
                data-testid="link-modal-cancel"
                onClick={() => setActiveModal(null)}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-zinc-400 glass transition-colors duration-200 hover:text-white"
              >
                Cancel
              </button>
              <button
                data-testid="link-modal-apply"
                onClick={saveModalLink}
                className="rounded-xl bg-brand-500 px-5 py-2.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-brand-600"
              >
                Apply Link Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global styles modal */}
      {showGlobalModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowGlobalModal(false); }}
        >
          <div className="glass-strong relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/15 p-7 shadow-[0_20px_80px_rgba(0,0,0,0.9)] animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div className="flex items-center gap-2.5">
                <Paintbrush className="h-5 w-5 text-brand-400" />
                <h3 className="font-display text-base font-bold text-zinc-100">Global Link Styles</h3>
              </div>
              <button
                data-testid="link-global-modal-close"
                onClick={() => setShowGlobalModal(false)}
                className="rounded-lg p-1.5 text-zinc-500 transition-colors duration-200 hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 pt-5">
              <ChipRow
                label="Default display"
                options={LINK_MODES}
                value={globals.mode}
                onChange={(v) => setGlobals({ ...globals, mode: v })}
              />
              <ChipRow
                label="Default card style"
                options={LINK_CARD_STYLES}
                value={globals.cardStyle}
                onChange={(v) => setGlobals({ ...globals, cardStyle: v })}
              />
              <ChipRow
                label="Default icon shape"
                options={LINK_ICON_STYLES}
                value={globals.iconStyle}
                onChange={(v) => setGlobals({ ...globals, iconStyle: v })}
              />
              <ChipRow
                label="Default icon size"
                options={ICON_SIZES}
                value={globals.iconSize}
                onChange={(v) => setGlobals({ ...globals, iconSize: v })}
              />

              <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                <span>Filled icon background</span>
                <Switch checked={globals.iconFill} onCheckedChange={(v) => setGlobals({ ...globals, iconFill: v })} />
              </label>
              <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                <span>Glow around links</span>
                <Switch
                  data-testid="link-glow-toggle"
                  checked={globals.glowOn}
                  onCheckedChange={(v) => setGlobals({ ...globals, glowOn: v })}
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <ColorPicker label="Global Color" value={globals.color || "#A48DF4"} onChange={(v) => setGlobals({ ...globals, color: v })} />
                <ColorPicker label="Global Glow" value={globals.glow || "#A48DF4"} onChange={(v) => setGlobals({ ...globals, glow: v })} />
              </div>

              <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-[11px] leading-relaxed text-zinc-400">
                Links with their own colour or style keep it. These defaults apply to every link that
                doesn&apos;t set its own.
              </p>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  {dirty ? (
                    <>
                      <AlertCircle className="h-3.5 w-3.5 text-amber-300" />
                      <span className="text-amber-200">Remember to save your links</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Saved</span>
                    </>
                  )}
                </div>
                <button
                  data-testid="link-global-modal-done"
                  onClick={() => setShowGlobalModal(false)}
                  className="rounded-xl bg-brand-500 px-5 py-2.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-brand-600"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
