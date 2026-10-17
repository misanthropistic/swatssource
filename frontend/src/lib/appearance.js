/* Appearance preferences that are this device's own business, not the
   account's: the corner radius of every card on the site.

   Everything else a person can tune lives in their profile; a rounding taste
   would be silly to sign in for, and localStorage is where the collapsed-
   sidebar state and the drag order already live. `applyRadius` writes the CSS
   variable the .glass cards consume, so one call is the whole feature. The
   picker in Settings reads and writes through these functions only. */

const KEY = "swats_rounding";

export const ROUNDING_DEFAULT = "default";

export const ROUNDING_OPTIONS = [
  { value: "sharp", label: "Sharp", css: "0.375rem" },
  { value: "soft", label: "Soft", css: "0.75rem" },
  { value: "default", label: "Default", css: "1rem" },
  { value: "round", label: "Round", css: "1.5rem" },
  { value: "pill", label: "Pill", css: "9999px" },
];

export function loadRounding() {
  try {
    const raw = localStorage.getItem(KEY);
    return ROUNDING_OPTIONS.some((o) => o.value === raw) ? raw : ROUNDING_DEFAULT;
  } catch {
    return ROUNDING_DEFAULT;
  }
}

/* Apply one of the named presets to the document. Returns what it applied so a
   test can assert on the substitution instead of the private key. */
export function applyRounding() {
  const value = loadRounding();
  const preset = ROUNDING_OPTIONS.find((o) => o.value === value) || ROUNDING_OPTIONS.find((o) => o.value === ROUNDING_DEFAULT);
  try {
    document.documentElement.style.setProperty("--sw-radius", preset.css);
  } catch {
    // No document (SSR / a test harness without DOM): nothing to apply to, and
    // the defaults in index.css are correct on their own.
  }
  return preset;
}
