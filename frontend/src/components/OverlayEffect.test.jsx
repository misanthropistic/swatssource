import { createRoot } from "react-dom/client";
import { act } from "react";
import { OverlayEffect } from "./OverlayEffect";
import { OVERLAYS, REMOVED_EFFECTS, resolveOverlay } from "@/constants/effects";
import { GHOST_OVERLAY_IDS, createGhostOverlayPainter } from "@/lib/ghostFx";

global.IS_REACT_ACT_ENVIRONMENT = true;

/* The overlays ride ABOVE the profile card, so a dead overlay is not obvious
 * from a screenshot — it just quietly does nothing. These tests drive the ghost
 * painters by hand with a recording 2D context on a virtual 60fps clock and
 * prove the layer exists, paints, keeps animating, and cleans up. */

const makeCtx = () => {
  const ctx = {
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    arc: jest.fn(),
    ellipse: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    bezierCurveTo: jest.fn(),
    quadraticCurveTo: jest.fn(),
    fillRect: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    scale: jest.fn(),
    fillText: jest.fn(),
    strokeText: jest.fn(),
    drawImage: jest.fn(),
    // The snow pile path draws its drift line and the frost bakes an offscreen
    // canvas; give the recorder everything ghost's painters touch.
    rect: jest.fn(),
    strokeRect: jest.fn(),
    clip: jest.fn(),
    closePath: jest.fn(),
    setTransform: jest.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "",
    globalAlpha: 1,
    shadowColor: "",
    shadowBlur: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  };
  return ctx;
};

let ctx;
let pending;
let cancelled;

beforeEach(() => {
  ctx = makeCtx();
  pending = [];
  cancelled = [];
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ctx);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
  global.requestAnimationFrame = (cb) => {
    pending.push(cb);
    return pending.length;
  };
  global.cancelAnimationFrame = (id) => cancelled.push(id);
});

let clock = 0;
const step = (n) => {
  act(() => {
    for (let i = 0; i < n; i += 1) {
      const cb = pending.shift();
      clock += 1000 / 60;
      cb(clock);
    }
  });
};

const mount = (props = {}) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(<OverlayEffect effect="" {...props} />));
  clock = performance.now();
  return { el, root };
};

/* A deterministic stand-in for Math.random: two runs of the same code must paint
   the identical field before comparison between frames means anything. */
const deterministic = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

it("the catalog is exactly ghost's overlay list, in ghost's order", () => {
  expect(OVERLAYS.filter((o) => o.id).map((o) => o.id)).toEqual(GHOST_OVERLAY_IDS);
  expect(OVERLAYS[0]).toEqual({ id: "", label: "None", premium: false });
});

it("hands a painter to every listed overlay and nothing to a removed one", () => {
  for (const id of GHOST_OVERLAY_IDS) {
    expect(typeof createGhostOverlayPainter(id, 400, 600)).toBe("function");
  }
  expect(createGhostOverlayPainter("not-an-effect", 400, 600)).toBeNull();
  expect(createGhostOverlayPainter("", 400, 600)).toBeNull();
});

it("paints something and keeps requesting frames for every ghost overlay", () => {
  for (const effect of GHOST_OVERLAY_IDS) {
    ctx = makeCtx();
    pending = [];
    const { el, root } = mount({ effect });
    const layer = el.querySelector('[data-testid="overlay-canvas"]');
    expect(layer).toBeTruthy();
    expect(layer.getAttribute("data-effect")).toBe(effect);
    expect(layer.style.backgroundImage).toBe("");
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(pending.length).toBe(1);

    // frost-bite bakes its branches into one offscreen canvas before drawing it,
    // so give it a frame beyond the first.
    step(effect === "frost-bite" ? 3 : 3);

    const drew = ctx.arc.mock.calls.length + ctx.fillRect.mock.calls.length + ctx.fill.mock.calls.length + ctx.stroke.mock.calls.length + ctx.drawImage.mock.calls.length;
    expect(drew).toBeGreaterThan(0);
    expect(pending.length).toBe(1); // still looping

    act(() => root.unmount());
    el.remove();
  }
});

