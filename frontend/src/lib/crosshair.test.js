import {
  CROSSHAIR_MAX_BYTES,
  crosshairSettings,
  scaledCrosshairSize,
  validateCrosshairFile,
} from "./crosshair";

const file = (name, type, size) => ({ name, type, size });

describe("crosshair uploads", () => {
  it("accepts pictures and refuses everything else", () => {
    expect(validateCrosshairFile(file("a.png", "image/png", 1024))).toBeNull();
    expect(validateCrosshairFile(file("a.webp", "image/webp", 1024))).toBeNull();
    expect(validateCrosshairFile(file("a.gif", "image/gif", 1024))).toBeNull();
    expect(validateCrosshairFile(file("a.svg", "image/svg+xml", 1024))).toMatch(/PNG/);
    expect(validateCrosshairFile(file("a.exe", "application/octet-stream", 10))).toMatch(/PNG/);
    expect(validateCrosshairFile(null)).toMatch(/Choose/);
  });

  it("enforces the 1MB ceiling", () => {
    expect(validateCrosshairFile(file("a.png", "image/png", CROSSHAIR_MAX_BYTES))).toBeNull();
    expect(validateCrosshairFile(file("a.png", "image/png", CROSSHAIR_MAX_BYTES + 1))).toMatch(/1MB/);
  });
});

describe("crosshair settings", () => {
  it("reads the new fields and migrates the old cursor field", () => {
    expect(crosshairSettings({ crosshair_image: "/x.png", crosshair_scale: 2, crosshair_x: 10, crosshair_y: 12 })).toEqual({
      image: "/x.png",
      scale: 2,
      x: 10,
      y: 12,
    });
    expect(crosshairSettings({ cursor_image: "/old.png" })).toEqual({
      image: "/old.png",
      scale: 1,
      x: 0,
      y: 0,
    });
  });

  it("clamps scale and hotspot into the native cursor budget", () => {
    expect(crosshairSettings({ crosshair_scale: 99 }).scale).toBe(2.5);
    expect(crosshairSettings({ crosshair_scale: 0.01 }).scale).toBe(0.4);
    expect(crosshairSettings({ crosshair_x: 900 }).x).toBe(127);
    expect(crosshairSettings({ crosshair_y: -20 }).y).toBe(0);
    expect(crosshairSettings({}).image).toBe("");
  });

  it("never asks for a cursor larger than the browser will accept", () => {
    expect(scaledCrosshairSize(64, 64, 1)).toEqual({ width: 64, height: 64 });
    expect(scaledCrosshairSize(64, 64, 2.5)).toEqual({ width: 128, height: 128 });
    expect(scaledCrosshairSize(4, 4, 0.4)).toEqual({ width: 8, height: 8 });
    expect(scaledCrosshairSize(1000, 1000, 2.5)).toEqual({ width: 128, height: 128 });
  });
});
