/* ============================================================================
   ghostFx — the exact engine from the repo-root ghost.html, as a module.
   ============================================================================
   ghost.html IS the master set: its three stacked canvases (background,
   overlay, pointer) and its DOM star spawners are the implementations the
   profile renderer now runs — ported line for line, not re-invented. The
   script ships three tunings of each painter ("version 1/2/3" chips) and runs
   version 1 by default; version 1 IS what ghost.html shows when it opens, so
   version 1's parameters are the ones transcribed here.

   ghost.html's own performance discipline is kept with it:
     • devicePixelRatio capped at 2 (components own the resize).
     • the particle pool hard-capped at 400.
     • one clear per frame, no layout reads in the loop (pointer positions are
       handed in by the event that produced them).
   The painters are factories that close over (w, h) exactly like ghost's
   close over W, H — a resize re-creates the painter, exactly like ghost's
   setBg() does.
   ========================================================================== */

const R = Math.random;
const PI = Math.PI;
const TAU7 = 7; // ghost draws full circles with 7 (> 2π); kept for exactness

/* ---------------------------------------------------------------- shapes -- */
export const ghostStar = (c, x, y, s) => {
  c.beginPath();
  c.moveTo(x, y - s);
  c.quadraticCurveTo(x, y, x + s, y);
  c.quadraticCurveTo(x, y, x, y + s);
  c.quadraticCurveTo(x, y, x - s, y);
  c.quadraticCurveTo(x, y, x, y - s);
  c.fill();
};

export const ghostHeart = (c, x, y, s) => {
  c.beginPath();
  c.moveTo(x, y + 0.35 * s);
  c.bezierCurveTo(x - 0.9 * s, y - 0.2 * s, x - 0.5 * s, y - 0.9 * s, x, y - 0.4 * s);
  c.bezierCurveTo(x + 0.5 * s, y - 0.9 * s, x + 0.9 * s, y - 0.2 * s, x, y + 0.35 * s);
  c.fill();
};

export const ghostFlake = (c, x, y, s, r) => {
  c.save();
  c.translate(x, y);
  c.rotate(r);
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    c.rotate(PI / 3);
    c.moveTo(0, 0);
    c.lineTo(0, -s);
    c.moveTo(0, -s * 0.6);
    c.lineTo(s * 0.28, -s * 0.85);
    c.moveTo(0, -s * 0.6);
    c.lineTo(-s * 0.28, -s * 0.85);
  }
  c.stroke();
  c.restore();
};

const mkbolt = (W, H) => {
  const out = [];
  const go = (x, y, w, a, lim) => {
    const p = [{ x, y }];
    while (y < lim) {
      x += (R() - 0.5) * 50 + a;
      y += 12 + R() * 22;
      p.push({ x, y });
      if (w > 1.5 && R() < 0.1) go(x, y, w * 0.5, (R() - 0.5) * 60, y + 80 + R() * 200);
    }
    out.push({ w, p });
  };
  go(R() * W, 0, 3, 0, H * (0.6 + R() * 0.4));
  return out;
};

/* ----------------------------------------------------- background painters -- */
/* E.rain = "rain": dark plate under actual falling rain — slanted streaks
   chasing down the plate, with the faint splash bloom where drops land. The
   first version drew stationary elliptical lenses that read as bubbles
   covering the page; rain read as a shower, not a wall of glass beads. */
