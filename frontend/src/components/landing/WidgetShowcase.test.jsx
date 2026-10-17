import { createRoot } from "react-dom/client";
import { act } from "react";
import { WidgetShowcase } from "./WidgetShowcase";

global.IS_REACT_ACT_ENVIRONMENT = true;

if (!global.IntersectionObserver) {
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
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
}

jest.mock("@/components/WidgetCards", () => ({
  WidgetCard: ({ w, accent }) => (
    <div data-testid="real-widget-card" data-type={w.type} data-subtype={w.subtype || ""} data-accent={accent}>
      {w.type}
    </div>
  ),
}));

const mount = () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(<WidgetShowcase />));
  return {
    el,
    cleanup: () => {
      act(() => root.unmount());
      el.remove();
    },
  };
};

it("renders the real widget components instead of hand-built mock cards", () => {
  const { el, cleanup } = mount();

  const cards = el.querySelectorAll('[data-testid="real-widget-card"]');
  expect(cards).toHaveLength(5);
  expect([...cards].map((c) => c.getAttribute("data-type"))).toEqual([
    "spotify", "soundcloud", "tiktok", "discord", "discord",
  ]);
  expect([...cards].filter((c) => c.getAttribute("data-subtype") === "server")).toHaveLength(1);

  // The old band shipped a Spotify iframe, a SoundCloud iframe and static
  // "Open" buttons; none of those belong on a live widget.
  expect(el.querySelector("iframe")).toBeNull();
  expect(el.textContent).not.toContain("Open");
  for (const old of ["widget-spotify", "widget-soundcloud", "widget-tiktok", "widget-discord-user", "widget-discord-server"]) {
    expect(el.querySelector(`[data-testid="${old}"]`)).toBeNull();
  }

  cleanup();
});

it("tilts the cards with the pointer", () => {
  const { el, cleanup } = mount();

  const stage = el.querySelector('[data-testid="widget-showcase-grid"]');
  expect(stage.style.perspective).toBe("1100px");

  const card = el.querySelector('[data-testid="live-widget-spotify"]');
  expect(card).toBeTruthy();

  // Every card carries a resting 3D tilt, so the band reads as tilted even
  // before a pointer arrives (and on reduced-motion machines).
  const tilts = el.querySelectorAll('[data-testid^="tilt-"]');
  expect(tilts).toHaveLength(5);
  expect(tilts[0].getAttribute("style")).toContain("rotateX(12deg)");
  // The card itself is lifted off the tilted plane, which is what sells the depth.
  expect(tilts[0].querySelector('div[style*="translateZ(34px)"]')).toBeTruthy();

  cleanup();
});
