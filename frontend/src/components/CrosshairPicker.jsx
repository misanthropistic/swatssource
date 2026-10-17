import { useMemo, useState } from "react";
import { Crosshair, Loader2, RotateCcw, Trash2, Upload } from "lucide-react";
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

const Preview = ({ src, settings, natural }) => {
  const { width, height } = scaledCrosshairSize(natural.width, natural.height, settings.scale);
  const left = Math.min(settings.x, width - 1);
  const top = Math.min(settings.y, height - 1);
  return (
    <div className="relative grid h-[168px] w-[168px] shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,127,188,0.10),transparent_70%),linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:auto,16px_16px,16px_16px]">
      {src ? (
        <>
          <img
            src={fileUrl(src)}
            alt="Crosshair preview"
            data-testid="crosshair-preview-image"
            className="object-contain"
            style={{ width, height }}
            onLoad={(e) => {
              const w = e.currentTarget.naturalWidth;
              const h = e.currentTarget.naturalHeight;
              if (w && h && (w !== natural.width || h !== natural.height)) setNatural({ width: w, height: h });
            }}
          />
          <span
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-300 bg-brand-500/40 shadow-[0_0_10px_rgba(255,127,188,0.8)]"
            style={{ left: `calc(50% - ${width / 2}px + ${left}px)`, top: `calc(50% - ${height / 2}px + ${top}px)` }}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 text-zinc-600">
          <Crosshair className="h-8 w-8" />
          <span className="font-mono2 text-[10px] uppercase tracking-widest">No crosshair</span>
        </div>
      )}
      {src ? (
        <span className="absolute bottom-1.5 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono2 text-[10px] text-zinc-400">
          {width}×{height}
        </span>
      ) : null}
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
      fd.append("kind", "crosshair");
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const measured = data?.metadata || {};
      if (measured.width && measured.height) setNatural({ width: measured.width, height: measured.height });
      patch({
        crosshair_image: data.url,
        crosshair_scale: 1,
        crosshair_x: Math.round((measured.width || 32) / 2),
        crosshair_y: Math.round((measured.height || 32) / 2),
      });
      toast.success("Crosshair uploaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setUploading(false);
  };

  const clear = () => patch({ crosshair_image: "", crosshair_scale: 1, crosshair_x: 0, crosshair_y: 0 });

  const reset = () =>
    patch({
      crosshair_scale: 1,
      crosshair_x: Math.round(natural.width / 2),
      crosshair_y: Math.round(natural.height / 2),
    });

  return (
    <div className="flex flex-col gap-4 sm:flex-row" data-testid={testid}>
      <Preview src={settings.image} settings={settings} natural={natural} />

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white transition ${
              isPremium ? "bg-brand-500 hover:brightness-110" : "bg-amber-500/80 hover:bg-amber-500"
            }`}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {settings.image ? "Replace image" : "Upload crosshair"}
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

        <p className="text-[11px] leading-relaxed text-zinc-500">
          PNG or WEBP with transparency, 1MB max. The picture replaces the mouse arrow on your
          profile only. Drag the sliders to set the click point (crosshair centre) and size.
          {!isPremium ? " Custom crosshairs are Premium." : ""}
        </p>

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

export default CrosshairPicker;
