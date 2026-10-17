import fs from "fs";
import path from "path";
import { BACKGROUND_EFFECTS, OVERLAYS, TEXT_EFFECTS, CURSOR_EFFECTS, REMOVED_EFFECTS, resolveBackground } from "./constants/effects";
import { GHOST_BG_IDS, GHOST_OVERLAY_IDS, GHOST_MOUSE_IDS } from "./lib/ghostFx";
import { FX_TEXT_JS_IDS } from "./components/FxText";

/* Regression guard for the bug that made every profile effect look broken.
 *
 * effects.css used to contain, under `@media (prefers-reduced-motion: reduce)`,
 * a blanket `animation: none !important` for every fx- class. Browsers report
 * that preference by default for a lot of people (Windows ships "Animation
 * effects" off in Accessibility → Visual effects), so on those machines every
 * effect on every profile — and in the editor picker — rendered as plain,
 * motionless text that was indistinguishable from the feature not existing.
 *
 * The effects are the product: the owner picks one on purpose, so they must
 * keep animating. Only the full-screen flashers are slowed down.
 */

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");

const effectsCss = read("effects.css");
const bareCss = stripComments(effectsCss);
const rmIndex = effectsCss.indexOf("@media (prefers-reduced-motion");
const reducedBlock = stripComments(effectsCss.slice(rmIndex));

const catalogIds = (name) => {
  const catalog = read(path.join("constants", "effects.js"));
  const block = new RegExp(`${name} = \\[([\\s\\S]*?)\\n\\];`).exec(catalog);
  return [...(block ? block[1] : "").matchAll(/id:\s*"([a-z0-9_-]*)"/g)].map((m) => m[1]);
};
const hasClass = (prefix, id) => bareCss.includes(`.${prefix}${id}`);

describe("the ghost swap — the catalogs ARE ghost.html's lists", () => {
  it("backgrounds, overlays and pointer effects match the ghost engine's tables", () => {
    expect(catalogIds("BACKGROUND_EFFECTS")).toEqual(["", ...GHOST_BG_IDS]);
    expect(catalogIds("OVERLAYS")).toEqual(["", ...GHOST_OVERLAY_IDS]);
    expect(catalogIds("CURSOR_EFFECTS")).toEqual(["", ...GHOST_MOUSE_IDS]);
  });

  it("paints every offered id, and offers nothing the engine does not paint", () => {
    for (const id of [...GHOST_BG_IDS, ...GHOST_OVERLAY_IDS, ...GHOST_MOUSE_IDS]) {
      const owned =
        resolveBackground(id) === id ||
        GHOST_OVERLAY_IDS.includes(id) ||
        GHOST_MOUSE_IDS.includes(id);
      expect(owned).toBe(true);
    }
  });

  it("resolves the legacy ids instead of rendering half an effect", () => {
    expect(resolveBackground("window-rain")).toBe("rain");
    expect(resolveBackground("vhs-tape")).toBe("tv");
    expect(resolveBackground("heart-fall")).toBe("love-fall");
    expect(resolveBackground("rain")).toBe("rain");
    for (const gone of ["cherry", "matrix", "aurora", "fireflies", "neon-wave", "cash-fall"]) {
      expect(resolveBackground(gone)).toBe("");
      expect(REMOVED_EFFECTS).toContain(gone);
    }
  });
});

describe("effects.css", () => {
  it("has a reduced-motion block at all", () => {
    expect(rmIndex).toBeGreaterThan(-1);
    expect(reducedBlock).toMatch(/\.fx-text-flicker/);
  });

  it("never switches the effects off entirely", () => {
    expect(reducedBlock).not.toMatch(/animation:\s*none/);
    expect(reducedBlock).not.toMatch(/animation-play-state:\s*paused/);
  });

  it("slows the strobing text effects instead of stopping them", () => {
    expect(reducedBlock).toMatch(/animation-duration:\s*14s/);
  });

  it("carries a CSS rule for every CSS-rendered text effect", () => {
    // JS-driven ids (typewriter, the sparkles, …) render through FxText.
    for (const id of catalogIds("TEXT_EFFECTS")) {
      if (!id || FX_TEXT_JS_IDS.includes(id)) continue;
      expect(hasClass("fx-text-", id)).toBe(true);
    }
  });

  it("carries the ghost star/ember/drip spawn classes the sparkles live on", () => {
    for (const cls of [".fx-spark", ".fx-ember", ".fx-drip"]) expect(bareCss).toContain(cls);
  });

  it("keeps the overlay and cursor ids off the CSS entirely (canvas layers)", () => {
    for (const id of [...GHOST_OVERLAY_IDS, ...GHOST_MOUSE_IDS]) {
      expect(hasClass("fx-ov-", id)).toBe(false);
    }
  });

  it("keeps an animation rule for every avatar effect", () => {
    for (const id of catalogIds("AVATAR_EFFECTS")) expect(hasClass("fx-ov-", id)).toBe(true);
  });
});

