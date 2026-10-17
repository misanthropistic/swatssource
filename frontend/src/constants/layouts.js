// ---------------------------------------------------------------------------
// Card layout registry
//
// One source of truth for which card layouts exist. Both the dashboard Editor
// and the public renderer (ProfilePreview) import from here, so a layout can
// never exist in the picker without a renderer (or render identically to
// another one) again.
//
// There used to be thirteen. Most were variations on the same idea — a column of
// blocks with the avatar somewhere — and every one of them was another surface
// that could break on its own, which is exactly what happened. Four are left,
// and they are the four the site is built around: two flat cards (one wide, one
// narrow with the picture floating off its top edge), one hero banner, and the
// full-page Slideshow. Each one now draws the same shared blocks, so a profile
// can never lose a section by picking a layout.
// ---------------------------------------------------------------------------

export const LAYOUTS = [
  { id: "minimal", label: "Minimal", hint: "Wide card: avatar on the left, everything stacked underneath, audio in its own box" },
  { id: "floating", label: "Floating Avatar", hint: "Narrow centred card with the avatar floating half on and half off the top" },
  { id: "banner", label: "Banner", hint: "Hero banner with an overlapping avatar, pill links, and a bottom widget card" },
  { id: "slideshow", label: "Slideshow", hint: "Fullpage scroll slides with side dot navigation", premium: true },
];

export const LAYOUT_IDS = LAYOUTS.map((l) => l.id);
export const LAYOUT_MAP = Object.fromEntries(LAYOUTS.map((l) => [l.id, l]));
export const isPremiumLayout = (id) => !!LAYOUT_MAP[id]?.premium;
export const isLayout = (id) => LAYOUT_IDS.includes(id);

// The layouts that no longer exist. A profile saved on one of them renders as
// `DEFAULT_LAYOUT` instead of as a layout whose renderer is gone, and the
// backend maps them the same way when a profile is saved (routes/profile.js).
export const REMOVED_LAYOUTS = [
  "classic",
  "rail",
  "stacks",
  "panels",
  "document",
  "divider",
  "showcase",
  "nowplaying",
  // Existing profiles may still be saved on Compact. It was Minimal with the
  // widgets and player tucked inside the same card, which is not a difference
  // worth a second renderer to keep in sync, so it resolves to Minimal now.
  "compact",
];

export const DEFAULT_LAYOUT = "minimal";

/** The layout a profile actually renders as: its own choice, or the default. */
export const resolveLayout = (id) => (LAYOUT_MAP[id] ? id : DEFAULT_LAYOUT);

export const ICON_SIZES = [
  { id: "sm", label: "Small", px: 40 },
  { id: "md", label: "Medium", px: 48 },
  { id: "lg", label: "Large", px: 58 },
];

export const ICON_SIZE_PX = Object.fromEntries(ICON_SIZES.map((s) => [s.id, s.px]));

// The card content a layout can draw, in the order an untouched profile renders
// it. Layouts hand their own blocks in through `claim`, and this is the order
// the leftovers flow in.
export const CARD_BLOCKS = ["avatar", "name", "badges", "bio", "links", "widgets", "audio", "views"];

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

export const SECTION_ANIMATIONS = [
  { id: "", label: "None" },
  { id: "fade", label: "Fade in" },
  { id: "rise", label: "Rise up" },
  { id: "slide", label: "Slide in" },
  { id: "zoom", label: "Zoom in" },
  { id: "blur", label: "Blur in", premium: true },
  { id: "cascade", label: "Cascade links", premium: true },
];

// Tailwind (tailwindcss-animate) classes for a reveal animation. `stagger` is
// the per-block delay in ms so the blocks arrive one after another.
export const animationClass = (id, stagger = 0) => {
  const delay = stagger ? { animationDelay: `${stagger}ms`, animationFillMode: "both" } : undefined;
  switch (id) {
    case "fade": return { className: "animate-in fade-in duration-500", style: delay };
    case "rise": return { className: "animate-in fade-in slide-in-from-bottom-4 duration-500", style: delay };
    case "slide": return { className: "animate-in fade-in slide-in-from-left-6 duration-500", style: delay };
    case "zoom": return { className: "animate-in fade-in zoom-in-95 duration-500", style: delay };
    // A real blur needs a keyframe, not a Tailwind utility: .fx-reveal-blur lives
    // in effects.css and is silenced under prefers-reduced-motion.
    case "blur": return { className: "fx-reveal-blur", style: delay };
    case "cascade": return { className: "animate-in fade-in slide-in-from-bottom-3 duration-500", style: delay };
    default: return { className: "", style: undefined };
  }
};
