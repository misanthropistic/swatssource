import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Check, Sparkles, Lock } from "lucide-react";
import { api, fileUrl } from "@/lib/api";
import { AVATAR_EFFECTS } from "@/constants/effects";
import catalogueRows from "@/constants/decorations.json";

/* The decoration catalogue.
 *
 * Version 1 shipped 671 numbered PNGs copied into /public/frames and typed into
 * a rented list that could only offer a filename. That library is gone: the
 * picker now runs off a curated catalogue of decoration presets with real
 * names, served as a JSON file (public/decorations/effects.json) in the exact
 * shape the open Discord Avatar Decoration catalogue publishes:
 *
 *     { "id": "…", "label": "Hugh the Rainbow", "url": "https://cdn.discordapp.com/avatar-decoration-presets/a_….png?size=240&passthrough=true" }
 *
 * Discord's preset endpoint serves the animated (APNG) art from the same URL a
 * static one uses, so the picker animates by simply loading the image — no
 * conversion, no separate sprite sheet, no per-frame code. Transparent areas
 * stay intact the same way, which is what makes the layer-over-the-avatar
 * approach work.
 *
 * The saved value is the preset url itself (the same string format a member's
 * own real Discord decoration already stores), so old and new selections render
 * through one code path on the card.
 */

const CATALOGUE = Array.isArray(catalogueRows)
  ? catalogueRows.filter((r) => r && r.url && r.label)
  : [];

const CATALOGUE_URL = "/decorations/effects.json";

/* The picker's own defaults. 160×160 is the smallest size Discord's CDN serves
 * a preset cleanly at and is plenty for a 32-px tile; the store keeps whatever
 * size the catalogue URL carries so the exact saved string can round-trip.
 * `Hue` re-colours the layer in CSS (hue-rotate on the <img>), 0–360 degrees,
 * applied only when the member confirms — a preview you cannot un-see cheaply. */
const TILE_SIZE_PARAM = "size=160";

const withTileSize = (url) => {
  if (!url) return "";
  const base = url.split("?")[0];
  return `${base}?${TILE_SIZE_PARAM}&passthrough=true`;
};

function DecorationButton({ item, avatarUrl, selected, onSelect }) {
  return (
    <button
      type="button"
      data-testid={`deco-${item.id}`}
      aria-pressed={selected}
      title={item.label}
      onClick={() => onSelect(item)}
      className={`group relative aspect-square rounded-2xl border p-1 transition ${
        selected
          ? "border-brand-500 bg-brand-500/20 shadow-[0_0_15px_rgba(164, 141, 244,0.3)]"
          : "border-white/10 hover:border-white/25 hover:bg-white/5"
      }`}
    >
      <span className="relative flex h-full w-full items-center justify-center">
        {/* The avatar sits behind every tile, so a decoration is previewed over
            the picture it will actually wear. */}
        <span className="h-[70%] w-[70%] overflow-hidden rounded-full bg-zinc-800">
          {avatarUrl ? (
            <img src={fileUrl(avatarUrl)} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-zinc-500">
              U
            </span>
          )}
        </span>
        <img
          src={withTileSize(item.url)}
          alt={item.label}
          loading="lazy"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
      </span>
      {selected && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 z-10">
          <Check className="h-2.5 w-2.5 text-white" />
        </span>
      )}
    </button>
  );
}

