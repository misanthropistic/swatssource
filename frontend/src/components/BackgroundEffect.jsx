import { useEffect, useRef } from "react";
import { createGhostBgPainter } from "@/lib/ghostFx";
import { resolveBackground } from "@/constants/effects";

/* ---------------------------------------------------------------------------
   BackgroundEffect — the background layer, painting the exact ghost.html set:
   window-rain, snow-v1, snow-v2, cash-fall, heart-fall, vhs-tape, spotlight,
   thunder (lib/ghostFx, ported verbatim; "version 1" is ghost's default).

   One canvas, one painter instance, one clear per frame — no DOM star fields, no
   double-painted CSS copy, no per-frame layout reads. The painters fill their
   own backdrops (that IS the look of the ghost page: window rain paints its
   #0b0e13 plate, vhs tape paints its tape plate), so the canvas carries the
   effect at full strength and the old per-effect opacity dial is gone.

   ghost rebuilds its painter on resize so the particle field re-seeds for the
   new box; the same happens here, driven by a ResizeObserver on the layer's
   parent (the URL-bar-resize case) plus the usual window listener.
   --------------------------------------------------------------------------- */

export function BackgroundEffect({ effect }) {
  const canvasRef = useRef(null);
  // Resolved once per value: legacy ids saved before the ghost swap map to the
  // closest ghost background (or to nothing, when nothing was close).
  const id = resolveBackground(effect);

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
    // Spotlight chases the pointer in canvas coordinates; every other painter
    // ignores it. Reset to the "never seen" state on (re)mount, as ghost does.
    const pointer = { current: { x: -99, y: -99 } };

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      pointer.current.x = e.clientX - rect.left;
      pointer.current.y = e.clientY - rect.top;
    };

    const resize = () => {
      const parent = canvas.parentElement;
      // Device pixel ratio capped at 2, exactly like ghost's resize(). The box
      // itself is capped too: a pathological parent height (a rendering bug
      // upstream) must not be able to ask for a 2^25-pixel backing store and
      // wedge the tab. No real profile viewport comes near 4096px either way.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.min(4096, Math.max(1, parent ? parent.clientWidth : window.innerWidth));
      h = Math.min(4096, Math.max(1, parent ? parent.clientHeight : window.innerHeight));
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Rebuild the painter for the new box, exactly like ghost's setBg().
      painter = createGhostBgPainter(id, w, h, pointer);
      ctx.clearRect(0, 0, w, h);
    };

    const frame = (now) => {
      ctx.clearRect(0, 0, w, h);
      if (painter) painter(ctx, now);
      raf = requestAnimationFrame(frame);
    };

    if (id === "spotlight" && typeof window !== "undefined") {
      window.addEventListener("pointermove", onMove, { passive: true });
    }
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
      if (id === "spotlight" && typeof window !== "undefined") {
        window.removeEventListener("pointermove", onMove);
      }
      observer?.disconnect();
    };
  }, [id]);

  if (!id) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="bg-canvas"
      data-effect={id}
      /* Which blend mode this layer gets is decided in effects.css per effect
         (.sw-bg-canvas). Screen keeps a particle layer from burying the owner's
         background; it also renders a PLATE-based effect (a rain-streaked
         window, a VHS tape, a thunderstorm, a spotlight) invisible, because
         screen drops dark pixels and those effects ARE mostly their dark plate.
         Half the catalogue looked like it did nothing because of that. */
      className="sw-bg-canvas absolute inset-0 w-full h-full pointer-events-none z-[1]"
    />
  );
}

export default BackgroundEffect;
