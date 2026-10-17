import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import Ranked from "./Ranked";

global.IS_REACT_ACT_ENVIRONMENT = true;

const ROWS = [1, 2, 3, 4, 5].map((n) => ({
  id: `id-${n}`,
  rank: n,
  username: `user${n}`,
  display_name: `User ${n}`,
  tier: n === 2 ? "premium" : "free",
  views: 1000 * (6 - n),
  verified: n === 1,
  avatar: "",
}));

jest.mock("@/lib/api", () => ({
  api: { get: jest.fn(() => Promise.resolve({ data: [] })) },
  fileUrl: (p) => p || "",
  profileUrl: (u) => `https://swats.bio/${u}`,
}));

const { api } = require("@/lib/api");

const mount = async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Ranked />
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return {
    el,
    cleanup: () => {
      act(() => root.unmount());
      el.remove();
    },
  };
};

beforeEach(() => {
  api.get.mockImplementation(() => Promise.resolve({ data: ROWS }));
});

it("shows the top profiles in a centre/side spotlight with the full list beneath", async () => {
  const { el, cleanup } = await mount();

  const stage = el.querySelector('[data-testid="ranked-spotlight"]');
  expect(stage).toBeTruthy();
  expect(stage.querySelectorAll('[data-testid^="ranked-spotlight-"]').length).toBe(ROWS.length);

  const centre = el.querySelector('[data-testid="ranked-spotlight-center"]');
  expect(centre.textContent).toContain("User 1");
  expect(centre.textContent).toContain("swats.bio/user1");
  expect(centre.getAttribute("data-menu-id")).toBe("profile");

  expect(el.querySelectorAll('[data-testid^="ranked-row-"]').length).toBe(ROWS.length);
  expect(el.querySelector('[data-testid="ranked-dot-0"]')).toBeTruthy();

  cleanup();
});

it("moves the spotlight with the arrows and the dots", async () => {
  const { el, cleanup } = await mount();

  const centreName = () => el.querySelector('[data-testid="ranked-spotlight-center"]').textContent;

  await act(async () => {
    el.querySelector('[data-testid="ranked-next"]').click();
  });
  expect(centreName()).toContain("User 2");

  await act(async () => {
    el.querySelector('[data-testid="ranked-prev"]').click();
  });
  expect(centreName()).toContain("User 1");

  await act(async () => {
    el.querySelector('[data-testid="ranked-dot-3"]').click();
  });
  expect(centreName()).toContain("User 4");

  cleanup();
});

it("renders the honest empty state when nobody is ranked", async () => {
  api.get.mockImplementation(() => Promise.resolve({ data: [] }));
  const { el, cleanup } = await mount();

  expect(el.querySelector('[data-testid="ranked-empty"]')).toBeTruthy();
  expect(el.querySelector('[data-testid="ranked-spotlight"]')).toBeNull();

  cleanup();
});
