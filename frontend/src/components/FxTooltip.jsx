import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./tooltips.css";

/* ---------------------------------------------------------------------------
   Tooltips
   ---------------------------------------------------------------------------
   Both forms render the bubble into document.body so it escapes every
   `overflow: hidden` ancestor (the badge tips used to be sliced off by the
   card's own clipping).

     * <HoverTip label="…">   — wraps children in an inline-flex anchor. Use it
       for badge glyphs.
     * useTooltip("…")        — returns { tipProps, tipNode } to spread onto an
       existing element that MUST keep its own display / grid behaviour (link
       cards, widget cards). Wrapping those in a <span> would break col-span and
       the vertical link stack, so they attach the handlers directly instead.
     * useMouseTip("…")       — returns handlers + a bubble that follows the
       pointer (a few px above the cursor). Used for the avatar UID tip, which
       the owner asked to track the mouse rather than sit above the element.

   There is ONE look and ONE entrance animation, and both belong to the profile
   rather than to each tip. Every tip used to pick its own look, which is how a
   card ended up with a card-style badge tip, a pill-shaped link tip and bare
   glowing text on the avatar. The list of things that CAN have a tip is now a
   list of switches on the Editor's tooltip panel instead.

     • classic — a plain black bubble with the label in it. This is the default,
                 and it is deliberately plain: no border, no glow, no tail.
     • glass   — frosted translucent card.
     • ice     — cold translucent blue with a frosted rim.

   Entrance: slide (up into place), fade, or none.
   --------------------------------------------------------------------------- */

export const TOOLTIP_STYLES = [
  { id: "classic", label: "Classic" },
  { id: "glass", label: "Glass" },
  { id: "ice", label: "Ice" },
];

export const TOOLTIP_ANIMATIONS = [
  { id: "slide", label: "Slide" },
  { id: "fade", label: "Fade" },
  { id: "none", label: "None" },
];

export const TOOLTIP_SIZES = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Large" },
];

export const DEFAULT_TOOLTIP_STYLE = "classic";
export const DEFAULT_TOOLTIP_ANIMATION = "slide";

/* The four looks a profile could save per tip before there was one global look.
   They still resolve — an old profile must not render a bubble with no styling
   because its style id is no longer in the list — onto the nearest of the three
   that exist. "Cards" became the plain bubble, "text" the plain bubble too. */
const LEGACY_STYLES = { normal: "classic", basic: "classic", mini: "classic", glass: "glass" };

/* The first candidate that is a look we have; `classic` when none of them are.
   Takes several so a caller can offer the global setting and then whatever the
   profile used to carry on that tip. */
export const resolveTooltipStyle = (...candidates) => {
  for (const candidate of candidates) {
    const id = LEGACY_STYLES[candidate] || candidate;
    if (TOOLTIP_STYLES.some((s) => s.id === id)) return id;
  }
  return DEFAULT_TOOLTIP_STYLE;
};

export const resolveTooltipAnimation = (value) =>
  TOOLTIP_ANIMATIONS.some((a) => a.id === value) ? value : DEFAULT_TOOLTIP_ANIMATION;

// Text sizes per tip size. Applied to the label itself rather than a scale
// transform, so the bubble stays crisp and the padding scales with it.
const TEXT_SIZE = {
  sm: "text-[10px]",
  md: "text-[11px]",
  lg: "text-[13px]",
};

/* The entrance is the tip's own (see tooltips.css), not the shared
   `animate-in` bundle every dialog and menu also uses. Those utility classes
   were re-declared by whichever motion plugin is installed and were caught by
   blanket reduced-motion rules, so on a lot of machines (Windows ships
   Accessibility → Visual effects → Animation effects OFF) the bubble landed in
   place with no animation whatsoever — which is exactly how "the tooltip just
   pops up as soon as it loads and the animations don't work" reads. */
const ENTRANCE = {
  slide: "tip-in-slide",
  fade: "tip-in-fade",
  none: "",
};

const PAD = {
  sm: "px-2 py-0.5",
  md: "px-2.5 py-1",
  lg: "px-3 py-1.5",
};

/* A tip must not pop the instant a moving cursor grazes a card: the tiniest
   stray touch would flash a bubble for a fraction of a second, which reads as
   "the tooltip is showing up randomly". ~150ms is short enough to feel instant
   but long enough to swallow grazing passes, and it always cancels — a tip
   whose anchor is replaced by a re-render while the timer is pending would
   otherwise setState on an unmounted component and keep the bubble on screen
   with nobody left to hide it. */
const SHOW_DELAY_MS = 150;

