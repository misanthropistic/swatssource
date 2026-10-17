import { memo, useMemo, useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { PremiumGate } from "@/components/ui-shared/PremiumGate";
import { api, fileUrl } from "@/lib/api";
import { ProfilePreview } from "@/components/ProfilePreview";
import AvatarDecorationModal from "@/components/AvatarDecorationModal";
import { ColorPicker } from "@/components/ColorPicker";
import { CrosshairPicker } from "@/components/CrosshairPicker";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { OverlayEffect } from "@/components/OverlayEffect";
import { FxText } from "@/components/FxText";
import { TOOLTIP_STYLES, TOOLTIP_ANIMATIONS, TOOLTIP_SIZES } from "@/components/FxTooltip";
import {
  TEXT_EFFECTS, OVERLAYS, CURSOR_EFFECTS, BACKGROUND_EFFECTS,
} from "@/constants/effects";
import { LAYOUTS, LAYOUT_MAP, DEFAULT_LAYOUT, SECTION_ANIMATIONS } from "@/constants/layouts";
import { FONTS, FREE_FONTS, fontStackOf } from "@/constants/fonts";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/lib/notify";
import { useEditGate } from "@/hooks/useEditGate";
import AuthGateNotice from "@/components/AuthGateNotice";
import { useClearFxPreviewOnUnmount, setFxPreview, useFxPreview } from "@/components/overlays/useFxPreview";
import {
  EffectDrawer,
  FxModal,
  useEffectMemory,
  FxTuningProvider,
} from "@/components/overlays";
import {
  Upload, Trash2, Loader2, Lock, Save, Image as ImageIcon, Film, Layout, Check, ChevronDown,
  ChevronRight, MousePointer2
} from "lucide-react";


const SUBTABS = [
  { id: "profile", label: "Profile & Assets" },
  { id: "effects", label: "Effects & FX" },
  { id: "card", label: "Card Layout & Style" },
  { id: "entry", label: "Entry Screen" },
];



/* A searchable font picker: each option renders in its own family, free fonts
   first, then Premium fonts locked behind the paywall. It is the same centered
   dialog over a blurred backdrop as every other picker, so the font list is a
   grid you can scan rather than a narrow column down the edge of the page. */
function FontField({ label, value, onChange, isPremium, navigate, testid }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = FONTS.find((f) => fontStackOf(value) === f.stack) || FONTS.find((f) => f.free);

  const q = query.trim().toLowerCase();
  const matches = q ? FONTS.filter((f) => f.name.toLowerCase().includes(q)) : FONTS;
  const categorizedFonts = matches.reduce((acc, font) => {
    const cat = font.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(font);
    return acc;
  }, {});

  return (
    <div data-testid={testid}>
      <div className="mb-2 text-xs text-zinc-300">{label}</div>

      <button
        type="button"
        data-testid={`${testid}-open`}
        onClick={() => { setQuery(""); setIsOpen(true); }}
        className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-[#101012] px-4 py-3 hover:border-brand-500/50 hover:bg-[#1a1a24] transition-colors"
      >
        <span className="text-sm text-zinc-100" style={{ fontFamily: selected.stack }}>
          {selected.name}
        </span>
        <span className="text-[10px] font-bold text-brand-300 bg-brand-500/10 px-2 py-1 rounded-md">
          Change
        </span>
      </button>

      <FxModal
        open={isOpen}
        onOpenChange={setIsOpen}
        id={`${testid}-drawer`}
        title={label}
        description={`${FONTS.length} typefaces, ${FREE_FONTS.length} of them free.`}
        eyebrow="Fonts"
        testid={`${testid}-drawer`}
      >
        <input
          autoFocus
          type="search"
          data-testid={`${testid}-search`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${FONTS.length} fonts…`}
          className="ov-input mb-4 px-4 py-2.5 text-sm placeholder:text-zinc-500"
        />

        <div className="mb-5 rounded-[10px] border border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="text-[11px] text-zinc-500">Preview</div>
          <div className="mt-1 truncate text-2xl text-zinc-100" style={{ fontFamily: selected.stack }}>
            {PREVIEW_WORD} · @yourname
          </div>
        </div>

        {matches.length === 0 && (
          <p className="py-10 text-center text-sm text-zinc-500">No fonts match “{query}”.</p>
        )}

        {Object.entries(categorizedFonts).map(([category, fonts]) => (
          <div key={category} className="mb-6 space-y-3">
            <h3 className="sticky top-0 z-[1] bg-[var(--ov-surface-1)]/92 py-2 font-display text-[11px] font-bold text-zinc-300 backdrop-blur-md">
              {category}
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {fonts.map((f) => {
                const locked = !f.free && !isPremium;
                const active = selected?.name === f.name;
                return (
                  <button
                    key={f.name}
                    type="button"
                    data-testid={`${testid}-font-${f.name}`}
                    onClick={() => {
                      if (locked) { setIsOpen(false); navigate("/!/pricing"); }
                      else { onChange(f.stack); setIsOpen(false); }
                    }}
                    className={`flex items-center justify-between rounded-[9px] border p-3 text-left transition-colors duration-200 ${
                      active
                        ? "border-brand-500 bg-brand-500/15"
                        : locked
                        ? "border-white/5 bg-black/40 hover:border-amber-500/30"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/10 hover:border-white/25"
                    }`}
                  >
                    <span
                      className={`truncate text-[16px] ${locked ? "text-zinc-500" : active ? "text-brand-100" : "text-zinc-200"}`}
                      style={{ fontFamily: f.stack }}
                      title={f.name}
                    >
                      {f.name}
                    </span>
                    <span className="ml-2 shrink-0">
                      {locked ? (
                        <Lock className="h-3.5 w-3.5 text-amber-500/80" />
                      ) : active ? (
                        <Check className="h-4 w-4 text-brand-400" />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </FxModal>
    </div>
  );
}

function LayoutPicker({ value, onChange, isPremium, navigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = LAYOUTS.find((l) => l.id === value) || LAYOUT_MAP[DEFAULT_LAYOUT];

  return (
    <div>
      <button
        type="button"
        data-testid="layout-open"
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-[#101012] px-4 py-4 hover:border-brand-500/50 hover:bg-[#1a1a24] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15">
            <Layout className="h-5 w-5 text-brand-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-zinc-100">{selected.label}</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">{selected.hint}</div>
          </div>
        </div>
        <span className="text-[10px] font-bold text-brand-300 bg-brand-500/10 px-2 py-1 rounded-md shrink-0">
          Change Layout
        </span>
      </button>

      <FxModal
        open={isOpen}
        onOpenChange={setIsOpen}
        id="layout-drawer"
        title="Layout"
        description="Choose how your whole profile page is structured."
        eyebrow="Card layout & style"
        testid="layout-drawer"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LAYOUTS.map((l) => {
            const locked = !!l.premium && !isPremium;
            const active = (value || DEFAULT_LAYOUT) === l.id;
            return (
              <button
                key={l.id}
                type="button"
                data-testid={`layout-option-${l.id}`}
                onClick={() => {
                  if (locked) { setIsOpen(false); navigate("/!/pricing"); }
                  else { onChange(l.id); setIsOpen(false); }
                }}
                className={`flex flex-col items-start gap-3 rounded-[10px] border p-4 text-left transition-colors duration-200 ${
                  active
                    ? "border-brand-500 bg-brand-500/15"
                    : locked
                    ? "border-white/5 bg-black/40 hover:border-amber-500/30"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/10 hover:border-white/25"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15">
                    <Layout className="h-5 w-5 text-brand-300" />
                  </span>
                  <span className="shrink-0">
                    {locked ? (
                      <Lock className="h-4 w-4 text-amber-500/80" />
                    ) : active ? (
                      <Check className="h-5 w-5 text-brand-400" />
                    ) : null}
                  </span>
                </div>
                <div>
                  <div className={`text-sm font-bold ${locked ? "text-zinc-500" : active ? "text-brand-100" : "text-zinc-100"}`}>
                    {l.label}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-zinc-400 line-clamp-2">{l.hint}</div>
                </div>
              </button>
            );
          })}
        </div>
      </FxModal>
    </div>
  );
}

