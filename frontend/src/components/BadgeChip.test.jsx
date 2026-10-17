import fs from "fs";
import path from "path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { BadgeChip, badgeImage, badgeLabel, badgeGlowFilter, badgeOverlay } from "./BadgeChip";

global.IS_REACT_ACT_ENVIRONMENT = true;

/* A badge is its own picture and nothing else. These pin that: the art is drawn
   bare — no plate, no fill, no border, no outline, and no box-shadow, which is
   what the owner kept reporting as "a background on every badge" — with an
   optional glow that hugs the art instead of its box, and an optional overlay
   that recolours the art without hiding it. */

let container;
let root;

const draw = (props) => {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root.render(<BadgeChip id="verified" {...props} />));
  return container.querySelector("[data-badge]");
};

afterAll(() => {
  act(() => root.unmount());
  container.remove();
});

it("draws the badge's own picture", () => {
  const chip = draw({});
  const img = chip.querySelector("img");

  expect(img).toBeTruthy();
  expect(img.getAttribute("src")).toBe(badgeImage("verified"));
  // No stand-in glyph when the art exists.
  expect(chip.querySelector("svg")).toBeNull();
  // A picture that cannot be dragged out of the page.
  expect(img.getAttribute("draggable")).toBe("false");
});

it("draws the art bare — no background, no outline, no box behind it", () => {
  const chip = draw({});

  expect(chip.style.background).toBe("");
  expect(chip.style.backgroundColor).toBe("");
  expect(chip.style.backgroundImage).toBe("");
  expect(chip.style.border).toBe("");
  expect(chip.style.outline).toBe("");
  // A background is anything the chip paints outside the picture, and the one
  // thing that used to: a box-shadow spreading from the chip's square box.
  expect(chip.style.boxShadow).toBe("");
  expect(chip.className).not.toContain("badge-chip--plate");
  expect(chip.className).not.toContain("badge-art-mono");
  // One layer only — the picture in its own box — and nothing laid over it.
  expect(chip.children).toHaveLength(1);
  expect(chip.firstElementChild.className).toBe("badge-art");
  expect(chip.firstElementChild.firstElementChild.tagName).toBe("IMG");
  expect(chip.querySelector(".badge-art-overlay")).toBeNull();
});

it("draws every badge at the same size, L, with its box hugging the art", () => {
  // The owner has no size control any more, and nothing a profile carries can
  // change the box: every owner-facing surface draws the L chip.
  const chip = draw({});
  expect(chip.className).toContain("h-[22px]");
  expect(chip.className).toContain("w-[22px]");
  expect(chip.querySelector("img").getAttribute("width")).toBe("22");

  // The box is the art's box — no 14px ring of empty padding on each side, which
  // is what used to space badges out twice as far as the row's own gap.
  expect(chip.className).not.toContain("h-9");
  const art = chip.firstElementChild;
  expect(art.style.width).toBe("22px");
  expect(art.style.height).toBe("22px");

  // A profile full of old size settings cannot shrink it.
  expect(draw({ size: undefined }).className).toContain("h-[22px]");
  // The compact box still exists for the leaderboard's rows, and only there.
  expect(draw({ size: "sm" }).className).toContain("h-[15px]");
});

it("keeps the glow's size, but hangs it on the art rather than on the box", () => {
  // The radius is the formula saved profiles already use…
  expect(badgeGlowFilter(true, "#ff0000", 100)).toBe("drop-shadow(0 0 20.0px #ff0000ff)");
  expect(badgeGlowFilter(true, "#ff0000", 0)).toBe("");
  expect(badgeGlowFilter(false, "#ff0000", 100)).toBe("");
  expect(badgeGlowFilter(true, "red", 100)).toBe("");

  // …and it is painted as a filter, never as a shadow of the chip's box.
  const chip = draw({ glowColor: "#ff0000", glowIntensity: 100 });
  expect(chip.style.getPropertyValue("--badge-glow")).toBe("drop-shadow(0 0 20.0px #ff0000ff)");
  expect(chip.style.boxShadow).toBe("");

  // Off, or zero strength, leaves nothing painted at all.
  expect(draw({ glowColor: "#ff0000", glowIntensity: 100, glow: false }).style.getPropertyValue("--badge-glow")).toBe("");
  expect(draw({ glowColor: "red", glowIntensity: 100 }).style.getPropertyValue("--badge-glow")).toBe("");
});