/* How long a tap suppresses the hover events the browser synthesises after it.
   A touch fires touchstart → touchend → mouseover → mousemove, so without this
   a tap on a badge left the bubble on screen with no way to dismiss it (there is
   no mouseleave on a phone) — the "tooltips get stuck" report. */
const TOUCH_QUIET_MS = 700;

/* Real pointer movement, counted for the page as a whole.

   When a page lays out under a resting cursor — a profile that finishes loading
   while the mouse happens to sit where the card appears — the browser tells
   that element it is hovered even though nobody moved anything. That is the
   synthetic enter which opened a badge or UID tip "as soon as it loads". A tip
   therefore only opens for a pointer that has actually moved since the tip
   mounted; the counter is bumped from one capture-phase listener at module
   load, so a card full of badges pays nothing per badge. */
let pointerMoves = 0;
if (typeof window !== "undefined") {
  const bump = () => {
    pointerMoves += 1;
  };
  window.addEventListener("pointermove", bump, { passive: true });
  window.addEventListener("mousemove", bump, { passive: true });
}

function useTipVisibility() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const touchedAt = useRef(0);
  // Where the pointer counter stood when this tip mounted.
  const movesAtMount = useRef(pointerMoves);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // The anchor can unmount while hovered (state updates swap it out, or the
  // list under the tip reorders): unmounting must always drop the bubble too,
  // or the portal node is left behind stuck open.
  useEffect(() => clearTimer, []);

  /* Start the clock once.

     This used to clear and restart the timer on every call, and the pointer-
     following tip (the avatar UID) calls it on every mousemove — so a moving
     cursor kept pushing the deadline out and the tip only appeared when the
     mouse stood still for 150ms, which read as "the tooltip shows randomly". The
     delay is a gate against a cursor grazing past, so what it measures is how
     long the pointer has been ON the anchor: the first call starts it, and a
     graze still shows nothing because leaving cancels the pending timer. */
  const schedule = () => {
    // No real movement yet means this hover came from the browser, not from a
    // visitor: stay shut.
    if (pointerMoves === movesAtMount.current) return;
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      // A tap's synthetic hover is not a hover.
      if (Date.now() - touchedAt.current < TOUCH_QUIET_MS) return;
      setVisible(true);
    }, SHOW_DELAY_MS);
  };
  const cancel = () => {
    clearTimer();
    setVisible(false);
  };
  // Wired onto the anchors alongside the mouse handlers: a touch cancels any
  // open bubble and keeps the events it synthesises from opening a new one.
  const touch = () => {
    touchedAt.current = Date.now();
    cancel();
  };

  return [visible, schedule, cancel, touch];
}

/* Keeps an open bubble over its anchor while the page scrolls or resizes.
   Inert unless the tip is visible, so a card full of badges pays nothing for it. */
function useAnchorReposition(visible, anchorRef, setPos) {
  useEffect(() => {
    if (!visible) return undefined;
    let frame = 0;
    const remeasure = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = anchorRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setPos({ x: r.left + r.width / 2, y: r.top });
      });
    };
    // `capture` so a scrolled ancestor (the slideshow's scroller, a dialog body)
    // reports as well as the window.
    window.addEventListener("scroll", remeasure, { passive: true, capture: true });
    window.addEventListener("resize", remeasure);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", remeasure, { capture: true });
      window.removeEventListener("resize", remeasure);
    };
  }, [visible, anchorRef, setPos]);
}

