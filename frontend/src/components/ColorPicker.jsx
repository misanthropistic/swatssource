import React, { useState, useRef, useEffect, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check } from "lucide-react";

const PRESET_COLORS = [
  "#ffffff", "#000000", "#A48DF4", "#D3C4FF", "#8C71E8",
  "#3b82f6", "#38bdf8", "#10b981", "#34d399", "#f59e0b",
  "#ef4444", "#f43f5e", "#ec4899", "#18181b"
];

// Helper: Parse any hex string (#rgb, #rrggbb, #rrggbbaa) to HSV + Alpha
function hexToHsv(hexStr) {
  let hex = (hexStr || "#A48DF4").trim().replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  } else if (hex.length === 4) {
    hex = hex.split("").map((c) => c + c).join("");
  }

  let r = 168, g = 85, b = 247, a = 1;
  if (hex.length >= 6) {
    const parsedR = parseInt(hex.substring(0, 2), 16);
    const parsedG = parseInt(hex.substring(2, 4), 16);
    const parsedB = parseInt(hex.substring(4, 6), 16);
    if (!Number.isNaN(parsedR)) r = parsedR;
    if (!Number.isNaN(parsedG)) g = parsedG;
    if (!Number.isNaN(parsedB)) b = parsedB;
    if (hex.length >= 8) {
      const parsedA = parseInt(hex.substring(6, 8), 16);
      if (!Number.isNaN(parsedA)) a = parsedA / 255;
    }
  }

  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2;
    } else {
      h = (rNorm - gNorm) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return {
    h: Math.round(h),
    s: Math.max(0, Math.min(1, s)),
    v: Math.max(0, Math.min(1, v)),
    a: Math.max(0, Math.min(1, a)),
  };
}

// Helper: Convert HSV + Alpha to Hex string
function hsvToHex(h, s, v, a = 1) {
  const normH = ((h % 360) + 360) % 360;
  const normS = Math.max(0, Math.min(1, s));
  const normV = Math.max(0, Math.min(1, v));

  const c = normV * normS;
  const x = c * (1 - Math.abs(((normH / 60) % 2) - 1));
  const m = normV - c;

  let rPrime = 0, gPrime = 0, bPrime = 0;
  if (normH < 60) {
    rPrime = c; gPrime = x; bPrime = 0;
  } else if (normH < 120) {
    rPrime = x; gPrime = c; bPrime = 0;
  } else if (normH < 180) {
    rPrime = 0; gPrime = c; bPrime = x;
  } else if (normH < 240) {
    rPrime = 0; gPrime = x; bPrime = c;
  } else if (normH < 300) {
    rPrime = x; gPrime = 0; bPrime = c;
  } else {
    rPrime = c; gPrime = 0; bPrime = x;
  }

  const r = Math.round((rPrime + m) * 255);
  const g = Math.round((gPrime + m) * 255);
  const b = Math.round((bPrime + m) * 255);

  const toHex = (n) => n.toString(16).padStart(2, "0");
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

  if (a < 0.999) {
    const alphaHex = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
    return `${hex}${alphaHex}`;
  }
  return hex;
}

