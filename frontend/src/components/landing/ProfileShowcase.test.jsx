import { createRoot } from "react-dom/client";
import { act } from "react";

import { ProfileShowcase, quietProfile } from "./ProfileShowcase";
import { resetTopProfiles } from "@/lib/landingProfiles";

/* The showcase replaced three hand-picked screenshots with the real
   ProfilePreview for the top three leaderboard profiles. These pin that it draws
   the real card, links to the real page, and that it drops the page dressing (a
   background video and a rain canvas per card is weight with nothing to say).

   They also pin the two fixes that stopped the row twitching: every card is
   drawn at its own scale — nothing is measured or resized at runtime — and the
   row never swaps itself out on a timer.

   And they pin the arrangement: rank 1 upright in the middle and in front, the
   other two leaning gently opposite ways beside it (never over it), each in a
   fixed, LARGE photo-proportioned frame that grows when it is hovered, with the
   whole frame clickable and no caption pill underneath — and, since a card that
   stretched to the window turned the row into a full-screen column of tall
   images, that no width ever hands a card `w-full` or stacks the row.

   The sizes are pinned from both ends on purpose: big enough that the band is
   not three thumbnails in the middle of an empty section, and small enough that
   three frames plus their gaps still fit the section's 1248px of usable width in
   ONE row. A frame that grew past that would wrap or clip, and a frame that
   shrank back to a thumbnail is the thing this layout was fixed to stop being. */

global.IS_REACT_ACT_ENVIRONMENT = true;

/* Which rank is drawn in which seat. Rank 1 belongs in the middle, so the DOM
   order is 2, 1, 3 — every expectation below is written through this map rather
   than assuming seat order equals rank order. */
const SEAT_RANK = { 0: 2, 1: 1, 2: 3 };

const mockLeaderboard = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  username: `rank${i + 1}`,
  display_name: `Rank ${i + 1}`,
  views: 1000 - i * 10,
}));

const mockProfileFor = (i) => ({
  username: `rank${i + 1}`,
  display_name: `Rank ${i + 1}`,
  uid_number: i + 1,
  views: 1000 - i * 10,
  badges: [],
  profile: {
    bio: `Page number ${i + 1}`,
    avatar_url: `/logo.png`,
    accent_color: "#A48DF4",
    background_video: "https://example.com/bg.mp4",
    bg_effect: "rain",
    cursor_effect: "sparkle",
    entry_enabled: true,
    links: [{ platform: "x", label: "Follow", url: "https://x.com", mode: "card" }],
    widgets: [],
    tracks: [],
  },
});

