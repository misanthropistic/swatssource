import fs from "fs";
import path from "path";
import zlib from "zlib";
import { DISCORD_BADGES, DISCORD_BADGE_MAP, BADGE_GROUPS } from "./discordBadges";
import { BADGE_META, BADGE_CATALOG, DISCORD_BADGE_CATALOG } from "./badges";

/* A badge is a picture now, so the failure that matters is a picture that is not
   there: a renamed file, a typo in the registry, or a badge that was registered
   without art. None of those show up as an error at runtime — the chip simply
   draws its fallback glyph — so they are pinned here instead. */

const PUBLIC = path.resolve(process.cwd(), "public");
const fileOf = (src) => path.join(PUBLIC, src);

it("ships a real file for every registered badge", () => {
  const missing = DISCORD_BADGES.filter((b) => !fs.existsSync(fileOf(b.src))).map((b) => `${b.id} → ${b.src}`);

  expect(missing).toEqual([]);
  // Guard against the registry being emptied by accident.
  expect(DISCORD_BADGES.length).toBeGreaterThan(100);
});

it("gives every badge an id, a name, a description and a declared group", () => {
  for (const b of DISCORD_BADGES) {
    expect(typeof b.id).toBe("string");
    expect(b.id.length).toBeGreaterThan(0);
    expect(b.name.length).toBeGreaterThan(0);
    expect(b.desc.length).toBeGreaterThan(0);
    expect(BADGE_GROUPS[b.group]).toBeTruthy();
    // The tint is what the monochrome style paints the art with.
    expect(b.tint).toMatch(/^#[0-9a-f]{6}$/i);
    expect(b.src.startsWith("/badges/discord/")).toBe(true);
  }
});

it("keys every badge exactly once", () => {
  const ids = DISCORD_BADGES.map((b) => b.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Object.keys(DISCORD_BADGE_MAP)).toHaveLength(ids.length);
  expect(DISCORD_BADGE_MAP.staff.id).toBe("staff");
});

it("keeps all four activity series, ten tiers each", () => {
  for (const series of ["game_variety", "game_time", "streaming", "account_age"]) {
    const tiers = DISCORD_BADGES.filter((b) => b.group === "activity" && b.id.startsWith(`${series}_`));
    expect(tiers).toHaveLength(10);
    for (const t of tiers) expect(fs.existsSync(fileOf(t.src))).toBe(true);
  }
});

/* The other direction: art that ships but nothing can reach is dead weight, and
   it is the first sign that a badge was renamed without its file recorded. */
it("leaves no badge file unreachable", () => {
  const dir = path.join(PUBLIC, "badges", "discord");
  const walk = (d, base = "") =>
    fs.readdirSync(d, { withFileTypes: true }).reduce(
      (acc, e) => acc.concat(e.isDirectory() ? walk(path.join(d, e.name), `${base}${e.name}/`) : [`${base}${e.name}`]),
      []
    );

  const files = walk(dir);
  const reachable = new Set(DISCORD_BADGES.map((b) => b.src.replace("/badges/discord/", "")));

  expect(files.filter((f) => !reachable.has(f))).toEqual([]);
  expect(files.length).toBeGreaterThan(100);
});

it("covers every family the two badge sets carry", () => {
  const groups = new Set(DISCORD_BADGES.map((b) => b.group));
  for (const name of ["core", "boosts", "activity", "gifting", "subscriptions", "server", "special", "guilds"]) {
    expect(groups.has(name)).toBe(true);
  }
});

/* Our own badges are the ones already handed out, so their appearance may change
   but their ids may not, and each one has to resolve to a real picture. */
it("points every swats.bio badge at real art", () => {
  const missing = BADGE_CATALOG.filter((b) => {
    const src = BADGE_META[b.id]?.art?.src;
    return !src || !fs.existsSync(fileOf(src));
  }).map((b) => `${b.id} → ${BADGE_META[b.id]?.art?.src}`);

  expect(missing).toEqual([]);
});

it("still resolves the badge ids profiles already carry", () => {
  const issued = ["og", "verified", "bug_hunter", "team", "owner", "admin", "media", "featured", "booster", "premium", "donater", "partner"];
  const missing = issued.filter((id) => {
    const src = BADGE_META[id]?.art?.src;
    return !src || !fs.existsSync(fileOf(src));
  });
  expect(missing).toEqual([]);
  // `donator` is the same badge under the spelling some profiles carry.
  expect(BADGE_META.donator.art.src).toBe(BADGE_META.donater.art.src);
});

it("hands out every Discord badge with a picture and a group", () => {
  for (const b of DISCORD_BADGE_CATALOG) {
    expect(b.name.length).toBeGreaterThan(0);
    expect(BADGE_META[b.id]?.art?.src).toBeTruthy();
  }
  expect(DISCORD_BADGE_CATALOG).toHaveLength(DISCORD_BADGES.length);
});

/* ── And no picture may bring a background with it ────────────────────────────

   A badge is drawn straight onto the card, so an image that is opaque edge to
   edge shows up as a rectangle with a badge somewhere inside it. That is not a
   hypothetical: the source set's `fame/` folder was four screenshots of a
   Discord panel — title bar, table, backdrop in every pixel — and every one of
   them drew exactly that rectangle. They are gone from the registry, and this
   check is what keeps the next one from arriving unnoticed: raster art has to
   carry a real alpha channel AND leave its corners transparent.

   SVGs are skipped on purpose. They are vector; there is no such thing as a
   baked-in backdrop in one. */

const BADGE_DIR = path.join(PUBLIC, "badges");

const filesUnder = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce(
    (acc, e) => acc.concat(e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]),
    []
  );