it("moves the particles between frames", () => {
  const random = jest.spyOn(Math, "random").mockImplementation(deterministic(424242));
  try {
    for (const effect of GHOST_OVERLAY_IDS) {
      ctx = makeCtx();
      pending = [];
      clock = 0;
      const { el, root } = mount({ effect });

      // Frame fingerprints include the paint state (colour, alpha) as well as
      // the geometry: the twinkling star and dot fields keep their positions and
      // move only through their fill/alpha, which IS motion.
      const METHODS = ["arc", "fillRect", "fill", "moveTo", "lineTo", "stroke", "ellipse", "translate", "rotate", "drawImage", "fillText"];
      for (const m of METHODS) {
        ctx[m].mockImplementation((...args) => {
          ctx.__frame.push(`${m}:${args.join(",")}|${ctx.fillStyle}|${ctx.globalAlpha}`);
        });
      }
      for (const g of ["createRadialGradient", "createLinearGradient"]) {
        ctx[g].mockImplementation((...args) => {
          ctx.__frame.push(`${g}:${args.join(",")}`);
          return { addColorStop: () => undefined };
        });
      }
      ctx.__frame = [];

      step(2);
      // Sample frames until three painted ones are on record.
      const framesSeen = [];
      for (let i = 0; i < 24 && framesSeen.length < 3; i += 1) {
        ctx.__frame = [];
        step(2);
        const painted = [...ctx.__frame];
        if (painted.length) framesSeen.push(painted);
      }

      expect(framesSeen.length).toBeGreaterThanOrEqual(3);
      expect(framesSeen[1].join("|")).not.toBe(framesSeen[0].join("|"));
      expect(framesSeen[2].join("|")).not.toBe(framesSeen[1].join("|"));

      act(() => root.unmount());
      el.remove();
    }
  } finally {
    random.mockRestore();
  }
});

it("stops the loop when the overlay goes away", () => {
  const { el, root } = mount({ effect: "dotters" });
  step(2);
  act(() => root.unmount());
  expect(cancelled.length).toBeGreaterThan(0);
  el.remove();
});

it("fades below the Editor's 100% transparency and stays full at default", () => {
  const cases = [
    [{ effect: "snow" }, ""],
    [{ effect: "snow", opacity: 100 }, ""],
    [{ effect: "snow", opacity: 25 }, "0.25"],
    [{ effect: "snow", opacity: 0 }, "0"],
  ];
  for (const [props, value] of cases) {
    const { el, root } = mount(props);
    const layer = el.querySelector('[data-testid="overlay-canvas"]');
    expect(layer.style.opacity).toBe(value || "");
    act(() => root.unmount());
    el.remove();
  }
});

it("legacy ids resolve: dots becomes dotters, frost-bite becomes grain", () => {
  expect(resolveOverlay("dots")).toBe("dotters");
  expect(resolveOverlay("frost-bite")).toBe("grain");
  expect(resolveOverlay("snow")).toBe("snow");
  expect(resolveOverlay("rain")).toBe("rain");
  expect(resolveOverlay("noise")).toBe("");
  expect(resolveOverlay("embers")).toBe("");

  const { el, root } = mount({ effect: "dots" });
  expect(el.querySelector('[data-testid="overlay-canvas"]').getAttribute("data-effect")).toBe("dotters");
  act(() => root.unmount());
  el.remove();

  const none = mount({ effect: "noise" });
  expect(none.el.innerHTML).toBe("");
  act(() => none.root.unmount());
  none.el.remove();
});

it("keeps the pointer feed for the spotlight overlay specifically", () => {
  const added = [];
  const removed = [];
  const realAdd = window.addEventListener;
  const realRemove = window.removeEventListener;
  window.addEventListener = (type) => added.push(type);
  window.removeEventListener = (type) => removed.push(type);
  try {
    const { el, root } = mount({ effect: "spotlight" });
    expect(added).toContain("pointermove");
    act(() => root.unmount());
    el.remove();
    expect(removed).toContain("pointermove");
    expect(added.filter((t) => t === "pointermove").length).toBe(1);
  } finally {
    window.addEventListener = realAdd;
    window.removeEventListener = realRemove;
  }
});

it("removed overlay ids are gone from every catalog on purpose", () => {
  const gone = ["noise", "retro", "scanlines", "vignette", "sparkle", "embers", "hearts", "snow-flakes"];
  for (const id of gone) {
    expect(REMOVED_EFFECTS).toContain(id);
    expect(OVERLAYS.some((o) => o.id === id)).toBe(false);
    expect(resolveOverlay(id)).toBe("");
  }
});