function TipBubble({ x, y, label, style, accent, size = "md", anim }) {
  if (typeof document === "undefined") return null;

  const look = resolveTooltipStyle(style);
  const scale = TEXT_SIZE[size] || TEXT_SIZE.md;
  const pad = PAD[size] || PAD.md;
  const entrance = ENTRANCE[resolveTooltipAnimation(anim)];

  // The bubble is portalled to <body> so no card can clip it, but a fixed box
  // near the top of the window would translate itself off-screen. Flip it under
  // the anchor when there is no room above, and keep it inside the viewport on
  // both axes — a tip that lands half a screen away reads as "tooltips broken".
  const vw = typeof window === "undefined" ? 0 : window.innerWidth;
  const flipBelow = y < 72;
  const clampedX = vw ? Math.min(Math.max(x, 96), vw - 96) : x;

  const skin =
    look === "glass" ? (
      <span
        data-tip-style="glass"
        className={`block whitespace-nowrap rounded-xl border bg-white/10 font-semibold text-white shadow-[0_12px_36px_rgba(0,0,0,0.6)] backdrop-blur-2xl ${pad} ${scale} ${entrance}`}
        style={{
          borderColor: accent ? `${accent}66` : "rgba(255,255,255,0.22)",
          boxShadow: accent
            ? `inset 0 1px 0 rgba(255,255,255,0.3), 0 10px 30px -4px ${accent}40`
            : "inset 0 1px 0 rgba(255,255,255,0.25), 0 10px 30px rgba(0,0,0,0.6)",
        }}
      >
        {label}
      </span>
    ) : look === "ice" ? (
      <span
        data-tip-style="ice"
        className={`block whitespace-nowrap rounded-xl border font-semibold text-white backdrop-blur-xl ${pad} ${scale} ${entrance}`}
        style={{
          background: "linear-gradient(160deg, rgba(214,240,255,0.25), rgba(122,180,255,0.15))",
          borderColor: "rgba(190,230,255,0.6)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 12px 30px rgba(6,18,38,0.8), 0 0 16px rgba(147,197,253,0.3)",
        }}
      >
        {label}
      </span>
    ) : (
      // classic: black, the label, nothing else — no border, no glow, no tail.
      <span data-tip-style="classic" className={`block whitespace-nowrap rounded-lg bg-black font-semibold text-white shadow-xl ${pad} ${scale} ${entrance}`}>
        {label}
      </span>
    );

  return createPortal(
    <span
      role="tooltip"
      className="pointer-events-none fixed z-[9999] block"
      style={{
        left: clampedX,
        top: y - 6,
        transform: flipBelow ? "translate(-50%, 12px)" : "translate(-50%, -100%)",
        maxWidth: 280,
      }}
    >
      {skin}
    </span>,
    document.body,
  );
}

export function HoverTip({ label, style, accent, size, anim, children }) {
  const anchorRef = useRef(null);
  const [visible, schedule, cancel, touch] = useTipVisibility();
  const [pos, setPos] = useState(null);
  const text = typeof label === "string" ? label.trim() : "";

  // The wrapper stays put even when the tip is switched off, so switching
  // tooltips on and off never nudges the badge row it wraps.
  const measure = () => {
    const el = anchorRef.current;
    if (!el || !text) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
  };
  const show = () => {
    measure();
    if (text) schedule();
  };
  const hide = cancel;

  // A bubble pinned to the viewport is only right until the page moves under it:
  // scrolling used to leave it floating over whatever drifted into its place.
  useAnchorReposition(visible, anchorRef, setPos);

  return (
    <span
      ref={anchorRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onTouchStart={touch}
      className="inline-flex"
    >
      {children}
      {text && visible && pos && (
        <TipBubble x={pos.x} y={pos.y} label={text} style={style} accent={accent} size={size} anim={anim} />
      )}
    </span>
  );
}

export function useTooltip(label, { style, accent, size, anim } = {}) {
  const anchorRef = useRef(null);
  const [visible, schedule, cancel, touch] = useTipVisibility();
  const [pos, setPos] = useState(null);
  const text = typeof label === "string" ? label.trim() : "";

  const measure = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
  };
  const show = () => {
    measure();
    schedule();
  };
  const hide = cancel;

  useAnchorReposition(visible, anchorRef, setPos);

  const tipProps = text
    ? { ref: anchorRef, onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide, onTouchStart: touch }
    : {};

  return {
    tipProps,
    tipNode:
      text && visible && pos ? (
        <TipBubble x={pos.x} y={pos.y} label={text} style={style} accent={accent} size={size} anim={anim} />
      ) : null,
  };
}

// A tip that trails the pointer instead of pinning itself over the element. The
// avatar is the only consumer: the owner wants the UID to appear just above the
// mouse while the picture is hovered.
//
// The mouse fires mousemove far more often than a frame frees up, so the old
// direct setPos per event batched a React render every mouse pixel — the tip
// visibly stuttered behind the cursor. A requestAnimationFrame gate means at
// most one re-position per frame, and a trailing tip that only updates when the
// cursor actually moved (scrolling without moving the mouse does not throw the
// bubble off the pointer).
export function useMouseTip(label, { style, accent, size, anim } = {}) {
  const [visible, schedule, cancel, touch] = useTipVisibility();
  const [pos, setPos] = useState(null);
  const rafRef = useRef(0);
  const text = typeof label === "string" ? label.trim() : "";

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const queuePos = (clientX, clientY) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setPos({ x: clientX, y: clientY });
    });
  };

  const props = text
    ? {
        onMouseMove: (e) => {
          queuePos(e.clientX, e.clientY);
          schedule();
        },
        onMouseLeave: cancel,
        onMouseEnter: (e) => {
          queuePos(e.clientX, e.clientY);
          schedule();
        },
        onTouchStart: touch,
      }
    : {};

  return {
    props,
    node:
      text && visible && pos ? (
        <TipBubble x={pos.x} y={pos.y} label={text} style={style} accent={accent} size={size} anim={anim} />
      ) : null,
  };
}

export default HoverTip;
