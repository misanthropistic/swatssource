import { useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, fileUrl } from "@/lib/api";
import { TRACK_STYLES, resolveTrackStyle } from "@/constants/effects";
import {
  WIDGET_KINDS, WIDGET_FIELDS, KIND_MAP, WIDGET_SPANS, GENERIC_WIDGET_ICON, DISCORD_STYLES,
  WIDGET_CARD_STYLES, WIDGET_CARD_STYLE_MAP, widgetCardStyleId,
} from "@/constants/widgets";
import { WidgetCard, WidgetPill } from "@/components/WidgetCards";
import { TrackStylePreview } from "@/components/TrackStylePreview";
import { Modal } from "@/components/ui-shared/Modal";

// One line per player style, shown under its preview in the browse dialog.
// Three styles, three shapes: the line, the small card, the corner chip.
const TRACK_STYLE_BLURB = {
  "mini-bar": "Just a slim line — play, title, scrubber, time. No background.",
  compact: "A small player with artwork icon, title and progress.",
  "corner-icon": "A speaker icon pinned to the page's top-left corner; the audio bar pops out on hover.",
};
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/lib/notify";
import { useEditGate } from "@/hooks/useEditGate";
import {
  Plus, Trash2, Save, Lock, Music, Upload, Loader2, Shuffle, X,
  Edit2, Check, BookOpen, LayoutGrid, RefreshCw, Image as ImageIcon, GripVertical,
  Sparkles,
} from "lucide-react";
import { ColorPicker } from "@/components/ColorPicker";
import { PremiumGate } from "@/components/ui-shared/PremiumGate";

// ---------------------------------------------------------------------------
// Widget editor
//
// A widget is nothing but a pointer at a live source: a username, an ID, a
// link — plus display options. Every number, avatar and status on the profile
// is fetched from the real API by the backend proxy (see routes/widgets.js).
// That is why there is no field here for a member count or a follower number:
// you cannot type one in, because the value would be invented.
// ---------------------------------------------------------------------------

// The identifier fields a chosen subtype actually needs. Everything else is a
// display option (title, width, colour, glow).
const subtypeOf = (widget) => {
  const kind = KIND_MAP[widget?.type];
  if (!kind) return null;
  return kind.subtypes.find((s) => s.id === widget.subtype) || kind.subtypes[0] || null;
};

const fieldsFor = (widget) => {
  const sub = subtypeOf(widget);
  return (sub?.fields || []).map((id) => ({ id, ...WIDGET_FIELDS[id] })).filter((f) => f.id);
};

// Legacy keys kept on the stored object (always empty) so older saved widgets
// stay shape-compatible. The editor never writes a value into any of them.
const LEGACY_EMPTY = {
  online_count: "", member_count: "", friends: "", followers: "",
  visits: "", likes: "", kd_ratio: "", level: "", agent: "", rank: "",
  status: "", game: "", subscribers: "", album_art: "", track: "", artist: "",
  server_name: "", invite_url: "", value: "", username: "", url: "", code: "",
  server_id: "", user_id: "", group_id: "", game_url: "", channel: "", repo: "",
  riot_id: "", timezone: "", date: "", embed: false,
  // "classic" keeps the full Discord card; the other three strip it back.
  discord_style: "classic",
  glow_on: false,
};

const blankWidget = (kind) => ({
  type: kind.id,
  subtype: kind.subtypes?.[0]?.id || "",
  title: kind.label,
  span: 2,
  color: "",
  glow: "",
  ...LEGACY_EMPTY,
});

const snapshot = (widgets, tracks, trackStyle, shuffle, volume, trackPosition) =>
  JSON.stringify({ widgets, tracks, trackStyle, shuffle, volume, trackPosition });