it("recolours the art with the overlay and still shows the artwork", () => {
  // Off unless asked for, whatever the colour says.
  expect(badgeOverlay(false, "#00ff00", 100)).toBeNull();
  expect(badgeOverlay(true, "", 100)).toBeNull();
  expect(badgeOverlay(true, "green", 100)).toBeNull();
  expect(badgeOverlay(true, "#00ff00", 0)).toBeNull();
  expect(badgeOverlay(true, "#00ff00", 100)).toEqual({ color: "#00ff00", opacity: 1 });
  // Halfway is half the wash, and the value is clamped.
  expect(badgeOverlay(true, "#00ff00", 50)).toEqual({ color: "#00ff00", opacity: 0.5 });
  expect(badgeOverlay(true, "#00ff00", 500)).toEqual({ color: "#00ff00", opacity: 1 });

  const plain = draw({});
  expect(plain.querySelector(".badge-art-overlay")).toBeNull();

  const chip = draw({ overlay: true, overlayColor: "#00ff00", overlayStrength: 100 });
  const wash = chip.querySelector('[data-testid="badge-overlay"]');
  expect(wash).toBeTruthy();
  // The colour it lays down, at the strength asked for.
  expect(wash.style.backgroundColor).toMatch(/#00ff00|rgb\(0, 255, 0\)/);
  expect(wash.style.opacity).toBe("1");
  // Masked by the picture itself, so the artwork's detail stays and the wash can
  // never bleed past the badge into a box.
  expect(wash.style.getPropertyValue("--badge-mask")).toContain(badgeImage("verified"));
  // It is laid over the art, inside the art's own box, not behind the chip.
  expect(chip.querySelector(".badge-art").contains(wash)).toBe(true);
  expect(chip.style.background).toBe("");
  expect(chip.style.boxShadow).toBe("");

  // A profile that saved a strength but never turned it on draws no wash.
  expect(draw({ overlay: false, overlayColor: "#00ff00", overlayStrength: 100 }).querySelector(".badge-art-overlay")).toBeNull();
});

it("lets a row place the chip without losing its settings", () => {
  const chip = draw({
    glowColor: "#ff0000",
    glowIntensity: 100,
    overlay: true,
    overlayColor: "#00ff00",
    overlayStrength: 100,
    style: { marginLeft: -14 },
  });

  expect(chip.style.marginLeft).toBe("-14px");
  expect(chip.style.getPropertyValue("--badge-glow")).toBe("drop-shadow(0 0 20.0px #ff0000ff)");
  expect(chip.querySelector('[data-testid="badge-overlay"]')).toBeTruthy();
});

/* The hover is the badge's only animation, and it used to be switched off
 * wholesale under prefers-reduced-motion (`transition: none; transform: none`)
 * — which is the setting a large share of machines report, so the badges looked
 * like they had no animation at all. Reduced motion calms it now; it must never
 * cancel it (the same rule effects.css and index.css carry for the profile). */
it("keeps the hover animation under reduced motion", () => {
  const css = fs.readFileSync(path.join(__dirname, "badges.css"), "utf8");
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion"));

  expect(reduced).toContain(".badge-chip:hover");
  expect(reduced).toMatch(/transform:\s*scale/);
  expect(reduced).not.toMatch(/transition:\s*none/);
  expect(reduced).not.toMatch(/transform:\s*none/);
});

it("draws a mark for a badge that has no art of its own", () => {
  const chip = draw({ id: "made_up_badge" });

  expect(chip.getAttribute("data-badge")).toBe("made_up_badge");
  expect(chip.querySelector("img")).toBeNull();
  expect(chip.querySelector("svg")).toBeTruthy();
  // Its name is still readable, from the id.
  expect(badgeLabel("made_up_badge")).toBe("made up badge");
});