const rain = (W, H) => {
  const mk = () => ({
    x: R() * (W + 120) - 60,
    y: R() * H,
    len: 12 + R() * 22,
    v: 9 + R() * 9,
  });
  const D = [...Array(170)].map(mk);
  return (c) => {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0e13');
    g.addColorStop(1, '#05070a');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // Two passes: the streaks, one batched path so hundreds of drops are one
    // stroke instead of hundreds of canvas state changes.
    c.strokeStyle = 'rgba(196,214,240,.42)';
    c.lineWidth = 1.1;
    c.lineCap = 'round';
    c.beginPath();
    for (const d of D) {
      d.y += d.v;
      d.x -= d.v * 0.14;
      if (d.y > H + d.len) Object.assign(d, mk(), { y: -d.len - 4 });
      c.moveTo(d.x, d.y);
      c.lineTo(d.x - d.len * 0.14, d.y - d.len);
    }
    c.stroke();
    // The splash puff where the heaviest drops hit the floor of the card.
    for (let i = 0; i < 5; i++) if (R() < 0.35) {
      const sx = R() * W;
      const sy = H - R() * 6;
      const r = 2 + R() * 4;
      c.beginPath();
      c.arc(sx, sy, r, 0, PI);
      c.strokeStyle = 'rgba(196,214,240,.18)';
      c.lineWidth = 1;
      c.stroke();
    }
  };
};

/* E.snow: drift field. ghost passes (n, wd, z); version 1's table decides the
   args per id (bg snow v1 = 150 flakes, no wind, scale 1; ov snow = 60). */
const snow = (W, H, n, wd, z) => {
  const f = [...Array(n)].map(() => {
    const d = R();
    return { x: R() * W, y: R() * H, r: (0.6 + d * 2.2) * z, s: 0.3 + d * 1.3, p: R() * 6, d };
  });
  return (c, t) => {
    c.fillStyle = '#fff';
    const g = Math.sin(t / 3000) * wd;
    for (const o of f) {
      o.y += o.s;
      o.x += Math.sin(t / 900 + o.p) * 0.35 * (1 + o.d) + g * (0.4 + o.d) + wd * 0.3;
      if (o.y > H + 5) { o.y = -5; o.x = R() * W; }
      if (o.x > W + 5) o.x = -5;
      if (o.x < -5) o.x = W + 5;
      c.globalAlpha = 0.25 + o.d * 0.65;
      c.beginPath();
      c.arc(o.x, o.y, o.r, 0, TAU7);
      c.fill();
    }
    c.globalAlpha = 1;
  };
};

/* E.pile: snow that lands and drifts along the bottom edge (bg "snow v2").
   The pile evens itself out fast and never climbs far — a flat, even blanket
   rather than the knee-high drift the big cap used to grow. */
const pile = (W, H, N, cap) => {
  const n = Math.ceil(W / 3) + 2;
  const h = new Float32Array(n);
  const f = [...Array(N)].map(() => ({ x: R() * W, y: R() * H, r: 1 + R() * 2, s: 0.6 + R() * 1.2, p: R() * 6 }));
  return (c, t) => {
    c.fillStyle = 'rgba(255,255,255,.92)';
    for (const o of f) {
      o.y += o.s;
      o.x += Math.sin(t / 800 + o.p) * 0.4;
      const i = (o.x / 3) | 0;
      if (o.y > H - (h[i] || 0)) {
        for (let k = -2; k <= 2; k++) if (h[i + k] !== undefined && h[i + k] < cap) h[i + k] += (3 - Math.abs(k)) * 0.09;
        o.y = -5;
        o.x = R() * W;
      }
      c.beginPath();
      c.arc(o.x, o.y, o.r, 0, TAU7);
      c.fill();
    }
    for (let i = 1; i < n - 1; i++) h[i] += ((h[i - 1] + h[i + 1]) / 2 - h[i]) * 0.09;
    c.beginPath();
    c.moveTo(0, H);
    for (let i = 0; i < n; i++) c.lineTo(i * 3, H - h[i]);
    c.lineTo(W, H);
    c.fill();
  };
};

