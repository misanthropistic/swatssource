import { Play, Volume2 } from "lucide-react";

/* ---------------------------------------------------------------------------
   A thumbnail of each audio player style.

   The Widgets page draws the shape of each player instead of listing bare
   names, so the choice is made by eye. The catalogue is three styles now:
   mini-bar (a slim line), compact (a small card) and corner-icon (a speaker
   chip that reveals its bar on hover — drawn mid-reveal so the thumbnail
   explains the interaction too).

   `size` scales the whole mock: "sm" for the picker grid, "lg" inside the
   browse dialog. Nothing here reads real track data on purpose: it is a
   picture of a layout, so it renders identically before a single track is
   added.
   --------------------------------------------------------------------------- */

const SIZES = {
  sm: { w: 132, h: 62, pad: 8, bar: 3, line: 7 },
  lg: { w: 260, h: 104, pad: 12, bar: 4, line: 11 },
};

const Bar = ({ w, h, className = "", style }) => (
  <span className={`block rounded-full ${className}`} style={{ width: w, height: h, ...style }} />
);

export function TrackStylePreview({ id, accent = "#A48DF4", size = "sm" }) {
  const S = SIZES[size] || SIZES.sm;

  const shell = (children) => (
    <div
      data-testid={`track-style-preview-${id}`}
      className="relative overflow-hidden border border-white/10 bg-[#0b0b10]"
      style={{ width: S.w, height: S.h, borderRadius: 12, padding: S.pad }}
    >
      {children}
    </div>
  );

  // Mini bar: one slim line — a bare play glyph, a short title, the scrubber
  // with its grabber, and a time on the end. No card, no background.
  if (id === "mini-bar") {
    return shell(
      <div className="flex h-full items-center gap-2">
        <span
          className="flex shrink-0 items-center justify-center rounded-full"
          style={{ width: S.line * 1.8, height: S.line * 1.8, background: accent }}
          aria-hidden
        >
          <Play width={S.line * 0.8} height={S.line * 0.8} style={{ color: "#fff" }} aria-hidden />
        </span>
        <Bar w="22%" h={S.line} className="bg-white/40" />
        <Bar w="100%" h={S.bar} style={{ background: `${accent}33` }} />
        <Bar w="14%" h={S.line - 2} className="bg-white/25" />
      </div>,
    );
  }

  // Corner icon: a speaker chip in the frame's top-left with the bar popping
  // out of it — drawn half-open so the thumbnail shows what hover does.
  if (id === "corner-icon") {
    return shell(
      <div className="relative h-full">
        <span
          className="absolute left-0 top-0 flex items-center justify-center rounded-full border text-white"
          style={{ width: S.line * 2.6, height: S.line * 2.6, background: "rgba(0,0,0,0.75)", borderColor: `${accent}55` }}
          aria-hidden
        >
          <Volume2 width={S.line} height={S.line} aria-hidden />
        </span>
        <div
          className="absolute right-0 top-0 rounded-xl border border-white/10 bg-black/80 p-1.5"
          style={{ width: "62%", height: `calc(100% - ${S.bar * 2}px)` }}
          aria-hidden
        >
          <Bar w="70%" h={S.line - 3} className="bg-white/40" />
          <Bar w="100%" h={S.bar - 1} className="mt-1.5" style={{ background: `${accent}55` }} />
        </div>
      </div>,
    );
  }

  // Compact (also the fallback for any unknown id): one small card — artwork
  // plate, title row, a thin scrubber underneath.
  return shell(
    <div className="flex h-full items-center gap-2.5">
      <span
        className="flex shrink-0 items-center justify-center rounded-lg border"
        style={{
          width: S.line * 2.2,
          height: S.line * 2.2,
          background: `linear-gradient(135deg, ${accent}55, ${accent}18)`,
          borderColor: `${accent}44`,
        }}
        aria-hidden
      >
        <Play width={S.line} height={S.line} style={{ color: accent }} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <Bar w="62%" h={S.line} className="bg-white/45" />
        <Bar w="100%" h={S.bar - 1} style={{ background: `${accent}44` }} />
      </div>
      <Bar w="16%" h={S.line - 3} className="bg-white/20" />
    </div>,
  );
}

export default TrackStylePreview;
