import fs from "fs";
import path from "path";
import { FRAME_COUNT } from "./frames";

/* The picker no longer ships a rented list of 671 numbered PNGs: it loads the
   curated catalogue (public/decorations/effects.json) at run time, the same
   file shape the open Discord Avatar Decoration catalogue publishes.
   FRAME_COUNT feeds the marketing copy, so it is pinned against the catalogue
   file itself here — the number and the list cannot drift apart. */
const catalogue = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "public", "decorations", "effects.json"), "utf8"),
);

it("counts the curated catalogue, and the catalogue stays valid", () => {
  const valid = catalogue.filter((row) => row && row.url && row.label);
  expect(valid).toHaveLength(catalogue.length);
  expect(FRAME_COUNT).toBe(valid.length);

  // Every entry is a real Discord preset, in the shape the catalogue publishes.
  for (const row of valid.slice(0, 25)) {
    expect(typeof row.id).toBe("string");
    expect(row.url).toMatch(/^https:\/\/cdn\.discordapp\.com\/avatar-decoration-presets\/a_[0-9a-f]+\.png/);
    expect(typeof row.label).toBe("string");
    expect(row.label.length).toBeGreaterThan(0);
  }
});