// Most of the set is SVG, so only the rasters need asking about a backdrop.
const rasterFilesUnder = (dir) => filesUnder(dir).filter((f) => /\.(png|gif)$/i.test(f));

/* Enough of a PNG decoder to read four corners: parse the chunks, inflate the
   image data, reverse the per-scanline filters, then ask for alpha. */
const decodePng = (buf) => {
  let off = 8;
  const idat = [];
  const palette = [];
  const trns = [];
  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;

  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      for (let i = 0; i < data.length; i += 3) palette.push(1);
    } else if (type === "tRNS") {
      for (let i = 0; i < data.length; i++) trns.push(data[i]);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }

  // Nothing we do not handle is silently skipped: the caller reports it.
  if (depth !== 8 || interlace) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) return null;

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    for (let x = 0; x < stride; x++) {
      const byte = raw[pos + x];
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let v;
      if (filter === 0) v = byte;
      else if (filter === 1) v = byte + a;
      else if (filter === 2) v = byte + b;
      else if (filter === 3) v = byte + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = byte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      pixels[y * stride + x] = v & 0xff;
    }
    pos += stride;
  }

  const alpha = (x, y) => {
    const i = y * stride + x * channels;
    if (colorType === 6) return pixels[i + 3];
    if (colorType === 4) return pixels[i + 1];
    if (colorType === 3) return trns[pixels[i]] ?? 255;
    return 255;
  };

  /* The clearest alpha in a small patch at each corner. Art with rounded corners
     is antialiased exactly there, so the single corner pixel can be half opaque
     on a badge that is otherwise perfectly transparent. */
  const corner = (x0, y0) => {
    let best = 255;
    for (let y = y0; y < Math.min(y0 + 4, height); y++) {
      for (let x = x0; x < Math.min(x0 + 4, width); x++) best = Math.min(best, alpha(x, y));
    }
    return best;
  };

  return [corner(0, 0), corner(width - 4, 0), corner(0, height - 4), corner(width - 4, height - 4)];
};

// A GIF can only be drawn without a backdrop if a frame declares a transparent
// colour index; there is no cheaper way to ask, and without one it is opaque.
const gifHasTransparency = (buf) => {
  const flags = buf[10];
  let off = 13;
  if (flags & 0x80) off += 3 * (1 << ((flags & 7) + 1));
  while (off < buf.length) {
    const block = buf[off];
    if (block === 0x21) {
      if (buf[off + 1] === 0xf9 && (buf[off + 3] & 1)) return true;
      off += 2;
      while (off < buf.length && buf[off] !== 0) off += buf[off] + 1;
      off += 1;
    } else if (block === 0x2c) {
      const local = buf[off + 9];
      off += 10;
      if (local & 0x80) off += 3 * (1 << ((local & 7) + 1));
      off += 1;
      while (off < buf.length && buf[off] !== 0) off += buf[off] + 1;
      off += 1;
    } else {
      return false;
    }
  }
  return false;
};

it("never ships badge art with its own background", () => {
  const files = rasterFilesUnder(BADGE_DIR);
  const bad = [];
  const unreadable = [];

  for (const file of files) {
    const buf = fs.readFileSync(file);
    const rel = path.relative(BADGE_DIR, file).split(path.sep).join("/");

    if (/\.gif$/i.test(file)) {
      if (!gifHasTransparency(buf)) bad.push(`${rel} → no transparent index`);
      continue;
    }

    const corners = decodePng(buf);
    if (!corners) {
      unreadable.push(rel);
      continue;
    }
    if (corners.some((a) => a > 39)) bad.push(`${rel} → corner alpha ${corners.join("/")}`);
  }

  // Every raster file has to be one this check could read, so a new encoding
  // shows up as a failure rather than as a silent pass.
  expect({ unreadable, opaque: bad }).toEqual({ unreadable: [], opaque: [] });
  // Guard against the set being emptied (or the walk breaking) by accident.
  expect(files.length).toBeGreaterThan(20);
  expect(filesUnder(BADGE_DIR).length).toBeGreaterThan(100);
});