/* E.cash: falling bills (k != 1) — version 1 is 34 notes at the slower speed. */
const cash = (W, H) => {
  const nb = (i) => ({ x: R() * W, y: i ? R() * H : -30, s: 0.8 + R() * 1.6, r: R() * 6, vr: (R() - 0.5) * 0.03, f: R() * 6, z: 0.7 + R() * 0.6 });
  const b = [...Array(34)].map(() => nb(1));
  return (c) => {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const o of b) {
      o.y += o.s;
      o.r += o.vr;
      o.f += 0.03;
      o.x += Math.sin(o.f * 0.7) * 0.5;
      if (o.y > H + 30) Object.assign(o, nb(0));
      const fl = Math.max(0.2, Math.abs(Math.cos(o.f)));
      c.save();
      c.translate(o.x, o.y);
      const w = 34 * o.z, h = 16 * o.z;
      c.rotate(o.r);
      c.scale(1, fl);
      c.fillStyle = '#4d8a5a';
      c.fillRect(-w / 2, -h / 2, w, h);
      c.strokeStyle = '#2b5736';
      c.lineWidth = 1;
      c.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
      c.fillStyle = '#cfe6d3';
      c.font = `bold ${9 * o.z}px Georgia,serif`;
      c.fillText('$', 0, 1);
      c.restore();
    }
  };
};

const hearts = (W, H, n, sz) => {
  const a = [...Array(n)].map(() => ({ x: R() * W, y: R() * H, s: sz * (0.5 + R()), v: 0.5 + R(), p: R() * 6, h: R() < 0.5 ? 350 : 335 + R() * 15 }));
  return (c, t) => {
    for (const o of a) {
      o.y += o.v;
      o.x += Math.sin(t / 700 + o.p) * 0.5;
      if (o.y > H + 30) { o.y = -30; o.x = R() * W; }
      c.fillStyle = `hsla(${o.h},78%,52%,.8)`;
      ghostHeart(c, o.x, o.y, o.s);
    }
  };
};

/* E.vhs(o, l): o=0 paints the full tape plate (bg "vhs tape"), o=1 paints just
   the tape artifacts (ov "vhs"). It is the tape look and nothing else: scan
   lines, the drifting tracking band and its chroma smear. The old write ran a
   sparkle-noise pass and burned "PLAY ▶" plus a timecode over the page —
   both gone; a profile wants the effect, not a caption burned into it. */
const vhs = (W, H, o, l) => {
  return (c, t) => {
    if (!o) {
      c.fillStyle = '#0a0c11';
      c.fillRect(0, 0, W, H);
    }
    const a = o ? 0.5 : 1;
    const y = (t * 0.12) % (H + 240) - 120;
    c.fillStyle = `rgba(255,255,255,${0.05 * a})`;
    c.fillRect(0, y, W, 34);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = R() < 0.5 ? `rgba(255,0,70,${0.12 * a})` : `rgba(0,220,255,${0.12 * a})`;
      c.fillRect(R() * 20 - 10, y + R() * 34, W, 2 + R() * 3);
    }
    // One faint tracking flutter, so the band quivers like a real head.
    if (R() < 0.5) {
      c.fillStyle = `rgba(255,255,255,${0.03 * a})`;
      c.fillRect(0, y + R() * 34, W, 1);
    }
    c.fillStyle = `rgba(0,0,0,${0.22 * a})`;
    for (let yy = 0; yy < H; yy += 3) c.fillRect(0, yy, W, 1);
  };
};

/* E.spot: follows the pointer through `pointer` ({x, y} in canvas space, null
   until seen — exactly ghost's mx/my < 0 fallback to the centre). */
const spot = (W, H, pointer) => {
  let x = W / 2, y = H / 2;
  const at = () => (pointer.current.x < 0 ? W / 2 : pointer.current.x);
  const atY = () => (pointer.current.y < 0 ? H / 2 : pointer.current.y);
  return (c, t) => {
    x += (at() - x) * 0.12;
    y += (atY() - y) * 0.12;
    c.fillStyle = '#020202';
    c.fillRect(0, 0, W, H);
    const r = Math.max(280, W * 0.18);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,248,230,.34)');
    g.addColorStop(0.5, 'rgba(255,248,230,.119)');
    g.addColorStop(1, 'rgba(255,248,230,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    void t;
  };
};

/* E.thunder: clouds, a forked bolt and the two-stage flash. Version 1 restrike:
   150 + random*300 frames. */
