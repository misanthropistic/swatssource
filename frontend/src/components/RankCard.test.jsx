import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import RankCard from "@/components/RankCard";

/* The rank box, in the four states it can be in: loaded, loading, failed, and
 * the two ends of the ladder (mid-rank, and the top where there is no next).
 *
 * The failure case is the one worth having: a read error must not draw "Rookie,
 * 0 XP", because that is a claim about the account rather than an admission that
 * the number is unknown.
 */

global.IS_REACT_ACT_ENVIRONMENT = true;

global.__RANK__ = null;
global.__RANK_FAILS__ = false;

jest.mock("@/lib/api", () => ({
  api: {
    get: async (url) => {
      if (url !== "/me/rank") throw new Error(`unexpected ${url}`);
      if (global.__RANK_FAILS__) throw new Error("network");
      return { data: global.__RANK__ };
    },
  },
}));

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

let container;
let root;

beforeEach(() => {
  global.__RANK__ = null;
  global.__RANK_FAILS__ = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const draw = async () => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <RankCard />
      </MemoryRouter>,
    );
  });
  await settle();
};

const RANKED = {
  rank: { id: "silver", name: "Silver", color: "#cbd5e1", blurb: "Filled in and visited" },
  next: { id: "gold", name: "Gold", min: 1400 },
  xp: 700,
  intoRank: 200,
  span: 900,
  toNext: 700,
  percent: 22,
  badges: ["og"],
  equipped_badges: [],
  events: [{ id: "halloween", label: "Halloween", hint: "Wear the site in October", live: true, opensInDays: null }],
};

it("shows the rank, the XP and the distance to the next one", async () => {
  global.__RANK__ = RANKED;
  await draw();

  const card = container.querySelector('[data-testid="rank-card"]');
  expect(card).toBeTruthy();
  expect(container.querySelector('[data-testid="rank-name"]').textContent).toBe("Silver");
  expect(container.querySelector('[data-testid="rank-xp"]').textContent).toContain("700");
  expect(container.querySelector('[data-testid="rank-progress-label"]').textContent).toBe("22% to Gold");
  expect(container.querySelector('[data-testid="rank-to-next"]').textContent).toContain("700");
  expect(container.querySelector('[data-testid="rank-progress"]').getAttribute("data-percent")).toBe("22");
});

it("says the top rank is the top rank instead of promising a next one", async () => {
  global.__RANK__ = { ...RANKED, rank: { id: "legend", name: "Legend", color: "#FF7FBC" }, next: null, toNext: 0, percent: 100 };
  await draw();

  expect(container.querySelector('[data-testid="rank-name"]').textContent).toBe("Legend");
  expect(container.querySelector('[data-testid="rank-progress-label"]').textContent).toBe("Top rank reached");
  expect(container.querySelector('[data-testid="rank-to-next"]').textContent).toBe("—");
});

it("draws the earned badges, including a seasonal id no registry lists", async () => {
  global.__RANK__ = { ...RANKED, badges: ["og", "halloween_2026"], equipped_badges: ["halloween_2026"] };
  await draw();

  const shelf = container.querySelector('[data-testid="rank-badge-shelf"]');
  expect(shelf).toBeTruthy();
  expect(shelf.querySelectorAll("[data-badge]").length).toBe(2);

  // The seasonal badge resolves to real art through the event registry rather
  // than falling back to a glyph, and the equipped one is drawn first.
  const first = shelf.querySelectorAll("[data-badge]")[0];
  expect(first.getAttribute("data-badge")).toBe("halloween_2026");
  expect(first.getAttribute("data-seasonal")).toBe("true");
  expect(first.querySelector("img").getAttribute("src")).toContain("events/halloween.svg");
});

it("says so when the read fails rather than reporting a rank of zero", async () => {
  global.__RANK_FAILS__ = true;
  await draw();

  expect(container.querySelector('[data-testid="rank-unavailable"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="rank-name"]')).toBeFalsy();
  expect(container.querySelector('[data-testid="rank-xp"]')).toBeFalsy();
});

it("points at the next seasonal badge when none is live", async () => {
  global.__RANK__ = {
    ...RANKED,
    events: [{ id: "christmas", label: "Christmas", hint: "Wear the site between 1 and 26 December", live: false, opensInDays: 12 }],
  };
  await draw();

  const hint = container.querySelector('[data-testid="rank-next-event"]').textContent;
  expect(hint).toContain("1 and 26 December");
  expect(hint).toContain("in 12 days");
});

// No calendar on the response means no live/next status to report, so the
// single "next event" line stays off. The seasonal catalogue itself is fixed and
// still ships with the app, so it is drawn anyway — that is the difference
// between "we do not know when" and "there is no event system".
it("reports no live event status when the server sent none, but still lists the season", async () => {
  global.__RANK__ = { ...RANKED, events: [] };
  await draw();

  expect(container.querySelector('[data-testid="rank-next-event"]')).toBeFalsy();
  const calendar = container.querySelector('[data-testid="rank-event-calendar"]');
  expect(calendar).toBeTruthy();
  for (const id of ["halloween", "christmas", "newyear"]) {
    expect(container.querySelector(`[data-testid="rank-event-${id}"]`)).toBeTruthy();
  }
});

it("offers a retry and keeps the season on screen when the rank read fails", async () => {
  global.__RANK_FAILS__ = true;
  await draw();

  expect(container.querySelector('[data-testid="rank-retry"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="rank-event-calendar"]')).toBeTruthy();
});
