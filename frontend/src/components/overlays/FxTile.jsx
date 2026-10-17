import { useEffect, useRef, useState } from "react";
import { FxText } from "@/components/FxText";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { OverlayEffect } from "@/components/OverlayEffect";
import { fileUrl } from "@/lib/api";

/* ---------------------------------------------------------------------------
   FxTile — the little box at the top of every effect tile.

   The store used to be labels only: you read the word "Flicker" and had to hover
   it to find out what Flicker was, one tile at a time, on the card behind the
   dialog. Every tile now draws its own effect instead, in a miniature of the
   thing that effect is FOR — the name for a text effect, the card for a
   background or an overlay, the avatar circle for a decoration, the pointer for
   a cursor effect.

   Two rules keep a wall of these from becoming a wall of animations:

     • an effect is mounted only while its tile is on screen. Two dozen effects
       animating at once is what the labels-only store was introduced to avoid.
       An off-screen tile draws the plain sample, which has the side benefit of
       showing what the effect is doing to it.
     • the sample is fixed-size, so a tile never reflows when its effect mounts.

   `None` carries no id, and draws the plain sample — which is exactly what it
   means: your card with no effect of this kind on it.
   --------------------------------------------------------------------------- */

export const TILE_SAMPLE = "swats";

// The cursor demo's markers. The CSS in effects.css animates each one from the
// tile's centre, so the box reads as a small stage the pointer is moving across.
const CURSOR_MARKERS = [0, 1, 2, 3, 4, 5];

/* True until something says otherwise: with no IntersectionObserver — jsdom, an
   older browser — a tile counts as visible, so the effect still draws. */
function useOnScreen(ref) {
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== "function") return undefined;
    const io = new IntersectionObserver(([entry]) => setOnScreen(!!entry?.isIntersecting), {
      rootMargin: "160px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return onScreen;
}

export function FxTile({ variant = "text", id = "", accent = "#A48DF4", avatarUrl = "" }) {
  const ref = useRef(null);
  const onScreen = useOnScreen(ref);
  // `None`, or a tile scrolled out of view, draws the sample with nothing on it.
  const live = !!id && onScreen;
  const pic = fileUrl(avatarUrl);

  return (
    <span ref={ref} className="ov-tile-preview" aria-hidden="true">
      {variant === "text" && <FxText id={live ? id : ""} text={TILE_SAMPLE} className="ov-tile-word" />}

      {(variant === "bg" || variant === "overlay") && (
        <span className="ov-tile-stage">
          <span
            className="ov-tile-ambience"
            style={{ background: `radial-gradient(circle at 50% 120%, ${accent}66, transparent 72%)` }}
          />
          <span className="ov-tile-card">
            <span className="ov-tile-card-name">swats</span>
            <span className="ov-tile-card-handle">@yourname</span>
          </span>
          {live && variant === "bg" && <BackgroundEffect effect={id} />}
          {live && variant === "overlay" && <OverlayEffect effect={id} color={accent} />}
        </span>
      )}

      {variant === "cursor" && (
        <span className="ov-tile-pointer">
          <span className={`fx-cursor-demo ${live ? `fx-cursor-${id}` : ""}`}>
            {live &&
              CURSOR_MARKERS.map((n) => <i key={n} />)}
          </span>
        </span>
      )}

      {variant === "avatar" && (
        <span className="ov-tile-avatar">
          <span
            className="ov-tile-avatar-pic"
            style={pic ? { backgroundImage: `url("${pic}")` } : { background: `linear-gradient(140deg, ${accent}, #1e1b4b)` }}
          />
          {live && <span className={`ov-tile-avatar-fx fx-ov-${id}`} />}
        </span>
      )}
    </span>
  );
}

export default FxTile;