export default function AvatarDecorationModal({
  isOpen,
  onClose,
  value,
  onChange,
  // The hue saved alongside the decoration (0–360, 0 = untouched), and the
  // setter that rides with Confirm.
  hueValue = 0,
  onHueChange,
  effectValue,
  onEffectChange,
  avatarUrl,
  isPremium,
  onGoPremium,
  // The signed-in member's Discord ID, when they have linked one. The member's
  // own decoration — the one they actually wear on Discord — is offered from
  // the same lookup the widgets route already does.
  discordId,
}) {
  const [catalogue, setCatalogue] = useState([]);
  const [cataState, setCataState] = useState("loading"); // loading | ready | error
  const [query, setQuery] = useState("");
  // The selection is a draft until Confirm: hue is cheap to explore, and
  // "apply on every slider tick" would flood the card with re-renders.
  const [draft, setDraft] = useState({ url: "", hue: 0 });
  const searchRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    setDraft({ url: value || "", hue: Number(hueValue) || 0 });
    let alive = true;
    // The catalogue ships in the bundle (src/constants/decorations.json — the
    // identical copy also serves at /decorations/effects.json); "load" here is
    // just the async-shaped handshake the UI state machine expects.
    Promise.resolve()
      .then(() => {
        if (alive) {
          setCatalogue(CATALOGUE);
          setCataState("ready");
        }
      })
      .catch(() => {
        if (alive) setCataState("error");
      });
    return () => {
      alive = false;
    };
  }, [isOpen, value]);

  useEffect(() => {
    if (isOpen) searchRef.current?.focus?.();
  }, [isOpen]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return catalogue;
    return catalogue.filter(
      (d) => d.label.toLowerCase().includes(q) || String(d.id).includes(q),
    );
  }, [catalogue, q]);

  const [real, setReal] = useState({ status: "idle", decoration: null });
  useEffect(() => {
    if (!isOpen || !discordId) return undefined;
    let alive = true;
    setReal({ status: "loading", decoration: null });
    api
      .get("/widgets/discord/users", { params: { ids: String(discordId) } })
      .then(({ data }) => {
        if (!alive) return;
        const me = (data?.users || []).find((u) => String(u.id) === String(discordId));
        setReal({ status: "done", decoration: me?.decoration || null });
      })
      .catch(() => {
        if (alive) setReal({ status: "error", decoration: null });
      });
    return () => {
      alive = false;
    };
  }, [isOpen, discordId]);

  if (!isOpen) return null;

  const effect = effectValue || "";

  const confirm = () => {
    // The saved value is the preset's url; the picked hue rides along as a
    // separate profile field so the card can hue-rotate the layer without a
    // second fetch.
    onChange(draft.url || "");
    onHueChange?.(draft.url ? draft.hue : 0);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-[#0A0A0D]/95 backdrop-blur-2xl rounded-3xl p-6 max-w-4xl w-full max-h-[88vh] flex flex-col relative shadow-[0_25px_90px_rgba(0,0,0,0.95),0_0_40px_rgba(164, 141, 244,0.15)] border border-white/15 animate-in zoom-in-95 duration-200"
        data-testid="decoration-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/20">
              <Sparkles className="h-4 w-4 text-brand-300" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-zinc-100">Change Avatar Decoration</h2>
              <p className="text-xs text-zinc-400">
                {cataState === "ready" ? `${catalogue.length} curated presets` : "loading the catalogue…"}
                {!isPremium ? " · animated APNG over your avatar" : ""}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 gap-5 pt-4">
          {/* ── catalogue column ────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchRef}
                  type="search"
                  data-testid="deco-search"
                  placeholder="Search decorations…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-brand-500/50"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraft({ url: "", hue: 0 });
                  onChange("");
                  onClose();
                }}
                className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.07]"
              >
                Clear
              </button>
            </div>

            <div className="mt-2 text-[11px] text-zinc-500">
              {cataState === "loading" && "Loading the catalogue…"}
              {cataState === "error" && "The catalogue could not load. Your own Discord decoration still works."}
              {cataState === "ready" && `${matches.length} result${matches.length === 1 ? "" : "s"}`}
            </div>

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1" data-testid="deco-grid">
              {cataState === "ready" && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {/* The member's own decoration first, when one exists. */}
                  {discordId && real.decoration && (
                    <DecorationButton
                      item={{ id: "mine", label: "Your Discord decoration", url: real.decoration.url }}
                      avatarUrl={avatarUrl}
                      selected={value === real.decoration.url}
                      onSelect={(item) => setDraft({ url: item.url, hue: 0 })}
                    />
                  )}
                  {matches.map((item) => (
                    <DecorationButton
                      key={item.id}
                      item={item}
                      avatarUrl={avatarUrl}
                      selected={draft.url === item.url}
                      onSelect={(it) => setDraft({ url: it.url, hue: 0 })}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── preview column ─────────────────────────────────────────── */}
          <div className="hidden w-64 shrink-0 flex-col sm:flex">
            <div className="text-xs font-bold text-zinc-200">Preview</div>
            <div
              className="mt-2 flex aspect-square items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] p-4"
              data-testid="deco-preview"
            >
              <span className="relative block h-full w-full max-h-[190px] max-w-[190px]">
                <span className="absolute inset-0 overflow-hidden rounded-full bg-zinc-800">
                  {avatarUrl ? (
                    <img src={fileUrl(avatarUrl)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-zinc-500">U</span>
                  )}
                </span>
                {draft.url && (
                  <img
                    src={draft.url}
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full scale-[1.28] object-contain"
                    style={draft.hue ? { filter: `hue-rotate(${draft.hue}deg)` } : undefined}
                    data-testid="deco-preview-layer"
                  />
                )}
              </span>
            </div>

            {/* Hue — a CSS filter over the chosen preset, 0..360. */}
            <div className="mt-4" data-testid="deco-hue">
              <div className="mb-2 text-xs font-bold text-zinc-200">Hue</div>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={draft.hue}
                onChange={(e) => setDraft((d) => ({ ...d, hue: Number(e.target.value) }))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-red-500 via-emerald-500 to-indigo-500 accent-brand-500 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
                aria-label="Decoration hue"
              />
              <div className="mt-1 flex justify-between font-mono2 text-[10px] text-zinc-500">
                <span>0°</span>
                <span className="text-zinc-300">{draft.hue}°</span>
                <span>360°</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                Shifts the decoration's colour wheel. 0° keeps the art untouched.
              </p>
            </div>
          </div>
        </div>

        {/* ── footer ─────────────────────────────────────────────────── */}
        <div className="mt-4 flex items-center justify-end gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="deco-confirm"
            onClick={confirm}
            className="rounded-xl bg-brand-500 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-brand-600"
          >
            Confirm
          </button>
        </div>

        {/* The Swats animated effects: same modal, separate axis. */}
        <div className="mt-4 border-t border-white/5 pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Swats animated effects {effect ? "· wearing one" : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="fx-avatar-none"
              onClick={() => onEffectChange("")}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                !effect ? "border-brand-500 bg-brand-500/20 text-brand-200" : "border-white/10 text-zinc-400 hover:bg-white/5"
              }`}
            >
              No effect
            </button>
            {AVATAR_EFFECTS.map((fx) => (
              <button
                key={fx.id}
                type="button"
                data-testid={`fx-avatar-${fx.id}`}
                onClick={() => (isPremium ? onEffectChange(fx.id) : onGoPremium?.())}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  effect === fx.id
                    ? "border-brand-500 bg-brand-500/20 text-brand-200"
                    : "border-white/10 text-zinc-400 hover:bg-white/5"
                }`}
              >
                {fx.label}
                {!isPremium && <LockInline />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const LockInline = () => (
  <Lock className="ml-1 inline h-3 w-3 shrink-0 text-amber-400" />
);
