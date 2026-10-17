import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import DashboardLayout from "./DashboardLayout";
import Overview from "./Overview";

/* The main dashboard suite (`dashboard.test.js`) also imports the Editor, which
   pulls in `@/components/overlays` — a module that is missing from this
   checkout, so that file cannot run at all. These tests cover the reworked
   shell and Overview without touching the editor, so a regression in the new
   navigation, tab strip or dialogs is still caught. */

global.IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: true, // reduced-motion on so count-ups resolve instantly
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
  uid_number: 41011,
  views: 42,
  badges: ["verified", "og"],
  equipped_badges: ["og"],
  discord: { linked: false },
  created_at: "2025-01-05T00:00:00.000Z",
  profile: { bio: "hello world", links: [], widgets: [], tracks: [], accent_color: "#FF7FBC" },
};

global.__DASH_USER__ = FREE_USER;

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: global.__DASH_USER__,
    setUser: () => {},
    logout: () => {},
    refresh: () => {},
  }),
}));

global.__API_CALLS__ = [];

jest.mock("@/lib/api", () => ({
  api: {
    get: (url) => {
      global.__API_CALLS__.push({ method: "get", url });
      return Promise.resolve({ data: [] });
    },
    put: (url, body) => {
      global.__API_CALLS__.push({ method: "put", url, body });
      return Promise.resolve({ data: { username: body?.username } });
    },
    post: (url, body) => {
      global.__API_CALLS__.push({ method: "post", url, body });
      return Promise.resolve({ data: {} });
    },
  },
  fileUrl: (u) => u || "",
}));

let container;
let root;

const calls = (method) => global.__API_CALLS__.filter((c) => c.method === method);
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

beforeEach(() => {
  global.__DASH_USER__ = FREE_USER;
  global.__API_CALLS__ = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  // Dialogs are portalled to <body>, so clear anything they left behind.
  document.body.innerHTML = "";
});

// Async so the layout's own /stats and /leaderboard fetches settle inside act().
const renderDashboard = async () => {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/!/dashboard"]}>
        <Routes>
          <Route path="/!/dashboard" element={<DashboardLayout />}>
            <Route index element={<Overview />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  });
};

describe("reworked dashboard shell", () => {
  it("renders dropdown categories whose header is a real toggle", async () => {
    await renderDashboard();

    const account = container.querySelector('[data-testid="navgroup-account"]');
    const customization = container.querySelector('[data-testid="navgroup-customization"]');
    const insights = container.querySelector('[data-testid="navgroup-insights"]');
    expect(account).toBeTruthy();
    expect(customization).toBeTruthy();
    expect(insights).toBeTruthy();

    // Expanded by default, and folding one flips its aria state.
    expect(insights.getAttribute("aria-expanded")).toBe("true");
    click(insights);
    expect(insights.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the active category as the title and its pages as a tab strip", async () => {
    await renderDashboard();

    expect(container.querySelector("h1").textContent).toBe("Account");
    // The reference strip: the pages of the Account category.
    expect(container.querySelector('[data-testid="tab-overview"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-stats"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-badges"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-settings"]')).toBeTruthy();

    // Sidebar extras from the reference: the Discord card. The language
    // dropdown is gone — switching it did nothing but toast the choice.
    expect(container.querySelector('[data-testid="discord-card"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="language-select"]')).toBeFalsy();
    expect(container.textContent).toContain("@tester");
    expect(container.textContent).toContain("UID 41011");
  });

  it("keeps the public link and logout reachable", async () => {
    await renderDashboard();
    expect(container.querySelector('[data-testid="view-public-btn"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="logout-btn"]')).toBeTruthy();
  });
});

describe("overview statistics", () => {
  // The six dialog-behind-every-tile Overview is gone. What remains is a strip
  // of quiet fact chips and the two things worth doing from here, so the tests
  // pin the strip and what each chip links to.
  it("renders the stat chips, completion checklist and connections", async () => {
    await renderDashboard();

    expect(container.querySelector('[data-testid="stat-username"]').textContent).toContain("tester");
    expect(container.querySelector('[data-testid="stat-views"]').textContent).toContain("42");
    expect(container.querySelector('[data-testid="stat-tier"]').textContent).toContain("Free");

    expect(container.querySelector('[data-testid="completion-card"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="connect-card"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="connect-discord-btn"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="analytics-view-more"]')).toBeTruthy();

    // Account quick actions.
    for (const id of ["qa-username", "qa-layout", "qa-settings"]) {
      expect(container.querySelector(`[data-testid="${id}"]`)).toBeTruthy();
    }
  });

  it("links each chip where its number lives, and puts no dialogs behind them", async () => {
    await renderDashboard();

    expect(container.querySelector('[data-testid="stat-tier"]').getAttribute("href")).toContain("/!/pricing");
    expect(container.querySelector('[data-testid="stat-views"]').getAttribute("href")).toContain("/!/dashboard/stats");
    expect(container.querySelector('[data-testid="stat-badges"]').getAttribute("href")).toContain("/!/dashboard/badges");

    // Clicking a chip opens nothing: the old modal zoo (alias, uid, views, tier,
    // badges, layout) is retired with the clutter it made.
    const before = document.querySelectorAll('[data-testid^="modal-"]').length;
    click(container.querySelector('[data-testid="stat-username"]'));
    expect(document.querySelectorAll('[data-testid^="modal-"]').length).toBe(before);
    expect(document.body.style.overflow).toBe("");
  });
});