const thunder = (W, H) => {
  let fl = 0, bolt = [], next = 90;
  const cl = [...Array(7)].map(() => ({ x: R() * W, y: R() * H * 0.5, r: 150 + R() * 200, s: 0.1 + R() * 0.2 }));
  return (c) => {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05070c');
    g.addColorStop(1, '#0b0f18');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    for (const o of cl) {
      o.x += o.s;
      if (o.x - o.r > W) o.x = -o.r;
      const q = c.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      q.addColorStop(0, `rgba(40,46,58,${fl > 0 ? 0.16 : 0.06})`);
      q.addColorStop(1, 'rgba(40,46,58,0)');
      c.fillStyle = q;
      c.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
    }
    if (--next < 0) {
      fl = 24;
      next = 150 + R() * 300;
      bolt = mkbolt(W, H);
    }
    if (fl > 0) {
      const a = fl / 24;
      const k = fl > 15 || fl < 9 ? a : a * 0.3;
      fl--;
      c.fillStyle = `rgba(190,210,255,${k * 0.18})`;
      c.fillRect(0, 0, W, H);
      c.strokeStyle = `rgba(235,243,255,${k})`;
      c.shadowColor = '#8fb4ff';
      c.shadowBlur = 18;
      for (const s of bolt) {
        c.lineWidth = s.w;
        c.beginPath();
        s.p.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
        c.stroke();
      }
      c.shadowBlur = 0;
    }
  };
};

const streak = (W, H, n, sl, ln) => {
  const a = [...Array(n)].map(() => ({ x: R() * W, y: R() * H, l: (10 + R() * 18) * ln, v: 16 + R() * 10 }));
  return (c) => {
    c.strokeStyle = 'rgba(190,210,235,.28)';
    c.lineWidth = 1;
    c.beginPath();
    for (const o of a) {
      o.y += o.v;
      o.x -= o.v * sl;
      if (o.y > H) { o.y = -30; o.x = R() * (W + 200); }
      c.moveTo(o.x, o.y);
      c.lineTo(o.x + o.l * sl, o.y - o.l);
    }
    c.stroke();
  };
};

const flakesFx = (W, H, n, s0) => {
  const a = [...Array(n)].map(() => ({ x: R() * W, y: R() * H, s: s0 * (5 + R() * 9), v: 0.3 + R() * 0.7, r: R() * 6, vr: (R() - 0.5) * 0.02, p: R() * 6 }));
  return (c, t) => {
    c.strokeStyle = 'rgba(235,245,255,.75)';
    c.lineWidth = 1;
    for (const o of a) {
      o.y += o.v;
      o.r += o.vr;
      o.x += Math.sin(t / 1200 + o.p) * 0.4;
      if (o.y > H + 20) { o.y = -20; o.x = R() * W; }
      ghostFlake(c, o.x, o.y, o.s, o.r);
    }
  };
};

/* E.frost: frost branches baked once into an offscreen canvas, then faded with
   a slow sine. The old bake laid a wide white radial wash under the branches
   at .38, which covered everything behind the overlay in fog and left the
   ice unreadable; the branches now carry the look and the wash is a hint. */
const frost = (W, H) => {
  const n = 46, al = 0.14;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0, 'rgba(170,210,255,0)');
  g.addColorStop(1, `rgba(190,225,255,${al})`);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(225,240,255,.55)';
  c.lineWidth = 1;
  const br = (x, y, a, l, d) => {
    if (l < 4 || d > 4) return;
    const x2 = x + Math.cos(a) * l;
    const y2 = y + Math.sin(a) * l;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x2, y2);
    c.stroke();
    br(x2, y2, a + 0.6 + R() * 0.3, l * 0.55, d + 1);
    br(x2, y2, a - 0.6 - R() * 0.3, l * 0.55, d + 1);
    br(x2, y2, a + (R() - 0.5) * 0.3, l * 0.7, d + 1);
  };
  for (let i = 0; i < n; i++) {
    const s = (R() * 4) | 0;
    const p = R();
    let x, y, a;
    if (s < 1) { x = p * W; y = 0; a = 1.57; }
    else if (s < 2) { x = p * W; y = H; a = -1.57; }
    else if (s < 3) { x = 0; y = p * H; a = 0; }
    else { x = W; y = p * H; a = PI; }
    br(x, y, a + (R() - 0.5) * 0.6, 40 + R() * 70, 0);
  }
  return (c2, t) => {
    c2.globalAlpha = 0.85 + Math.sin(t / 1500) * 0.1;
    c2.drawImage(cv, 0, 0, W, H);
    c2.globalAlpha = 1;
  };
};

