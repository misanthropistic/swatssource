// Tooltips are opt-out per kind (badges, links, the avatar UID) and wear ONE
// look and ONE entrance, both picked on the Editor's tooltip panel. These tests
// pin the three lookups, the switches, the three looks and the viewport
// placement, because "the tooltips do nothing" is exactly how a broken hover
// target reads to an owner.
//
// Tips appear on a short show delay (~150ms, the anti-flicker gate — a moving
// cursor grazing a card must not flash a bubble), so every hover here waits for
// the delay to elapse before asserting. The "off"/hidden branches still assert
// synchronously: cancel() is immediate, no settling required.
import fs from "fs";
import path from "path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ProfilePreview } from "./ProfilePreview";
import { HoverTip, TOOLTIP_STYLES, TOOLTIP_ANIMATIONS, TOOLTIP_SIZES, resolveTooltipStyle } from "./FxTooltip";

global.IS_REACT_ACT_ENVIRONMENT = true;

const data = (profile = {}) => ({
  username: "tester",
  display_name: "Tester",
  uid_number: 42,
  views: 12,
  badges: ["verified"],
  profile: {
    bio: "hello",
    links: [{ platform: "discord", label: "Discord", url: "https://example.com", tooltip: "join us" }],
    widgets: [],
    tracks: [],
    ...profile,
  },
});

let container;
let root;

const rect = (r) => {
  Element.prototype.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0,
    toJSON: () => ({}),
    ...r,
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  rect({}); // jsdom reports a zero-sized rect unless a test changes it
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.querySelectorAll('[role="tooltip"]').forEach((n) => n.remove());
});

const render = (profile) => act(() => root.render(<ProfilePreview data={data(profile)} />));

const mouse = (el, type, init = {}) =>
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
  });

// A tip only opens for a pointer that has actually moved since it mounted: a
// hover the browser synthesises for whatever sits under a resting cursor when
// the card lays out must not pop one. Every hover here therefore starts with a
// real move, exactly like a visitor arriving with the mouse.
const movePointer = () =>
  act(() => {
    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
  });

// Past the show delay, inside act so React flushes the visibility setState.
const settle = async (ms = 200) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const tip = () => document.body.querySelector('[role="tooltip"]');
const tipText = () => tip()?.textContent ?? "";

const hoverBadge = async () => {
  movePointer();
  const badge = container.querySelector('[data-badge="verified"]');
  expect(badge).toBeTruthy();
  mouse(badge, "mouseover", { relatedTarget: document.body });
  await settle();
  return badge;
};

const hoverLink = async () => {
  movePointer();
  const link = container.querySelector('a[href="https://example.com"]');
  expect(link).toBeTruthy();
  mouse(link, "mouseover", { relatedTarget: document.body });
  await settle();
  return link;
};

const hoverAvatar = async () => {
  movePointer();
  const avatar = container.querySelector('[style*="cursor: help"]');
  expect(avatar).toBeTruthy();
  mouse(avatar, "mouseover", { relatedTarget: document.body });
  mouse(avatar, "mousemove", { clientX: 60, clientY: 90 });
  await settle();
  return avatar;
};

it("shows the badge name on hover, and stops when the switch is off", async () => {
  await render();
  await hoverBadge();
  expect(tipText()).toContain("VERIFIED");

  act(() => root.unmount());
  document.querySelectorAll('[role="tooltip"]').forEach((n) => n.remove());
  root = createRoot(container);
  await render({ badge_tooltips: false });
  await hoverBadge();
  expect(tip()).toBeNull();
});

it("shows the note typed on a link, and stops when the switch is off", async () => {
  await render();
  await hoverLink();
  expect(tipText()).toContain("join us");

  act(() => root.unmount());
  document.querySelectorAll('[role="tooltip"]').forEach((n) => n.remove());
  root = createRoot(container);
  await render({ link_tooltips: false });
  const link = await hoverLink();
  // Switched off means switched off: no bubble, and no fallback title either.
  expect(tip()).toBeNull();
  expect(link.getAttribute("title")).toBeNull();
});

// An icon-only link has no room for a description on the card, and a folded
// description is hidden until hover — both used to show a bare native browser
// title (or nothing) instead of the styled tip, which is what read as "link
// tooltips don't work".
it("falls back to the link's description where the card cannot show it", async () => {
  await render({
    links: [{ platform: "discord", label: "Discord", url: "https://example.com", mode: "icon", desc: "our community" }],
  });
  await hoverLink();
  expect(tipText()).toContain("our community");

  act(() => root.unmount());
  document.querySelectorAll('[role="tooltip"]').forEach((n) => n.remove());
  root = createRoot(container);
  await render({
    links: [{ platform: "discord", label: "Discord", url: "https://example.com", mode: "icon", desc: "our community" }],
    link_tooltips: false,
  });
  await hoverLink();
  // Switched off means no styled bubble; the browser's own title is all that is
  // left, which is the documented behaviour of the switch.
  expect(tip()).toBeNull();
});

it("shows the UID above the cursor on the avatar, and stops when the switch is off", async () => {
  await render();
  await hoverAvatar();
  expect(tipText()).toContain("UID #42");

  act(() => root.unmount());
  document.querySelectorAll('[role="tooltip"]').forEach((n) => n.remove());
  root = createRoot(container);
  await render({ avatar_uid_tooltip: false });
  const avatar = container.querySelector('[style*="cursor: help"]');
  expect(avatar).toBeNull();
  expect(tip()).toBeNull();
});