export function ColorPicker({ label, value, onChange, testid }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(value || "#A48DF4"));
  const [hexInput, setHexInput] = useState(value || "#A48DF4");

  const satValRef = useRef(null);
  const hueRef = useRef(null);
  const alphaRef = useRef(null);

  // Sync state if external value changes while closed
  useEffect(() => {
    if (!isOpen) {
      setHsv(hexToHsv(value || "#A48DF4"));
      setHexInput(value || "#A48DF4");
    }
  }, [value, isOpen]);

  // Notify parent of updated color
  const updateColor = useCallback((newHsv) => {
    setHsv(newHsv);
    const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v, newHsv.a);
    setHexInput(hex);
    if (onChange) onChange(hex);
  }, [onChange]);

  // 1. Saturation & Value 2D Box Dragging
  const handleSatValPointerDown = (e) => {
    e.preventDefault();
    const box = satValRef.current;
    if (!box) return;

    const compute = (clientX, clientY) => {
      const rect = box.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      const s = x / rect.width;
      const v = 1 - (y / rect.height);
      updateColor({ ...hsv, s, v });
    };

    compute(e.clientX, e.clientY);

    const onPointerMove = (moveEvent) => compute(moveEvent.clientX, moveEvent.clientY);
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // 2. Custom Hue Slider Dragging
  const handleHuePointerDown = (e) => {
    e.preventDefault();
    const bar = hueRef.current;
    if (!bar) return;

    const compute = (clientX) => {
      const rect = bar.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const h = Math.round((x / rect.width) * 360) % 360;
      updateColor({ ...hsv, h });
    };

    compute(e.clientX);

    const onPointerMove = (moveEvent) => compute(moveEvent.clientX);
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // 3. Custom Alpha / Opacity Slider Dragging
  const handleAlphaPointerDown = (e) => {
    e.preventDefault();
    const bar = alphaRef.current;
    if (!bar) return;

    const compute = (clientX) => {
      const rect = bar.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const a = Number((x / rect.width).toFixed(2));
      updateColor({ ...hsv, a });
    };

    compute(e.clientX);

    const onPointerMove = (moveEvent) => compute(moveEvent.clientX);
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // Direct Hex Input
  const handleHexInputChange = (e) => {
    let val = e.target.value.trim();
    if (!val.startsWith("#")) val = "#" + val;
    setHexInput(val);
    if (/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(val)) {
      const parsed = hexToHsv(val);
      setHsv(parsed);
      if (onChange) onChange(val);
    }
  };

  const handleHexInputBlur = () => {
    const formatted = hsvToHex(hsv.h, hsv.s, hsv.v, hsv.a);
    setHexInput(formatted);
    if (onChange) onChange(formatted);
  };

  const pureHueHex = hsvToHex(hsv.h, 1, 1, 1);
  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v, hsv.a);

  return (
    <div className="space-y-1.5 w-full">
      {label && <label className="block text-[11px] font-semibold text-zinc-400">{label}</label>}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div
            data-testid={testid}
            className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer hover:border-brand-500/40 transition-colors w-full group"
          >
            <div
              className="w-7 h-7 rounded-lg shadow-inner shrink-0 relative overflow-hidden"
              style={{
                backgroundColor: value || "#A48DF4",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)",
              }}
            />
            <span className="w-full bg-transparent text-[13px] font-mono2 text-zinc-200 uppercase flex-1 text-left font-semibold truncate">
              {value || "#A48DF4"}
            </span>
          </div>
        </PopoverTrigger>

        <PopoverContent
          className="w-72 p-4 bg-[#111218] border border-white/15 rounded-2xl shadow-2xl z-50 select-none text-zinc-100"
          align="start"
        >
          <div className="space-y-3.5">
            {/* 1. Custom 2D Saturation / Value Picker Box */}
            <div
              ref={satValRef}
              onPointerDown={handleSatValPointerDown}
              className="relative w-full h-36 rounded-xl overflow-hidden cursor-crosshair shadow-inner"
              style={{ backgroundColor: pureHueHex }}
            >
              {/* White Saturation gradient horizontally */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(to right, #ffffff, transparent)" }}
              />
              {/* Black Value gradient vertically */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(to top, #000000, transparent)" }}
              />
              {/* Selector Thumb */}
              <div
                className="absolute w-4 h-4 rounded-full border-2 border-white shadow-[0_0_5px_rgba(0,0,0,0.8)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: `${hsv.s * 100}%`,
                  top: `${(1 - hsv.v) * 100}%`,
                  backgroundColor: currentHex,
                }}
              />
            </div>

            {/* 2. Custom Hue Slider Menu */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 mb-1.5">
                <span>Custom Hue</span>
                <span className="font-mono2 text-[10px] text-zinc-500">{hsv.h}°</span>
              </div>
              <div
                ref={hueRef}
                onPointerDown={handleHuePointerDown}
                className="relative w-full h-4 rounded-full cursor-pointer shadow-inner border border-white/10"
                style={{
                  background:
                    "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
                }}
              >
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4.5 h-4.5 rounded-full border-2 border-white bg-black shadow-md pointer-events-none"
                  style={{
                    left: `${(hsv.h / 360) * 100}%`,
                    backgroundColor: pureHueHex,
                  }}
                />
              </div>
            </div>

            {/* 3. Custom Transparency / Alpha Slider */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 mb-1.5">
                <span>Transparency / Alpha</span>
                <span className="font-mono2 text-[10px] text-zinc-500">{Math.round(hsv.a * 100)}%</span>
              </div>
              <div
                ref={alphaRef}
                onPointerDown={handleAlphaPointerDown}
                className="relative w-full h-4 rounded-full cursor-pointer shadow-inner border border-white/10 overflow-hidden"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%)",
                  backgroundSize: "8px 8px",
                  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                }}
              >
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `linear-gradient(to right, transparent, ${hsvToHex(hsv.h, hsv.s, hsv.v, 1)})`,
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4.5 h-4.5 rounded-full border-2 border-white bg-white shadow-md pointer-events-none"
                  style={{
                    left: `${hsv.a * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* 4. Color Swatch + Hex Input */}
            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-black/50 border border-white/10">
              <div
                className="w-8 h-8 rounded-lg shadow-inner border border-white/20 shrink-0"
                style={{ backgroundColor: currentHex }}
              />
              <input
                type="text"
                value={hexInput}
                onChange={handleHexInputChange}
                onBlur={handleHexInputBlur}
                className="w-full bg-transparent text-xs font-mono2 text-zinc-100 uppercase font-bold outline-none"
                placeholder="#A48DF4"
                maxLength={9}
              />
            </div>

            {/* 5. Quick Aesthetic Presets */}
            <div>
              <div className="text-[11px] font-semibold text-zinc-400 mb-2">Preset Swatches</div>
              <div className="grid grid-cols-7 gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      const parsed = hexToHsv(c);
                      updateColor(parsed);
                    }}
                    className="w-6 h-6 rounded-md hover:scale-115 transition-transform flex items-center justify-center cursor-pointer shadow-sm"
                    style={{
                      backgroundColor: c,
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)",
                    }}
                  >
                    {currentHex.toLowerCase().startsWith(c.toLowerCase()) && (
                      <Check className="w-3.5 h-3.5 text-white drop-shadow-md" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