/* E.stars: twinkling field + shooting stars. Version 1 rate. */
const starsFx = (W, H, rt, tl) => {
  const a = [];
  const tw = [...Array(60)].map(() => ({ x: R() * W, y: R() * H, p: R() * 6 }));
  let nx = 30;
  return (c, t) => {
    for (const q of tw) {
      c.fillStyle = `rgba(255,255,255,${0.15 + 0.25 * Math.sin(t / 600 + q.p)})`;
      c.fillRect(q.x, q.y, 1.5, 1.5);
    }
    if (--nx < 0) {
      nx = (70 + R() * 130) * rt;
      a.push({ x: W * 0.1 + R() * W * 0.9, y: R() * H * 0.4, vx: -(9 + R() * 6), vy: 4 + R() * 3 });
    }
    for (let i = a.length - 1; i >= 0; i--) {
      const s = a[i];
      s.x += s.vx;
      s.y += s.vy;
      const tx = s.x - s.vx * tl;
      const ty = s.y - s.vy * tl;
      const g = c.createLinearGradient(s.x, s.y, tx, ty);
      g.addColorStop(0, 'rgba(255,255,255,.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.strokeStyle = g;
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.lineTo(tx, ty);
      c.stroke();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(s.x, s.y, 1.4, 0, TAU7);
      c.fill();
      if (s.x < -100 || s.y > H + 100) a.splice(i, 1);
    }
  };
};

/* E.dots: dotters is a whole canvas of little dots, not a few drifting
   glimmers. They are laid out on an offset grid so they cover the overlay
   evenly, and each one twinkles gently so the field is alive without ever
   reading as a swarm of bubbles. */
const dots = (W, H) => {
  const gap = 14;
  const cols = Math.ceil(W / gap) + 2;
  const rows = Math.ceil(H / gap) + 2;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      cells.push({ x: k * gap + (r % 2) * (gap / 2), y: r * gap, p: (cells.length % 13) * 0.48 });
    }
  }
  return (c, t) => {
    for (const o of cells) {
      const k = 0.16 + 0.24 * (0.5 + 0.5 * Math.sin(t / 900 + o.p));
      c.fillStyle = `rgba(255,255,255,${k.toFixed(3)})`;
      c.beginPath();
      c.arc(o.x, o.y, 1.5, 0, TAU7);
      c.fill();
    }
  };
};

/* --------------------------------------------------- the two lookup tables -- */
/* Exactly ghost's BG / OV maps, with the version-1 table's arguments hard-coded,
   and ids spelled in the catalog's kebab-case. `pointer` is shared so the one
   pointer-following background (spotlight) can chase the mouse. */
const pointerRef = () => ({ current: { x: -99, y: -99 } });

export const GHOST_BG_IDS = [
  'window-rain', 'snow-v1', 'snow-v2', 'cash-fall', 'heart-fall', 'vhs-tape', 'spotlight', 'thunder',
];

export const GHOST_OVERLAY_IDS = [
  'snow', 'vhs', 'rain', 'hearts', 'snow-flakes', 'frost-bite', 'shooting-stars', 'dotters',
];

export function createGhostBgPainter(id, w, h, pointer = pointerRef()) {
  switch (id) {
    case 'window-rain': return rain(w, h);
    case 'snow-v1': return snow(w, h, 150, 0, 1);
    case 'snow-v2': return pile(w, h, 120, 24);
    case 'cash-fall': return cash(w, h);
    case 'heart-fall': return hearts(w, h, 40, 14);
    case 'vhs-tape': return vhs(w, h, 0, 1);
    case 'spotlight': return spot(w, h, pointer);
    case 'thunder': return thunder(w, h);
    default: return null;
  }
}

