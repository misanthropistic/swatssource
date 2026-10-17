import { useEffect, useRef } from "react";
import { createGhostOverlayPainter } from "@/lib/ghostFx";
import { resolveOverlay } from "@/constants/effects";

/* ---------------------------------------------------------------------------
   OverlayEffect — the layer above the profile card, painting the exact
   ghost.html overlay set: snow, vhs, rain, hearts, snow-flakes, frost-bite,
   shooting-stars, dotters (lib/ghostFx, ported verbatim, version 1).

   ghost runs every overlay as a canvas painter (there is no CSS half in the
   ghost page and there is none here either): one canvas, one painter, one clear
   per frame, painter rebuilt on resize exactly like ghost's setOv().

   The Editor's Transparency slider still works: below 100 the whole layer fades.
   z-70 keeps it above the card (the profile card paints at z-10), and
   pointer-events-none keeps everything underneath clickable.
   --------------------------------------------------------------------------- */

export function OverlayEffect({ effect, color, opacity }) {
  const canvasRef = useRef(null);
  const id = resolveOverlay(effect);
  void color;

  useEffect(() => {
    if (!id) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let raf = 0;
    let w = 0;
    let h = 0;
    let painter = null;
    const pointer = { current: { x: -99, y: -99 } };

    const resize = () => {
      const parent = canvas.parentElement;
      // Device pixel ratio capped at 2 (and the box at 4096px, the same
      // pathological-parent guard the background layer carries): ghost's
      // backing-store budget, never bigger.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.min(4096, Math.max(1, parent ? parent.clientWidth : window.innerWidth));
      h = Math.min(4096, Math.max(1, parent ? parent.clientHeight : window.innerHeight));
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Rebuild the painter for the new box, exactly like ghost's setOv().
      painter = createGhostOverlayPainter(id, w, h, pointer);
      ctx.clearRect(0, 0, w, h);
    };

    const frame = (now) => {
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, w, h);
      if (painter) painter(ctx, now);
      raf = requestAnimationFrame(frame);
    };

    window.addEventListener("resize", resize);
    const observer =
      typeof ResizeObserver === "function" && canvas.parentElement
        ? new ResizeObserver(() => resize())
        : null;
    observer?.observe(canvas.parentElement);
    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      observer?.disconnect();
    };
  }, [id]);

  if (!id) return null;

  // The Editor's Transparency slider. 100% keeps the overlay exactly as
  // authored (ghost shows it at full strength); anything lower fades the layer.
  const raw = opacity === undefined || opacity === null || opacity === "" ? 100 : Number(opacity);
  const alpha = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) / 100 : 1;
  const layerStyle = alpha === 1 ? undefined : { opacity: alpha };

  return (
    <canvas
      ref={canvasRef}
      data-testid="overlay-canvas"
      data-effect={id}
      className="absolute inset-0 w-full h-full pointer-events-none z-[70]"
      style={layerStyle}
    />
  );
}

export default OverlayEffect;
