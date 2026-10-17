import { Sparkles } from "lucide-react";
import { badgeMeta } from "@/constants/badges";
import "./badges.css";

/* ---------------------------------------------------------------------------
   BadgeChip — the single source of truth for how a badge looks.

   A badge is a picture: the real Discord artwork (see constants/discordBadges.js)
   drawn bare, at the size the surface asks for. Nothing is drawn BEHIND it — no
   plate, no tile, no fill, no rim, no outline and no box-shadow — because every
   one of those shows up as a background behind the badge on the card.

   What the owner may change is how that picture is painted, and both settings
   are account-wide:

     • Glow    — a drop-shadow in `glowColor` at `glowIntensity`. It used to be a
                 box-shadow, which spread from the chip's square box and read as
                 a pink plate behind every badge; a drop-shadow follows the art's
                 own silhouette, so the glow is a halo around the badge.
     • Overlay — a colour laid over the art and masked by the same art, blended
                 with `mix-blend-mode: color`. The badge keeps its shape, its
                 shading and every line of its artwork, and takes the chosen hue:
                 an overlay recolours a badge, it never flattens it into a
                 silhouette and it never fills the box.
   --------------------------------------------------------------------------- */

// "lg" is what every owner-facing surface draws; the smaller box exists for the
// compact leaderboard rows, not as a setting a profile can carry.
//
// The box is the art's box. It used to be a 36px square holding a 22px picture,
// so every pair of badges was separated by 14px of invisible padding on each
// side on top of the row's own gap — which is what read as "the gaps between the
// badges are way too big". With the box hugging the art, the row's gap is the
// whole distance between two badges, and the chip's centre is the art's centre,
// so a badge lines up with the name beside it instead of floating in a box.
const SIZES = {
  sm: { box: "h-[15px] w-[15px]", art: 15 },
  lg: { box: "h-[22px] w-[22px]", art: 22 },
};

export const isHexColor = (v) => /^#[0-9a-f]{6}$/i.test(v || "");

/* `badgeMeta` rather than `BADGE_META`: a seasonal badge is one badge per event
   per year (`halloween_2026`), so it can never be listed in the registry itself
   — the lookup resolves it from the event instead. */
export function badgeLabel(id, meta) {
  const M = meta || badgeMeta(id) || {};
  return M.label || String(id || "").replace(/_/g, " ") || "Badge";
}

/* The picture a badge draws, whichever shape the registry stored it in. */
export function badgeImage(id, meta) {
  const M = meta || badgeMeta(id) || {};
  const art = M.art;
  if (!art) return null;
  return typeof art === "string" ? art : art.src || null;
}

const clampPercent = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/* The glow as a filter, or an empty string when the owner has it off. Exactly
   the radius the box-shadow used (6px at nothing, 20px at full), so a saved
   profile's glow keeps its size; only the shape it spreads from has changed. */
export const badgeGlowFilter = (glow, glowColor, glowIntensity) => {
  const strength = clampPercent(glowIntensity) / 100;
  if (!glow || !isHexColor(glowColor) || strength <= 0) return "";
  const alpha = Math.round(strength * 255)
    .toString(16)
    .padStart(2, "0");
  return `drop-shadow(0 0 ${(6 + strength * 14).toFixed(1)}px ${glowColor}${alpha})`;
};

/* The overlay wash: which colour to lay over the art and how much of it. `null`
   means the art is drawn as it is. */
export const badgeOverlay = (overlay, overlayColor, overlayStrength) => {
  const strength = clampPercent(overlayStrength) / 100;
  if (!overlay || !isHexColor(overlayColor) || strength <= 0) return null;
  return { color: overlayColor, opacity: strength };
};

export function BadgeChip({
  id,
  meta,
  accent = "#A48DF4",
  glowColor = "",
  glowIntensity = 60,
  glow = true,
  overlay = false,
  overlayColor = "",
  overlayStrength = 60,
  size = "lg",
  className = "",
  style,
  title,
  ...rest
}) {
  const M = meta || badgeMeta(id) || {};
  const src = badgeImage(id, meta);
  // Only a badge with no art of its own falls back to a glyph, and it takes the
  // badge's own colour so it still reads as that badge.
  const base = M.color || accent;
  const s = SIZES[size] || SIZES.lg;

  const glowFilter = badgeGlowFilter(glow, glowColor, glowIntensity);
  const wash = badgeOverlay(overlay, overlayColor, overlayStrength);

  return (
    <span
      {...rest}
      data-badge={id}
      /* Every badge is its own right-click surface: the menu copies the name
         that is on screen ("New Year 2027") or the raw id a profile stores.
         Declared before `rest` so a caller that wants its own menu can still
         pass data-menu-id and win. */
      data-menu-id="badge"
      data-menu-badge={id}
      data-menu-badge-label={badgeLabel(id, meta)}
      title={title || badgeLabel(id, meta)}
      className={`badge-chip inline-flex shrink-0 items-center justify-center ${s.box} ${className}`}
      // `style` is merged rather than replaced: a row uses it to place the chip.
      // The glow rides in a custom property so the chip's own hover filter can
      // still compose with it.
      style={{ ...style, ...(glowFilter ? { "--badge-glow": glowFilter } : {}) }}
    >
      {src ? (
        // The art and its wash share one box sized to the art, so the mask lines
        // up with the picture pixel for pixel at any size.
        <span className="badge-art" style={{ width: s.art, height: s.art }}>
          <img
            className="badge-art-img"
            src={src}
            alt=""
            draggable={false}
            width={s.art}
            height={s.art}
          />
          {wash && (
            <span
              aria-hidden="true"
              data-testid="badge-overlay"
              className="badge-art-overlay"
              // The picture is the mask, so the wash can only ever paint the
              // badge's own pixels. It rides in a custom property because that
              // is what carries a `mask-image` through an inline style.
              style={{
                "--badge-mask": `url("${src}")`,
                backgroundColor: wash.color,
                opacity: wash.opacity,
              }}
            />
          )}
        </span>
      ) : (
        <Sparkles width={s.art} height={s.art} style={{ color: base }} />
      )}
    </span>
  );
}

export default BadgeChip;