export function createGhostOverlayPainter(id, w, h, pointer = pointerRef()) {
  switch (id) {
    case 'snow': return snow(w, h, 60, 0, 1);
    case 'vhs': return vhs(w, h, 1, 1);
    case 'rain': return streak(w, h, 130, 0.18, 1);
    case 'hearts': return hearts(w, h, 18, 9);
    case 'snow-flakes': return flakesFx(w, h, 26, 1);
    case 'frost-bite': return frost(w, h);
    case 'shooting-stars': return starsFx(w, h, 1, 9);
    case 'dotters': return dots(w, h);
    default:
      void pointer;
      return null;
  }
}

/* ------------------------------------------------------- the mouse engine -- */
/* ghost's emit/drawParts/drawTrail verbatim, version 1. The state (parts and
   trail arrays) is per-mounted-canvas. */
export const GHOST_MOUSE_IDS = ['sparkle', 'star-dust', 'snow-flakes', 'blood-drips', 'sparks', 'silver-trail', 'black-trail'];

export const createGhostMouseState = () => ({
  parts: [],
  trail: [],
  x: -99,
  y: -99,
});

/* Every pointer event hands its position in and emits. Exactly ghost's emit():
   trails push a knot; every other mode throws n particles per event, n coming
   from the version-1 table (sparks 3, sparkle 2, everything else 1). */
export function ghostEmit(state, mode, x, y) {
  state.x = x;
  state.y = y;
  if (mode === 'none') return;
  if (/trail/.test(mode)) {
    state.trail.push({ x, y, t: 0 });
    return;
  }
  const n = mode === 'sparks' ? 3 : mode === 'sparkle' ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const p = { x: x + (R() - 0.5) * 8, y: y + (R() - 0.5) * 8, a: 0, m: mode, vx: 0, vy: 0, L: 60, V: 1 };
    if (mode === 'sparkle') {
      p.p = R() * 6;
      p.c = R() < 0.7 ? '255,255,255' : '255,236,170';
      p.vx = (R() - 0.5) * 0.5;
      p.vy = 0.15 + R() * 0.5;
      p.s = 3 + R() * 6;
      p.L = 50 + R() * 50;
    } else if (mode === 'star-dust') {
      p.vx = (R() - 0.5) * 1.4;
      p.vy = (R() - 0.5) * 1.4 - 0.2;
      p.s = 0.6 + R() * 1.6;
      p.L = 60 + R() * 40;
      p.c = ['200,225,255', '255,235,180', '255,255,255'][(R() * 3) | 0];
    } else if (mode === 'snow-flakes') {
      p.vy = 0.6 + R() * 0.9;
      p.s = 3 + R() * 5;
      p.L = 150;
      p.p = R() * 6;
      p.r = R() * 6;
    } else if (mode === 'blood-drips') {
      p.st = 8 + R() * 40;
      p.len = 0;
      p.s = 1.5 + R() * 2.3;
      p.L = 150;
    } else if (mode === 'sparks') {
      const a = R() * PI * 2;
      const v = 1.5 + R() * 4;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v - 1;
      p.L = 22 + R() * 20;
      p.h = 25 + R() * 30;
    }
    state.parts.push(p);
  }
  if (state.parts.length > 400) state.parts.splice(0, state.parts.length - 400);
}

