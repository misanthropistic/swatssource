import { createRoot } from "react-dom/client";
import { act } from "react";

import { FAQ } from "./FAQ";

/* The FAQ used to be a two-column band with a sticky intro and a search box.
   Six questions do not need a search field, so the section was simplified and
   the box removed; these tests keep both decisions. */

global.IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: true, // reduced motion: animations resolve without waiting
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

const mount = () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(<FAQ />));
  return {
    el,
    cleanup: () => {
      act(() => root.unmount());
      el.remove();
    },
  };
};

const click = (node) => act(() => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));

it("has no search box and lists every question", () => {
  const { el, cleanup } = mount();

  expect(el.querySelector('[data-testid="faq-accordion-section"]')).toBeTruthy();
  expect(el.querySelector("input")).toBeNull();
  expect(el.textContent).not.toContain("Search questions");
  expect(el.textContent).not.toContain("No questions found");
  expect(el.querySelectorAll('[data-testid^="faq-item-"]')).toHaveLength(6);
  // The first question starts open so the section is never a wall of shuts.
  expect(el.querySelector('[data-testid="faq-item-0"]').textContent).toContain("bio-link engine");

  cleanup();
});

it("opens the question you click", async () => {
  const { el, cleanup } = mount();

  const items = [...el.querySelectorAll('[data-testid^="faq-item-"]')];
  click(items[2].querySelector("button"));

  expect(el.querySelector('[data-testid="faq-item-2"]').textContent).toContain("Discord server cards");

  // The first one is closing, not gone: AnimatePresence keeps the node until the
  // exit transition has played, so let it finish before asserting.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  expect(el.querySelector('[data-testid="faq-item-0"]').textContent).not.toContain("bio-link engine");

  cleanup();
});
