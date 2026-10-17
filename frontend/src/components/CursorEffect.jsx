import { useEffect, useRef } from "react";
import { createGhostMouseState, ghostEmit, ghostDrawMouse } from "@/lib/ghostFx";
import { resolveCursor, CURSOR_EFFECTS } from "@/constants/effects";

/* ---------------------------------------------------------------------------
   CursorEffect — the exact ghost.html pointer layer: sparkle, star dust,
   snow flakes, blood drips, sparks, silver trail, black trail (lib/ghostFx,
   ported verbatim, version 1).

   How ghost's engine works, and how this is wired:

     • every pointer move hands the position to ghostEmit(), which throws its
       version-1 particle count (sparks 3, sparkle 2, everything else 1) and
       pushes the pool back down to a hard cap of 400.
     • one draw per frame: the trail (a ribbon of knots with a 26-frame life)
       and then the particles. Nothing is drawn until the pointer has moved.
     • no layout reads in the loop; the canvas is window-sized at devicePixelRatio
       capped at 2, exactly like ghost's #fx canvas.

   `accent` is accepted and ignored: ghost's mouse effects bring their own
   colours and a pointer layer that recolours to the profile's accent would no
   longer be the exact ghost set.
   --------------------------------------------------------------------------- */

export const CursorEffect = ({ effect, accent }) => {
  const canvasRef = useRef(null);
  const id = resolveCursor(effect);
  void accent;

  useEffect(() => {
    if (!id) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const state = createGhostMouseState();
    let w = 0;
    let h = 0;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Ghost resizes via setEffect on its own read; our transform handles it.
    };

    const onMove = (e) => {
      ghostEmit(state, id, e.clientX, e.clientY);
    };

    const frame = () => {
      ghostDrawMouse(ctx, state, id, w, h);
      raf = requestAnimationFrame(frame);
    };

    const moveEvent = typeof window !== "undefined" && "onpointermove" in window ? "pointermove" : "mousemove";

    window.addEventListener(moveEvent, onMove, { passive: true });
    window.addEventListener("resize", resize);
    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(moveEvent, onMove);
      window.removeEventListener("resize", resize);
      state.parts.length = 0;
      state.trail.length = 0;
    };
  }, [id]);

  // Deliberately does NOT bail out on prefers-reduced-motion — same contract as
  // effects.css: the owner picked the effect on purpose, it keeps animating.
  if (!id) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="cursor-effect"
      data-effect={id}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60 }}
    />
  );
};

/* Ids the ghost pointer layer actually renders (all of CURSOR_EFFECTS' ids from
   constants/resolvers except "" — None). Kept exported for tests. */
export const CURSOR_PAINTER_IDS = CURSOR_EFFECTS.filter((e) => e.id).map((e) => e.id);

export default CursorEffect;