/* Section heading with a hairline rule. Previously every single heading was
   prefixed with a Sparkles glyph, which is where most of the "stars everywhere"
   noise came from. */
const Section = ({ title, hint, children }) => (
  <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
    <div className="mb-5 flex items-center gap-4">
      <h2 className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">{title}</h2>
      <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      {hint && <span className="shrink-0 text-[11px] text-zinc-500">{hint}</span>}
    </div>
    {children}
  </section>
);

const PREVIEW_WORD = "swats";

/* The dashboard's own switch look. Native checkboxes rendered as the browser's
   default grey tick box, which read as unfinished next to the rest of the UI. */
const SWITCH_CLASS =
  "h-5 w-9 shrink-0 rounded-full border border-white/15 bg-white/10 shadow-inner transition-colors duration-200 data-[state=checked]:border-brand-400/60 data-[state=checked]:bg-brand-500 data-[state=unchecked]:bg-white/10";

/* A grid of mutually exclusive chips. Premium chips carry `locked` and route the
   click to the pricing page instead of changing the setting. */
const ChipGrid = ({ options, value, onChange, onLocked, testid, cols = 3 }) => (
  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
    {options.map((o) => {
      const active = (value ?? "") === o.id;
      return (
        <button
          key={o.id || "none"}
          type="button"
          data-testid={testid ? `${testid}-${o.id || "none"}` : undefined}
          onClick={() => (o.locked ? onLocked?.() : onChange(o.id))}
          className={`flex items-center justify-center gap-1 rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition ${
            active
              ? "border-brand-500 bg-brand-500/20 text-brand-200"
              : o.locked
                ? "border-white/10 text-zinc-600"
                : "border-white/10 text-zinc-400 hover:bg-white/5"
          }`}
        >
          {o.locked && <Lock className="h-3 w-3 text-amber-400" />}
          <span className="truncate">{o.label}</span>
        </button>
      );
    })}
  </div>
);

/* Labelled slider with the live value on the right. Uses local state while
   dragging and only commits to the profile draft on release, so dragging a dial
   no longer re-renders the whole editor (and live preview) on every pixel. */
const SliderRow = ({ label, value, min, max, step = 1, suffix = "", onChange, testid }) => {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div data-testid={testid}>
      <div className="mb-2 flex items-center justify-between text-xs text-zinc-300">
        <span>{label}</span>
        <span className="font-mono2 text-brand-300">
          {local}
          {suffix}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[local]}
        onValueChange={([v]) => setLocal(v)}
        onValueCommit={([v]) => onChange(v)}
        className="[&_[role=slider]]:border-brand-400/60 [&_[role=slider]]:bg-brand-500 [&_.absolute]:bg-brand-500"
        aria-label={label}
      />
    </div>
  );
};

/* Each entry style, drawn. "Code Lock" and "Text Button" meant nothing until
   you picked one and looked at your own page — the same problem the effect tiles
   had, with the same answer: a miniature of the shape the gate actually renders.
   Change one of these three and PublicProfile's gate has to change with it. */
const ENTRY_STYLES = [
  { id: "bubble", label: "Bubble Pill" },
  { id: "text", label: "Text Button" },
  { id: "codelock", label: "Code Lock" },
];

const EntryStyleThumb = ({ id, accent }) => (
  <span className="relative flex h-14 w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0e]">
    <span
      className="pointer-events-none absolute inset-0"
      style={{ background: `radial-gradient(circle at 50% 130%, ${accent}33, transparent 70%)` }}
    />
    {id === "text" ? (
      <span className="relative font-mono2 text-[10px] uppercase tracking-widest text-zinc-300">Click to enter</span>
    ) : id === "codelock" ? (
      <span className="relative flex flex-col items-center gap-1.5">
        <span className="font-mono2 text-[8px] uppercase tracking-widest text-zinc-500">Enter PIN</span>
        <span className="flex items-center gap-1">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className="h-1.5 w-1.5 rounded-full border border-zinc-600" />
          ))}
        </span>
      </span>
    ) : (
      <span className="relative rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-zinc-200">
        Click to enter
      </span>
    )}
  </span>
);

/* One row per effect family. The Effects tab used to be a two-column grid of
   tall cards, each holding a full-size stage — six stages to scroll past to
   reach the sixth family. Every family is now one row: the stage inline on the
   left (it is a thumbnail of the effect, not the subject of the page), what is
   selected beside it, and one button that opens the picker. */
const FxCard = ({ title, hint, children, footer }) => (
  <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
    <div className="mb-3 flex items-center gap-3">
      <h3 className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">{title}</h3>
      <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      {hint && <span className="shrink-0 text-[11px] text-zinc-500">{hint}</span>}
    </div>
    {children}
    {footer && <div className="mt-3 border-t border-white/5 pt-3">{footer}</div>}
  </section>
);

/* One switch with its label and its hint. The tooltip panel is a list of nine of
   these, and repeating the markup that many times is how a panel drifts apart. */
const ToggleRow = ({ testid, label, hint, checked, onCheckedChange }) => (
  <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-xs text-zinc-300">
    <span>
      {label}
      {hint && <span className="ml-2 text-[10px] text-zinc-500">({hint})</span>}
    </span>
    <Switch data-testid={testid} className={SWITCH_CLASS} checked={checked} onCheckedChange={onCheckedChange} />
  </label>
);

/* The live card, subscribed to the effect store's hover preview.

   It reads the override from the store (overlays/useFxPreview) rather than taking
   it as a prop, so pointing at a tile in the store re-renders this card — the one
   thing that actually changes — instead of the whole editor page: the profile
   form, five pickers and every drawer. Sweeping the store used to re-render all
   of that once per tile, which is what made the picker feel sluggish. */
const LivePreviewCard = memo(function LivePreviewCard({ user, profile, displayName, tuning }) {
  const fxPreview = useFxPreview();

  const data = useMemo(() => {
    // The override only touches the field being previewed, so the rest of the
    // card keeps tracking the saved draft.
    const previewProfile = { ...profile };
    if (fxPreview?.slot === "name") previewProfile.name_effect = fxPreview.id;
    if (fxPreview?.slot === "bio") previewProfile.bio_effect = fxPreview.id;
    return { ...user, display_name: displayName, profile: previewProfile };
  }, [user, profile, displayName, fxPreview]);

  return (
    <FxTuningProvider tuning={tuning}>
      <ProfilePreview data={data} embedded />
    </FxTuningProvider>
  );
});

/* A single large stage showing ONE effect — the selected one. Nothing else in
   the picker animates, so the page isn't a wall of 20 simultaneous animations. */
