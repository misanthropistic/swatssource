import { createRoot } from "react-dom/client";
import { act } from "react";
import { CursorEffect, CURSOR_PAINTER_IDS } from "./CursorEffect";
import { GHOST_MOUSE_IDS, ghostEmit, createGhostMouseState } from "@/lib/ghostFx";
import { CURSOR_EFFECTS, resolveCursor } from "@/constants/effects";

global.IS_REACT_ACT_ENVIRONMENT = true;

// Report reduced motion ON, which is exactly the condition that used to make the
// owner's cursor effect silently render nothing.
window.matchMedia = (query) => ({
  matches: String(query).includes("prefers-reduced-motion"),
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent() {
    return false;
  },
});

const makeCtx = () => ({
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  arc: jest.fn(),
  ellipse: jest.fn(),
  fill: jest.fn(),
  stroke: jest.fn(),
  fillRect: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  quadraticCurveTo: jest.fn(),
  closePath: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  setTransform: jest.fn(),
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  lineCap: "",
  lineJoin: "",
  globalAlpha: 1,
  shadowColor: "",
  shadowBlur: 0,
});

let ctx;
let pending;
let cancelled;
let listeners;

beforeEach(() => {
  ctx = makeCtx();
  pending = [];
  cancelled = [];
  listeners = {};
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ctx);
  global.requestAnimationFrame = (cb) => {
    pending.push(cb);
    return pending.length;
  };
  global.cancelAnimationFrame = (id) => cancelled.push(id);
  window.addEventListener = (type, fn) => {
    listeners[type] = listeners[type] || [];
    listeners[type].push(fn);
  };
  window.removeEventListener = (type, fn) => {
    const list = listeners[type] || [];
    const i = list.indexOf(fn);
    if (i > -1) list.splice(i, 1);
  };
});

const fire = (type, event) => {
  for (const fn of listeners[type] || []) fn(event);
};
/* The component prefers pointer events where they exist — jsdom predates them,
   so the move event is whichever the component registered for. */
const fireMove = (clientX, clientY) => {
  const type = listeners["pointermove"] ? "pointermove" : "mousemove";
  fire(type, { clientX, clientY });
};
const step = (n) => {
  act(() => {
    for (let i = 0; i < n; i += 1) {
      const cb = pending.shift();
      cb(performance.now());
    }
  });
};

let container;
let root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/* The catalog and the ghost pointer engine are the same list, in both
   directions — a tile that promises an effect but paints nothing is what these
   guards exist for. */
it("paints every cursor effect the store offers, and offers every effect it paints", () => {
  const offered = CURSOR_EFFECTS.filter((o) => o.id).map((o) => o.id);
  expect(offered).toEqual(GHOST_MOUSE_IDS);
  expect(CURSOR_PAINTER_IDS).toEqual(offered);
});

it("the ghost emit/draw pair recognises exactly the catalog ids", () => {
  for (const id of CURSOR_EFFECTS.filter((o) => o.id).map((o) => o.id)) {
    const state = createGhostMouseState();
    const p = { clientX: 10, clientY: 12 };
    ghostEmit(state, id, p.clientX, p.clientY);
    const drawn = state.parts.length > 0 || state.trail.length > 0;
    expect(drawn).toBe(true);
  }
});

it("mounts the cursor canvas even when the visitor prefers reduced motion", () => {
  act(() => root.render(<CursorEffect effect="star-dust" />));
  const canvas = container.querySelector('[data-testid="cursor-effect"]');
  expect(canvas).toBeTruthy();
  expect(canvas.getAttribute("data-effect")).toBe("star-dust");
  // An overlay that swallowed clicks would block the whole profile page.
  expect(canvas.style.pointerEvents).toBe("none");
});

it("draws particles after pointer moves and nothing before them", () => {
  act(() => root.render(<CursorEffect effect="star-dust" />));
  step(3);
  // No pointer yet, no ink: ghost only emits on move events.
  expect(ctx.arc.mock.calls.length).toBe(0);

  fireMove(40, 30);
  step(2);
  // Star dust is little glowing round specks. (ghost resets the glow to 0
  // after every particle is drawn, so the final canvas state reads 0 by design.)
  expect(ctx.arc.mock.calls.length).toBeGreaterThan(0);

  // The sparkle variant draws its stars as four-point paths instead.
  ctx = makeCtx();
  act(() => root.unmount());
  container.innerHTML = "";
  root = createRoot(container);
  act(() => root.render(<CursorEffect effect="sparkle" />));
  fireMove(40, 30);
  step(2);
  expect(ctx.fill).toHaveBeenCalled();
  expect(ctx.beginPath).toHaveBeenCalled();
});

it("draws the trail modes as strokes once the pointer has two knots", () => {
  for (const mode of ["silver-trail", "black-trail"]) {
    ctx = makeCtx();
    act(() => root.unmount());
    container.innerHTML = "";
    root = createRoot(container);
    act(() => root.render(<CursorEffect effect={mode} />));
    fireMove(10, 10);
    fireMove(20, 14);
    step(2);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.lineCap).toBe("round");
  }
});

it("caps the particle pool at ghost's 400", () => {
  const state = createGhostMouseState();
  const evt = { clientX: 5, clientY: 5 };
  for (let i = 0; i < 500; i += 1) ghostEmit(state, "sparks", evt.clientX, evt.clientY);
  expect(state.parts.length).toBeLessThanOrEqual(400);
});

it("renders nothing when the owner has not chosen a cursor effect, and legacy ids die quietly", () => {
  act(() => root.render(<CursorEffect effect="" />));
  expect(container.querySelector('[data-testid="cursor-effect"]')).toBeNull();

  act(() => root.render(<CursorEffect effect="smooth-flow" />));
  expect(container.querySelector('[data-testid="cursor-effect"]')).toBeNull();

  // The overlap ids survive the swap untouched.
  expect(resolveCursor("sparkle")).toBe("sparkle");
  expect(resolveCursor("star-dust")).toBe("star-dust");
  expect(resolveCursor("sparks")).toBe("sparks");
  expect(resolveCursor("laser")).toBe("");
  expect(resolveCursor("")).toBe("");
});
