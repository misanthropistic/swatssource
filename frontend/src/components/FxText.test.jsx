import { act } from "react";
import { createRoot } from "react-dom/client";
import { FxText } from "./FxText";

/* The two text effects whose JavaScript half was doing the wrong thing:
 *
 *  - morph swapped the owner's text for invented words ("phantom", "spirit",
 *    "nobody"). On a profile that text is the display name, so the effect was
 *    renaming people.
 *  - reactive read every letter's box on every pointer move, which is a forced
 *    layout per letter per event — the effect lagged behind the cursor.
 *
 * Everything about the catalogue itself is pinned in effects.test.js; this file
 * only covers what the runtime does to the element.
 */

global.IS_REACT_ACT_ENVIRONMENT = true;

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

let container;
let root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (props) => act(() => root.render(<FxText {...props} />));

it("morphs the look, never the words", async () => {
  render({ id: "morph", text: "veskx" });

  const host = container.querySelector("[data-fx-text]");
  expect(host.textContent).toBe("veskx");
  // The cycle really is running: the first step blurs the text out...
  expect(host.style.filter).toBe("blur(9px)");

  // ...and it resolves back into the SAME text, not into somebody else's word.
  await settle(500);
  expect(host.style.filter).toBe("");
  expect(host.textContent).toBe("veskx");
  for (const invented of ["phantom", "spirit", "nobody"]) {
    expect(host.textContent).not.toContain(invented);
  }
});

it("reactive measures the letters once instead of on every pointer move", async () => {
  const measured = [];
  const realRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function spy() {
    if (this.tagName === "SPAN") measured.push(this.textContent);
    return realRect.call(this);
  };

  try {
    render({ id: "reactive", text: "abc" });
    await settle();
    const afterRender = measured.length;
    // One measure per letter when the effect starts.
    expect(afterRender).toBeGreaterThanOrEqual(3);

    act(() => {
      for (let i = 0; i < 25; i += 1) {
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: i * 8, clientY: 20 }));
      }
    });
    await settle(60);

    // The letters did not move, so 25 pointer moves must not add 25 more
    // measurements — the letters were positioned from the cached boxes.
    expect(measured.length).toBe(afterRender);
    expect(container.querySelector("[data-fx-text]").children.length).toBe(3);
  } finally {
    Element.prototype.getBoundingClientRect = realRect;
  }
});
