import { createRoot } from "react-dom/client";
import { act } from "react";

import { parseDevlogBlocks, renderDevlogBody } from "./devlogBody";

global.IS_REACT_ACT_ENVIRONMENT = true;

/* The devlog is written in a house style: a "# swats.bio devlog:" heading, then
   quoted lines that carry the point of the post. Before this, the feed printed
   the # and the > as literal characters. */

const render = (body) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(renderDevlogBody(body)));
  return {
    el,
    cleanup: () => {
      act(() => root.unmount());
      el.remove();
    },
  };
};

const BLOCKS = ['[data-devlog-block="heading"]', '[data-devlog-block="quote"]', '[data-devlog-block="list"]', '[data-devlog-block="paragraph"]'];

it("parses the constructs the devlog is written with", () => {
  const blocks = parseDevlogBlocks(
    [
      "# swats.bio devlog:",
      "",
      "> the part that matters",
      "> a second quoted line",
      "",
      "Normal words, **bold words** and `code`.",
      "",
      "- one",
      "- two",
      "",
      "1. first",
      "2. second",
    ].join("\n")
  );

  expect(blocks.map((b) => b.type)).toEqual(["heading", "quote", "paragraph", "list", "list"]);
  expect(blocks[0]).toMatchObject({ level: 1, lines: ["swats.bio devlog:"] });
  // Consecutive quote lines are one callout, not two.
  expect(blocks[1].lines).toEqual(["the part that matters", "a second quoted line"]);
  expect(blocks[4]).toMatchObject({ ordered: true, lines: ["first", "second"] });
});

it("renders the heading without the hash and the quote as a callout", () => {
  const { el, cleanup } = render("# swats.bio devlog:\n\n> shipped today");

  const heading = el.querySelector('[data-devlog-block="heading"]');
  expect(heading.tagName).toBe("H3");
  expect(heading.textContent).toBe("swats.bio devlog:");
  expect(el.textContent).not.toContain("#");

  const quote = el.querySelector('[data-devlog-block="quote"]');
  expect(quote.tagName).toBe("BLOCKQUOTE");
  expect(quote.textContent).toBe("shipped today");
  expect(el.textContent).not.toContain(">");

  cleanup();
});

it("keeps nested structure: a heading level, a plain paragraph and a list", () => {
  const { el, cleanup } = render("## What shipped\n\nA sentence.\n\n- rain\n- sparkles");

  expect(el.querySelectorAll('[data-devlog-block="heading"]')).toHaveLength(1);
  expect(el.querySelector('[data-devlog-block="heading"]').tagName).toBe("H3");
  expect(el.querySelector('[data-devlog-block="paragraph"]').textContent).toBe("A sentence.");
  expect(el.querySelectorAll('[data-devlog-block="list"] li')).toHaveLength(2);

  cleanup();
});

it("formats inline text and never injects markup", () => {
  const { el, cleanup } = render(
    'Bold **yes**, code `npm test`, a link https://swats.bio and <img src=x onerror=alert(1)>'
  );

  expect(el.querySelector("strong").textContent).toBe("yes");
  expect(el.querySelector("code").textContent).toBe("npm test");
  expect(el.querySelector("a").getAttribute("href")).toBe("https://swats.bio");
  // Unknown HTML arrives as text, and no element was created from it.
  expect(el.querySelector("img")).toBeNull();
  expect(el.textContent).toContain("<img src=x onerror=alert(1)>");

  cleanup();
});

it("leaves an empty or missing body alone", () => {
  expect(parseDevlogBlocks("")).toEqual([]);
  expect(parseDevlogBlocks(null)).toEqual([]);
  expect(parseDevlogBlocks("   \n\n  ")).toEqual([]);

  const { el, cleanup } = render("");
  expect(el.querySelectorAll(BLOCKS.join(","))).toHaveLength(0);
  cleanup();
});

it("does not eat a hash or arrow that is part of a sentence", () => {
  const { el, cleanup } = render("The count went 3 > 2 and issue #42 is fixed.");

  // A single paragraph, formatted as written — no phantom quote or heading.
  expect(el.querySelector('[data-devlog-block="quote"]')).toBeNull();
  expect(el.querySelector('[data-devlog-block="heading"]')).toBeNull();
  expect(el.querySelector('[data-devlog-block="paragraph"]').textContent).toBe(
    "The count went 3 > 2 and issue #42 is fixed."
  );

  cleanup();
});
