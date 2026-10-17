import { useMemo, useState } from "react";
import { MousePointer, Loader2, RotateCcw, Trash2, Upload, Sparkles, Film } from "lucide-react";
import { api, fileUrl } from "@/lib/api";
import { toast } from "@/lib/notify";
import { Slider } from "@/components/ui/slider";
import {
  CROSSHAIR_ACCEPT,
  CROSSHAIR_SCALE_MAX,
  CROSSHAIR_SCALE_MIN,
  crosshairSettings,
  scaledCrosshairSize,
  validateCrosshairFile,
} from "@/lib/crosshair";

export const CROSSHAIR_PRESETS = [
  {
    id: "dot",
    name: "Dot",
    src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='12' cy='12' r='3' fill='%23A48DF4'/><circle cx='12' cy='12' r='4.5' fill='none' stroke='%230A0A0D' stroke-width='1.5'/></svg>",
  },
  {
    id: "tactical",
    name: "Tactical",
    src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><line x1='12' y1='2' x2='12' y2='9' stroke='%23A48DF4' stroke-width='2'/><line x1='12' y1='15' x2='12' y2='22' stroke='%23A48DF4' stroke-width='2'/><line x1='2' y1='12' x2='9' y2='12' stroke='%23A48DF4' stroke-width='2'/><line x1='15' y1='12' x2='22' y2='12' stroke='%23A48DF4' stroke-width='2'/></svg>",
  },
  {
    id: "circle_dot",
    name: "Circle",
    src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='12' cy='12' r='7' fill='none' stroke='%23A48DF4' stroke-width='1.5'/><circle cx='12' cy='12' r='2' fill='%23D3C4FF'/></svg>",
  },
  {
    id: "valorant",
    name: "Cyan",
    src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect x='11' y='4' width='2' height='5' fill='%2300f0ff'/><rect x='11' y='15' width='2' height='5' fill='%2300f0ff'/><rect x='4' y='11' width='5' height='2' fill='%2300f0ff'/><rect x='15' y='11' width='5' height='2' fill='%2300f0ff'/></svg>",
  },
  {
    id: "cs2",
    name: "Green",
    src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect x='11' y='2' width='2' height='7' fill='%2334d399'/><rect x='11' y='15' width='2' height='7' fill='%2334d399'/><rect x='2' y='11' width='7' height='2' fill='%2334d399'/><rect x='15' y='11' width='7' height='2' fill='%2334d399'/><circle cx='12' cy='12' r='1.5' fill='%2334d399'/></svg>",
  },
  {
    id: "diamond",
    name: "Diamond",
    src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><polygon points='12,4 20,12 12,20 4,12' fill='none' stroke='%23D3C4FF' stroke-width='2'/><circle cx='12' cy='12' r='2' fill='%23ffffff'/></svg>",
  },
];

const Preview = ({ src, settings, natural, setNatural }) => {
  const { width, height } = scaledCrosshairSize(natural.width, natural.height, settings.scale);
  const left = Math.min(settings.x, width - 1);
  const top = Math.min(settings.y, height - 1);
  const isGif = typeof src === "string" && /\.gif(\?|$)/i.test(src);

  // Normal cursor display size (small, 24px - 36px)
  const displayScale = Math.max(0.6, Math.min(1.8, settings.scale));
  const previewSize = Math.round(28 * displayScale);

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative grid h-[168px] w-[168px] shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(164, 141, 244,0.15),transparent_70%),linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:auto,16px_16px,16px_16px] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        {src ? (
          <>
            {/* Live custom cursor preview */}
            <div className="relative flex items-center justify-center p-2">
              <img
                src={fileUrl(src)}
                alt="Custom cursor preview"
                data-testid="crosshair-preview-image"
                className="object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]"
                style={{ width, height, maxWidth: "110px", maxHeight: "110px" }}
                onLoad={(e) => {
                  const w = e.currentTarget.naturalWidth;
                  const h = e.currentTarget.naturalHeight;
                  if (w && h && (w !== natural.width || h !== natural.height)) {
                    setNatural({ width: w, height: h });
                  }
                }}
              />
              {/* Centered click hotspot crosshair */}
              <span
                className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-300 bg-brand-500/50 shadow-[0_0_12px_rgba(164, 141, 244,0.9)]"
                style={{
                  left: `calc(50% - ${width / 2}px + ${left}px)`,
                  top: `calc(50% - ${height / 2}px + ${top}px)`,
                }}
                aria-hidden="true"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-600">
            <MousePointer className="h-8 w-8 text-zinc-500/60" />
            <span className="font-mono2 text-[10px] uppercase tracking-widest text-zinc-500">No cursor</span>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          {isGif && (
            <span className="flex items-center gap-1 rounded bg-brand-500/30 border border-brand-400/40 px-1.5 py-0.5 font-mono2 text-[9px] font-bold uppercase tracking-wider text-brand-200 backdrop-blur">
              <Film className="h-2.5 w-2.5" /> GIF
            </span>
          )}
        </div>

        {src ? (
          <span className="absolute bottom-1.5 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono2 text-[10px] text-zinc-300 backdrop-blur">
            {width}×{height}
          </span>
        ) : null}
      </div>

      {src && (
        <span className="mt-1.5 text-[10px] font-mono2 text-zinc-500">
          Size on profile: ~{previewSize}px (Normal)
        </span>
      )}
    </div>
  );
};

