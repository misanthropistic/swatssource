import { createRoot } from "react-dom/client";
import { act } from "react";
import { FxTile } from "./FxTile";

global.IS_REACT_ACT_ENVIRONMENT = true;

/* The box at the top of every picker tile: the effect, drawn in miniature, on
   the thing that effect is for. These pin the three things the store depends on
   — that an effect is drawn in its own tile, that None draws nothing, and that a
   tile mounts its effect only while it is on screen. */

let container;
let root;

const draw = (props) => {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root.render(<FxTile {...props} />));
  return container.firstElementChild;
};

afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  container = undefined;
  root = undefined;
  delete global.IntersectionObserver;
});

it("draws the sample wearing the tile's own effect", () => {
  const tile = draw({ variant: "text", id: "rainbow" });

  expect(tile.className).toBe("ov-tile-preview");
  const word = tile.querySelector(".ov-tile-word");
  expect(word.textContent).toBe("swats");
  expect(word.className).toContain("fx-text-rainbow");
});

it("draws the plain sample for None", () => {
  const tile = draw({ variant: "text", id: "" });

  expect(tile.querySelector(".ov-tile-word").className).not.toContain("fx-text-");
  // The sample is still there: "None" means the card without the effect, not an
  // empty box.
  expect(tile.querySelector(".ov-tile-word").textContent).toBe("swats");
});

it("mounts a tile's effect only while the tile is on screen", () => {
  // A stub the test can drive by hand, standing in for the real observer.
  let notify;
  global.IntersectionObserver = class {
    constructor(cb) {
      notify = cb;
    }
    observe() {}
    disconnect() {}
  };

  const tile = draw({ variant: "cursor", id: "spotlight" });
  expect(tile.querySelector(".fx-cursor-spotlight")).toBeTruthy();

  // Scrolled out of view: the box stays, the animation goes.
  act(() => notify([{ isIntersecting: false }]));
  expect(tile.querySelector(".fx-cursor-spotlight")).toBeFalsy();

  // …and comes back when it scrolls in again.
  act(() => notify([{ isIntersecting: true }]));
  expect(tile.querySelector(".fx-cursor-spotlight")).toBeTruthy();
});

it("draws each family in the miniature it belongs to", () => {
  // Background and overlay sit on a miniature of the card.
  const bg = draw({ variant: "bg", id: "snow-v1" });
  expect(bg.querySelector("canvas")).toBeTruthy();
  expect(bg.querySelector(".ov-tile-card")).toBeTruthy();

  expect(draw({ variant: "overlay", id: "grain" }).querySelector("canvas")).toBeTruthy();

  // A decoration is layered over the avatar circle, and the picture it is drawn
  // over comes from the profile.
  const avatar = draw({ variant: "avatar", id: "swats_shine", avatarUrl: "https://cdn.example/a.png" });
  expect(avatar.querySelector(".fx-ov-swats_shine")).toBeTruthy();
  expect(avatar.querySelector(".ov-tile-avatar-pic").style.backgroundImage).toContain("cdn.example");

  // The cursor-buddy tile family is gone with the pets — nothing renders for
  // it even if a tile somehow asks.
  expect(draw({ variant: "pet", id: "cat" }).querySelector("[data-pet]")).toBeFalsy();
});