function EffectStage({ variant, id, accent, label, size = "lg" }) {
  const compact = size === "compact";
  const frame = compact
    ? "relative h-28 w-52 sm:w-64 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0e]"
    : "relative h-56 sm:h-64 w-full overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0e]";
  const caption = (
    <span className="absolute left-4 top-3 z-20 max-w-[calc(100%-2rem)] truncate text-[10px] font-mono2 uppercase tracking-[0.14em] text-zinc-500">
      {label}
    </span>
  );

  if (variant === "cursor") {
    return (
      <div className={frame}>
        {caption}
        {id ? (
          <div className={`absolute inset-0 fx-cursor-demo fx-cursor-${id} scale-[1.7]`}>
            <i /><i /><i /><i /><i /><i />
          </div>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs font-mono2 text-zinc-600">
            No cursor effect
          </span>
        )}
      </div>
    );
  }

  if (variant === "text") {
    return (
      <div className={`${frame} flex items-center justify-center px-6`}>
        {caption}
        <FxText
          id={id || ""}
          text={PREVIEW_WORD}
          className={
            compact
              ? "text-2xl font-black tracking-tight text-zinc-100"
              : "text-4xl font-black tracking-tight text-zinc-100 sm:text-5xl"
          }
        />
      </div>
    );
  }

  // Background and overlay effects sit behind / above sample content.
  return (
    <div className={frame}>
      {caption}
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 125%, ${accent}55, transparent 72%)` }} />
      <div className="relative z-10 flex h-full items-center justify-center px-6 pointer-events-none">
        <div className={`rounded-2xl border border-white/10 bg-black/40 text-center backdrop-blur-sm ${compact ? "px-4 py-3" : "px-6 py-5"}`}>
          <div className={`font-bold text-zinc-100 ${compact ? "text-xs" : "text-base"}`}>swats</div>
          <div className="mt-1 font-mono2 text-[10px] text-zinc-400">@yourname</div>
        </div>
      </div>
      {id && variant === "bg" && <BackgroundEffect effect={id} />}
      {id && variant === "overlay" && <OverlayEffect effect={id} color={accent} />}
    </div>
  );
}

/* Effect picker: a live stage of the selected effect on the left, its name in
   the middle, and a button that opens the shared EffectModal. The modal renders
   one tile per effect over a blurred backdrop and keeps the real profile preview
   visible behind it. The catalogs each ship their own `id: ""` entry; the modal
   filters it so a single None shows.

   The stage sits inline rather than in a tall card of its own: six full-width
   stages stacked down the page meant scrolling past a lot of one effect to reach
   the next. */
function EffectPicker({
  options, value, onChange, isPremium, navigate, testid, variant, accent,
  displayName, onPreview, tuning, onTuningChange, onTuningReset,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const memory = useEffectMemory(testid);

  const choices = [{ id: "", label: "None", premium: false }, ...options.filter((o) => o.id !== "")];
  const selected = choices.find((c) => c.id === (value || "")) || choices[0];
  const title =
    variant === "text" ? "Text effects"
      : variant === "bg" ? "Background effects"
      : variant === "overlay" ? "Overlay effects"
      : variant === "pet" ? "Cursor buddies"
      : "Cursor effects";

  return (
    <div data-testid={testid} className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={() => { onPreview?.(null); setIsOpen(true); }}
        data-testid={`${testid}-stage-open`}
        aria-label={`Change the ${selected.label} effect`}
        className="shrink-0 rounded-2xl outline-none transition hover:ring-2 hover:ring-brand-500/40 focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        <EffectStage
          variant={variant}
          id={value || ""}
          accent={accent}
          size="compact"
          label={`${selected.label}${selected.premium && !isPremium ? " · Premium" : ""}`}
        />
      </button>

      <div className="min-w-[10rem] flex-1">
        <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
          <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
          <span className="truncate">{selected.label}</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          {selected.id
            ? selected.premium && !isPremium
              ? "Premium — unlock it on the pricing page."
              : "Live on your card. Hover the tiles to preview the others."
            : "Nothing selected — the card shows no effect of this kind."}
        </p>
      </div>

      <button
        type="button"
        data-testid={`${testid}-open`}
        onClick={() => { onPreview?.(null); setIsOpen(true); }}
        className="ov-btn ov-btn-primary shrink-0 px-4 py-2 text-xs"
      >
        Change effect
      </button>

      <EffectDrawer
        open={isOpen}
        onOpenChange={(o) => { setIsOpen(o); if (!o) onPreview?.(null); }}
        variant={variant}
        title={title}
        description={
          variant === "text"
            ? "Each tile runs your real name live. Click to select, click again to remove."
            : "Pick a layer for your profile. Click a tile to select it."
        }
        options={options}
        value={value}
        onChange={(id) => { onChange(id); memory.pushRecent(id); }}
        onPreview={onPreview}
        isPremium={isPremium}
        onUpgrade={() => navigate("/!/pricing")}
        displayName={displayName || PREVIEW_WORD}
        accent={accent}
        tuning={tuning}
        onTuningChange={onTuningChange}
        onTuningReset={onTuningReset}
        favorites={memory.favorites}
        onToggleFavorite={memory.toggleFavorite}
        recent={memory.recent}
        testid={testid}
      />
    </div>
  );
}

const ACCEPT_HINT = (accept) => {
  if (accept.includes("audio")) return "MP3 or WAV";
  if (accept.includes("video")) return "PNG, JPG, GIF or MP4";
  return "PNG, JPG or GIF";
};

/* A big square drop-in box rather than a cramped little row: it shows what is
   currently set as its own background and gives the upload action room. */
function AssetUpload({ label, icon: Icon, value, accept, onUploaded, onRemove, premiumHint, testid }) {
  const [uploading, setUploading] = useState(false);
  const src = fileUrl(value);
  const isVideo = /\.(mp4|webm)(\?|$)/i.test(value || "");
  const isAudio = (accept || "").includes("audio");
  const hasVisual = !!src && !isAudio && !isVideo;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", label.toLowerCase());
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onUploaded(data.url);
      toast.success(`${label} updated!`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setUploading(false);
    e.target.value = "";
  };

  return (
    <div
      data-testid={testid}
      className="group relative aspect-square overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] transition-colors duration-200 hover:border-brand-500/40"
    >
      {hasVisual && <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />}
      {isVideo && <video src={src} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-cover opacity-45" />}
      {(hasVisual || isVideo) && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/70 to-black/35" />
      )}

      <div className="relative flex h-full flex-col items-center justify-center gap-3 p-5 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/25 bg-brand-500/15">
          <Icon className="h-6 w-6 text-brand-300" />
        </div>

        <div>
          <div className="text-sm font-bold text-zinc-100">{label}</div>
          <div className="mt-1 text-[11px] text-zinc-400">
            {value ? (isAudio ? "Audio file set" : "Uploaded") : ACCEPT_HINT(accept)}
          </div>
          {premiumHint && <div className="mt-1 text-[10px] text-amber-400">{premiumHint}</div>}
        </div>

        {isAudio && value ? <audio src={src} controls className="w-full max-w-[220px]" /> : null}

        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-brand-500/20 px-4 py-2 text-xs font-semibold text-brand-100 transition-colors duration-200 hover:bg-brand-500/30">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {value ? "Replace" : "Upload"}
            <input type="file" accept={accept} onChange={handleUpload} disabled={uploading} className="hidden" />
          </label>
          {value ? (
            <button
              type="button"
              onClick={onRemove}
              title={`Remove ${label}`}
              aria-label={`Remove ${label}`}
              className="rounded-xl bg-red-500/10 p-2 text-red-400 transition-colors duration-200 hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* The uploader's compact cousin, for the simplified Profile string: a pill
   button that uploads straight away, with a Remove beside it once something is
   set. It shares AssetUpload's endpoint and error handling. */
function QuickUpload({ label, buttonLabel, value, accept, onUploaded, onRemove, premiumHint, testid }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", label.toLowerCase());
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onUploaded(data.url);
      toast.success(`${label} updated!`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setUploading(false);
    e.target.value = "";
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5" data-testid={testid}>
      <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:brightness-110">
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {buttonLabel}
        <input type="file" accept={accept} onChange={handleUpload} disabled={uploading} className="hidden" />
      </label>
      {value && (
        <button
          type="button"
          onClick={onRemove}
          data-testid={`${testid}-remove`}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08]"
        >
          Remove {label}
        </button>
      )}
      {premiumHint && <span className="text-[10px] text-amber-400">{premiumHint}</span>}
    </div>
  );}  

/* The embed card's compact uploader. Same endpoint and error handling as
   QuickUpload, but it writes into the URL field instead of owning a field, so
   the pasted-link path and the upload path share one source of truth. */
function MetaImageUpload({ value, onUploaded }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "embed image");
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onUploaded(data.url);
      toast.success("Embed image updated!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setUploading(false);
    e.target.value = "";
  };

  return (
    <div data-testid="meta-image-upload">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-zinc-300 transition hover:border-brand-500/40 hover:bg-white/[0.06]">
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {value ? "Replace image" : "Upload image"}
        <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} className="hidden" />
      </label>
    </div>
  );
}

/* A string of one setting, headlined the way the simplified Profile tab reads:
   the label, then the control, then a hairline before the next one. */
const ProfileRow = ({ label, children }) => (
  <div className="border-b border-white/[0.06] py-5 last:border-b-0">
    <div className="mb-3 text-sm font-semibold text-zinc-200">{label}</div>
    {children}
  </div>
);



export default function Editor() {
  const { user, setUser } = useAuth();
  // Every locked control in the editor used to send the owner to /!/pricing,
  // which threw them out of the page they were editing — and, on the sections
  // that were already visible, read as the control doing nothing at all. The
  // gate opens over the editor instead, naming the feature that was refused.
  const [premiumFeature, setPremiumFeature] = useState(null);
  const askPremium = (feature) => () => setPremiumFeature(feature);
  const gate = useEditGate();
  const [sub, setSub] = useState("profile");
  const [showDecoModal, setShowDecoModal] = useState(false);
  // The one panel every hover label and every footer-line setting lives in.
  const [showTipPanel, setShowTipPanel] = useState(false);
  const [p, setP] = useState({ ...user.profile });
  const [displayName, setDisplayName] = useState(user.display_name || "");
  // The Background row splits into a colour getter and a media uploader; the
  // segmented control remembers which half you were on.
  const [bgMode, setBgMode] = useState(user.profile?.background_url ? "media" : "color");
  const [saving, setSaving] = useState(false);
  // Leaving the editor drops any hover preview, so a later mount never inherits
  // one from a card the owner has already walked away from.
  useClearFxPreviewOnUnmount();

  const isPremium = user.tier === "premium" || user.tier === "admin" || user.is_owner;

  // Keep widgets and tracks in sync with any updates from the widgets tab
  useEffect(() => {
    if (user?.profile) {
      setP((prev) => ({
        ...prev,
        widgets: user.profile.widgets || [],
        tracks: user.profile.tracks || [],
      }));
    }
  }, [user?.profile?.widgets, user?.profile?.tracks]);

  const set = (k, v) => setP((prev) => ({ ...prev, [k]: v }));
  const accentColor = p.accent_color || "#FF7FBC";

  // Per-effect tuning lives in profile.fx_tuning keyed by effect id, so it is
  // saved with everything else and read back by FxText via FxTuningProvider.
  const fxTuning = p.fx_tuning || {};
  const setFxTuning = (effectId, patch) => {
    if (!effectId) return;
    setP((prev) => ({
      ...prev,
      fx_tuning: {
        ...(prev.fx_tuning || {}),
        [effectId]: { ...((prev.fx_tuning || {})[effectId] || {}), ...patch },
      },
    }));
  };
  const resetFxTuning = (effectId) => {
    if (!effectId) return;
    setP((prev) => {
      const next = { ...(prev.fx_tuning || {}) };
      delete next[effectId];
      return { ...prev, fx_tuning: next };
    });
  };

  const save = async () => {
    // Admin "Auth check": the server refuses this write anyway, so stopping here
    // turns a lost edit into an explanation.
    if (gate.guard("saving profile changes")) return;
    setSaving(true);
    try {
      const payload = {
        ...p,
        widgets: user.profile?.widgets || [],
        tracks: user.profile?.tracks || [],
        display_name: displayName,
      };
      const { data } = await api.put("/me/profile", payload);
      setUser(data);
      toast.success("Profile changes saved!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    }
    setSaving(false);
  };

  return (
    <div data-testid="editor-page" className="space-y-8">
      {/* Shown above the fields, where the blocked save actually happens. */}
      <AuthGateNotice variant="card" />

      {/* Navigation Subtabs */}
      <div className="flex flex-wrap gap-2.5">
        {SUBTABS.map((s) => (
          <button
            key={s.id}
            data-testid={`editor-subtab-${s.id}`}
            onClick={() => setSub(s.id)}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-colors duration-200 ${
              sub === s.id
                ? "bg-brand-500/20 text-brand-200 border border-brand-500/40 shadow-md"
                : "bg-white/5 text-zinc-400 hover:text-zinc-200 border border-white/5"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_440px]">
        {/* Controls Column */}
        <div className="space-y-5">
          {sub === "profile" && (
            <Section title="Profile" hint="Your picture, name and bio">
              {/* One string of settings, in the order a visitor reads them: the
                  picture, what wears over it, the backdrop, the banner, then
                  the words. Every row owns its own hairline. */}
              <ProfileRow label="Avatar">
                <div className="flex items-center gap-5">
                  {/* The little picture itself — a 64px round avatar, with the
                      decoration layered over it exactly as the card does. */}
                  <div className="relative h-16 w-16 shrink-0">
                    <div className="h-full w-full overflow-hidden rounded-full ring-1 ring-white/10">
                      {p.avatar_url ? (
                        <img src={fileUrl(p.avatar_url)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-lg font-bold text-zinc-500">
                          {(displayName || user.username || "?")[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    {p.avatar_decoration && (
                      <img
                        src={p.avatar_decoration}
                        alt=""
                        className="pointer-events-none absolute inset-0 h-full w-full scale-[1.28] object-contain"
                        style={Number(p.avatar_decoration_hue) ? { filter: `hue-rotate(${Number(p.avatar_decoration_hue)}deg)` } : undefined}
                      />
                    )}
                  </div>
                  <QuickUpload
                    testid="asset-avatar"
                    label="Avatar"
                    buttonLabel="Change Avatar"
                    value={p.avatar_url}
                    accept="image/*"
                    onUploaded={(u) => set("avatar_url", u)}
                    onRemove={() => set("avatar_url", "")}
                  />
                </div>
                {/* Pfp framing: zoom in on the picture and slide it inside the
                    circle, instead of taking whatever the round crop centre
                    gave you. Only shown once there is a picture to frame. */}
                {p.avatar_url && (
                  <div className="mt-4 space-y-2.5">
                    <SliderRow
                      testid="avatar-zoom"
                      label="Pfp zoom"
                      value={Number(p.avatar_zoom ?? 100)}
                      min={100}
                      max={250}
                      step={5}
                      suffix="%"
                      onChange={(v) => set("avatar_zoom", v)}
                    />
                    <SliderRow
                      testid="avatar-crop-x"
                      label="Crop X"
                      value={Number(p.avatar_pos_x ?? 50)}
                      min={0}
                      max={100}
                      step={1}
                      suffix="%"
                      onChange={(v) => set("avatar_pos_x", v)}
                    />
                    <SliderRow
                      testid="avatar-crop-y"
                      label="Crop Y"
                      value={Number(p.avatar_pos_y ?? 50)}
                      min={0}
                      max={100}
                      step={1}
                      suffix="%"
                      onChange={(v) => set("avatar_pos_y", v)}
                    />
                  </div>
                )}
              </ProfileRow>

              <ProfileRow label="Decoration">
                <div className="flex flex-wrap items-center gap-2.5"
                  data-testid="decoration-picker-row"
                >
                  <button
                    type="button"
                    data-testid="open-decorations"
                    onClick={() => setShowDecoModal(true)}
                    className="rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:brightness-110"
                  >
                    Change Decoration
                  </button>
                  {p.avatar_decoration && (
                    <button
                      type="button"
                      data-testid="remove-decoration"
                      onClick={() => { set("avatar_decoration", ""); set("avatar_decoration_hue", 0); }}
                      className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08]"
                    >
                      Remove Decoration
                    </button>
                  )}
                  {Number(p.avatar_decoration_hue) > 0 && (
                    <span className="font-mono2 text-[10px] text-zinc-500">hue {p.avatar_decoration_hue}°</span>
                  )}
                </div>
              </ProfileRow>

              <ProfileRow label="Background">
                {/* Colour or media: the segmented control decides which control
                    shows. Choosing Media reveals the bg + dim sliders from the
                    old Assets panel; choosing a colour removes any image. */}
                <div className="mb-3 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                  {[
                    { id: "color", label: "Color" },
                    { id: "media", label: "Media" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      data-testid={`bg-mode-${mode.id}`}
                      aria-pressed={bgMode === mode.id}
                      onClick={() => {
                        if (mode.id === "color" && p.background_url) set("background_url", "");
                        setBgMode(mode.id);
                      }}
                      className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                        bgMode === mode.id ? "bg-brand-500 text-white" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {bgMode === "color" ? (
                  <div className="max-w-xs">
                    <ColorPicker label="" value={p.background_color || ""} onChange={(v) => set("background_color", v)} testid="background-color" />
                    <p className="mt-2 text-[11px] text-zinc-500">
                      Sets a solid background color. Any image/video background will be removed.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <QuickUpload
                      testid="asset-background"
                      label="Background"
                      buttonLabel="Change Media"
                      value={p.background_url}
                      accept={isPremium ? "image/*,video/mp4" : "image/*"}
                      onUploaded={(u) => set("background_url", u)}
                      onRemove={() => set("background_url", "")}
                      premiumHint={!isPremium ? "MP4 video background is Premium" : null}
                    />
                    {p.background_url && (
                      <div className="max-w-sm space-y-4">
                        <SliderRow
                          testid="slider-bg-opacity"
                          label="Background opacity"
                          value={Number(p.bg_opacity ?? 100)}
                          min={0}
                          max={100}
                          suffix="%"
                          onChange={(v) => set("bg_opacity", v)}
                        />
                        <SliderRow
                          testid="slider-bg-dim"
                          label="Background dim / darkness"
                          value={Number(p.bg_dim ?? 50)}
                          min={0}
                          max={100}
                          suffix="%"
                          onChange={(v) => set("bg_dim", v)}
                        />
                        <ColorPicker label="Tint" value={p.overlay_color || accentColor} onChange={(v) => set("overlay_color", v)} testid="background-tint" />
                      </div>
                    )}
                  </div>
                )}
              </ProfileRow>

              <ProfileRow label="Banner">
                <div className="space-y-2">
                  <QuickUpload
                    testid="asset-banner"
                    label="Banner"
                    buttonLabel="Change Banner"
                    value={p.banner_url}
                    accept="image/*"
                    onUploaded={(u) => set("banner_url", u)}
                    onRemove={() => set("banner_url", "")}
                  />
                  {/* What sits over the banner picture. The old card hardcoded a
                      bottom fade on every banner; the owner disliked it, so it
                      is one selectable look now — with an off inside the list. */}
                  <ChipGrid
                    testid="banner-effect"
                    value={p.banner_effect || "fade"}
                    onChange={(v) => set("banner_effect", v)}
                    options={[
                      { id: "fade", label: "Fade" },
                      { id: "dim", label: "Dim" },
                      { id: "vignette", label: "Vignette" },
                      { id: "none", label: "None" },
                    ]}
                  />
                </div>
              </ProfileRow>

              <ProfileRow label="Crosshair">
                <CrosshairPicker
                  value={p}
                  onChange={(next) => setP((prev) => ({ ...prev, ...next }))}
                  isPremium={isPremium}
                  onLocked={askPremium("Custom crosshairs")}
                />
              </ProfileRow>

              <ProfileRow label="Display Name">
                <input
                  data-testid="editor-displayname"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-brand-500/50"
                />
              </ProfileRow>

              <ProfileRow label="Bio">
                <textarea
                  data-testid="editor-bio"
                  value={p.bio || ""}
                  onChange={(e) => set("bio", e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-brand-500/50"
                  placeholder="Tell people who you are..."
                />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs text-zinc-400">Location</label>
                    <input
                      data-testid="editor-location"
                      value={p.location || ""}
                      onChange={(e) => set("location", e.target.value)}
                      placeholder="e.g. Somewhere"
                      className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-2.5 text-xs text-zinc-100 outline-none focus:border-brand-500/50"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-zinc-400">Accent colour</label>
                    <ColorPicker label="" value={p.accent_color || "#FF7FBC"} onChange={(v) => set("accent_color", v)} testid="color-accent" />
                  </div>
                </div>
              </ProfileRow>

              <ProfileRow label="Metadata">
                {/* What embeds and search engines read off the public page.
                    Empty fields fall back to the built-ins (name, bio, avatar),
                    so leaving this alone is a valid choice. */}
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs text-zinc-400">Meta title</label>
                    <input
                      data-testid="editor-meta-title"
                      value={p.meta_title || ""}
                      onChange={(e) => set("meta_title", e.target.value)}
                      maxLength={60}
                      placeholder={`${(displayName || user.username) + (" on swats.bio")}`}
                      className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-2.5 text-xs text-zinc-100 outline-none focus:border-brand-500/50"
                    />
                    <p className="mt-1 text-[11px] text-zinc-500">Up to 60 characters — the tab title and the title tag.</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-zinc-400">Meta description</label>
                    <textarea
                      data-testid="editor-meta-description"
                      value={p.meta_description || ""}
                      onChange={(e) => set("meta_description", e.target.value)}
                      rows={2}
                      maxLength={160}
                      placeholder="Your bio doubles as the description — write your own here."
                      className="w-full resize-none rounded-xl bg-white/[0.03] border border-white/10 px-4 py-2.5 text-xs text-zinc-100 outline-none focus:border-brand-500/50"
                    />
                    <p className="mt-1 text-[11px] text-zinc-500">Up to 160 characters — what embeds show under the link title.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs text-zinc-400">Embed image URL</label>
                      <input
                        data-testid="editor-meta-image"
                        value={p.meta_image || ""}
                        onChange={(e) => set("meta_image", e.target.value)}
                        placeholder="https://... or /uploads/banner.png"
                        className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-2.5 text-xs text-zinc-100 outline-none focus:border-brand-500/50"
                      />
                      {/* The plain URL field stays for pasted links, but you can
                          no longer reach it only by knowing a path: Upload sends
                          the file to the same /api/upload endpoint every other
                          asset uses and writes the returned URL straight into the
                          field — which the backend accepts because it starts
                          with /uploads/. */}
                      <MetaImageUpload
                        value={p.meta_image || ""}
                        onUploaded={(u) => set("meta_image", u)}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-zinc-400">Theme colour (embed + browser)</label>
                      <ColorPicker label="" value={p.theme_color || accentColor} onChange={(v) => set("theme_color", v)} testid="color-theme" />
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    Bots read these the moment the link is unfurled — Discord, X and Slack all
                    render from this block. Changes only apply once the profile is saved.
                  </p>
                </div>
              </ProfileRow>
            </Section>
          )}
          {sub === "effects" && (
            <>
              {/* One row per family. Each stage is a compact thumbnail of the
                  effect and the picker opens as a centered dialog over a blurred
                  backdrop, so only the chosen effect animates at a time. */}
              <div className="space-y-4">
                <FxCard
                  title="Display name"
                  hint="Your name on the card"
                  footer={
                    <label className="flex cursor-pointer select-none items-center justify-between gap-4 text-xs text-zinc-300">
                      <span>Also apply this effect to the @username</span>
                      <Switch data-testid="fx-name-alias-toggle" className={SWITCH_CLASS} checked={!!p.use_name_effect_on_alias} onCheckedChange={(v) => set("use_name_effect_on_alias", v)} />
                    </label>
                  }
                >
                  <EffectPicker
                    options={TEXT_EFFECTS}
                    value={p.name_effect}
                    onChange={(v) => set("name_effect", v)}
                    isPremium={isPremium}
                    navigate={askPremium("Name text effects")}
                    testid="fx-name"
                    variant="text"
                    accent={accentColor}
                    displayName={displayName || user.username}
                    onPreview={(id) => setFxPreview("name", id)}
                    tuning={fxTuning}
                    onTuningChange={setFxTuning}
                    onTuningReset={resetFxTuning}
                  />
                </FxCard>

                <FxCard title="Bio text" hint="Short description">
                  <EffectPicker
                    options={TEXT_EFFECTS}
                    value={p.bio_effect}
                    onChange={(v) => set("bio_effect", v)}
                    isPremium={isPremium}
                    navigate={askPremium("Bio text effects")}
                    testid="fx-bio"
                    variant="text"
                    accent={accentColor}
                    displayName={p.bio || "Bio text"}
                    onPreview={(id) => setFxPreview("bio", id)}
                    tuning={fxTuning}
                    onTuningChange={setFxTuning}
                    onTuningReset={resetFxTuning}
                  />
                </FxCard>

                <FxCard title="Background" hint="Behind your card">
                  <EffectPicker
                    options={BACKGROUND_EFFECTS}
                    value={p.background_effect}
                    onChange={(v) => set("background_effect", v)}
                    isPremium={isPremium}
                    navigate={askPremium("Background effects")}
                    testid="fx-bg"
                    variant="bg"
                    accent={accentColor}
                  />
                </FxCard>

                <FxCard title="Overlay" hint="Above your card">
                  <EffectPicker
                    options={OVERLAYS}
                    value={p.overlay}
                    onChange={(v) => set("overlay", v)}
                    isPremium={isPremium}
                    navigate={askPremium("Overlay effects")}
                    testid="fx-overlay"
                    variant="overlay"
                    accent={accentColor}
                  />
                  {p.overlay && (
                    <div className="mt-5 border-t border-white/5 pt-4">
                      <SliderRow
                        testid="overlay-opacity"
                        label="Transparency"
                        value={Number(p.overlay_opacity ?? 100)}
                        min={0}
                        max={100}
                        suffix="%"
                        onChange={(v) => set("overlay_opacity", v)}
                      />
                    </div>
                  )}
                </FxCard>

                <FxCard title="Cursor" hint="Follows the pointer">
                  <EffectPicker
                    options={CURSOR_EFFECTS}
                    value={p.cursor_effect}
                    onChange={(v) => set("cursor_effect", v)}
                    isPremium={isPremium}
                    navigate={askPremium("Cursor effects")}
                    testid="fx-cursor"
                    variant="cursor"
                    accent={accentColor}
                  />
                </FxCard>

                <FxCard title="3D tilt" hint="Card follows the pointer">
                  <label className="flex cursor-pointer select-none items-center justify-between gap-4 text-xs text-zinc-300">
                    <span>Enable 3D card tilt on hover</span>
                    <Switch data-testid="tilt-toggle" className={SWITCH_CLASS} checked={p.card_tilt !== false} onCheckedChange={(v) => set("card_tilt", v)} />
                  </label>
                  {p.card_tilt !== false && (
                    <div className="mt-5 flex items-center gap-4">
                      <span className="text-xs text-zinc-500">Intensity</span>
                      <Slider
                        data-testid="tilt-strength"
                        min={2}
                        max={25}
                        step={1}
                        value={[p.tilt_strength || 12]}
                        onValueChange={([v]) => set("tilt_strength", v)}
                        className="flex-1 [&_[role=slider]]:border-brand-400/60 [&_[role=slider]]:bg-brand-500 [&_.absolute]:bg-brand-500"
                        aria-label="3D tilt intensity"
                      />
                      <span className="w-8 text-right font-mono2 text-xs text-zinc-400">{p.tilt_strength || 12}</span>
                    </div>
                  )}
                </FxCard>
              </div>
            </>
          )}

          {sub === "card" && (
            <>
              <Section title="Layout Mode" hint="Every layout renders differently">
                <LayoutPicker 
                  value={p.layout} 
                  onChange={(v) => set("layout", v)} 
                  isPremium={isPremium}
                  navigate={askPremium("Premium layouts")}
                />
              </Section>

              <Section title="Fonts" hint="15 free · 31 premium">
                <div className="grid gap-5 sm:grid-cols-2">
                  <FontField testid="font-display" label="Display name font" value={p.display_font || "Unbounded"} onChange={(v) => set("display_font", v)} isPremium={isPremium} navigate={askPremium("Premium fonts")} />
                  <FontField testid="font-name" label="@alias / subheading font" value={p.name_font || "Inter"} onChange={(v) => set("name_font", v)} isPremium={isPremium} navigate={askPremium("Premium fonts")} />
                </div>
                <div className="mt-5">
                  <FontField testid="font-bio" label="Bio / body text font" value={p.bio_font || "Inter"} onChange={(v) => set("bio_font", v)} isPremium={isPremium} navigate={askPremium("Premium fonts")} />
                </div>
              </Section>

              <Section title="Card Style" hint="Surface behind everything">
                <ChipGrid
                  testid="cardstyle"
                  cols={3}
                  value={p.card_style || ""}
                  onChange={(v) => set("card_style", v)}
                  options={[
                    { id: "classic", label: "Classic" },
                    { id: "frosted", label: "Frosted" },
                    { id: "frosted-soft", label: "Frosted soft" },
                    { id: "outlined", label: "Outlined" },
                    { id: "aurora", label: "Aurora" },
                    { id: "transparent", label: "Transparent" },
                  ]}
                />
                <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                  <label className="flex cursor-pointer items-center justify-between gap-4 text-xs text-zinc-300">
                    <span>Card surface background</span>
                    <Switch
                      data-testid="card-bg-toggle"
                      className={SWITCH_CLASS}
                      checked={p.card_background !== false && p.card_style !== "transparent"}
                      onCheckedChange={(v) => {
                        set("card_background", v);
                        if (!v) set("card_style", "transparent");
                        else if (p.card_style === "transparent") set("card_style", "classic");
                      }}
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-4 text-xs text-zinc-300">
                    <span>Glow around the card</span>
                    <Switch data-testid="card-glow-toggle" className={SWITCH_CLASS} checked={p.card_glow !== false} onCheckedChange={(v) => set("card_glow", v)} />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-4 text-xs text-zinc-300">
                    <span>Glow behind your name</span>
                    <Switch data-testid="name-glow-toggle" className={SWITCH_CLASS} checked={p.name_glow !== false} onCheckedChange={(v) => set("name_glow", v)} />
                  </label>
                  {/* ADVANCED MODE — every dial lives behind it. While it is off
                      the presets own the surface completely; while it is on the
                      renderer builds the card from the sliders and colours here,
                      on every layout. This is the owner's ask: the glass blur,
                      surface/outline alpha, rounding and width dials are hidden
                      until Advanced is switched on, and the Themes grid is gone —
                      the three colour pickers replace it. */}
                  <div className="pt-3 space-y-4 border-t border-white/5">
                    <label className="flex cursor-pointer items-center justify-between gap-4 text-xs text-zinc-300">
                      <span>Advanced mode — show the surface dials</span>
                      {/* Strict boolean on purpose: the renderer overrides the
                          presets only when advanced_mode === true, so a legacy
                          numeric 1 saved by the long-gone panel reads OFF and
                          that profile keeps rendering the Card Style preset
                          it picked. */}
                      <Switch
                        data-testid="advanced-mode-toggle"
                        className={SWITCH_CLASS}
                        checked={p.advanced_mode === true}
                        onCheckedChange={(v) => set("advanced_mode", v)}
                      />
                    </label>
                    {p.advanced_mode === true ? (
                      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="advanced-appearance">
                        <SliderRow
                          testid="card-blur"
                          label="Card glass blur"
                          value={Number(p.card_blur ?? 20)}
                          min={0}
                          max={40}
                          suffix="px"
                          onChange={(v) => set("card_blur", v)}
                        />
                        <SliderRow
                          testid="card-fill-alpha"
                          label="Surface alpha"
                          value={Number(p.card_fill_alpha ?? 78)}
                          min={0}
                          max={100}
                          suffix="%"
                          onChange={(v) => set("card_fill_alpha", v)}
                        />
                        <SliderRow
                          testid="card-outline-alpha"
                          label="Outline alpha"
                          value={Number(p.card_outline_alpha ?? 33)}
                          min={0}
                          max={100}
                          suffix="%"
                          onChange={(v) => set("card_outline_alpha", v)}
                        />
                        <SliderRow
                          testid="card-radius"
                          label="Corner rounding"
                          value={Number(p.card_radius ?? 24)}
                          min={0}
                          max={60}
                          suffix="px"
                          onChange={(v) => set("card_radius", v)}
                        />
                        {/* Positioning: the card sits centred forever at its
                            hard-coded 680px before this. The dial narrows or widens
                            it — the preview and the public page both obey. */}
                        <SliderRow
                          testid="card-width"
                          label="Card width"
                          value={Number(p.card_width ?? 680)}
                          min={320}
                          max={920}
                          step={20}
                          suffix="px"
                          onChange={(v) => set("card_width", v)}
                        />
                        <div className="grid gap-4 sm:grid-cols-3 border-t border-white/5 pt-4">
                          <div>
                            <label className="mb-1.5 block text-xs text-zinc-400">Fill colour</label>
                            <ColorPicker label="" value={p.card_fill_color || "#131316"} onChange={(v) => set("card_fill_color", v)} testid="card-fill-color" />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs text-zinc-400">Outline colour</label>
                            <ColorPicker label="" value={p.card_outline_color || accentColor} onChange={(v) => set("card_outline_color", v)} testid="card-outline-color" />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs text-zinc-400">Glow colour</label>
                            <ColorPicker label="" value={p.card_glow_color || accentColor} onChange={(v) => set("card_glow_color", v)} testid="card-glow-color" />
                          </div>
                        </div>
                        {/* The text colours live behind the same Advanced switch
                            as the surface dials — they were only readable by
                            the renderer with no control anywhere, which is the
                            "there aren't enough colour pickers" half of this
                            panel's reputation. */}
                        <div className="grid gap-4 sm:grid-cols-3 border-t border-white/5 pt-4">
                          <div>
                            <label className="mb-1.5 block text-xs text-zinc-400">Name colour</label>
                            <ColorPicker label="" value={p.name_color || "#ffffff"} onChange={(v) => set("name_color", v)} testid="card-name-color" />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs text-zinc-400">Alias colour</label>
                            <ColorPicker label="" value={p.alias_color || ""} onChange={(v) => set("alias_color", v)} testid="card-alias-color" />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs text-zinc-400">Bio colour</label>
                            <ColorPicker label="" value={p.bio_color || ""} onChange={(v) => set("bio_color", v)} testid="card-bio-color" />
                          </div>
                        </div>
                        <SliderRow
                          testid="card-glow-strength"
                          label="Glow strength"
                          value={Number(p.card_glow_strength ?? 50)}
                          min={0}
                          max={100}
                          suffix="%"
                          onChange={(v) => set("card_glow_strength", v)}
                        />
                        <p className="text-[11px] leading-relaxed text-zinc-500">
                          These dials build the surface and your text colours on every layout,
                          overriding the preset look. Turn Advanced off to return to the selected
                          Card Style exactly as shipped.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Section>


              {/* Every hover label AND every footer-line setting behind one
                  button. It used to be two sections of the editor: three
                  per-tip style pickers, a size row, a format picker for the
                  count and another for the UID. A profile has one tooltip look
                  now, a list of on/off switches for what carries a tip, and one
                  format each for the count and the member number. */}
              <Section title="Tooltips & display" hint="Hover labels, your UID and the view count">
                <button
                  type="button"
                  data-testid="tooltip-panel-open"
                  onClick={() => setShowTipPanel(true)}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left transition hover:border-brand-500/40 hover:bg-white/[0.06]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <MousePointer2 className="h-4 w-4 shrink-0 text-brand-400" />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-zinc-100">Tooltips & display</span>
                      <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                        {(TOOLTIP_STYLES.find((s) => s.id === (p.tooltip_style || "classic")) || {}).label || "Classic"} ·{" "}
                        {(TOOLTIP_ANIMATIONS.find((a) => a.id === (p.tooltip_anim || "slide")) || {}).label || "Slide"} · badges, links & your UID
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
                </button>
              </Section>

              <FxModal
                open={showTipPanel}
                onOpenChange={setShowTipPanel}
                id="tip-panel"
                eyebrow="Tooltips"
                title="Tooltips & display"
                description="One look and one entrance for every hover label, the switches for what carries one, and how your footer line reads."
                testid="tip-panel"
                footer={
                  <div className="ov-modal-foot-row">
                    <span className="ov-foot-note">Click a look to apply it. Every tip on your card follows it.</span>
                    <button type="button" onClick={() => setShowTipPanel(false)} className="ov-btn px-4 py-2 text-xs">
                      Done
                    </button>
                  </div>
                }
              >
                <div className="space-y-5">
                  <div>
                    <div className="mb-2 text-xs text-zinc-300">Look</div>
                    <ChipGrid
                      testid="tooltip-style"
                      cols={3}
                      value={p.tooltip_style || "classic"}
                      onChange={(v) => set("tooltip_style", v)}
                      options={TOOLTIP_STYLES}
                    />
                    <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                      Classic is a plain black bubble with the label in it. Glass and Ice are the two
                      dressed looks.
                    </p>
                  </div>

                  <div className="border-t border-white/5 pt-5">
                    <div className="mb-2 text-xs text-zinc-300">Entrance</div>
                    <ChipGrid
                      testid="tooltip-animation"
                      cols={3}
                      value={p.tooltip_anim || "slide"}
                      onChange={(v) => set("tooltip_anim", v)}
                      options={TOOLTIP_ANIMATIONS}
                    />
                  </div>

                  <div className="border-t border-white/5 pt-5">
                    <div className="mb-2 text-xs text-zinc-300">Size</div>
                    <ChipGrid
                      testid="tooltip-size"
                      cols={3}
                      value={p.tooltip_size || "md"}
                      onChange={(v) => set("tooltip_size", v)}
                      options={TOOLTIP_SIZES}
                    />
                  </div>

                  <div className="border-t border-white/5 pt-5">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Show a hover label on
                    </div>
                    <div className="space-y-3">
                      <ToggleRow
                        testid="badge-tooltips-toggle"
                        label="Badges"
                        hint="a badge's name"
                        checked={p.badge_tooltips !== false}
                        onCheckedChange={(v) => set("badge_tooltips", v)}
                      />
                      <ToggleRow
                        testid="link-tooltips-toggle"
                        label="Links"
                        hint="the note you typed on a link"
                        checked={p.link_tooltips !== false}
                        onCheckedChange={(v) => set("link_tooltips", v)}
                      />
                      <ToggleRow
                        testid="avatar-uid-tooltip-toggle"
                        label="Your avatar"
                        hint="your UID, following the cursor"
                        checked={p.avatar_uid_tooltip !== false}
                        onCheckedChange={(v) => set("avatar_uid_tooltip", v)}
                      />
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-5">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Your footer line
                    </div>

                    <div className="mb-2 text-xs text-zinc-300">Meta line style</div>
                    <ChipGrid
                      testid="meta-style"
                      cols={3}
                      value={p.meta_style || "plain"}
                      onChange={(v) => set("meta_style", v)}
                      options={[
                        { id: "plain", label: "Plain" },
                        { id: "pills", label: "Pills" },
                        { id: "boxed", label: "Boxed" },
                      ]}
                    />

                    {/* Where the count sits. "Meta line" is the footer line the
                        card has always drawn; the four corners move it onto the
                        page itself, and "Hidden" draws it nowhere. */}
                    <div className="mb-2 mt-5 text-xs text-zinc-300">View counter position</div>
                    <ChipGrid
                      testid="views-position"
                      cols={3}
                      value={p.views_position || ""}
                      onChange={(v) => set("views_position", v)}
                      options={[
                        { id: "", label: "Meta line" },
                        { id: "tl", label: "Top left" },
                        { id: "tr", label: "Top right" },
                        { id: "bl", label: "Bottom left" },
                        { id: "br", label: "Bottom right" },
                        { id: "hidden", label: "Hidden" },
                      ]}
                    />
                    <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                      The count reads as it is up to a thousand, then shortens: 999, 1.2k, 3.4m. Your
                      UID is your member number — the order you joined in — shown as it is.
                    </p>

                    <div className="mt-4 space-y-3">
                      <ToggleRow
                        testid="show-join-date"
                        label="Join date"
                        hint="the month and year you joined"
                        checked={!!p.show_join_date}
                        onCheckedChange={(v) => set("show_join_date", v)}
                      />
                      <ToggleRow
                        testid="showcase-uid-toggle"
                        label="Your UID chip"
                        hint="your member number"
                        checked={!!p.showcase_uid}
                        onCheckedChange={(v) => set("showcase_uid", v)}
                      />
                    </div>
                  </div>
                </div>
              </FxModal>

              <Section title="Page & Privacy" hint="How the page itself behaves for a visitor">
                <SliderRow
                  testid="bio-size"
                  label="Bio text size"
                  value={Number(p.bio_size ?? 100)}
                  min={80}
                  max={160}
                  step={5}
                  suffix="%"
                  onChange={(v) => set("bio_size", v)}
                />
                <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 text-xs text-zinc-300">
                  <span>
                    Hide the &quot;made with swats.bio&quot; footer
                    {!isPremium && <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-400">Premium</span>}
                  </span>
                  <Switch
                    data-testid="hide-footer"
                    className={SWITCH_CLASS}
                    checked={!!p.hide_footer}
                    onCheckedChange={(v) => (isPremium ? set("hide_footer", v) : setPremiumFeature("Footer removal"))}
                  />
                </label>
              </Section>


              {/* The Advanced Appearance panel is gone: the toggle, the fill /
                  outline / radius sliders behind it and the per-block placement
                  map underneath. Every value it wrote is still read by the
                  renderer, but nothing here rewrites the card style you picked
                  in one place anymore. */}

              <Section title="Animations" hint={isPremium ? "Played as the page loads" : "Premium"}>
                <ChipGrid
                  testid="reveal"
                  cols={3}
                  value={p.reveal_animation || ""}
                  onChange={(v) => set("reveal_animation", v)}
                  onLocked={askPremium("Section animations")}
                  options={SECTION_ANIMATIONS.map((a) => ({ ...a, locked: !!a.premium && !isPremium }))}
                />
                <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 border-t border-white/5 pt-4 text-xs text-zinc-300">
                  <span>
                    Foldable sections <span className="text-[10px] text-zinc-500">(click a header to collapse)</span>
                  </span>
                  <Switch
                    data-testid="section-fold-toggle"
                    className={SWITCH_CLASS}
                    checked={!!p.section_fold}
                    onCheckedChange={(v) => (isPremium ? set("section_fold", v) : askPremium("Foldable sections")())}
                  />
                </label>
              </Section>
            </>
          )}

          {sub === "entry" && (
            <Section title="Profile Entry Screen">
              <label className="mb-4 flex cursor-pointer items-center justify-between gap-4 text-xs font-bold text-zinc-300">
                <span>Enable Entry Overlay Screen</span>
                <Switch data-testid="entry-enable" className={SWITCH_CLASS} checked={!!p.entry_enabled} onCheckedChange={(v) => set("entry_enabled", v)} />
              </label>
              {p.entry_enabled && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {ENTRY_STYLES.map(({ id, label }) => (
                      <button
                        key={id}
                        data-testid={`entry-style-${id}`}
                        aria-pressed={(p.entry_style || "bubble") === id}
                        onClick={() => set("entry_style", id)}
                        className={`flex flex-col gap-2 rounded-xl border p-2 text-xs font-semibold transition ${
                          (p.entry_style || "bubble") === id ? "bg-brand-500/20 border-brand-500 text-brand-200" : "border-white/10 text-zinc-400 hover:bg-white/5"
                        }`}
                      >
                        <EntryStyleThumb id={id} accent={accentColor} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <input
                    data-testid="entry-text"
                    value={p.entry_text || ""}
                    onChange={(e) => set("entry_text", p.entry_style === "codelock" ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value)}
                    inputMode={p.entry_style === "codelock" ? "numeric" : "text"}
                    maxLength={p.entry_style === "codelock" ? 4 : 60}
                    placeholder={p.entry_style === "codelock" ? "4-digit PIN (e.g. 1234)" : "Button text (e.g. Click to enter)"}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-zinc-100 outline-none focus:border-brand-500/50"
                  />
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    {p.entry_style === "codelock"
                      ? "Visitors type this PIN to open the page. Leave it empty and the gate opens on click instead."
                      : "The label on the entry button or text prompt."}
                  </p>
                </div>
              )}
            </Section>
          )}

          {/* Save Button. Left enabled while the gate is on: the click is what
              explains why nothing saved, and a greyed-out button with no reason
              beside it is the thing this whole flow exists to avoid. */}
          <button
            onClick={save}
            disabled={saving}
            data-testid="editor-save"
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold text-sm hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(255,127,188,0.3)]"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : gate.blocked ? (
              <Lock className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {gate.blocked ? "Connect Discord to save" : "Save Changes"}
          </button>
        </div>

        {/* Live Preview Panel */}
        <div className="lg:sticky lg:top-24 self-start space-y-2">
          <div className="text-xs font-mono2 uppercase tracking-wider text-zinc-400 font-bold">Real-time Profile Preview</div>
          <div className="overflow-hidden rounded-3xl border border-white/15 shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
            <LivePreviewCard user={user} profile={p} displayName={displayName} tuning={fxTuning} />
          </div>
        </div>
      </div>

      <AvatarDecorationModal
        isOpen={showDecoModal}
        onClose={() => setShowDecoModal(false)}
        value={p.avatar_decoration || ""}
        onChange={(val) => set("avatar_decoration", val)}
        hueValue={Number(p.avatar_decoration_hue || 0)}
        onHueChange={(val) => set("avatar_decoration_hue", val)}
        // Older profiles saved a Swats effect into the frame field; surface it as
        // the effect selection so the modal reflects what is actually on the card.
        effectValue={p.avatar_effect || (String(p.avatar_decoration || "").startsWith("swats_") ? p.avatar_decoration : "")}
        onEffectChange={(val) => set("avatar_effect", val)}
        avatarUrl={p.avatar_url}
        isPremium={isPremium}
        onGoPremium={askPremium("Avatar decorations")}
        discordId={user?.discord?.id || null}
      />

      {/* One gate for the whole page: a locked control opens this over the editor
          instead of throwing the owner out to the pricing page. */}
      <PremiumGate
        open={!!premiumFeature}
        feature={premiumFeature}
        onClose={() => setPremiumFeature(null)}
      />
    </div>
  );
}
