import fs from "fs";
import path from "path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import DashboardLayout from "./DashboardLayout";
import Overview from "./Overview";
import Editor from "./Editor";
import Links from "./Links";
import Widgets from "./Widgets";
import Badges from "./Badges";
import UserManager from "./UserManager";
import Stats from "./Stats";
import Leaderboard from "./Leaderboard";
import DashboardDevlog from "./Devlog";
import Analytics from "./Analytics";
import { TEXT_EFFECTS, OVERLAYS, CURSOR_EFFECTS, BACKGROUND_EFFECTS } from "@/constants/effects";
import { BADGE_CATALOG } from "@/constants/badges";

global.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom ships neither of these and framer-motion needs them.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: true, // pretend reduced-motion is on so count-ups resolve instantly
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
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const FREE_USER = {
  username: "tester",
  display_name: "Tester",
  role: "user",
  tier: "free",
  is_owner: false,
  views: 42,
  badges: ["verified", "og"],
  equipped_badges: ["og"],
  discord: { linked: false },
  profile: { bio: "hello world", links: [], widgets: [], tracks: [], accent_color: "#A48DF4" },
};

const PREMIUM_USER = { ...FREE_USER, tier: "premium" };

// jest.mock factories are hoisted above module scope, so the fixture is read
// from a global that each test can swap before rendering.
global.__DASH_USER__ = FREE_USER;

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: global.__DASH_USER__,
    setUser: () => {},
    logout: () => {},
    refresh: () => {},
  }),
}));

// Every call is recorded so the tests can assert on what a page actually saves,
// not merely that a button exists.
global.__API_CALLS__ = [];

jest.mock("@/lib/api", () => ({
  api: {
    get: (url, config) => {
      global.__API_CALLS__.push({ method: "get", url, params: config?.params });
      // A test can hand a specific endpoint a payload through the global below.
      if (url === "/leaderboard") return Promise.resolve({ data: global.__LEADERBOARD__ || [] });
      // The admin Users page's roster + stats.
      if (url === "/admin/discord/roster") return Promise.resolve({ data: global.__ROSTER__ || { users: [], stats: {} } });
      // The viewer's own standing, which is knowable outside the loaded window.
      if (url === "/me/leaderboard") return Promise.resolve({ data: global.__MY_RANK__ || {} });
      // The bot-backed identity lookup, which also carries each account's real
      // Discord avatar decoration.
      if (url === "/widgets/discord/users") return Promise.resolve({ data: global.__DISCORD_USERS__ });
      return Promise.resolve({ data: [] });
    },
    put: (url, body) => {
      global.__API_CALLS__.push({ method: "put", url, body });
      return Promise.resolve({ data: {} });
    },
    post: (url, body) => {
      global.__API_CALLS__.push({ method: "post", url, body });
      // Sync all answers with a summary of what moved; a test hands it one
      // through the global below (the default is "nothing to sync"). A test that
      // needs several pages queues them in __SYNC_PAGES__, one per request.
      if (url === "/admin/bot/sync-all") {
        const queued = global.__SYNC_PAGES__ || [];
        const data = queued.length ? queued.shift() : global.__SYNC_ALL__ || { scanned: 0 };
        return Promise.resolve({ data });
      }
      return Promise.resolve({ data: {} });
    },
  },
  fileUrl: (u) => u || "",
}));

let container;
let root;

const calls = (method) => global.__API_CALLS__.filter((c) => c.method === method);
const byText = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === text);