it("offers three looks and renders a different bubble for each", async () => {
  expect(TOOLTIP_STYLES.map((s) => s.id)).toEqual(["classic", "glass", "ice"]);
  const looks = new Set();
  for (const style of ["classic", "glass", "ice"]) {
    act(() => root.unmount());
    document.querySelectorAll('[role="tooltip"]').forEach((n) => n.remove());
    root = createRoot(container);
    await render({ tooltip_style: style });
    await hoverBadge();
    expect(tipText()).toContain("VERIFIED");
    looks.add(tip().innerHTML);
  }
  expect(looks.size).toBe(3);
});

it("draws classic as a plain black bubble", async () => {
  await render({ tooltip_style: "classic" });
  await hoverBadge();
  const bubble = tip().firstElementChild;
  // Black fill, the label, and none of the dressing the other two looks carry.
  expect(bubble.className).toContain("bg-black");
  expect(bubble.className).not.toContain("border");
  expect(bubble.className).not.toContain("backdrop-blur");
  expect(bubble.textContent).toBe("VERIFIED");
});

// The look is one setting for the whole profile, so the old per-tip ids still
// resolve rather than leaving an old card with an unstyled bubble.
it("resolves the per-tip style ids an older profile still carries", () => {
  expect(resolveTooltipStyle(undefined)).toBe("classic");
  for (const legacy of ["normal", "basic", "mini"]) expect(resolveTooltipStyle(legacy)).toBe("classic");
  expect(resolveTooltipStyle("glass")).toBe("glass");
  // The global setting wins over whatever the tip carries from before.
  expect(resolveTooltipStyle("ice", "glass")).toBe("ice");
  expect(resolveTooltipStyle("nonsense", "glass")).toBe("glass");
});

it("gives every tip the entrance the profile picked", async () => {
  const entrance = async (anim) => {
    act(() => root.unmount());
    document.querySelectorAll('[role="tooltip"]').forEach((n) => n.remove());
    root = createRoot(container);
    await render({ tooltip_anim: anim });
    await hoverBadge();
    return tip().firstElementChild.className;
  };

  expect(TOOLTIP_ANIMATIONS.map((a) => a.id)).toEqual(["slide", "fade", "none"]);
  // The tip's own keyframes (components/tooltips.css), not the shared
  // animate-in bundle another plugin can redefine.
  expect(await entrance("slide")).toContain("tip-in-slide");
  const fade = await entrance("fade");
  expect(fade).toContain("tip-in-fade");
  expect(fade).not.toContain("tip-in-slide");
  expect(await entrance("none")).not.toContain("tip-in-");
});

// Laying a card out under a resting cursor makes the browser report a hover
// nobody performed. That is the tip that used to appear the moment a profile
// finished loading, so it is gated on real pointer movement — and a real move
// still opens it.
// The entrance is the tip's own, so no shared utility bundle or motion plugin
// can leave the bubble without an animation ("the animations don't work on
// tooltips").
it("keeps its own entrance keyframes", () => {
  const css = fs.readFileSync(path.join(__dirname, "tooltips.css"), "utf8");
  expect(css).toMatch(/@keyframes sw-tip-in/);
  expect(css).toMatch(/@keyframes sw-tip-fade/);
  expect(css).toMatch(/\.tip-in-slide\s*\{[^}]*animation:\s*sw-tip-in/);
  expect(css).toMatch(/\.tip-in-fade\s*\{[^}]*animation:\s*sw-tip-fade/);
});

it("ignores the hover a page gets from a cursor that never moved", async () => {
  await render();
  const badge = container.querySelector('[data-badge="verified"]');
  expect(badge).toBeTruthy();
  mouse(badge, "mouseover", { relatedTarget: document.body });
  await settle();
  expect(tip()).toBeNull();

  // Move off, move the pointer for real, come back: the tip opens.
  mouse(badge, "mouseout", { relatedTarget: document.body });
  mouse(badge, "mouseleave", { relatedTarget: document.body });
  await hoverBadge();
  expect(tipText()).toContain("VERIFIED");
});

it("scales the label with the tooltip size", async () => {
  const sizes = new Set();
  for (const size of TOOLTIP_SIZES.map((s) => s.id)) {
    act(() => root.unmount());
    document.querySelectorAll('[role="tooltip"]').forEach((n) => n.remove());
    root = createRoot(container);
    await render({ tooltip_style: "classic", tooltip_size: size });
    await hoverBadge();
    sizes.add(tip().innerHTML);
  }
  expect(sizes.size).toBe(3);
});

it("flips a tip below its anchor when there is no room above it", async () => {
  await render();
  // The badge sits at the very top of the window: a bubble translated upward
  // would be pushed off-screen, which is what made tips look like they never
  // appeared on a scrolled page.
  rect({ top: 4, height: 16, left: 200, width: 16 });
  await hoverBadge();
  expect(tip().style.transform).toContain("12px");

  rect({ top: 400, height: 16, left: 200, width: 16 });
  mouse(container.querySelector('[data-badge="verified"]'), "mouseleave");
  await hoverBadge();
  expect(tip().style.transform).toContain("-100%");
});

it("keeps a wrapper around its children even with the tip switched off", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const r = createRoot(el);
  act(() => r.render(<HoverTip label="">child</HoverTip>));
  expect(el.innerHTML).toContain("child");
  act(() => r.unmount());
  el.remove();
});