/* The text sparkle is ghost's DOM star: a clip-path star spawned into the text
 * box every 90ms, twinkling out over 900ms — not a canvas redrawing it, and not
 * the invented glow-pulse the store shipped once before. */
describe("the text sparkle, exactly as ghost.html ships it", () => {
  const fxText = read("components", "FxText.jsx");

  it("spawns the DOM stars with ghost's cadence and palettes", () => {
    expect(fxText).toContain('"fx-spark"');
    expect(fxText).toContain("return 90"); // ghost's 90ms spawn clock
    expect(fxText).toContain("900);"); // ghost's 900ms twinkle life
    expect(fxText).toContain('() => "#fff"'); // white palette, ghost's exact colour
    expect(fxText).toContain("#4dff88"); // green palette, ghost's exact pair
  });

  it("draws the star with ghost's clip-path and twinkle, in effects.css", () => {
    expect(bareCss).toContain("clip-path: polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%)");
    expect(bareCss).toMatch(/@keyframes spk/);
  });

  it("no canvas middleman renders the sparkles any more", () => {
    expect(fxText).not.toContain("fx-sparkle-layer");
    expect(bareCss).not.toContain(".fx-sparkle-layer");
  });
});

/* Nothing is loaded from an effects file any more: the ghost engine and the CSS
 * are the only two sources, so regressions to GIF-era loading are impossible. */
describe("no file-backed effects", () => {
  it("does not ship or point at an effects folder", () => {
    expect(fs.existsSync(path.join(__dirname, "..", "public", "fx"))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, "constants", "fxFiles.js"))).toBe(false);
    const sources = [
      read("components", "OverlayEffect.jsx"),
      read("components", "BackgroundEffect.jsx"),
      read("components", "FxText.jsx"),
      read("lib", "ghostFx.js"),
      effectsCss,
    ];
    for (const source of sources) expect(source).not.toMatch(/\/fx\//);
  });

  it("runs the ghost engines, not the deleted harness painters", () => {
    expect(fs.existsSync(path.join(__dirname, "lib", "fxPainters.js"))).toBe(false);
    const ghost = read("lib", "ghostFx.js");
    // A few exact signatures from ghost.html's script, pinned so a rewrite can
    // not quietly drift off the source file:
    expect(ghost).toContain("'255,236,170'"); // sparkle's warm second colour
    expect(ghost).toContain("#6e0000"); // drip stroke
    expect(ghost).toContain("rgba(190,210,255"); // thunder's flash wash
    expect(ghost).toContain("rgba(168,18,34"); // bleeding's drip colour
  });
});

/* The landing page is the shop window: when a machine reports "reduce motion"
 * a blanket rule in index.css used to kill every animation on it. The same
 * contract as effects.css applies: calm the loops, never switch them off. */
describe("index.css reduced-motion policy", () => {
  const css = stripComments(read("index.css"));
  const block = css.slice(css.indexOf("@media (prefers-reduced-motion"));

  it("never stops animations with a blanket selector", () => {
    expect(block).not.toMatch(/\*[^{]*\{[^}]*animation-duration:\s*0\.001ms/);
    expect(block).not.toMatch(/animation:\s*none/);
    expect(block).not.toMatch(/animation-iteration-count:\s*1\s*!important/);
  });

  it("still slows the endless loops down", () => {
    expect(block).toMatch(/animation-duration:\s*120s\s*!important/);
  });
});