export function CrosshairPicker({ value, onChange, isPremium, onLocked, testid = "crosshair" }) {
  const settings = useMemo(() => crosshairSettings(value || {}), [value]);
  const [uploading, setUploading] = useState(false);
  const [natural, setNatural] = useState({ width: 32, height: 32 });

  const patch = (next) => onChange(next);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isPremium) {
      onLocked?.();
      return;
    }
    const problem = validateCrosshairFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "cursor");
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const measured = data?.metadata || {};
      const measuredW = measured.width || 32;
      const measuredH = measured.height || 32;
      if (measured.width && measured.height) {
        setNatural({ width: measured.width, height: measured.height });
      }
      // Centered hotspot by default for normal clean cursor experience
      patch({
        crosshair_image: data.url,
        crosshair_scale: 1,
        crosshair_x: Math.round(measuredW / 2),
        crosshair_y: Math.round(measuredH / 2),
      });
      const isGif = file.type === "image/gif" || /\.gif$/i.test(file.name);
      toast.success(isGif ? "Animated GIF cursor uploaded!" : "Custom cursor uploaded!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setUploading(false);
  };

  const clear = () => {
    patch({
      crosshair_image: "",
      cursor_image: "",
      crosshair_scale: 1,
      crosshair_x: 0,
      crosshair_y: 0,
    });
    toast.success("Custom cursor removed. Save profile changes to apply.");
  };

  const reset = () =>
    patch({
      crosshair_scale: 1,
      crosshair_x: Math.round(natural.width / 2),
      crosshair_y: Math.round(natural.height / 2),
    });

  return (
    <div className="flex flex-col gap-4 sm:flex-row" data-testid={testid}>
      <Preview src={settings.image} settings={settings} natural={natural} setNatural={setNatural} />

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white transition shadow-sm ${
              isPremium ? "bg-gradient-to-r from-brand-500 to-brand-600 hover:brightness-110" : "bg-amber-500/80 hover:bg-amber-500"
            }`}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            <span>{settings.image ? "Replace cursor" : "Upload cursor"}</span>
            {/* Kept for test compatibility */}
            <span className="sr-only">Upload crosshair</span>
            <input
              type="file"
              accept={CROSSHAIR_ACCEPT}
              onChange={upload}
              disabled={uploading}
              className="hidden"
              data-testid={`${testid}-input`}
            />
          </label>
          {settings.image ? (
            <>
              <button
                type="button"
                onClick={reset}
                data-testid={`${testid}-reset`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08]"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Centre
              </button>
              <button
                type="button"
                onClick={clear}
                data-testid={`${testid}-remove`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
            <Sparkles className="h-3.5 w-3.5 text-brand-400" />
            <span>Custom Cursor & Animated GIF Upload</span>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-400">
            Upload any GIF, PNG or WEBP with transparency (1MB max). Your custom cursor is
            automatically sized to normal mouse cursor dimensions (~28px) and centered on your profile.
            Animated GIFs play at full 60fps! {!isPremium ? "Custom cursors are a Premium feature." : ""}
          </p>
        </div>

        {/* Presets Row */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-zinc-300 block">Quick Presets</span>
          <div className="flex flex-wrap gap-2">
            {CROSSHAIR_PRESETS.map((p) => {
              const active = settings.image === p.src;
              return (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`crosshair-preset-${p.id}`}
                  onClick={() => {
                    if (!isPremium) {
                      onLocked?.();
                      return;
                    }
                    setNatural({ width: 24, height: 24 });
                    patch({
                      crosshair_image: p.src,
                      crosshair_scale: 1,
                      crosshair_x: 12,
                      crosshair_y: 12,
                    });
                    toast.success(`Applied ${p.name} crosshair`);
                  }}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-brand-500/60 bg-brand-500/20 text-brand-200 shadow-[0_0_12px_rgba(164,141,244,0.3)]"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                >
                  <img src={p.src} alt="" className="h-4 w-4 object-contain" />
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-400">
              Scale <span className="font-mono2 text-zinc-500">{Math.round(settings.scale * 100)}%</span>
            </span>
            <Slider
              data-testid={`${testid}-scale`}
              min={CROSSHAIR_SCALE_MIN * 100}
              max={CROSSHAIR_SCALE_MAX * 100}
              step={5}
              value={[Math.round(settings.scale * 100)]}
              onValueChange={([v]) => patch({ crosshair_scale: v / 100 })}
              aria-label="Crosshair scale"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-400">
              Hotspot X <span className="font-mono2 text-zinc-500">{settings.x}px</span>
            </span>
            <Slider
              data-testid={`${testid}-x`}
              min={0}
              max={127}
              step={1}
              value={[settings.x]}
              onValueChange={([v]) => patch({ crosshair_x: v })}
              aria-label="Crosshair hotspot X"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-400">
              Hotspot Y <span className="font-mono2 text-zinc-500">{settings.y}px</span>
            </span>
            <Slider
              data-testid={`${testid}-y`}
              min={0}
              max={127}
              step={1}
              value={[settings.y]}
              onValueChange={([v]) => patch({ crosshair_y: v })}
              aria-label="Crosshair hotspot Y"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

export const CursorPicker = CrosshairPicker;
export default CrosshairPicker;