export default function Widgets() {
  const { user, setUser } = useAuth();
  const gate = useEditGate();
  const isPremium = user.tier === "premium" || user.tier === "admin" || user.is_owner;

  // resolveTrackStyle folds every legacy saved id ("default", "simplistic",
  // "wide", "vinyl"…) onto one of the three styles that exist, so the picker
  // always shows a real selection.
  const savedTrackStyle = resolveTrackStyle(user.profile?.track_style);
  const savedShuffle = !!user.profile?.track_shuffle;
  const savedVolume = user.profile?.track_volume ?? 80;
  // Where the player sits: in the card's flow (as shipped) or lifted to the
  // page's top-right corner. Saved as track_position on the profile.
  const savedTrackPosition = user.profile?.track_position || "";

  // The profile accent drives the style previews, so a mock player matches the
  // colours the owner's real player will use.
  const accentColor = user.profile?.accent_color || "#FF7FBC";

  const [widgets, setWidgets] = useState(user.profile?.widgets || []);
  const [tracks, setTracks] = useState(user.profile?.tracks || []);
  const [trackStyle, setTrackStyle] = useState(savedTrackStyle);
  const [shuffle, setShuffle] = useState(savedShuffle);
  const [volume, setVolume] = useState(savedVolume);
  const [trackPosition, setTrackPosition] = useState(savedTrackPosition);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // The save bar is a confirmation, not furniture: it appears while there is
  // something to save, lingers for a beat after a successful save so the owner
  // sees the save land, and then gets out of the way.
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef(null);

  // Baseline used to tell the owner whether they have unsaved changes.
  const baseline = useRef(snapshot(user.profile?.widgets || [], user.profile?.tracks || [], savedTrackStyle, savedShuffle, savedVolume, savedTrackPosition));
  const dirty = baseline.current !== snapshot(widgets, tracks, trackStyle, shuffle, volume, trackPosition);

  const [activeModal, setActiveModal] = useState(null); // null | { isNew, index, widget }
  const [premiumFeature, setPremiumFeature] = useState(null); // feature name when a premium action is attempted
  const [coverUploading, setCoverUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [widgetDragIndex, setWidgetDragIndex] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [previewPill, setPreviewPill] = useState(false);
  // Full-size look at every player style, since the picker grid can only show
  // them at thumbnail size.
  const [showStyleGallery, setShowStyleGallery] = useState(false);

  // Discord banner upload: used by the Banner layout when the server has no
  // banner of its own (Discord only exposes it through the invite API).
  const uploadDiscordBanner = async (file) => {
    if (!file) return;
    setBannerUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "asset");
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      patchActiveWidget({ banner_url: data.url });
      toast.success("Banner uploaded!");
    } catch {
      toast.error("Banner upload failed");
    }
    setBannerUploading(false);
  };

  const openAddWidgetModal = (kind) => {
    if (kind.premium && !isPremium) {
      // The dialog explains what is locked and offers the plans; the old toast
      // plus a redirect out of the page lost whatever was half-edited here.
      setPremiumFeature(`${kind.label || kind.id} widgets`);
      return;
    }
    setActiveModal({ isNew: true, index: widgets.length, widget: blankWidget(kind) });
  };

  const openEditWidgetModal = (i) => {
    const kind = KIND_MAP[widgets[i].type];
    // Backfill the subtype for widgets saved before subtypes existed.
    setActiveModal({ isNew: false, index: i, widget: { ...blankWidget(kind || { id: widgets[i].type }), ...widgets[i] } });
  };

  const patchActiveWidget = (patch) =>
    setActiveModal((prev) => (prev ? { ...prev, widget: { ...prev.widget, ...patch } } : prev));

  // Drag-to-reorder: the widget order is what the profile renders.
  const moveWidget = (from, to) => {
    if (from == null || from === to) return;
    const next = [...widgets];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setWidgets(next);
  };

  const saveModalWidget = () => {
    if (!activeModal) return;
    const { isNew, index, widget } = activeModal;
    if (isNew) {
      setWidgets([...widgets, widget]);
    } else {
      setWidgets(widgets.map((w, idx) => (idx === index ? widget : w)));
    }
    setActiveModal(null);
    toast.success("Widget updated in draft — remember to save");
  };

  const removeWidget = async (i) => {
    if (gate.guard("deleting a widget")) return;
    const next = widgets.filter((_, idx) => idx !== i);
    setWidgets(next);
    try {
      const { data } = await api.put("/me/profile", {
        widgets: next,
        tracks,
        track_style: trackStyle,
        track_shuffle: shuffle,
        track_volume: volume,
        track_position: trackPosition,
      });
      setUser(data);
      baseline.current = snapshot(next, tracks, trackStyle, shuffle, volume, trackPosition);
      toast.success("Widget deleted");
    } catch {
      toast.error("Failed to delete widget");
    }
  };

  const clearAllWidgets = async () => {
    if (gate.guard("removing widgets")) return;
    if (!window.confirm("Are you sure you want to remove all widgets?")) return;
    setWidgets([]);
    try {
      const { data } = await api.put("/me/profile", {
        widgets: [],
        tracks,
        track_style: trackStyle,
        track_shuffle: shuffle,
        track_volume: volume,
        track_position: trackPosition,
      });
      setUser(data);
      baseline.current = snapshot([], tracks, trackStyle, shuffle, volume, trackPosition);
      toast.success("All widgets deleted");
    } catch {
      toast.error("Failed to clear widgets");
    }
  };

  const addTrackFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "audio");
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setTracks([...tracks, { title: file.name.replace(/\.[^.]+$/, ""), artist: "", url: data.url, cover: "" }]);
      toast.success("Audio track uploaded successfully!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleTrackCoverUpload = async (i, file) => {
    if (!file) return;
    setCoverUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "asset");
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setTracks(tracks.map((t, idx) => (idx === i ? { ...t, cover: data.url } : t)));
      toast.success("Track artwork updated!");
    } catch {
      toast.error("Cover upload failed");
    }
    setCoverUploading(false);
  };

  const removeTrack = (i) => setTracks(tracks.filter((_, idx) => idx !== i));

  const saveAll = async () => {
    if (gate.guard("saving widgets")) return;
    setSaving(true);
    try {
      const { data } = await api.put("/me/profile", {
        widgets,
        tracks,
        track_style: trackStyle,
        track_shuffle: shuffle,
        track_volume: volume,
        track_position: trackPosition,
      });
      setUser(data);
      baseline.current = snapshot(widgets, tracks, trackStyle, shuffle, volume, trackPosition);
      toast.success("Widgets & audio player saved!");
      setJustSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 2600);
    } catch {
      toast.error("Save failed");
    }
    setSaving(false);
  };

  // A one-line description built only from what the owner entered. It never
  // shows a statistic, because statistics come from the API at render time.
  const summaryFor = (w) => {
    const kind = KIND_MAP[w.type];
    const sub = subtypeOf(w);
    const label = kind?.label || w.type;
    const subLabel = kind && kind.subtypes.length > 1 && sub ? `${label} · ${sub.label}` : label;
    const field = fieldsFor(w)[0];
    const entered = field ? w[field.key] : "";
    if (field && !entered) return `${subLabel} · needs ${field.label.toLowerCase()}`;
    if (field) return `${subLabel} · ${entered}`;
    return `${subLabel} · live`;
  };

  const accentFor = (w) => {
    const kind = KIND_MAP[w.type];
    return w.color || kind?.color || "#FF7FBC";
  };

  return (
    <div data-testid="widgets-page" className="space-y-8 pb-28">
      {/* Preset Gallery */}
      <div className="glass rounded-3xl p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-lg font-bold text-zinc-100 flex items-center gap-2.5">
              <LayoutGrid className="w-5 h-5 text-brand-400" /> Widget presets
            </h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              Pick a card, point it at your profile, group, server or link — the card pulls every
              number and avatar live. You never type a member count or a follower figure by hand.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            className="px-4 py-2.5 rounded-xl bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-brand-300 text-xs font-semibold transition flex items-center gap-2 shrink-0 self-start sm:self-auto cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-brand-400" /> Widget Setup Guides & Tutorials
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {WIDGET_KINDS.map((kind) => {
            const locked = kind.premium && !isPremium;
            const Icon = kind.Icon || GENERIC_WIDGET_ICON;
            return (
              <button
                key={kind.id}
                type="button"
                data-testid={`add-widget-${kind.id}`}
                onClick={() => openAddWidgetModal(kind)}
                className={`group relative text-left p-5 rounded-2xl border transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                  locked
                    ? "border-white/10 bg-white/[0.015] hover:border-white/20"
                    : "border-white/10 bg-white/[0.02] hover:border-brand-500/50 hover:bg-brand-500/[0.07]"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span
                    className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border"
                    style={{ background: `${kind.color}1f`, borderColor: `${kind.color}44` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: kind.color }} />
                  </span>
                  {locked ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[9px] font-bold uppercase">
                      <Lock className="w-3 h-3" /> Premium
                    </span>
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-white/5 group-hover:bg-brand-500/25 flex items-center justify-center transition-colors duration-200">
                      <Plus className="w-3.5 h-3.5 text-zinc-400 group-hover:text-brand-200" />
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-zinc-100">{kind.label}</div>
                <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{kind.desc}</div>
                {kind.subtypes.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {kind.subtypes.map((s) => (
                      <span key={s.id} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-semibold text-zinc-400">
                        {s.label}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Configured Widgets */}
      <div className="glass rounded-3xl p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-bold text-zinc-100">Your widgets</h2>
            <span className="text-xs font-mono2 text-zinc-500">
              {widgets.length} {widgets.length === 1 ? "widget" : "widgets"}
            </span>
          </div>
          {widgets.length > 0 && (
            <button
              type="button"
              onClick={clearAllWidgets}
              className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear all
            </button>
          )}
        </div>

        {/* Dense and span-aware: a Full-width card takes both columns, and a
            Half-width card back-fills the gap beside a taller one instead of
            being pushed down — so this list looks like the profile it becomes. */}
        {widgets.length === 0 ? (
          <div className="text-center py-14 border border-dashed border-white/10 rounded-2xl">
            <LayoutGrid className="w-7 h-7 text-zinc-600 mx-auto mb-3" />
            <div className="text-sm text-zinc-400">No widgets yet</div>
            <div className="text-xs text-zinc-600 mt-1">Choose a preset above to build your first live card.</div>
          </div>
        ) : (
          <div className="grid auto-rows-min grid-flow-row-dense gap-4 sm:grid-cols-2">
            {widgets.map((w, i) => {
              const kind = KIND_MAP[w.type] || {};
              const Icon = kind.Icon || GENERIC_WIDGET_ICON;
              const color = accentFor(w);
              const sub = subtypeOf(w);
              return (
                <div
                  key={i}
                  data-testid={`widget-row-${i}`}
                  draggable
                  onDragStart={() => setWidgetDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { moveWidget(widgetDragIndex, i); setWidgetDragIndex(null); }}
                  onDragEnd={() => setWidgetDragIndex(null)}
                  className={`cursor-grab rounded-2xl border bg-white/[0.02] p-5 transition-colors duration-200 active:cursor-grabbing ${
                    Number(w.span ?? 2) === 2 ? "sm:col-span-2" : ""
                  } ${
                    widgetDragIndex === i ? "border-brand-500/60 opacity-60" : "border-white/10 hover:border-brand-500/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <GripVertical className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
                      <span
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                        style={{ background: `${color}1f`, borderColor: `${color}44` }}
                      >
                        <Icon className="w-5 h-5" style={{ color }} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-zinc-100 truncate">{w.title || kind.label || w.type}</div>
                        <div className="text-[11px] text-zinc-500 font-mono2">
                          {kind.label || w.type}{kind.subtypes?.length > 1 && sub ? ` · ${sub.label}` : ""}
                          {" · "}
                          {Number(w.span ?? 2) === 2 ? "Full width" : "Half width"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditWidgetModal(i)}
                        className="p-2 rounded-xl bg-brand-500/15 text-brand-300 hover:bg-brand-500/30 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                        title="Edit widget"
                        aria-label={`Edit ${w.title || w.type}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeWidget(i)}
                        className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                        title="Delete widget"
                        aria-label={`Delete ${w.title || w.type}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 text-xs text-zinc-300 font-mono2 truncate">
                    {summaryFor(w)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Audio Section */}
      <div className="glass rounded-3xl p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-lg font-bold text-zinc-100 flex items-center gap-2.5">
              <Music className="w-5 h-5 text-brand-400" /> Audio tracks
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              Upload MP3/WAV tracks for the player on your profile.
            </p>
          </div>

          <label className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-xs font-semibold cursor-pointer hover:brightness-110 transition-colors duration-200 flex items-center justify-center gap-2 shadow-md shrink-0">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload track
            <input type="file" accept="audio/*" onChange={addTrackFile} disabled={uploading} className="hidden" />
          </label>
        </div>

        <div className="space-y-3 mb-6">
          {tracks.length === 0 && (
            <div className="text-center py-10 text-zinc-500 text-xs font-mono2 border border-dashed border-white/10 rounded-2xl">
              No tracks yet. Upload an MP3 to enable background music.
            </div>
          )}

          {tracks.map((t, i) => (
            <div key={i} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row items-center gap-4">
              <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-white/10 group">
                {t.cover ? (
                  <img src={fileUrl(t.cover)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-6 h-6 text-zinc-500 m-auto mt-5" />
                )}
                <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center cursor-pointer text-[10px] text-white font-bold">
                  {coverUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cover"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleTrackCoverUpload(i, e.target.files?.[0])}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex-1 space-y-2 w-full">
                <input
                  type="text"
                  value={t.title || ""}
                  onChange={(e) => setTracks(tracks.map((tr, idx) => (idx === i ? { ...tr, title: e.target.value } : tr)))}
                  placeholder="Track title"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs font-semibold text-zinc-100 outline-none focus:border-brand-500/50"
                />
                <input
                  type="text"
                  value={t.artist || ""}
                  onChange={(e) => setTracks(tracks.map((tr, idx) => (idx === i ? { ...tr, artist: e.target.value } : tr)))}
                  placeholder="Artist"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-zinc-300 outline-none focus:border-brand-500/50"
                />
              </div>

              <button
                onClick={() => removeTrack(i)}
                className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors duration-200 self-end sm:self-center"
                aria-label="Delete track"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-8 pt-6 border-t border-white/10">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="text-xs font-semibold text-zinc-300">Player style</label>
              <button
                type="button"
                data-testid="browse-track-styles"
                onClick={() => setShowStyleGallery(true)}
                className="flex items-center gap-1.5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-[11px] font-semibold text-brand-200 transition-colors duration-200 hover:bg-brand-500/20"
              >
                <Sparkles className="h-3.5 w-3.5" /> Browse all styles
              </button>
            </div>

            {/* Each style draws itself, so the choice is made by eye instead of
                by reading a word and hoping. */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2">
              {TRACK_STYLES.map((s) => {
                const active = trackStyle === s.id;
                const locked = !!s.premium && !isPremium;
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-testid={`track-style-${s.id}`}
                    aria-pressed={active}
                    onClick={() => {
                      if (locked) { setPremiumFeature(`The ${s.label} player style`); return; }
                      setTrackStyle(s.id);
                    }}
                    className={`rounded-2xl border p-2.5 text-left transition-colors duration-200 ${
                      active
                        ? "border-brand-500/60 bg-brand-500/15"
                        : "border-white/10 hover:border-white/25 hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="mb-2 block overflow-hidden rounded-xl">
                      <TrackStylePreview id={s.id} accent={accentColor} />
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold ${active ? "text-brand-200" : "text-zinc-200"}`}>{s.label}</span>
                      {locked && <Lock className="h-3 w-3 text-amber-400" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 mb-2.5">
                <span>Default volume</span>
                <span className="font-mono2 text-brand-400">{volume}%</span>
              </div>
              <Slider
                data-testid="volume-slider"
                min={0}
                max={100}
                step={1}
                value={[volume]}
                onValueChange={([v]) => setVolume(v)}
                className="[&_[role=slider]]:border-brand-400/60 [&_[role=slider]]:bg-brand-500 [&_.absolute]:bg-brand-500"
                aria-label="Default player volume"
              />
            </div>

            <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
              <span className="flex items-center gap-2.5">
                <Shuffle className="w-4 h-4 text-brand-400" /> Shuffle tracks
              </span>
              <Switch
                data-testid="track-shuffle-toggle"
                className="h-5 w-9 shrink-0 rounded-full border border-white/15 transition-colors duration-200 data-[state=checked]:border-brand-400/60 data-[state=checked]:bg-brand-500 data-[state=unchecked]:bg-white/10"
                checked={shuffle}
                onCheckedChange={setShuffle}
              />
            </label>

            {/* The player used to ride above the page — the "top right media
                player" — and the card-internal styles folded it into the flow.
                This puts the pin back as an explicit choice. Corner Icon pins
                itself regardless. */}
            <div>
              <div className="mb-2.5 text-xs font-semibold text-zinc-300">Player position</div>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { id: "", label: "In card", hint: "rides in the card" },
                  { id: "top-left", label: "Top left", hint: "pinned, over the page" },
                  { id: "top-right", label: "Top right", hint: "pinned, over the page" },
                ].map((pos) => {
                  const active = (trackPosition || "") === pos.id;
                  return (
                    <button
                      key={pos.id || "card"}
                      type="button"
                      data-testid={`track-position-${pos.id || "card"}`}
                      aria-pressed={active}
                      onClick={() => setTrackPosition(pos.id)}
                      className={`rounded-2xl border px-3 py-2.5 text-left transition-colors duration-200 cursor-pointer ${
                        active
                          ? "border-brand-500/60 bg-brand-500/15"
                          : "border-white/10 hover:border-white/25 hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className={`block text-xs font-bold ${active ? "text-brand-200" : "text-zinc-200"}`}>{pos.label}</span>
                      <span className="block mt-0.5 text-[10px] text-zinc-500">{pos.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky save bar — only while there is something to save (or just
          after a save, as the confirmation). */}
      <div
        data-testid="widget-save-bar"
        className={`${dirty || justSaved ? "flex" : "hidden"} sticky bottom-4 z-20 glass-strong rounded-2xl border border-white/10 p-3 items-center justify-between gap-4 shadow-[0_10px_40px_rgba(0,0,0,0.6)]`}
      >
        <div className="flex items-center gap-2.5 text-xs pl-2 min-w-0">
          {dirty ? (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span className="text-amber-300 font-semibold truncate" data-testid="widget-dirty-indicator">
                Unsaved changes
              </span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-zinc-400 truncate">All changes saved</span>
            </>
          )}
        </div>

        <button
          onClick={saveAll}
          disabled={saving}
          data-testid="widget-save-btn"
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold text-sm hover:brightness-110 transition-colors duration-200 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(255,127,188,0.28)] shrink-0"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </div>

      {/* Every player style at full size. The grid in the page shows each one as
          a thumbnail; this is where a serious choice gets made. */}
      <Modal
        open={showStyleGallery}
        onClose={() => setShowStyleGallery(false)}
        icon={Music}
        size="lg"
        testid="track-style-gallery"
        title="Player styles"
        description="How your audio player looks on your profile. Pick one and it applies to every visitor."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {TRACK_STYLES.map((s) => {
            const active = trackStyle === s.id;
            const locked = !!s.premium && !isPremium;
            return (
              <div
                key={s.id}
                data-testid={`gallery-style-${s.id}`}
                className={`rounded-2xl border p-3.5 transition-colors duration-200 ${
                  active ? "border-brand-500/60 bg-brand-500/10" : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="flex justify-center rounded-xl bg-[#08080b] py-3.5">
                  <TrackStylePreview id={s.id} accent={accentColor} size="lg" />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-100">{s.label}</span>
                  {locked && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 font-mono2 text-[9px] font-bold uppercase tracking-wide text-amber-300">
                      <Lock className="h-2.5 w-2.5" /> Premium
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{TRACK_STYLE_BLURB[s.id]}</p>
                <button
                  type="button"
                  data-testid={`gallery-use-${s.id}`}
                  disabled={active}
                  onClick={() => {
                    if (locked) { setShowStyleGallery(false); setPremiumFeature(`The ${s.label} player style`); return; }
                    setTrackStyle(s.id);
                    setShowStyleGallery(false);
                  }}
                  className={`mt-3 w-full rounded-xl px-4 py-2 text-xs font-semibold transition-colors duration-200 ${
                    active
                      ? "border border-white/10 text-zinc-500"
                      : "bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:brightness-110"
                  }`}
                >
                  {active ? "In use" : locked ? "Unlock with Premium" : "Use this style"}
                </button>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Widget config modal */}
      <PremiumGate
        open={!!premiumFeature}
        feature={premiumFeature}
        onClose={() => setPremiumFeature(null)}
      />

      {activeModal && (() => {
        const kind = KIND_MAP[activeModal.widget.type] || { label: activeModal.widget.type, color: "#FF7FBC", subtypes: [] };
        const KindIcon = kind.Icon || GENERIC_WIDGET_ICON;
        const sub = subtypeOf(activeModal.widget);
        const fields = fieldsFor(activeModal.widget);
        const color = activeModal.widget.color || kind.color || "#FF7FBC";
        const glow = activeModal.widget.glow || "";
        return (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null); }}
          >
            <div className="glass-strong rounded-3xl p-5 max-w-3xl w-full relative shadow-[0_20px_80px_rgba(0,0,0,0.9)] border border-white/15 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center border"
                    style={{ background: `${kind.color}1f`, borderColor: `${kind.color}44` }}
                  >
                    <KindIcon className="w-4 h-4" style={{ color: kind.color }} />
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-bold text-zinc-100">Configure {kind.label}</h3>
                    <p className="text-[11px] text-zinc-500">Saved live — every value is read from the real API.</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveModal(null)}
                  className="p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors duration-200"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-6 pt-5">
                <div className="space-y-4">
                  {kind.subtypes.length > 1 && (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-2">Card type</label>
                      <div className="grid grid-cols-3 gap-2">
                        {kind.subtypes.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            data-testid={`widget-subtype-${s.id}`}
                            onClick={() => patchActiveWidget({ subtype: s.id })}
                            className={`p-2.5 rounded-xl border text-[11px] font-semibold transition-colors duration-200 ${
                              sub?.id === s.id
                                ? "bg-brand-500/20 border-brand-500/50 text-brand-200"
                                : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {fields.map((f) => (
                    <div key={f.id}>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">{f.label}</label>
                      {f.type === "textarea" ? (
                        <textarea
                          rows={5}
                          data-testid={`widget-field-${f.id}`}
                          value={activeModal.widget[f.key] || ""}
                          onChange={(e) => patchActiveWidget({ [f.key]: e.target.value })}
                          placeholder={f.placeholder || ""}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/10 font-mono2 text-xs text-zinc-100 outline-none focus:border-brand-500/50 resize-none"
                        />
                      ) : (
                        <input
                          type={f.type === "datetime-local" ? "datetime-local" : "text"}
                          data-testid={`widget-field-${f.id}`}
                          value={activeModal.widget[f.key] || ""}
                          onChange={(e) => patchActiveWidget({ [f.key]: e.target.value })}
                          placeholder={f.placeholder || ""}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-zinc-100 outline-none focus:border-brand-500/50"
                        />
                      )}
                      {f.help && <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">{f.help}</p>}
                    </div>
                  ))}

                  {fields.length === 0 && (
                    <p className="text-xs text-zinc-400 leading-relaxed rounded-xl bg-white/[0.02] border border-white/10 p-3.5">
                      This card needs no setup — it reads a real value straight from your account.
                    </p>
                  )}

                  {(activeModal.widget.type === "spotify" || activeModal.widget.type === "soundcloud") && (
                    <label className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.02] border border-white/10 p-3.5 text-xs text-zinc-300 cursor-pointer">
                      <span>
                        <span className="block font-semibold">Interactive embed player</span>
                        <span className="block text-[11px] text-zinc-500">Play the track right on your profile instead of a card</span>
                      </span>
                      <Switch
                        data-testid="widget-embed-toggle"
                        className="h-5 w-9 shrink-0 rounded-full border border-white/15 transition-colors duration-200 data-[state=checked]:border-brand-400/60 data-[state=checked]:bg-brand-500 data-[state=unchecked]:bg-white/10"
                        checked={!!activeModal.widget.embed}
                        onCheckedChange={(v) => patchActiveWidget({ embed: v })}
                      />
                    </label>
                  )}

                  {activeModal.widget.type === "discord" && (sub?.id || "server") === "server" && (
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-zinc-300">Discord layout</label>
                      <div className="grid grid-cols-3 gap-2">
                        {DISCORD_STYLES.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            data-testid={`discord-style-${s.id}`}
                            onClick={() => patchActiveWidget({ discord_style: s.id })}
                            className={`rounded-xl border p-2.5 text-[11px] font-semibold transition-colors duration-200 ${
                              (activeModal.widget.discord_style || "classic") === s.id
                                ? "border-brand-500/50 bg-brand-500/20 text-brand-200"
                                : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                        Classic is the full card with a strip of real members, Minimal is a single compact row,
                        and Banner puts the server banner across the top with the crew beneath it.
                      </p>

                      {(activeModal.widget.discord_style || "classic") === "banner" && (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">Server banner</div>
                          <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
                            Discord only shares a server&apos;s banner through an invite, so add one to pull it in
                            automatically — or upload your own image as the banner.
                          </p>
                          <div className="flex items-center gap-3">
                            <div className="h-14 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
                              {activeModal.widget.banner_url ? (
                                <img src={fileUrl(activeModal.widget.banner_url)} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-zinc-600">
                                  <ImageIcon className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                            <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-brand-500/30 bg-brand-500/15 px-3 py-2 text-[11px] font-semibold text-brand-100 transition hover:bg-brand-500/25">
                              {bannerUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                              {activeModal.widget.banner_url ? "Replace banner" : "Upload banner"}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={bannerUploading}
                                onChange={(e) => uploadDiscordBanner(e.target.files?.[0])}
                              />
                            </label>
                            {activeModal.widget.banner_url && (
                              <button
                                type="button"
                                onClick={() => patchActiveWidget({ banner_url: "" })}
                                className="rounded-xl bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20"
                                aria-label="Remove banner"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Widget title (optional)</label>
                    <input
                      type="text"
                      value={activeModal.widget.title || ""}
                      onChange={(e) => patchActiveWidget({ title: e.target.value })}
                      placeholder={kind.label}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-zinc-100 outline-none focus:border-brand-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Tooltip (optional)</label>
                    <input
                      type="text"
                      value={activeModal.widget.tooltip || ""}
                      onChange={(e) => patchActiveWidget({ tooltip: e.target.value })}
                      placeholder="Shown when a visitor hovers this widget"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-zinc-100 outline-none focus:border-brand-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-2">Width</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {WIDGET_SPANS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => patchActiveWidget({ span: s.id })}
                          className={`p-2.5 rounded-xl border text-[11px] font-semibold transition-colors duration-200 ${
                            Number(activeModal.widget.span ?? 2) === s.id
                              ? "bg-brand-500/20 border-brand-500/50 text-brand-200"
                              : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <ColorPicker label="Widget Color" value={color} onChange={(v) => patchActiveWidget({ color: v })} />
                    <ColorPicker label="Widget Glow" value={glow || "#000000"} onChange={(v) => patchActiveWidget({ glow: `${v}80` })} />
                  </div>

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5 text-xs text-zinc-300">
                    <span>
                      <span className="block font-semibold">Widget Background</span>
                      <span className="block text-[11px] text-zinc-500">
                        Enable dark card surface background or remove for transparent
                      </span>
                    </span>
                    <Switch
                      data-testid="widget-bg-toggle"
                      className="h-5 w-9 shrink-0 rounded-full border border-white/15 transition-colors duration-200 data-[state=checked]:border-brand-400/60 data-[state=checked]:bg-brand-500 data-[state=unchecked]:bg-white/10"
                      checked={activeModal.widget.background !== false && !activeModal.widget.transparent}
                      onCheckedChange={(v) => patchActiveWidget({ background: v, transparent: !v })}
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5 text-xs text-zinc-300">
                    <span>
                      <span className="block font-semibold">Compact density</span>
                      <span className="block text-[11px] text-zinc-500">
                        Tightens the card's own padding — worth it when a profile carries several widgets
                      </span>
                    </span>
                    <Switch
                      data-testid="widget-density-toggle"
                      className="h-5 w-9 shrink-0 rounded-full border border-white/15 transition-colors duration-200 data-[state=checked]:border-brand-400/60 data-[state=checked]:bg-brand-500 data-[state=unchecked]:bg-white/10"
                      checked={activeModal.widget.compact === true}
                      onCheckedChange={(v) => patchActiveWidget({ compact: v })}
                    />
                  </label>

                  {/* Card style — two looks, not six sliders. Each preset writes
                      the real surface values, so a widget saved under the old
                      controls still resolves to one of these. */}
                  <div className="space-y-3 p-3.5 rounded-xl border border-white/10 bg-white/[0.02]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Card style</span>
                      <span className="font-mono2 text-[10px] text-zinc-500">
                        {WIDGET_CARD_STYLE_MAP[widgetCardStyleId(activeModal.widget)]?.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {WIDGET_CARD_STYLES.map((style) => {
                        const active = widgetCardStyleId(activeModal.widget) === style.id;
                        const solid = style.id === "solid";
                        return (
                          <button
                            key={style.id}
                            type="button"
                            data-testid={`widget-card-style-${style.id}`}
                            aria-pressed={active}
                            onClick={() => patchActiveWidget({ ...style.values })}
                            className={`rounded-2xl border p-3 text-left transition-colors duration-200 ${
                              active
                                ? "border-brand-500/60 bg-brand-500/15"
                                : "border-white/10 hover:border-white/25 hover:bg-white/[0.04]"
                            }`}
                          >
                            {/* A picture of the finished card, drawn with the same
                                values the preset writes. */}
                            <span
                              className="mb-2.5 flex h-11 items-center gap-2 px-2.5"
                              style={{
                                borderRadius: `${style.values.card_radius}px`,
                                background: solid ? "#17171c" : "rgba(255,255,255,0.06)",
                                border: `1px solid rgba(255,255,255,${style.values.card_outline_alpha / 100})`,
                              }}
                            >
                              <span className="h-4 w-4 shrink-0 rounded-full bg-white/25" />
                              <span className="space-y-1">
                                <span className="block h-1.5 w-14 rounded-full bg-white/40" />
                                <span className="block h-1 w-9 rounded-full bg-white/15" />
                              </span>
                            </span>
                            <span className={`block text-xs font-bold ${active ? "text-brand-200" : "text-zinc-200"}`}>
                              {style.label}
                            </span>
                            <span className="mt-0.5 block text-[10px] leading-relaxed text-zinc-500">{style.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5 text-xs text-zinc-300">
                    <span>
                      <span className="block font-semibold">Glow around this card</span>
                      <span className="block text-[11px] text-zinc-500">
                        Off by default, so a stack of widgets stays readable
                      </span>
                    </span>
                    <Switch
                      data-testid="widget-glow-toggle"
                      className="h-5 w-9 shrink-0 rounded-full border border-white/15 transition-colors duration-200 data-[state=checked]:border-brand-400/60 data-[state=checked]:bg-brand-500 data-[state=unchecked]:bg-white/10"
                      checked={!!activeModal.widget.glow_on}
                      onCheckedChange={(v) => patchActiveWidget({ glow_on: v })}
                    />
                  </label>

                  {activeModal.widget.glow_on && (
                    <div>
                      <div className="flex items-center justify-between text-xs text-zinc-300 mb-2 font-medium">
                        <span>Glow amount</span>
                        <span className="text-zinc-400 font-mono text-[11px]">{activeModal.widget.glow_amount ?? 22}px</span>
                      </div>
                      <Slider
                        data-testid="widget-glow-amount"
                        value={[Number(activeModal.widget.glow_amount ?? 22)]}
                        min={2}
                        max={60}
                        step={1}
                        onValueChange={([v]) => patchActiveWidget({ glow_amount: v })}
                      />
                    </div>
                  )}
                </div>

                {/* Live preview: the real card, fed by the real API */}
                <div className="flex flex-col justify-start">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="text-xs font-mono2 uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5" /> Live preview
                    </div>
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.05] border border-white/10">
                      <button
                        type="button"
                        onClick={() => setPreviewPill(false)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${!previewPill ? "bg-brand-500 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
                      >
                        Card
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewPill(true)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${previewPill ? "bg-brand-500 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
                      >
                        Pill
                      </button>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-black/60 border border-white/10 min-h-[170px] flex items-center justify-center">
                    <div className="w-full max-w-[420px]">
                      {/* A real two-column stage so the Half / Full width choice is
                          visible instead of every preview looking the same. */}
                      <div className="grid grid-cols-2 gap-3">
                        {previewPill ? (
                          <div className={Number(activeModal.widget.span ?? 2) === 2 ? "col-span-2" : ""}>
                            <WidgetPill w={activeModal.widget} accent={kind.color || "#FF7FBC"} ownerCreated={user.created_at} owner={user.username} />
                          </div>
                        ) : (
                          <WidgetCard w={activeModal.widget} accent={kind.color || "#FF7FBC"} ownerCreated={user.created_at} owner={user.username} />
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-2.5 leading-relaxed">
                    Live real-time preview — floating avatar layout uses the unified pill style automatically.
                  </p>
                </div>
              </div>

              <div className="pt-5 mt-5 border-t border-white/10 flex justify-end gap-2.5">
                <button
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2.5 rounded-xl glass text-xs font-semibold text-zinc-400 hover:text-white transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={saveModalWidget}
                  className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors duration-200"
                >
                  Apply widget
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Interactive Widget Tutorial & Guide Modal */}
      {showTutorial && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowTutorial(false); }}
        >
          <div className="glass-strong rounded-3xl p-5 sm:p-8 max-w-3xl w-full relative shadow-[0_20px_80px_rgba(0,0,0,0.9)] border border-white/15 animate-in zoom-in-95 duration-200 max-h-[88vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-brand-300">
                  <BookOpen className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-display text-xl font-bold text-zinc-100">
                    Widget Setup Tutorials & Guide
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Point a card at a source and it fills itself in from the live API.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTutorial(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {[
                {
                  id: "roblox",
                  title: "Roblox — Profile, Group or Game",
                  steps: [
                    "Choose the card type: Profile shows a player, Group / Community shows a group, Game shows a live experience.",
                    "Paste the username, the group link or the game link — that is all that is typed.",
                    "Avatar, display name, about text, friends, followers, join date or member and player counts are pulled from Roblox's own API.",
                  ],
                },
                {
                  id: "discord",
                  title: "Discord — Server or Profile",
                  steps: [
                    "Server: turn on Server Settings → Widget → Enable Server Widget, then paste the Server ID or invite. Name, live online count and members are real.",
                    "Profile: paste a Discord user ID and join discord.gg/lanyard with that account to stream status, activity and Spotify.",
                  ],
                },
                {
                  id: "spotify",
                  title: "Spotify / SoundCloud / TikTok — Link cards",
                  steps: [
                    "Paste a track, album, playlist, video or post link.",
                    "Title, artwork and artist are read from the provider — nothing is entered twice.",
                  ],
                },
                {
                  id: "github",
                  title: "GitHub — Profile or Repository",
                  steps: [
                    "Profile: type a username for avatar, bio, repos, followers, total stars and top language.",
                    "Repository: type owner/name for stars, forks, issues, language and licence.",
                  ],
                },
                {
                  id: "youtube",
                  title: "YouTube — Channel",
                  steps: [
                    "Paste the channel link or @handle. Avatar, subscriber count and your newest upload come from YouTube.",
                  ],
                },
                {
                  id: "steam",
                  title: "Steam — Profile",
                  steps: [
                    "Paste your Steam profile link or custom URL. Persona, avatar, online state and current game are live.",
                  ],
                },
                {
                  id: "custom",
                  title: "Custom Code / Embeds (Premium)",
                  steps: [
                    "Paste arbitrary HTML, CSS or an iframe embed (Ko-fi buttons, custom badges and so on).",
                  ],
                },
              ].map((g) => {
                const kind = KIND_MAP[g.id] || {};
                const Icon = kind.Icon || GENERIC_WIDGET_ICON;
                return (
                  <div key={g.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2.5">
                    <div className="flex items-center gap-2.5 font-bold text-sm" style={{ color: kind.color || "#FF7FBC" }}>
                      <Icon className="w-4 h-4" /> {g.title}
                    </div>
                    <div className="text-xs text-zinc-300 space-y-1.5 leading-relaxed">
                      {g.steps.map((s) => <p key={s}>• {s}</p>)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setShowTutorial(false)}
                className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
