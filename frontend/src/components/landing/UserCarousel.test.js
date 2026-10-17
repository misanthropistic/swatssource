import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { UserCarousel } from "./UserCarousel";

global.IS_REACT_ACT_ENVIRONMENT = true;

// The marquee measures the DOM; jsdom has no layout, so render through it.
jest.mock("react-fast-marquee", () => ({ __esModule: true, default: ({ children }) => <div>{children}</div> }));

let feed = [];
jest.mock("@/lib/api", () => ({
  api: { get: () => Promise.resolve({ data: global.__SHOWCASE__ }) },
  fileUrl: (u) => u || "",
}));

let container;
let root;

beforeEach(() => {
  global.__SHOWCASE__ = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = () => act(() => root.render(<MemoryRouter><UserCarousel /></MemoryRouter>));

it("holds its space with placeholders while the feed loads", () => {
  render();
  // The section must exist during loading: it used to render null and leave a hole
  // in the middle of the landing page, which read as a half-empty page.
  expect(container.querySelector('[data-testid="infinite-user-carousel"]')).toBeTruthy();
  expect(container.querySelectorAll('[data-testid^="showcase-card-"]').length).toBe(0);
});

it("says so honestly when nobody is featured yet, instead of inventing people", async () => {
  render();
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });

  expect(container.querySelector('[data-testid="infinite-user-carousel"]')).toBeTruthy();
  expect(container.textContent).toContain("Nobody has been featured yet");
  expect(container.querySelectorAll('[data-testid^="showcase-card-"]').length).toBe(0);
});

it("renders only real accounts when the feed has them", async () => {
  global.__SHOWCASE__ = [
    { id: "7", username: "realperson", display_name: "Real Person", avatar: "/logo.png", verified: true },
  ];
  render();
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });

  const cards = container.querySelectorAll('[data-testid^="showcase-card-"]');
  expect(cards.length).toBeGreaterThan(0);
  expect(container.textContent).toContain("realperson");
});
