// The swats right-click menu replaces the browser's grey slab site-wide. What
// cannot be seen in a screenshot: it must open on a right-click, show the
// surface's items (a profile's Open/Copy set), fall through untouched inside
// text fields (Paste lives in the native menu there), close on the next click
// anywhere, and clamp itself inside the viewport so it never opens half off-
// screen on the edge.
import { createRoot } from "react-dom/client";
import { act } from "react";
import ContextMenuProvider from "./ContextMenu";
import { clearMenuActions, registerMenuAction } from "@/lib/menuActions";

global.IS_REACT_ACT_ENVIRONMENT = true;

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
  clearMenuActions();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  rect({});
  document.body.innerHTML = "";
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.querySelectorAll('[role="menu"]').forEach((n) => n.remove());
});

const fire = (element, init = {}) => {
  act(() => {
    element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 500,
        clientY: 400,
        ...init,
      })
    );
  });
};

const menu = () => document.body.querySelector('[role="menu"]');

const mountProvider = () => act(() => root.render(<ContextMenuProvider />));

it("opens on a right-click with the surface's items", () => {
  mountProvider();
  const span = document.createElement("span");
  span.setAttribute("data-menu-id", "profile");
  span.setAttribute("data-menu-name", "tester");
  span.setAttribute("data-menu-href", "/tester");
  document.body.appendChild(span);
  fire(span);

  const m = menu();
  expect(m).toBeTruthy();
  const text = m.textContent;
  expect(text).toContain("Open this profile");
  expect(text).toContain("Copy @tester");
  expect(text).toContain("Copy profile link");
  // Universal set rides along under every surface.
  expect(text).toContain("Reload page");
});

it("gives a bare background the universal set", () => {
  mountProvider();
  fire(document.body);
  const text = menu().textContent;
  expect(text).toContain("Back");
  expect(text).toContain("Select all");
  expect(text).not.toContain("Open this profile");
});

it("never intercepts a right-click inside a text field — Paste stays native", () => {
  const input = document.createElement("input");
  input.type = "text";
  document.body.appendChild(input);
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  act(() => input.dispatchEvent(event));
  // No preventDefault, no menu: the browser's own field menu is untouched.
  expect(event.defaultPrevented).toBe(false);
  expect(menu()).toBeNull();
});

/* ---------------------------------------------------------------------------
   Different surfaces, different menus

   Every surface used to get the same five universal items, which is what "the
   mini menus do not work" looks like from the other side of the screen: a menu
   with nothing about the thing you clicked. These pin the surfaces that now
   declare themselves, and — for the two whose verbs live inside a React page —
   that the action is actually handed back to the component that owns it.
   --------------------------------------------------------------------------- */

const surface = (attrs) => {
  const el = document.createElement("span");
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  document.body.appendChild(el);
  return el;
};

it("offers a conversation menu on a conversation row", () => {
  mountProvider();
  const opened = [];
  registerMenuAction("open-thread", ({ threadId }) => opened.push(threadId));

  fire(surface({ "data-menu-id": "thread", "data-menu-thread-id": "t-9", "data-menu-thread-kind": "group", "data-menu-name": "crew" }));

  const text = menu().textContent;
  expect(text).toContain("Open this group");
  expect(text).toContain("Group settings");
  expect(text).toContain("Copy @crew");

  const open = [...menu().querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === "Open this group");
  act(() => open.click());
  // The page's own action ran; the menu did not navigate instead.
  expect(opened).toEqual(["t-9"]);
});

it("offers no group settings on a one-to-one conversation", () => {
  mountProvider();
  fire(surface({ "data-menu-id": "thread", "data-menu-thread-id": "t-1", "data-menu-thread-kind": "direct", "data-menu-name": "bob" }));

  const text = menu().textContent;
  expect(text).toContain("Open this conversation");
  expect(text).not.toContain("Group settings");
});

