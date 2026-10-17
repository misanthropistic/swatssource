import fs from "fs";
import path from "path";
import {
  createGhostBgPainter, createGhostOverlayPainter, GHOST_BG_IDS, GHOST_OVERLAY_IDS,
} from "./ghostFx";

/* Does each painter actually PAINT?
 *
 * The catalogue test (effects.test.js) proves every offered id has a class and a
 * branch, which is not the same as proving the branch draws anything: a painter
 * that returns a function which never touches the context, or one whose alpha
 * rounds to nothing, still passes that test while the profile shows a blank
 * layer. This runs the real painters against a recording 2D context and counts
 * the pixels they ask for.
 *
 * jsdom has no canvas at all, so `getContext('2d')` is stubbed here — including
 * the offscreen plates the frost / rain / vhs painters bake into (createElement
 * 'canvas' + getContext).
 */

const PAINT_OPS = [
  "fillRect", "strokeRect", "fill", "stroke", "drawImage", "fillText",
  "arc", "ellipse", "putImageData", "strokeText",
];

const SILENT_OPS = [
  "beginPath", "closePath", "moveTo", "lineTo", "quadraticCurveTo",
  "bezierCurveTo", "rect", "clearRect", "save", "restore", "translate", "scale",
  "rotate", "setTransform", "resetTransform", "clip", "setLineDash",
];

function recordingContext() {
  const ctx = {
    ops: [],
    trace: [],
    counts: Object.fromEntries(PAINT_OPS.map((k) => [k, 0])),
  };
  const record = (name) => (...args) => {
    // Every call goes into the trace, path geometry included: hearts and snow
    // move their shapes with moveTo/bezierCurveTo and only call fill() at the
    // end, so a frame signature made from paint calls alone reads a perfectly
    // animated painter as frozen.
    ctx.trace.push({ name, args, alpha: ctx.globalAlpha });
    if (PAINT_OPS.includes(name)) {
      ctx.counts[name] += 1;
      ctx.ops.push({ name, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle });
    }
  };
  for (const name of [...PAINT_OPS, ...SILENT_OPS]) ctx[name] = record(name);
  // Gradients are where the spotlight's movement lives: its fillRect covers the
  // whole canvas every frame and only the gradient's centre changes.
  const gradient = (...args) => {
    ctx.trace.push({ name: "gradient", args, alpha: ctx.globalAlpha });
    return { addColorStop: () => undefined };
  };
  ctx.createLinearGradient = gradient;
  ctx.createRadialGradient = gradient;
  ctx.createPattern = () => null;
  ctx.measureText = () => ({ width: 10 });

  // Style properties the painters assign, with a plain default.
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "left";
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.imageSmoothingEnabled = true;

  ctx.painted = () => ctx.ops.length;
  // The frame just painted, as text. Colours matter as much as coordinates, so
  // the styles in force are part of it too.
  ctx.frame = () =>
    ctx.trace
      .map((o) => `${o.name}(${o.args.map((a) => (typeof a === "number" ? a.toFixed(1) : String(a))).join(",")})@${o.alpha}`)
      .concat([String(ctx.fillStyle), String(ctx.strokeStyle)])
      .join(";");
  return ctx;
}

let realGetContext;

beforeAll(() => {
  realGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function stub(type) {
    if (type !== "2d") return null;
    if (!this.__ctx) this.__ctx = recordingContext();
    return this.__ctx;
  };
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

const W = 900;
const H = 600;
const POINTER = { current: { x: W / 2, y: H / 2 } };

// Runs a painter for `frames` frames and reports what it drew. A painter given
// a pointer gets one that actually moves: spotlight chases the cursor and is
// supposed to hold still while the cursor does.
const run = (painter, frames = 90, pointer = null) => {
  const ctx = recordingContext();
  expect(typeof painter).toBe("function");
  const signatures = new Set();
  for (let i = 0; i < frames; i += 1) {
    if (pointer) {
      pointer.current.x = W / 3 + i * 2;
      pointer.current.y = H / 3 + Math.sin(i / 6) * 40;
    }
    ctx.trace.length = 0;
    painter(ctx, i * 16.7);
    signatures.add(ctx.frame());
  }
  return { ctx, signatures };
};

const describeCounts = (ctx) =>
  PAINT_OPS.map((op) => (ctx.counts[op] ? `${op}=${ctx.counts[op]}` : null)).filter(Boolean).join(" ");

describe("the ghost background painters", () => {
  it.each(GHOST_BG_IDS)("%s paints something", (id) => {
    const { ctx } = run(createGhostBgPainter(id, W, H, POINTER));
    // eslint-disable-next-line no-console
    console.log(`[bg] ${id}: ${describeCounts(ctx) || "NOTHING"}`);
    expect(ctx.painted()).toBeGreaterThan(0);
  });

  it.each(GHOST_BG_IDS)("%s animates", (id) => {
    const { signatures } = run(createGhostBgPainter(id, W, H, POINTER), 90, POINTER);
    // A layer that never changes is a still frame on a page of motion, which is
    // the project's own definition of a broken effect.
    expect(signatures.size).toBeGreaterThan(1);
  });
});

describe("the ghost overlay painters", () => {
  it.each(GHOST_OVERLAY_IDS)("%s paints something", (id) => {
    const { ctx } = run(createGhostOverlayPainter(id, W, H, POINTER));
    // eslint-disable-next-line no-console
    console.log(`[ov] ${id}: ${describeCounts(ctx) || "NOTHING"}`);
    expect(ctx.painted()).toBeGreaterThan(0);
  });

  it.each(GHOST_OVERLAY_IDS)("%s animates", (id) => {
    const { signatures } = run(createGhostOverlayPainter(id, W, H, POINTER), 90, POINTER);
    expect(signatures.size).toBeGreaterThan(1);
  });
});

/* The blend mode has to match the kind of painter, or the layer is thrown away.
 *
 * `mix-blend-mode: screen` drops dark pixels, which is right for a particle
 * layer over the owner's background and wrong for the four plate-based ones —
 * under screen their dark plates contributed almost nothing, so half the
 * catalogue looked like it painted nothing while it was in fact painting. */
describe("the background layer's blending", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "effects.css"), "utf8");
  const plateEffects = ["window-rain", "vhs-tape", "thunder", "spotlight"];

  it("keeps the particle effects screen-blended so the page shows through", () => {
    expect(css).toMatch(/\.sw-bg-canvas\s*\{[^}]*mix-blend-mode:\s*screen/);
  });

  it.each(plateEffects)("draws %s normally, so the plate is not blended away", (id) => {
    const rule = new RegExp(`\\.sw-bg-canvas\\[data-effect="${id}"\\]`);
    expect(css).toMatch(rule);
    expect(css).toMatch(/mix-blend-mode:\s*normal/);
  });
});
