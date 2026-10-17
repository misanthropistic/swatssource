import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import Explore from "./Explore";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api", () => ({
  api: { get: jest.fn() },
  fileUrl: (p) => p || "",
  profileUrl: (u) => `https://swats.bio/${u}`,
}));
jest.mock("@/components/landing/Navbar", () => ({ Navbar: () => null }));
jest.mock("@/components/landing/Footer", () => ({ Footer: () => null }));

const { api } = require("@/lib/api");

const ROWS = [
  { id: "1", username: "koni", display_name: "Koni", tier: "premium", views: 38, avatar_url: "/a.png", badges: ["verified", "premium"] },
  { id: "2", username: "swats", display_name: "Swats", tier: "free", views: 10, avatar_url: "", badges: [] },
];

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 360));
  });
};

const mount = async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Explore />
      </MemoryRouter>,
    );
  });
  await flush();
  return {
    el,
    cleanup: () => {
      act(() => root.unmount());
      el.remove();
    },
  };
};

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

it("falls back to the leaderboard when /explore is not served", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/explore") return Promise.reject(new Error("No API route for GET /api/explore"));
    if (url === "/leaderboard") return Promise.resolve({ data: ROWS });
    return Promise.resolve({ data: [] });
  });

  const { el, cleanup } = await mount();

  expect(el.querySelector('[data-testid="explore-card-koni"]')).toBeTruthy();
  expect(el.querySelector('[data-testid="explore-card-swats"]')).toBeTruthy();
  expect(el.querySelector('[data-testid="explore-empty"]')).toBeNull();

  cleanup();
});

it("uses the explore endpoint when it answers", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/explore") return Promise.resolve({ data: [ROWS[0]] });
    return Promise.resolve({ data: [] });
  });

  const { el, cleanup } = await mount();

  expect(el.querySelector('[data-testid="explore-card-koni"]')).toBeTruthy();
  expect(api.get.mock.calls.filter(([url]) => url === "/leaderboard")).toHaveLength(0);

  cleanup();
});