beforeEach(() => {
  global.__DASH_USER__ = FREE_USER;
  global.__API_CALLS__ = [];
  global.__LEADERBOARD__ = [];
  global.__MY_RANK__ = {};
  global.__DISCORD_USERS__ = { users: [] };
  global.__ROSTER__ = { users: [], stats: {} };
  global.__SYNC_ALL__ = { scanned: 0 };
  global.__SYNC_PAGES__ = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const renderAt = (path, element) => {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          {/* The page under test renders as the index child of the shell at
              whatever path it was handed, so a new page needs no new route. */}
          <Route path={path} element={<DashboardLayout />}>
            <Route index element={element} />
          </Route>
          <Route path="/!/pricing" element={<div>pricing page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
};

const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

// Let the page's own API promises resolve inside act(), so the DOM is final
// before an assertion reads it.
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const subtab = (name) => container.querySelector(`[data-testid="editor-subtab-${name}"]`);
const picker = (id) => container.querySelector(`[data-testid="fx-${id}"]`);
// The catalog chips live inside each picker's popup now, so a test opens the
// popup first and counts the chips within that popup's own container.
const chipsIn = (id) => [...container.querySelector(`[data-testid="fx-${id}-choices"]`).querySelectorAll("button")];
const option = (group, id) => container.querySelector(`[data-testid="fx-${group}-${id}"]`);
const openPicker = (id) => click(container.querySelector(`[data-testid="fx-${id}-open"]`));

describe("dashboard shell", () => {
  it("renders the sidebar, user card and a route-aware breadcrumb", () => {
    renderAt("/!/dashboard", <Overview />);
    expect(container.querySelector('[data-testid="overview-page"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="logout-btn"]')).toBeTruthy();
    expect(container.textContent).toContain("@tester");
    expect(container.textContent).toContain("Overview");
  });

  it("renders Overview stats, checklist and connect card", () => {
    renderAt("/!/dashboard", <Overview />);
    expect(container.querySelector('[data-testid="stat-views"]').textContent).toContain("42");
    expect(container.querySelector('[data-testid="stat-tier"]').textContent).toContain("Free");
    expect(container.querySelector('[data-testid="completion-card"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="connect-card"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="connect-discord-btn"]')).toBeTruthy();
  });
});

// The dashboard has its own devlog feed, separate from the public changelog.
// They are two channels of the same table, so a build note never appears on the
// marketing page and vice versa.
describe("dashboard devlog", () => {
  it("reads the dashboard channel, not the public one", async () => {
    renderAt("/!/dashboard/devlogs", <DashboardDevlog />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const call = calls("get").find((c) => c.url === "/devlogs");
    expect(call).toBeTruthy();
    expect(call.params?.channel).toBe("dashboard");
  });

  // The feed is read in the dashboard, not on the public changelog page. The
  // sidebar entry used to be a link to /!/devlogs — the marketing changelog,
  // with its own nav and footer — which handed a signed-in member to a page
  // written for visitors. It opens a popup in place now.
  it("opens as a popup from the sidebar instead of leaving the dashboard", async () => {
    renderAt("/!/dashboard", <Overview />);
    const link = container.querySelector('[data-testid="devlog-link"]');
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBeNull();

    click(link);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const modal = document.body.querySelector('[data-testid="devlog-feed-modal"]');
    expect(modal).toBeTruthy();
    // And it reads the dashboard channel, the same feed the page used to show.
    const call = calls("get").find((c) => c.url === "/devlogs");
    expect(call?.params?.channel).toBe("dashboard");
  });
});

describe("leaderboard", () => {
  // The API flattens the avatar onto the row. The page used to look for it under
  // `profile`, so no picture ever rendered — not on the podium, not in the list.
  it("shows the profile picture the API returns for every ranked member", async () => {
    global.__LEADERBOARD__ = [
      { id: "1", username: "ada", display_name: "Ada", tier: "premium", views: 900, badges: [], avatar_url: "/uploads/ada.png" },
      { id: "2", username: "bob", display_name: "Bob", tier: "free", views: 400, badges: [], avatar_url: "/uploads/bob.png" },
    ];
    renderAt("/!/dashboard/leaderboard", <Leaderboard />);
    expect(container.querySelector('[data-testid="leaderboard-page"]')).toBeTruthy();
    // The rows arrive from the API promise, not the first paint.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const imgs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(imgs).toContain("/uploads/ada.png");
    expect(imgs).toContain("/uploads/bob.png");
    // ...and the name still renders beside it, so the row is complete.
    expect(container.textContent).toContain("Ada");
    // Two members is fewer than a podium, so both belong in the list. This used
    // to slice the first three rows off regardless and show an empty table.
    expect(container.querySelector('[data-testid="leaderboard-row-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="leaderboard-row-1"]')).toBeTruthy();
    expect(container.textContent).not.toContain("Top 3 shown above");
  });

  // A row used to be an inert div: the only way to reach the profile you were
  // looking at was to retype the handle. Every row is a link now.
  it("links each row to that member's profile", async () => {
    global.__LEADERBOARD__ = [
      { id: "1", username: "ada", display_name: "Ada", tier: "free", views: 900, badges: [], rank: 1 },
      { id: "2", username: "bob", display_name: "Bob", tier: "free", views: 900, badges: [], rank: 2 },
    ];
    renderAt("/!/dashboard/leaderboard", <Leaderboard />);
    await settle();

    const row = container.querySelector('[data-testid="leaderboard-row-0"]');
    expect(row.tagName).toBe("A");
    expect(row.getAttribute("href")).toBe("/ada");
    // Two equal view counts sit in the board's own order (username breaks the
    // tie), and each keeps the rank the API gave it — not its array position.
    expect(container.querySelector('[data-testid="leaderboard-row-0"]').textContent).toContain("#1");
    expect(container.querySelector('[data-testid="leaderboard-row-1"]').textContent).toContain("#2");
  });

  it("shows the viewer's own rank even when they are nowhere near the top", async () => {
    global.__LEADERBOARD__ = [
      { id: "1", username: "ada", display_name: "Ada", tier: "free", views: 900, badges: [], rank: 1 },
    ];
    global.__MY_RANK__ = { rank: 412, total: 1203, views: 12, percentile: 34 };
    renderAt("/!/dashboard/leaderboard", <Leaderboard />);
    await settle();

    const strip = container.querySelector('[data-testid="leaderboard-my-rank"]');
    expect(strip).toBeTruthy();
    expect(strip.textContent).toContain("#412");
    expect(strip.textContent).toContain("1,203");
    expect(strip.textContent).toContain("Top 34%");
  });
});

// The admin Users page. The Edit button next to a row has ONE job — open the
// editor over the table with the role picker and the badge grant menu — so if
// the modal stops mounting, an admin cannot assign badges at all.
describe("admin users page", () => {
  const openUsers = async () => {
    renderAt("/!/dashboard/admin/users", <UserManager />);
    // The roster comes in behind a 250ms search debounce, so settle() on a
    // macrotask long enough for the fetch + rerender to land.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
  };
  const ROSTER = {
    users: [
      { id: "7", username: "fbi", display_name: "FBI", tier: "free", role: "user", is_owner: false, views: 10, badges: ["og"], discord_linked: true, discord_username: "fbidiscord", member: true },
    ],
    stats: { total: 1, linked: 1 },
  };

  it("opens the edit menu with the badge assignment chips", async () => {
    global.__DASH_USER__ = { ...FREE_USER, role: "admin", tier: "admin" };
    global.__ROSTER__ = ROSTER;
    await openUsers();

    const edit = container.querySelector('button[title="Edit User"]');
    expect(edit).toBeTruthy();
    click(edit);

    const modal = container.querySelector('[data-testid="user-edit-modal"]');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain("Edit @fbi");
    expect(modal.textContent).toContain("Granted Badges");
    expect(modal.textContent).toContain(BADGE_CATALOG[0].name);

    // The identity format the owner asked for: "discord username (swats.bio
    // username)", and only because our roster flagged the account as a member
    // of our guild. Table column and modal chip both read it.
    expect(container.textContent).toContain("fbidiscord (@fbi)");
    expect(modal.textContent).toContain("fbidiscord (@fbi)");
  });

  it("hides the discord handle for a linked account outside our server", async () => {
    global.__DASH_USER__ = { ...FREE_USER, role: "admin", tier: "admin" };
    global.__ROSTER__ = {
      users: [
        { ...ROSTER.users[0], member: false },
      ],
      stats: { total: 1, linked: 1 },
    };
    await openUsers();

    expect(container.textContent).not.toContain("fbidiscord");
    expect(container.textContent).toContain("not in server");
  });

  it("grants a badge and saves it through the admin API", async () => {
    global.__DASH_USER__ = { ...FREE_USER, role: "admin", tier: "admin" };
    global.__ROSTER__ = ROSTER;
    await openUsers();

    click(container.querySelector('button[title="Edit User"]'));
    const modal = container.querySelector('[data-testid="user-edit-modal"]');
    // Grant the catalogue badge the user does not carry yet.
    const grantable = BADGE_CATALOG.find((b) => !ROSTER.users[0].badges.includes(b.id));
    click([...modal.querySelectorAll("button")].find((b) => b.textContent.trim().includes(grantable.name)));

    click([...modal.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save Changes"));
    await act(async () => {});

    const put = calls("put").find((c) => c.url === "/admin/users/7");
    expect(put).toBeTruthy();
    expect(put.body.badges).toContain("og");
    expect(put.body.badges).toContain(grantable.id);
  });

  /* Sync all: one button for the drift an admin cannot see by looking at the
     table — a member holding the OG role with no OG badge. It has to reach the
     one endpoint that repairs both halves and then re-read the roster, because
     the rows are what show the result. */
  it("syncs roles and badges for every linked account, then reloads the roster", async () => {
    global.__DASH_USER__ = { ...FREE_USER, role: "admin", tier: "admin" };
    global.__ROSTER__ = ROSTER;
    global.__SYNC_ALL__ = {
      scanned: 3,
      roles_applied: 2,
      badges_added: 1,
      members_missing: 0,
      failed: 0,
      remaining: 0,
      discord_configured: true,
      errors: [],
    };
    const confirm = window.confirm;
    window.confirm = () => true;
    try {
      await openUsers();

      const button = container.querySelector('[data-testid="sync-all"]');
      expect(button).toBeTruthy();
      expect(button.textContent).toContain("Sync all");

      // No selection is required: this is a whole-roster action, so it lives in
      // the page header where it is always reachable.
      expect(container.querySelector('[data-testid="bulk-bar"]')).toBeFalsy();

      const before = calls("get").filter((c) => c.url === "/admin/discord/roster").length;
      click(button);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const post = calls("post").find((c) => c.url === "/admin/bot/sync-all");
      expect(post).toBeTruthy();
      const after = calls("get").filter((c) => c.url === "/admin/discord/roster").length;
      expect(after).toBeGreaterThan(before);
    } finally {
      window.confirm = confirm;
    }
  });

  /* The whole point of the button: it must not stop at the first page. The
     endpoint pages at 100 accounts per request, so "Sync all" is only true if
     the loop keeps asking with the next offset until the server says nothing is
     left. */
  it("works through every page of the roster, not just the first", async () => {
    global.__DASH_USER__ = { ...FREE_USER, role: "admin", tier: "admin" };
    global.__ROSTER__ = ROSTER;
    global.__SYNC_PAGES__ = [
      { scanned: 100, total: 150, offset: 0, next_offset: 100, remaining: 50, roles_applied: 4, badges_added: 9, failed: 0, errors: [] },
      { scanned: 50, total: 150, offset: 100, next_offset: 150, remaining: 0, roles_applied: 1, badges_added: 3, failed: 0, errors: [] },
    ];
    const confirm = window.confirm;
    window.confirm = () => true;
    try {
      await openUsers();
      click(container.querySelector('[data-testid="sync-all"]'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      const offsets = calls("post")
        .filter((c) => c.url === "/admin/bot/sync-all")
        .map((c) => c.body?.offset);
      expect(offsets).toEqual([0, 100]);
    } finally {
      window.confirm = confirm;
    }
  });

  it("asks nothing of the roster when there was nothing to sync", async () => {
    global.__DASH_USER__ = { ...FREE_USER, role: "admin", tier: "admin" };
    global.__ROSTER__ = { users: [], stats: {} };
    global.__SYNC_ALL__ = { scanned: 0 };
    const confirm = window.confirm;
    window.confirm = () => true;
    try {
      await openUsers();
      const before = calls("get").filter((c) => c.url === "/admin/discord/roster").length;
      click(container.querySelector('[data-testid="sync-all"]'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(calls("post").some((c) => c.url === "/admin/bot/sync-all")).toBe(true);
      // Nothing moved, so nothing is re-read: a pointless second roster fetch is
      // the kind of thing that makes an admin distrust the button.
      const after = calls("get").filter((c) => c.url === "/admin/discord/roster").length;
      expect(after).toBe(before);
    } finally {
      window.confirm = confirm;
    }
  });
});

// The Advanced Appearance panel is gone: the "apply these sliders to my current
// card style" toggle, the fill / outline / radius sliders behind it, and the
// ten-spots-per-element placement map underneath. The card surface is chosen in
// one place now, and a layout owns the order of its own blocks.
describe("editor card panel", () => {
  const openCard = () => {
    renderAt("/!/dashboard/editor", <Editor />);
    click(subtab("card"));
  };

  it("hides the surface dials behind advanced mode; the placement map stays gone", () => {
    global.__DASH_USER__ = PREMIUM_USER;
    openCard();

    expect(container.textContent).not.toContain("Apply these sliders to my current card style");
    expect(container.textContent).not.toContain("Content Placement");
    for (const testid of [
      "placement-locked",
      "pos-avatar",
      "pos-badges",
      "pos-bio",
    ]) {
      expect(container.querySelector(`[data-testid="${testid}"]`)).toBeFalsy();
    }

    // This is the owner's ask: the glass blur, surface/outline alpha, rounding
    // and width dials only exist while Advanced mode is on, and the Themes
    // grid is gone entirely.
    expect(container.querySelector('[data-testid="cardstyle-classic"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cardstyle-advanced"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="card-bg-toggle"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="card-glow-toggle"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="card-blur"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="card-fill-alpha"] [role="slider"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="card-outline-alpha"] [role="slider"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="card-radius"] [role="slider"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="card-width"] [role="slider"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="cardtheme-ocean"]')).toBeFalsy();
  });

  it("advanced mode reveals the surface dials and the colour pickers", async () => {
    global.__DASH_USER__ = PREMIUM_USER;
    openCard();

    // Toggle off: none of the dials or pickers are on the page at all.
    expect(container.querySelector('[data-testid="card-fill-color"]')).toBeFalsy();
    click(container.querySelector('[data-testid="advanced-mode-toggle"]'));
    expect(container.querySelector('[data-testid="advanced-appearance"]')).toBeTruthy();
    for (const testid of ["card-blur", "card-fill-alpha", "card-outline-alpha", "card-radius", "card-width", "card-glow-strength"]) {
      expect(container.querySelector(`[data-testid="${testid}"] [role="slider"]`)).toBeTruthy();
    }
    expect(container.querySelector('[data-testid="card-fill-color"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="card-outline-color"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="card-glow-color"]')).toBeTruthy();

    // Saving carries the switch through to the backend.
    await act(async () => {
      click(container.querySelector('[data-testid="editor-save"]'));
    });

    const put = calls("put").find((c) => c.url === "/me/profile");
    expect(put?.body.advanced_mode).toBe(true);
  });

  // The style chips and the sliders drive the very card the editor preview
  // draws (ProfilePreview.cardStyles). A chip that saves a value the renderer
  // ignores — the "still Classic" report — fails here.
  it("renders the picked card style on the live preview", () => {
    global.__DASH_USER__ = PREMIUM_USER;
    openCard();

    const previewStyle = () =>
      [...container.querySelectorAll('[data-testid="profile-preview"] div')]
        .find((d) => d.className.includes("p-5 sm:p-6")).style;

    click(container.querySelector('[data-testid="cardstyle-aurora"]'));
    expect(previewStyle().boxShadow).toContain("0 0 50px");

    click(container.querySelector('[data-testid="cardstyle-outlined"]'));
    expect(previewStyle().border).toContain("1.5px solid");

    // Corner rounding reaches the preview through the shared card_radius field
    // — asserted above — and Aurora's glow is the style assertion itself.
  });

  it("offers the four surviving layouts and no others", () => {
    global.__DASH_USER__ = PREMIUM_USER;
    openCard();
    click(container.querySelector('[data-testid="layout-open"]'));

    for (const id of ["minimal", "floating", "banner", "slideshow"]) {
      expect(container.querySelector(`[data-testid="layout-option-${id}"]`)).toBeTruthy();
    }
    for (const id of ["compact", "showcase", "divider", "rail", "stacks", "panels", "document", "classic", "nowplaying"]) {
      expect(container.querySelector(`[data-testid="layout-option-${id}"]`)).toBeFalsy();
    }
  });

  // Fonts and the layout list used to slide in from the right edge, so half the
  // editor was a side panel and half was a centered dialog. Every picker is the
  // same centered dialog over a blurred backdrop now, and no side panel is left.
  it("opens fonts and layout in the same centered dialog as the effect pickers", () => {
    global.__DASH_USER__ = PREMIUM_USER;
    openCard();

    for (const testid of ["font-display", "layout"]) {
      click(container.querySelector(`[data-testid="${testid}-open"]`));

      const dialog = container.querySelector(`[data-testid="${testid}-drawer"]`);
      expect(dialog).toBeTruthy();
      expect(dialog.getAttribute("role")).toBe("dialog");
      expect(dialog.className).toContain("ov-modal");
      expect(container.querySelector(".ov-scrim-blur")).toBeTruthy();
      expect(container.querySelector(".ov-drawer")).toBeFalsy();

      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(container.querySelector(`[data-testid="${testid}-drawer"]`)).toBeFalsy();
    }
  });

  it("saves the layout the owner picks", async () => {
    global.__DASH_USER__ = PREMIUM_USER;
    openCard();
    click(container.querySelector('[data-testid="layout-open"]'));
    click(container.querySelector('[data-testid="layout-option-banner"]'));

    await act(async () => {
      click(container.querySelector('[data-testid="editor-save"]'));
    });

    const put = calls("put").find((c) => c.url === "/me/profile");
    expect(put).toBeTruthy();
    expect(put.body.layout).toBe("banner");
    // ...and none of the settings the deleted panel used to write are sent.
    for (const key of ["advanced_mode", "pos_avatar", "pos_bio", "card_radius", "card_fill_color"]) {
      expect(put.body[key]).toBeUndefined();
    }
  });
});

describe("editor effect pickers", () => {
  const openEffects = () => {
    renderAt("/!/dashboard/editor", <Editor />);
    click(subtab("effects"));
  };

  it("gives every catalog entry a chip and exactly one None", () => {
    openEffects();
    openPicker("name");
    // One chip per catalog entry: the picker adds None and drops the catalog's
    // own empty entry, so the count equals the catalog length.
    expect(chipsIn("name").length).toBe(TEXT_EFFECTS.length);
    // each catalog ships its own { id: "" } entry; it must not become a second None
    expect(container.querySelectorAll('[data-testid="fx-name-none"]').length).toBe(1);
    expect(option("name", "rainbow")).toBeTruthy();

    openPicker("bio");
    expect(chipsIn("bio").length).toBe(TEXT_EFFECTS.length);
    openPicker("overlay");
    expect(chipsIn("overlay").length).toBe(OVERLAYS.length);
    openPicker("bg");
    expect(chipsIn("bg").length).toBe(BACKGROUND_EFFECTS.length);
    openPicker("cursor");
    expect(chipsIn("cursor").length).toBe(CURSOR_EFFECTS.length);
    // The buddy catalog is gone — searched-for explicitly in the removal test.
    expect(picker("pet")).toBeFalsy();
  });

  // The picker used to slide in from the right edge, which put the tiles in a
  // narrow column while the thing being changed sat off to the side of it. It is
  // one centered dialog over a blurred backdrop now.
  it("opens the picker as a centered dialog over a blurred backdrop", () => {
    openEffects();
    expect(container.querySelector(".ov-modal")).toBeFalsy();

    openPicker("name");

    const dialog = container.querySelector('[data-testid="fx-name-drawer"]');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.className).toContain("ov-modal");
    // The blurred backdrop is there, and no side panel is left behind it.
    expect(container.querySelector(".ov-scrim-blur")).toBeTruthy();
    expect(container.querySelector(".ov-drawer")).toBeFalsy();

    // Escape closes it, and the page underneath is untouched.
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector('[data-testid="fx-name-drawer"]')).toBeFalsy();
  });

  // Every tile is a box with its own effect drawn in it, so the catalog can be
  // read at a glance instead of one hover at a time.
  it("draws the effect itself in every tile", () => {
    openEffects();
    openPicker("name");

    const tiles = chipsIn("name");
    expect(tiles.length).toBe(TEXT_EFFECTS.length);
    for (const tile of tiles) expect(tile.querySelector(".ov-tile-preview")).toBeTruthy();

    // The tile for an effect wears THAT effect.
    expect(option("name", "rainbow").querySelector(".fx-text-rainbow")).toBeTruthy();
    expect(option("name", "shake").querySelector(".fx-text-shake")).toBeTruthy();
    // None draws the plain sample — the card with no effect of this kind on it.
    expect(option("name", "none").querySelector(".fx-text-rainbow")).toBeFalsy();
    expect(option("name", "none").textContent).toContain("swats");
  });

  it("keeps each tile's effect out of the click target and off the card", () => {
    openEffects();
    const stage = () => container.querySelector('[data-testid="fx-name-stage-open"]');
    openPicker("name");

    // The box inside the tile draws the effect; the button itself never does, so
    // a click target can never be mistaken for an effect layer.
    expect([...picker("name").querySelectorAll("button")].filter((b) => b.className.includes("fx-"))).toHaveLength(0);
    // Nothing is on the card until something is chosen.
    expect(container.querySelector('[data-testid="profile-preview"] .fx-text-rainbow')).toBeFalsy();

    click(option("name", "rainbow"));
    expect(stage().querySelector(".fx-text-rainbow")).toBeTruthy();
    expect(container.querySelector('[data-testid="profile-preview"] .fx-text-rainbow')).toBeTruthy();

    // Selecting another effect unmounts the previous one from the stage.
    openPicker("name");
    click(option("name", "shake"));
    expect(stage().querySelector(".fx-text-rainbow")).toBeFalsy();
    expect(stage().querySelector(".fx-text-shake")).toBeTruthy();

    // and None clears it
    openPicker("name");
    click(option("name", "none"));
    expect(stage().querySelector(".fx-text-shake")).toBeFalsy();
  });

  it("mounts the real effect layer for background, overlay and cursor choices", () => {
    global.__DASH_USER__ = PREMIUM_USER;
    openEffects();

    // Canvas-painted backgrounds drop their fx-bg class (one copy only, see
    // BackgroundEffect) so assert on the canvas element itself. The tile draws
    // one on its own; the big stage gets one when the effect is chosen.
    openPicker("bg");
    expect(option("bg", "snow-v1").querySelector("canvas")).toBeTruthy();
    click(option("bg", "snow-v1"));
    expect(container.querySelector('[data-testid="fx-bg-stage-open"]').querySelector("canvas")).toBeTruthy();

    // The overlay canvas distinguishes itself the same way.
    openPicker("overlay");
    expect(option("overlay", "snow").querySelector("canvas")).toBeTruthy();
    click(option("overlay", "snow"));
    expect(container.querySelector('[data-testid="fx-overlay-stage-open"]').querySelector("canvas")).toBeTruthy();

    // Cursor effects draw their demo markers in the tile, and the stage too.
    openPicker("cursor");
    expect(option("cursor", "sparks").querySelector(".fx-cursor-sparks")).toBeTruthy();
    click(option("cursor", "sparks"));
    expect(container.querySelector('[data-testid="fx-cursor-stage-open"]').querySelector(".fx-cursor-sparks")).toBeTruthy();
  });

  // The cursor-buddy pets were removed from the product entirely: no picker,
  // no dials, no upload card, and a save that no longer carries the field. If
  // the effects tab grows a pet picker back, this is the tripwire.
  it("no longer offers a cursor buddy — the pets are gone", async () => {
    global.__DASH_USER__ = PREMIUM_USER;
    openEffects();

    expect(container.querySelector('[data-testid="fx-pet"]')).toBeFalsy();
    expect(container.textContent).not.toContain("Cursor buddy");
    expect(container.textContent).not.toContain("Your own pet");
    expect(container.querySelector('[data-testid="pet-speed"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="pet-delay"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="asset-cursor-widget"]')).toBeFalsy();

    await act(async () => {
      click(container.querySelector('[data-testid="editor-save"]'));
    });
    const put = calls("put").find((c) => c.url === "/me/profile");
    expect(put).toBeTruthy();
    expect("cursor_widget" in put.body).toBe(false);
  });

  // The crosshair upload is the pointer, not the buddy, and it lives in the
  // Profile & Assets tab with its own scale and hotspot controls.
  it("uploads a custom crosshair from the Profile & Assets tab", () => {
    global.__DASH_USER__ = PREMIUM_USER;
    renderAt("/!/dashboard/editor", <Editor />);
    click(subtab("profile"));

    const picker = container.querySelector('[data-testid="crosshair"]');
    expect(picker).toBeTruthy();
    expect(picker.textContent).toContain("Upload crosshair");
    expect(container.querySelector('[data-testid="crosshair-input"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="crosshair-scale"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="crosshair-x"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="crosshair-y"]')).toBeTruthy();
  });

  it("writes the selected effect through to the live preview", () => {
    openEffects();
    openPicker("name");
    click(option("name", "rainbow"));
    expect(container.querySelector('[data-testid="profile-preview"] .fx-text-rainbow')).toBeTruthy();

    openPicker("name");
    click(option("name", "none"));
    expect(container.querySelector('[data-testid="profile-preview"] .fx-text-rainbow')).toBeFalsy();
  });

  it("keeps premium effects behind the paywall for free accounts", async () => {
    openEffects();
    openPicker("name");
    click(option("name", "glow"));

    // The locked effect is refused and the gate opens over the editor, naming the
    // feature, instead of navigating away from the page being edited. The dialog
    // is portalled to <body>, so it is looked up there rather than in the
    // dashboard tree.
    const gate = document.body.querySelector('[data-testid="premium-gate"]');
    expect(gate).toBeTruthy();
    expect(gate.textContent).toContain("Name text effects");
    expect(gate.textContent).toContain("Premium");

    // The editor is still mounted underneath, and the effect was never applied.
    expect(container.querySelector('[data-testid="editor-save"]')).toBeTruthy();
    // The card never took it. (The tile draws its own copy of every effect, so
    // this has to be asked of the card rather than of the page.)
    expect(container.querySelector('[data-testid="profile-preview"] .fx-text-glow')).toBeFalsy();

    // Dismissing leaves the owner exactly where they were. The dialog animates
    // out, so give the exit transition a moment before checking it has gone.
    click(document.body.querySelector('[data-testid="premium-gate-dismiss"]'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(document.body.querySelector('[data-testid="premium-gate"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="editor-save"]')).toBeTruthy();
  });

  it("exposes the cursor, alias and tilt controls", () => {
    openEffects();
    expect(picker("cursor")).toBeTruthy();
    // These are Radix switches now, not native checkboxes: state lives on
    // aria-checked and the whole row is a label, so clicking the text works too.
    const alias = container.querySelector('[data-testid="fx-name-alias-toggle"]');
    const tilt = container.querySelector('[data-testid="tilt-toggle"]');
    expect(alias).toBeTruthy();
    expect(alias.getAttribute("aria-checked")).toBe("false");
    expect(tilt.getAttribute("aria-checked")).toBe("true");

    click(alias);
    expect(alias.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('[data-testid="tilt-strength"]')).toBeTruthy();
  });
});

// Every hover label and the whole footer line live behind ONE button now: the
// three per-tip style pickers and the two format pickers are gone.
describe("the tooltip & display panel", () => {
  const openPanel = () => {
    renderAt("/!/dashboard/editor", <Editor />);
    click(subtab("card"));
    click(container.querySelector('[data-testid="tooltip-panel-open"]'));
  };

  it("holds one look, one entrance and a switch per thing that carries a tip", () => {
    openPanel();

    expect(container.querySelector('[data-testid="tip-panel"]')).toBeTruthy();

    // Three looks, three entrances and three sizes, all global.
    for (const id of ["classic", "glass", "ice"]) {
      expect(container.querySelector(`[data-testid="tooltip-style-${id}"]`)).toBeTruthy();
    }
    for (const id of ["slide", "fade", "none"]) {
      expect(container.querySelector(`[data-testid="tooltip-animation-${id}"]`)).toBeTruthy();
    }
    for (const id of ["sm", "md", "lg"]) {
      expect(container.querySelector(`[data-testid="tooltip-size-${id}"]`)).toBeTruthy();
    }

    // One switch per kind, which is the whole of a tip's settings.
    expect(container.querySelector('[data-testid="badge-tooltips-toggle"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="link-tooltips-toggle"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="avatar-uid-tooltip-toggle"]')).toBeTruthy();
    // …and the footer line's own switches, which live in the same panel now.
    expect(container.querySelector('[data-testid="showcase-uid-toggle"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="show-join-date"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="meta-style-plain"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="views-position-br"]')).toBeTruthy();

    // The three per-tip style pickers are gone, and so are the two format
    // pickers: a tip has a look for the whole profile, and the count and the
    // member number have one format each.
    for (const gone of [
      "badge-tooltip-style-normal",
      "link-tooltip-style-normal",
      "uid-tooltip-style-basic",
      "views-format-compact",
      "views-format-full",
      "uid-format-short",
      "uid-format-full",
    ]) {
      expect(container.querySelector(`[data-testid="${gone}"]`)).toBeNull();
    }
  });
});

describe("avatar decoration catalogue picker", () => {
  // The 671 numbered frame PNGs are retired from the picker: the modal loads
  // the curated catalogue (public/decorations/effects.json) and tiles it with
  // the member's avatar behind every decoration. The old bundled frames stay
  // on disk for old profiles; nothing offers them any more.
  const open = () => {
    click(container.querySelector('[data-testid="open-decorations"]'));
  };

  it("loads the catalogue into a searchable, avatar-backed grid", async () => {
    global.__DASH_USER__ = PREMIUM_USER;
    renderAt("/!/dashboard/editor", <Editor />);
    open();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const grid = document.body.querySelector('[data-testid="deco-grid"]');
    expect(grid).toBeTruthy();
    // The first catalogue entry — the same shape the open Discord Avatar
    // Decoration catalogue publishes: one file, real labels, CDN urls.
    expect(grid.querySelector('[data-testid="deco-1352687418418921532"]')).toBeTruthy();

    // Search narrows the tiles by label: only Phoenix matches, and its tile now
    // appears while the unrelated ones stay out of the grid.
    const input = document.body.querySelector('[data-testid="deco-search"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    act(() => {
      setter.call(input, "Phoenix");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const narrowed = document.body.querySelector('[data-testid="deco-grid"]');
    const ids = [...narrowed.querySelectorAll('button')].map((b) => b.getAttribute("data-testid"));
    expect(ids).toContain("deco-1352687448228106302");
  });

  it("previews a decoration over the member's avatar, with a hue dial and Confirm", async () => {
    global.__DASH_USER__ = PREMIUM_USER;
    renderAt("/!/dashboard/editor", <Editor />);
    open();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const first = document.body.querySelector('[data-testid="deco-grid"] button');
    click(first);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // The preview panel shows the decoration over the avatar.
    expect(document.body.querySelector('[data-testid="deco-preview-layer"]')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="deco-hue"]')).toBeTruthy();

    // Confirm writes the preset url (not a filename) into the editor draft.
    click(document.body.querySelector('[data-testid="deco-confirm"]'));
    await act(async () => {
      click(container.querySelector('[data-testid="editor-save"]'));
    });
    const put = calls("put").find((c) => c.url === "/me/profile");
    expect(put.body.avatar_decoration).toMatch(/^https:\/\/cdn.discordapp.com\/avatar-decoration-presets\//);
  });

  it("does not offer the member's real decoration slot without a linked account", async () => {
    global.__DASH_USER__ = PREMIUM_USER; // linked: false, no Discord id
    renderAt("/!/dashboard/editor", <Editor />);
    open();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // The real-decoration lookup is only fired for a linked account.
    expect(calls("get").some((c) => c.url === "/widgets/discord/users")).toBe(false);
  });
});
describe("editor entry screen", () => {
  const openEntry = () => {
    renderAt("/!/dashboard/editor", <Editor />);
    click(subtab("entry"));
    click(container.querySelector('[data-testid="entry-enable"]'));
  };

  // "Code Lock" and "Text Button" said nothing about what they were until you
  // picked one and looked at your own page. Each style now draws itself in the
  // tile, so the picker can be read at a glance.
  it("draws each entry style in its own tile, and saves the one you pick", async () => {
    openEntry();

    const bubble = container.querySelector('[data-testid="entry-style-bubble"]');
    const text = container.querySelector('[data-testid="entry-style-text"]');
    const lock = container.querySelector('[data-testid="entry-style-codelock"]');
    expect(bubble && text && lock).toBeTruthy();

    // A pill, a line of type, and a PIN of four dots.
    expect(bubble.querySelector("span.rounded-full").textContent).toContain("Click to enter");
    expect(text.querySelector("span.font-mono2").textContent).toContain("Click to enter");
    expect(lock.textContent).toContain("Enter PIN");
    expect(lock.querySelectorAll("span.rounded-full")).toHaveLength(4);

    // Bubble is the default, and picking another moves the mark with it.
    expect(bubble.getAttribute("aria-pressed")).toBe("true");
    click(lock);
    expect(lock.getAttribute("aria-pressed")).toBe("true");
    expect(bubble.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      click(container.querySelector('[data-testid="editor-save"]'));
    });
    const put = calls("put").find((c) => c.url === "/me/profile");
    expect(put.body.entry_enabled).toBe(true);
    expect(put.body.entry_style).toBe("codelock");
  });
});

describe("editor assets", () => {
  it("offers each asset as its own uploader row in the simplified Profile tab", () => {
    renderAt("/!/dashboard/editor", <Editor />);
    // The Profile string: avatar, decoration, background, banner — each one a
    // row with its own action button, no square boxes to scroll past.
    for (const id of ["asset-avatar", "decoration-picker-row", "bg-mode-color", "bg-mode-media", "asset-banner"]) {
      expect(container.querySelector(`[data-testid="${id}"]`)).toBeTruthy();
    }
    // The background row defaults to a colour, with the media half behind its
    // own segmented control.
    expect(container.querySelector('[data-testid="bg-mode-color"]').getAttribute("aria-pressed")).toBe("true");
    // The MP3 upload lives on the Widgets & Music page — it is not needed here.
    expect(container.querySelector('[data-testid="asset-audio"]')).toBeNull();
  });
});

describe("links page", () => {
  it("uses icon presets instead of a platform dropdown", () => {
    renderAt("/!/dashboard", <Links />);
    expect(container.querySelector('[data-testid="links-page"]')).toBeTruthy();

    // the reported problem: a <select> of 36 platforms
    expect(container.querySelector("select")).toBeNull();

    expect(container.querySelector('[data-testid="link-presets"]')).toBeTruthy();
    for (const id of ["discord", "tiktok", "instagram", "youtube", "github"]) {
      expect(container.querySelector(`[data-testid="link-preset-${id}"]`)).toBeTruthy();
    }

    // the editor offers a searchable icon grid, still no dropdown
    click(container.querySelector('[data-testid="link-preset-tiktok"]'));
    expect(container.querySelector('[data-testid="link-platform-grid"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="link-platform-option-"]').length).toBeGreaterThan(30);
    expect(container.querySelector("select")).toBeNull();
  });

  // The editor modal used to carry a "Live Link Preview" panel beside the form.
  it("does not render the live link preview panel", () => {
    renderAt("/!/dashboard", <Links />);
    click(container.querySelector('[data-testid="link-preset-tiktok"]'));

    // the editor opened…
    expect(container.querySelector('[data-testid="link-modal-apply"]')).toBeTruthy();
    // …without the preview box
    expect(container.textContent).not.toContain("Live Link Preview");
  });

  it("saves the draft links to the profile", async () => {
    renderAt("/!/dashboard", <Links />);
    click(container.querySelector('[data-testid="link-preset-tiktok"]'));
    click(container.querySelector('[data-testid="link-modal-apply"]'));

    await act(async () => {
      click(container.querySelector('[data-testid="links-save-btn"]'));
    });

    const put = calls("put")[0];
    expect(put.url).toBe("/me/profile");
    expect(put.body.links).toHaveLength(1);
    expect(put.body.links[0].platform).toBe("tiktok");
  });
});

describe("widgets page", () => {
  it("offers a preset gallery with an icon per widget", () => {
    renderAt("/!/dashboard", <Widgets />);
    expect(container.querySelector('[data-testid="widgets-page"]')).toBeTruthy();
    for (const id of ["discord", "spotify", "roblox", "github", "youtube", "custom"]) {
      const tile = container.querySelector(`[data-testid="add-widget-${id}"]`);
      expect(tile).toBeTruthy();
      // each preset renders a real brand icon, not an empty box
      expect(tile.querySelector("svg")).toBeTruthy();
    }
  });

  // The six surface controls (two opacity sliders, four outline widths, four
  // corner presets) are gone; two presets remain, and they still write the real
  // surface values the renderer reads.
  it("offers two widget card styles instead of a wall of surface sliders", async () => {
    global.__DASH_USER__ = PREMIUM_USER;
    renderAt("/!/dashboard", <Widgets />);
    click(container.querySelector('[data-testid="add-widget-discord"]'));

    expect(container.querySelector('[data-testid="widget-card-style-glass"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="widget-card-style-solid"]')).toBeTruthy();
    for (const gone of ["widget-fill-alpha", "widget-outline-alpha", "widget-border-0", "widget-corner-pill"]) {
      expect(container.querySelector(`[data-testid="${gone}"]`)).toBeFalsy();
    }

    click(container.querySelector('[data-testid="widget-card-style-solid"]'));
    click(byText("Apply widget"));
    await act(async () => {
      click(container.querySelector('[data-testid="widget-save-btn"]'));
    });

    const saved = calls("put")[0].body.widgets[0];
    expect(saved.card_fill_alpha).toBe(100);
    expect(saved.card_radius).toBe(14);
    expect(saved.card_border_width).toBe(1);
  });

  it("draws every player style and browses them in a popup", () => {
    global.__DASH_USER__ = PREMIUM_USER;
    renderAt("/!/dashboard", <Widgets />);

    // The catalogue is three styles now: mini-bar, compact and corner-icon
    // (removed legacy ids are folded onto these by resolveTrackStyle).
    for (const id of ["mini-bar", "compact", "corner-icon"]) {
      expect(container.querySelector(`[data-testid="track-style-preview-${id}"]`)).toBeTruthy();
      expect(container.querySelector(`[data-testid="track-style-${id}"]`)).toBeTruthy();
    }

    // The popup shows them at full size, then applies the chosen one.
    expect(document.body.querySelector('[data-testid="track-style-gallery"]')).toBeFalsy();
    click(container.querySelector('[data-testid="browse-track-styles"]'));
    expect(document.body.querySelector('[data-testid="track-style-gallery"]')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="gallery-style-corner-icon"]')).toBeTruthy();

    click(document.body.querySelector('[data-testid="gallery-use-corner-icon"]'));
    expect(container.querySelector('[data-testid="track-style-corner-icon"]').getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-testid="track-style-compact"]').getAttribute("aria-pressed")).toBe("false");
  });

  it("applies every player style directly — none of them is locked any more", () => {
    // The catalogue was cut to three styles and all three are free, so a free
    // account picks any of them without a premium popup.
    global.__DASH_USER__ = FREE_USER;
    renderAt("/!/dashboard", <Widgets />);

    click(container.querySelector('[data-testid="track-style-corner-icon"]'));
    expect(document.body.querySelector('[data-testid="premium-gate"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="track-style-corner-icon"]').getAttribute("aria-pressed")).toBe("true");

    click(container.querySelector('[data-testid="track-style-mini-bar"]'));
    expect(container.querySelector('[data-testid="track-style-mini-bar"]').getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-testid="track-style-corner-icon"]').getAttribute("aria-pressed")).toBe("false");
  });

  it("never invents values for a widget the owner has not filled in", async () => {
    renderAt("/!/dashboard", <Widgets />);
    click(container.querySelector('[data-testid="add-widget-discord"]'));
    click(byText("Apply widget"));

    await act(async () => {
      click(container.querySelector('[data-testid="widget-save-btn"]'));
    });

    const saved = calls("put")[0].body.widgets[0];
    expect(saved.type).toBe("discord");
    expect(saved.online_count).toBe("");
    expect(saved.member_count).toBe("");
  });
});

describe("badges page", () => {
  it("persists an equip through /me/profile so it survives a reload", async () => {
    renderAt("/!/dashboard", <Badges />);
    expect(container.querySelector('[data-testid="badges-page"]')).toBeTruthy();

    // owns ["verified", "og"] and has "og" equipped, so verified is the Equip action
    const equip = [...container.querySelectorAll("button")].find(
      (b) => b.textContent.includes("Equip") && !b.textContent.includes("Equipped"),
    );
    expect(equip).toBeTruthy();

    await act(async () => {
      click(equip);
    });

    const put = calls("put")[0];
    expect(put.url).toBe("/me/profile");
    expect(put.body).toEqual({ equipped_badges: ["og", "verified"] });
  });

  // Badge styling is the glow and the overlay, and nothing per-badge: the page
  // must not offer a way to put anything but art behind a badge.
  it("saves the glow and the overlay, and clears the retired customisation", async () => {
    renderAt("/!/dashboard", <Badges />);

    // No per-badge styling control is left on the page.
    expect(container.querySelector('[data-testid="badge-customize-verified"]')).toBeNull();
    expect(container.querySelector('[data-testid="badge-editor"]')).toBeNull();
    expect(container.querySelector('[data-testid="badge-style-plate"]')).toBeNull();
    expect(container.querySelector('[data-testid="badge-size-lg"]')).toBeNull();
    expect(container.textContent).not.toContain("Recolor All");

    await act(async () => {
      click(container.querySelector('[data-testid="badge-style-open"]'));
    });
    expect(container.querySelector('[data-testid="badge-overlay-toggle"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="badge-overlay-slider"]')).toBeTruthy();
    // The overlap slider spread the row over itself; it is gone.
    expect(container.querySelector('[data-testid="badge-overlap-slider"]')).toBeNull();

    await act(async () => {
      click(container.querySelector('[data-testid="badge-glow-toggle"]'));
    });
    await act(async () => {
      click(container.querySelector('[data-testid="badge-overlay-toggle"]'));
    });
    await act(async () => {
      click(byText("Save Badge Styling"));
    });

    const put = calls("put")[0];
    expect(put.url).toBe("/me/profile");
    expect(put.body.badge_glow).toBe(false);
    expect(put.body.badge_overlay).toBe(true);
    expect(put.body.badge_overlay_color).toBe("#A48DF4");
    expect(put.body.badge_overlay_strength).toBe(60);
    // A profile that still carries an old plate, wash, overlap or per-badge
    // override is cleaned out by the same save.
    expect(put.body.badge_style).toBe("default");
    expect(put.body.badge_size).toBe("lg");
    expect(put.body.badge_icon_weight).toBe("normal");
    expect(put.body.badge_overlay_tint).toBe("");
    expect(put.body.badge_recolor_enabled).toBe(false);
    expect(put.body.badge_overrides).toEqual({});
  });
});

describe("no stock browser controls in the dashboard", () => {
  // A native checkbox or range input renders as the browser's default grey control,
  // which is what made the dashboard read as unfinished next to its own styling.
  const pages = fs.readdirSync(__dirname).filter((f) => f.endsWith(".jsx"));

  // SiteSettings styles its inputs with `sr-only peer` + a drawn track, so those are
  // custom controls already and are deliberately allowed.
  const nativeControls = (src) => {
    const found = [];
    const re = /type="(checkbox|range)"/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const context = src.slice(Math.max(0, m.index - 200), m.index + 260);
      if (!context.includes("sr-only")) found.push(m[1]);
    }
    return found;
  };

  it.each(pages)("%s uses styled controls", (file) => {
    const src = fs.readFileSync(path.join(__dirname, file), "utf8");
    expect(nativeControls(src)).toEqual([]);
  });

  it("drives the editor's toggles and sliders through the shared primitives", () => {
    const editor = fs.readFileSync(path.join(__dirname, "Editor.jsx"), "utf8");
    expect(editor).toContain('from "@/components/ui/switch"');
    expect(editor).toContain('from "@/components/ui/slider"');
    expect(editor).toContain("<Switch");
    expect(editor).toContain("<Slider");
  });
});

// The dashboard pages below were rewritten for spacing and no test rendered them,
// so a runtime error in any of them would have passed both the build and the suite.
describe("rewritten dashboard pages render", () => {
  it.each([
    ["stats", <Stats />],
    ["leaderboard", <Leaderboard />],
    ["analytics", <Analytics />],
  ])("mounts the %s page", (name, element) => {
    renderAt("/!/dashboard", element);
    expect(container.querySelector(`[data-testid="${name}-page"]`)).toBeTruthy();
  });

  // The Redeem Premium card: the dashboard front page's door for an invite
  // code AFTER someone signed up. A free account sees it, pastes the code,
  // and the backend grants the tier (permanently or for the code's days).
  it("redeems a premium invite code from the overview", async () => {
    global.__DASH_USER__ = FREE_USER;
    renderAt("/!/dashboard", <Overview />);
    const card = container.querySelector('[data-testid="redeem-premium-card"]');
    expect(card).toBeTruthy();
    await act(async () => {});

    const input = container.querySelector('[data-testid="redeem-premium-input"]');
    const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    act(() => {
      setVal.call(input, "SWATS-TRIAL123");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click([...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "Redeem"));
    await act(async () => {});

    const post = calls("post").find((c) => c.url === "/me/redeem-invite");
    expect(post).toBeTruthy();
    expect(post.body.code).toBe("SWATS-TRIAL123");
  });

  // Admins/owner hold codes too (badge-carrying ones especially), and hiding
  // the box from them is exactly why the owner could never find it.
  it("offers the redeem box to an admin as well", () => {
    global.__DASH_USER__ = { ...FREE_USER, role: "admin", tier: "admin" };
    renderAt("/!/dashboard", <Overview />);
    expect(container.querySelector('[data-testid="redeem-premium-card"]')).toBeTruthy();
  });
});