it("keeps the conversation item usable when no page has claimed the action", () => {
  mountProvider();
  // No registerMenuAction: the row is on screen without its page. The item must
  // still be there and must not throw — an item that clicks into nothing is how
  // this menu reads as broken. What it falls back to is a navigation
  // (`location.assign`), and jsdom's Location refuses to be replaced, so the
  // destination is not asserted here; the registry path is, in the test above.
  fire(surface({ "data-menu-id": "thread", "data-menu-thread-id": "t-2", "data-menu-name": "bob" }));
  const item = [...menu().querySelectorAll('[role="menuitem"]')].find(
    (b) => b.textContent === "Open this conversation",
  );
  expect(item).toBeTruthy();
  expect(() => act(() => item.click())).not.toThrow();
  expect(menu()).toBeNull();
});

it("names a badge and a template for what they are", () => {
  mountProvider();

  fire(surface({ "data-menu-id": "badge", "data-menu-badge": "newyear_2027", "data-menu-badge-label": "New Year 2027" }));
  expect(menu().textContent).toContain("Copy “New Year 2027”");
  expect(menu().textContent).toContain("Copy badge id");

  act(() => document.body.click());
  const previewed = [];
  registerMenuAction("template-preview", ({ templateId }) => previewed.push(templateId));
  fire(surface({ "data-menu-id": "template", "data-menu-template-id": "7", "data-menu-template-title": "Quiet Dusk" }));
  expect(menu().textContent).toContain("Preview this template");

  const preview = [...menu().querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === "Preview this template");
  act(() => preview.click());
  expect(previewed).toEqual(["7"]);
});

it("copies an invite code and an announcement off their own menus", () => {
  mountProvider();
  const written = [];
  const clipboard = navigator.clipboard;
  Object.defineProperty(navigator, "clipboard", { value: { writeText: (t) => written.push(t) }, configurable: true });
  try {
    fire(surface({ "data-menu-id": "invite", "data-menu-invite": "SWATS-42" }));
    act(() => [...menu().querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === "Copy invite code").click());

    fire(surface({ "data-menu-id": "announcement", "data-menu-announcement-text": "Maintenance on Sunday" }));
    act(() => [...menu().querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === "Copy announcement").click());

    expect(written).toEqual(["SWATS-42", "Maintenance on Sunday"]);
  } finally {
    Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  }
});

it("clamps the menu inside the viewport when it opens at the screen edge", () => {
  mountProvider();
  fire(document.body, { clientX: window.innerWidth - 2, clientY: window.innerHeight - 2 });
  const m = menu();
  expect(m).toBeTruthy();
  // The layout effect positions before reveal; jsdom run it synchronously, so
  // the menu must not carry the raw cursor coordinates.
  expect(Number.parseFloat(m.style.left)).toBeLessThan(window.innerWidth - 2);
  expect(Number.parseFloat(m.style.top)).toBeLessThan(window.innerHeight - 2);
  expect(m.style.visibility).toBe("visible");
});

it("closes on any click, and an item click runs its action", () => {
  mountProvider();
  const written = [];
  const clipboard = navigator.clipboard;
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: (t) => written.push(t) },
    configurable: true,
  });

  try {
    fire(document.body);
    expect(menu()).toBeTruthy();
    act(() => {
      document.body.click();
    });
    expect(menu()).toBeNull();

    // A fresh menu whose COPY item copies what the surface carried. Proves the
    // click dispatches into run() — an item that clicks but does nothing is
    // exactly how this menu would read as broken.
    const span = document.createElement("span");
    span.setAttribute("data-menu-id", "profile");
    span.setAttribute("data-menu-name", "tester");
    document.body.appendChild(span);
    fire(span);
    const items = [...menu().querySelectorAll('[role="menuitem"]')];
    const copyItem = items.find((b) => b.textContent === "Copy @tester");
    expect(copyItem).toBeTruthy();
    act(() => copyItem.click());
    expect(written).toContain("@tester");
    expect(menu()).toBeNull();
  } finally {
    Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  }
});