function ghostTrail(state, mode, c) {
  if (!/trail/.test(mode)) {
    state.trail.length = 0;
    return;
  }
  const T = 26;
  const WM = 7;
  while (state.trail.length && state.trail[0].t > T) state.trail.shift();
  state.trail.forEach((p) => p.t++);
  const dark = mode[0] === 'b';
  c.lineCap = c.lineJoin = 'round';
  for (let i = 1; i < state.trail.length; i++) {
    const a = state.trail[i - 1];
    const b = state.trail[i];
    const k = 1 - b.t / T;
    const w = 1 + k * WM;
    const seg = () => {
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    };
    if (dark) {
      c.strokeStyle = `rgba(255,255,255,${k * 0.35})`;
      c.lineWidth = w + 1.5;
      seg();
      c.strokeStyle = `rgba(0,0,0,${k})`;
      c.lineWidth = w;
      seg();
    } else {
      c.shadowColor = 'rgba(210,220,240,.8)';
      c.shadowBlur = 8;
      c.strokeStyle = `rgba(${(190 + k * 60) | 0},${(195 + k * 55) | 0},${(205 + k * 50) | 0},${k})`;
      c.lineWidth = w;
      seg();
      c.shadowBlur = 0;
      c.strokeStyle = `rgba(255,255,255,${k * 0.8})`;
      c.lineWidth = w * 0.35;
      seg();
    }
  }
  c.shadowBlur = 0;
}

function ghostParts(state, mode, c) {
  for (let i = state.parts.length - 1; i >= 0; i--) {
    const p = state.parts[i];
    if (++p.a > p.L || p.m !== mode) {
      state.parts.splice(i, 1);
      continue;
    }
    const k = 1 - p.a / p.L;
    p.x += p.vx;
    p.y += p.vy;
    c.globalAlpha = 1;
    switch (p.m) {
      case 'sparkle': {
        const s = p.s * Math.sin(PI * k) * (0.7 + 0.3 * Math.sin(p.a * 0.5 + p.p));
        c.fillStyle = `rgb(${p.c})`;
        c.shadowColor = `rgba(${p.c},.9)`;
        c.shadowBlur = 8;
        ghostStar(c, p.x, p.y, s);
        break;
      }
      case 'star-dust':
        p.vx *= 0.98;
        p.vy *= 0.98;
        c.fillStyle = `rgba(${p.c},${k})`;
        c.shadowColor = `rgba(${p.c},.8)`;
        c.shadowBlur = 6;
        c.beginPath();
        c.arc(p.x, p.y, p.s, 0, TAU7);
        c.fill();
        break;
      case 'snow-flakes':
        p.vx = Math.sin(p.a * 0.08 + p.p) * 0.5;
        p.r += 0.02;
        c.strokeStyle = `rgba(235,245,255,${k})`;
        c.lineWidth = 1;
        ghostFlake(c, p.x, p.y, p.s, p.r);
        break;
      case 'blood-drips': {
        if (p.st > 0) { p.st--; p.len += 0.25; } else p.vy += 0.15;
        c.globalAlpha = Math.min(1, k * 2.5);
        c.strokeStyle = '#6e0000';
        c.lineWidth = p.s * 0.7;
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x, p.y + p.len);
        c.stroke();
        c.fillStyle = p.s > 2.4 ? '#a30000' : '#8a0000';
        c.beginPath();
        c.ellipse(p.x, p.y + p.len, p.s, p.s * 1.3, 0, 0, TAU7);
        c.fill();
        c.fillStyle = 'rgba(255,170,170,.45)';
        c.beginPath();
        c.arc(p.x - p.s * 0.3, p.y + p.len - p.s * 0.3, p.s * 0.25, 0, TAU7);
        c.fill();
        break;
      }
      case 'sparks':
        p.vy += 0.15;
        p.vx *= 0.97;
        c.strokeStyle = `hsla(${p.h},100%,${55 + 30 * k}%,${k})`;
        c.lineWidth = 1.5;
        c.shadowColor = 'rgba(255,140,30,.9)';
        c.shadowBlur = 6;
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5);
        c.stroke();
        break;
      default:
        break;
    }
    c.shadowBlur = 0;
    c.globalAlpha = 1;
  }
}

/* One frame of the pointer layer: trail then particles. When the mode is a
   trail, particles are skipped entirely (they are not spawned) — as in ghost. */
export function ghostDrawMouse(c, state, mode, w, h) {
  c.clearRect(0, 0, w, h);
  ghostTrail(state, mode, c);
  if (!/trail/.test(mode)) ghostParts(state, mode, c);
}

/* ghost's flip/reactive animations wrap each letter in a span with a --i index. */
export const spanLetters = (text) =>
  [...text].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('');