jest.mock("@/lib/api", () => ({
  api: {
    get: (url) => {
      if (url === "/leaderboard") return Promise.resolve({ data: mockLeaderboard });
      const match = String(url).match(/^\/u\/(.+)$/);
      if (match) {
        const index = mockLeaderboard.findIndex((u) => u.username === decodeURIComponent(match[1]));
        if (index >= 0) return Promise.resolve({ data: mockProfileFor(index) });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    },
  },
  fileUrl: (p) => p || "",
  // The card links are built from the configured origin, not typed out; this is
  // that helper at the default origin the assertions below expect.
  profileUrl: (u) => `https://swats.bio/${u}`,
}));

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const mount = async (node) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(node);
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

const seatsIn = (el) => [...el.querySelectorAll('[data-testid^="showcase-seat-"]')];

beforeEach(() => {
  resetTopProfiles();
});

it("draws the real profile card for the top three", async () => {
  const { el, cleanup } = await mount(<ProfileShowcase />);

  expect(seatsIn(el)).toHaveLength(3);

  // Real cards, not images of cards: the same testid the public page renders.
  expect(el.querySelectorAll('[data-testid="profile-preview"]')).toHaveLength(3);
  expect(el.querySelector('[data-testid="profile-showcase"]')).toBeTruthy();
  // No phone chrome: no bezel art and no notch.
  expect(el.querySelectorAll('[data-testid$="-notch"]')).toHaveLength(0);
  // No swap indicator: the row changes on its own.
  expect(el.querySelector('[data-testid="showcase-pager"]')).toBeNull();

  // …and each frame opens the page it is a picture of, in seat order (2, 1, 3).
  const links = [...el.querySelectorAll('a[data-testid^="showcase-link-"]')].map((a) =>
    a.getAttribute("href")
  );
  expect(links).toEqual([
    "https://swats.bio/rank2",
    "https://swats.bio/rank1",
    "https://swats.bio/rank3",
  ]);

  // Each frame is marked with the rank it holds.
  expect(el.textContent).toContain("#1");
  expect(el.textContent).toContain("#3");
  expect(el.textContent).toContain("@rank3");

  cleanup();
});

it("frames each card like a photograph, and lets the hovered one show more", async () => {
  const { el, cleanup } = await mount(<ProfileShowcase />);

  const seats = seatsIn(el);
  for (const seat of seats) {
    const frame = seat.firstElementChild;

    // A fixed, portrait frame that crops the page rather than shrinking it.
    expect(frame.className).toContain("h-[134px]");
    expect(frame.className).toContain("overflow-hidden");
    // Hovering reveals more of the page by growing the frame.
    expect(frame.className).toContain("group-hover:h-[152px]");
    expect(frame.className).toContain("xl:group-hover:h-[590px]");
    // No inline height: an inline value would beat the hover class outright.
    expect(frame.style.height).toBe("");
    // …and a fade at the cut, so a cropped card does not read as a broken one.
    expect(frame.querySelector(".from-\\[\\#0b0b0f\\]")).toBeTruthy();

    // The preview is drawn at its own scale, top-aligned, with nothing to
    // re-measure when its content changes.
    const stage = frame.querySelector("[inert]");
    expect(stage).toBeTruthy();
    expect(stage.className).toContain("top-0");
    expect(stage.style.transform).toBe("");
    expect(stage.getAttribute("aria-hidden")).toBe("true");
  }

  // The row reserves the revealed size, so hovering one card cannot push the
  // rest of the page around.
  const fanRow = el.querySelector('[data-testid="showcase-fan"]');
  expect(fanRow.className).toContain("min-h-[152px]");
  expect(fanRow.className).toContain("xl:min-h-[590px]");

  cleanup();
});

/* One number out of a Tailwind arbitrary value: the `376` of `w-[376px]`, read
   from the class a breakpoint actually applies (the last one given). */
const lastValue = (classes, prefix) => {
  const matches = [...classes.matchAll(new RegExp(`${prefix}-\\[(\\d+)px\\]`, "g"))];
  return matches.length ? Number(matches[matches.length - 1][1]) : null;
};

// 7xl (1280px) minus the section's own `px-4`, which is the width the row has to
// fit in without wrapping or clipping.
const ROW_FITS = 1280 - 32;

it("leans the two outer frames the other way, gently, and never over the middle", async () => {
  const { el, cleanup } = await mount(<ProfileShowcase />);

  const fan = el.querySelector('[data-testid="showcase-fan"]');
  // A row at EVERY width — the default first, so the row can never be a column
  // that stacks three tall cards on a narrow window.
  expect(fan.className).toContain("flex-row");
  expect(fan.className).toContain("flex-nowrap");
  expect(fan.className).toContain("justify-center");
  expect(fan.className).not.toContain("flex-col");

  const seats = seatsIn(el);

  // Left of the middle: leaning back the other way — on by default, not only
  // from `lg` up. The lean is a few degrees, not the 7deg that used to be the
  // loudest thing in the section.
  expect(seats[0].className).toContain("-rotate-[3deg]");
  // The middle: straight, and in front of both others. (It still carries the
  // hover straighten like every other seat, so this asks for no *base* tilt.)
  expect(seats[1].className).not.toMatch(/\brotate-\[3deg\]/);
  expect(seats[1].className).toContain("z-30");
  // Right of the middle: leaning the other way.
  expect(seats[2].className).toMatch(/(^|\s)rotate-\[3deg\]/);
  expect(seats[2].className).not.toContain("-rotate-[3deg]");

  // Nothing laps over anything: the gap between the frames comes from the row,
  // and no card carries a negative margin pulling it onto its neighbour. A lapped
  // fan hid the inside edge of the two outside pages.
  expect(fan.className).toMatch(/(^|\s)gap-\[\d+px\]/);
  for (const seat of seats) {
    expect(seat.className).not.toMatch(/(^|\s)-m[rl]-/);
    expect(seat.className).not.toContain("absolute");
  }

  // Fixed at every breakpoint: nothing stretches a card to the window, which is
  // what used to make the section three full-screen images tall.
  for (const seat of seats) {
    expect(seat.className).toContain("w-[96px]");
    expect(seat.className).toContain("xl:w-[376px]");
    expect(seat.className).toContain("shrink-0");
    expect(seat.className).not.toContain("w-full");
    expect(seat.className).not.toContain("flex-1");
  }

  // Full size, but still one row: the widest frame the row ever uses, three of
  // them plus two gaps, has to fit the section's usable width. Growing a frame
  // without shrinking the gaps is exactly how this band would wrap or clip.
  const frameW = lastValue(seats[0].className, "w");
  const gap = lastValue(fan.className, "gap");
  expect(frameW).toBeGreaterThanOrEqual(360);
  expect(3 * frameW + 2 * gap).toBeLessThanOrEqual(ROW_FITS);

  // Every one of them straightens and rises when hovered.
  for (const seat of seats) {
    expect(seat.className).toContain("hover:rotate-0");
    expect(seat.className).toContain("hover:z-40");
  }

  // The two that lean sit behind the middle until they are hovered.
  expect(seats[0].className).toContain("z-20");
  expect(seats[2].className).toContain("z-10");

  cleanup();
});

it("makes the whole frame the link, with no caption pill underneath", async () => {
  const { el, cleanup } = await mount(<ProfileShowcase />);

  // The pill that used to sit below each card is gone with the caption.
  expect(el.querySelectorAll("figcaption")).toHaveLength(0);

  const seats = seatsIn(el);
  seats.forEach((seat, i) => {
    const link = seat.querySelector(`[data-testid="showcase-link-${i}"]`);
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe(`https://swats.bio/rank${SEAT_RANK[i]}`);
    // A stretched link over the frame, so any click on it lands here.
    expect(link.className).toContain("absolute inset-0");
    expect(link.getAttribute("aria-label")).toContain(`Rank ${SEAT_RANK[i]}`);

    // …and the preview cannot intercept that click first.
    expect(seat.querySelector("[inert]").className).toContain("pointer-events-none");
  });

  // One anchor per card, and never an anchor inside another: the preview's own
  // links are inert siblings of the overlay, not children of it.
  expect(el.querySelectorAll("a a")).toHaveLength(0);

  // The rank is still readable — as a corner badge on the frame, not a pill
  // underneath it.
  const badges = [...el.querySelectorAll('[data-testid^="showcase-seat-"]')].map((seat) =>
    [...seat.querySelectorAll("[aria-hidden]")].map((n) => n.textContent).join(" ")
  );
  expect(badges.join(" ")).toContain("#1");

  cleanup();
});

it("leaves the row alone: no timer swaps the cards out", async () => {
  jest.useFakeTimers();
  try {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(<ProfileShowcase />);
    });
    // Promise chains are microtasks, so they settle without advancing timers.
    await act(async () => {});
    expect(el.textContent).toContain("@rank1");

    // Two rotations' worth of time: the set that was drawn on mount is still the
    // set on screen, so a swap can never re-mount a preview under the pointer.
    act(() => {
      jest.advanceTimersByTime(20000);
    });

    expect(el.textContent).toContain("@rank1");
    expect(el.textContent).toContain("@rank3");
    expect(el.querySelectorAll('[data-testid="profile-preview"]')).toHaveLength(3);
    expect(jest.getTimerCount()).toBe(0);

    act(() => root.unmount());
    el.remove();
  } finally {
    jest.useRealTimers();
  }
});

it("strips the page dressing before it draws a profile in the showcase", () => {
  const quiet = quietProfile(mockProfileFor(0));

  expect(quiet.profile.bg_effect).toBeUndefined();
  expect(quiet.profile.background_video).toBeUndefined();
  expect(quiet.profile.cursor_effect).toBeUndefined();
  expect(quiet.profile.entry_enabled).toBeUndefined();

  // Everything a visitor recognises is kept.
  expect(quiet.profile.bio).toBe("Page number 1");
  expect(quiet.profile.avatar_url).toBe("/logo.png");
  expect(quiet.profile.links).toHaveLength(1);
  expect(quiet.username).toBe("rank1");
});

it("says the leaderboard is empty instead of inventing people", async () => {
  const empty = jest.spyOn(require("@/lib/api").api, "get").mockResolvedValue({ data: [] });
  try {
    const { el, cleanup } = await mount(<ProfileShowcase />);
    expect(el.querySelector('[data-testid="showcase-empty"]')).toBeTruthy();
    expect(el.querySelectorAll('[data-testid="profile-preview"]')).toHaveLength(0);
    cleanup();
  } finally {
    empty.mockRestore();
  }
});
