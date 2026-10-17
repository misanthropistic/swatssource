export const CROSSHAIR_MAX_BYTES = 1024 * 1024;
export const CROSSHAIR_ACCEPT = "image/png,image/webp,image/gif,image/jpeg";
export const CROSSHAIR_SCALE_MIN = 0.4;
export const CROSSHAIR_SCALE_MAX = 2.5;
export const CROSSHAIR_CURSOR_LIMIT = 128;

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

export const crosshairSettings = (profile = {}) => {
  const scale = Number(profile.crosshair_scale);
  const x = Number(profile.crosshair_x);
  const y = Number(profile.crosshair_y);
  return {
    image: profile.crosshair_image || profile.cursor_image || "",
    scale: Number.isFinite(scale) ? clamp(scale, CROSSHAIR_SCALE_MIN, CROSSHAIR_SCALE_MAX) : 1,
    x: Number.isFinite(x) ? clamp(x, 0, CROSSHAIR_CURSOR_LIMIT - 1) : 0,
    y: Number.isFinite(y) ? clamp(y, 0, CROSSHAIR_CURSOR_LIMIT - 1) : 0,
  };
};

export function validateCrosshairFile(file) {
  if (!file) return "Choose an image file.";
  const type = String(file.type || "").toLowerCase();
  if (!/^image\/(png|webp|gif|jpeg|jpg)$/.test(type)) {
    return "Crosshair images must be PNG, WEBP, GIF or JPEG.";
  }
  if (file.size > CROSSHAIR_MAX_BYTES) {
    return "Crosshair images must be 1MB or smaller.";
  }
  return null;
}

export function scaledCrosshairSize(naturalWidth, naturalHeight, scale) {
  const s = clamp(scale, CROSSHAIR_SCALE_MIN, CROSSHAIR_SCALE_MAX);
  const w = Math.round(clamp((naturalWidth || 32) * s, 8, CROSSHAIR_CURSOR_LIMIT));
  const h = Math.round(clamp((naturalHeight || 32) * s, 8, CROSSHAIR_CURSOR_LIMIT));
  return { width: w, height: h };
}

export function buildCrosshairCursor(src, settings = {}) {
  const { scale = 1, x = 0, y = 0 } = settings;
  const fallback = { value: `url("${src}") ${clamp(x, 0, 63)} ${clamp(y, 0, 63)}, auto`, width: null, height: null };
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !src) return resolve(null);
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const { width, height } = scaledCrosshairSize(img.naturalWidth, img.naturalHeight, scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(fallback);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, width, height);
        const data = canvas.toDataURL("image/png");
        resolve({
          value: `url("${data}") ${clamp(x, 0, width - 1)} ${clamp(y, 0, height - 1)}, auto`,
          width,
          height,
        });
      } catch {
        resolve(fallback);
      }
    };
    img.onerror = () => resolve(fallback);
    img.src = src;
  });
}
