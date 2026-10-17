import { createRoot } from "react-dom/client";
import { act } from "react";
import { BackgroundEffect } from "./BackgroundEffect";
import { BACKGROUND_EFFECTS, REMOVED_EFFECTS, resolveBackground } from "@/constants/effects";
import { GHOST_BG_IDS, createGhostBgPainter } from "@/lib/ghostFx";

global.IS_REACT_ACT_ENVIRONMENT = true;

const WIDTH = 800;
const HEIGHT = 200;

/* jsdom has no canvas implementation, so record what the painter draws. */
let drawn;

function makeRecorder() {
  const state = {
    fills: 0,
    fillRects: 0,
    fillStyles: new Set(),
    minLineY: Infinity,
    lineTo: 0,
    ellipses: 0,
    drawImages: 0,
    fillTexts: 0,
  };
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    clearRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo(_x, y) {
      state.lineTo++;
      if (y < state.minLineY) state.minLineY = y;
    },
    arc() {},
    ellipse() {
      state.ellipses++;
    },
    rect() {},
    fillRect() {
      state.fillRects++;
    },
    strokeRect() {},
    fill() {
      state.fills++;
      state.fillStyles.add(this.fillStyle);
    },
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    clip() {},
    setTransform() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    drawImage() {
      state.drawImages++;
    },
    fillText() {
      state.fillTexts++;
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
  };
  return { ctx, state };
}

let frames = [];

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function getContext() {
    const { ctx, state } = makeRecorder();
    // Only the element actually on the page counts; a painter that builds an
    // offscreen canvas (frost) must not be mistaken for the layer itself.
    if (this.isConnected) drawn = state;
    return ctx;
  };
  global.requestAnimationFrame = (cb) => frames.push(cb);
  global.cancelAnimationFrame = () => {};
});

const advance = (count, now = () => 16) => {
  act(() => {
    for (let i = 0; i < count; i++) {
      const batch = frames;
      frames = [];
      batch.forEach((cb) => cb(now()));
    }
  });
};

let container;
let root;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: WIDTH, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: HEIGHT, configurable: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  drawn = null;
  frames = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/* The catalog IS the ghost file's background list, in its order. */
describe("the catalog and the painter agree", () => {
  it("offers exactly the ghost backgrounds, in ghost's order", () => {
    const offered = BACKGROUND_EFFECTS.filter((o) => o.id).map((o) => o.id);
    expect(offered).toEqual(GHOST_BG_IDS);
  });

  it("hands a painter to every listed id and nothing to a removed one", () => {
    for (const id of GHOST_BG_IDS) {
      expect(typeof createGhostBgPainter(id, WIDTH, HEIGHT)).toBe("function");
    }
    for (const gone of REMOVED_EFFECTS.filter((id) => !BACKGROUND_EFFECTS.some((o) => o.id === id))) {
      expect(createGhostBgPainter(gone, WIDTH, HEIGHT)).toBeNull();
    }
  });
});

