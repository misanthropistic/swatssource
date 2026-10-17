/* lib/appearance — pinned below the visible surface. A test cannot click a
   corner radius, so the contract is exactly what each preset writes into
   --sw-radius, and what an empty or unknown stored value falls back to. */
import { ROUNDING_OPTIONS, loadRounding, applyRounding, ROUNDING_DEFAULT } from "@/lib/appearance";

describe("the rounding preference", () => {
  const original = window.localStorage;
  const store = new Map();

  beforeEach(() => {
    store.clear();
    // jsdom's localStorage is replaced with a Map-backed stand-in so tests do
    // not leak choices into each other.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
      },
    });
    document.documentElement.style.removeProperty("--sw-radius");
  });

  afterAll(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: original });
  });

  it("defaults to the site's own 1rem when nothing was chosen", () => {
    expect(loadRounding()).toBe("default");
    expect(applyRounding().css).toBe("1rem");
  });

  it("writes each preset's exact value into --sw-radius", () => {
    for (const preset of ROUNDING_OPTIONS) {
      window.localStorage.setItem("swats_rounding", preset.value);
      expect(applyRounding().css).toBe(preset.css);
      expect(document.documentElement.style.getPropertyValue("--sw-radius")).toBe(preset.css);
    }
  });

  it("ignores a stale or corrupted stored choice", () => {
    window.localStorage.setItem("swats_rounding", "super-round-1998");
    expect(loadRounding()).toBe("default");
    expect(applyRounding().css).toBe("1rem");
  });
});