describe("the ghost backgrounds render", () => {
  it("mounts a canvas for every catalog id and keeps looping", () => {
    for (const id of GHOST_BG_IDS) {
      act(() => root.unmount());
      frames = [];
      drawn = null;
      root = createRoot(container);
      act(() => root.render(<BackgroundEffect effect={id} />));
      const canvas = container.querySelector('[data-testid="bg-canvas"]');
      expect(canvas).toBeTruthy();
      expect(canvas.getAttribute("data-effect")).toBe(id);
      // The ghost painters carry the whole effect (they paint their own
      // backdrops), so the layer is at full strength — no opacity dial.
      expect(canvas.style.opacity).toBe("");
      expect(frames.length).toBe(1); // first frame painted on mount
      advance(3);
      expect(frames.length).toBe(1); // still re-requesting
      const drew =
        drawn.fills + drawn.fillRects + drawn.lineTo + drawn.ellipses + drawn.drawImages + drawn.fillTexts;
      expect(drew).toBeGreaterThan(0);
    }
    act(() => root.unmount());
    root = createRoot(container);
  });

  it("cancels the loop on unmount", () => {
    const cancelled = [];
    const real = global.requestAnimationFrame;
    global.requestAnimationFrame = (cb) => "rafid";
    global.cancelAnimationFrame = (id) => cancelled.push(id);
    try {
      act(() => root.render(<BackgroundEffect effect="snow-v1" />));
      expect(cancelled).toEqual([]);
      act(() => root.unmount());
      expect(cancelled).toContain("rafid");
    } finally {
      global.requestAnimationFrame = real;
      global.cancelAnimationFrame = () => {};
      root = createRoot(container);
    }
  });

  it("rain paints falling streaks, not the old bubble lenses", () => {
    act(() => root.render(<BackgroundEffect effect="rain" />));
    advance(3);
    // Rain is lines chasing down the plate: many lineTo points, and none of
    // the elliptical lenses that used to read as bubbles.
    expect(drawn.lineTo).toBeGreaterThanOrEqual(100);
    expect(drawn.ellipses).toBe(0);
    expect(drawn.fillRects).toBeGreaterThan(0); // the dark pane
  });

  it("snow-v2 piles along the bottom edge, evenly and low; snow-v1 never does", () => {
    act(() => root.render(<BackgroundEffect effect="snow-v2" />));
    advance(600);
    // The pile rises above the bottom edge as flakes land...
    expect(drawn.minLineY).toBeLessThan(HEIGHT);
    // ...but the low cap keeps it an even blanket, a few pixels high at most.
    expect(drawn.minLineY).toBeGreaterThanOrEqual(HEIGHT - 26);

    frames = [];
    drawn = null;
    act(() => root.render(<BackgroundEffect effect="snow-v1" />));
    advance(600);
    expect(drawn.minLineY).toBe(Infinity); // no pile path at all
    expect(drawn.fills).toBeGreaterThan(0); // falling flakes
  });

  it("tv paints its plate and its scanlines, and burns no text", () => {
    act(() => root.render(<BackgroundEffect effect="tv" />));
    advance(3);
    // The tape look is the effect itself: no "PLAY ▶" or timecode written
    // over the page, and no sparkle-noise either.
    expect(drawn.fillTexts).toBe(0);
    expect(drawn.fillRects).toBeGreaterThan(0); // the plate, band and scanlines
  });

  it("legacy ids resolve onto their replacement instead of half-working", () => {
    expect(resolveBackground("window-rain")).toBe("rain");
    expect(resolveBackground("vhs-tape")).toBe("tv");
    expect(resolveBackground("heart-fall")).toBe("love-fall");
    expect(resolveBackground("snow-v1")).toBe("snow-v1");
    expect(resolveBackground("galaxy")).toBe("galaxy");
    // Anything with no twin renders as none, not as a broken painter.
    expect(resolveBackground("aurora")).toBe("");
    expect(resolveBackground("cash-fall")).toBe("");
    expect(resolveBackground("")).toBe("");

    act(() => root.render(<BackgroundEffect effect="window-rain" />));
    expect(container.querySelector('[data-testid="bg-canvas"]').getAttribute("data-effect")).toBe(
      "rain",
    );
    act(() => root.render(<BackgroundEffect effect="aurora" />));
    expect(container.querySelector('[data-testid="bg-canvas"]')).toBeNull();
  });

  it("watches its container, not just the window", () => {
    const observed = [];
    const realRO = global.ResizeObserver;
    global.ResizeObserver = class {
      constructor(cb) {
        this.cb = cb;
      }
      observe(el) {
        observed.push(el);
      }
      disconnect() {
        observed.disconnected = true;
      }
    };
    try {
      act(() => root.render(<BackgroundEffect effect="snow-v1" />));
      expect(observed).toContain(container);
      act(() => root.unmount());
      expect(observed.disconnected).toBe(true);
    } finally {
      if (realRO) global.ResizeObserver = realRO;
      else delete global.ResizeObserver;
      root = createRoot(container);
    }
  });
});
