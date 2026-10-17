import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import DashboardLayout from "./DashboardLayout";
import AdminHub from "./Admin";

/* The admin area is one sidebar entry with its pages as the section's own tabs.
   The other dashboard suites all render a free user, so none of them would notice
   if that entry disappeared, doubled, or came back as seven separate links. */

global.IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: true,
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

const ADMIN_USER = {
  username: "owner",
  display_name: "Owner",
  role: "admin",
  tier: "premium",
  is_owner: true,
  uid_number: 1,
  views: 9001,
  badges: ["owner", "admin"],
  equipped_badges: [],
  discord: { linked: true, username: "owner" },
  created_at: "2024-01-01T00:00:00.000Z",
  profile: { bio: "", links: [], widgets: [], tracks: [] },
};

const FREE_USER = {
  ...ADMIN_USER,
  username: "tester",
  display_name: "Tester",
  role: "user",
  tier: "free",
  is_owner: false,
  discord: { linked: false },
};

global.__DASH_USER__ = ADMIN_USER;

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: global.__DASH_USER__,
    setUser: () => {},
    logout: () => {},
    refresh: () => {},
  }),
}));

global.__API_CALLS__ = [];
global.__GET__ = {};

jest.mock("@/lib/api", () => ({
  api: {
    get: (url) => {
      global.__API_CALLS__.push({ method: "get", url });
      const entry = Object.entries(global.__GET__).find(([prefix]) => url.startsWith(prefix));
      return Promise.resolve({ data: entry ? entry[1] : [] });
    },
    put: (url, body) => {
      global.__API_CALLS__.push({ method: "put", url, body });
      return Promise.resolve({ data: {} });
    },
    post: (url, body) => {
      global.__API_CALLS__.push({ method: "post", url, body });
      return Promise.resolve({ data: {} });
    },
    delete: (url) => {
      global.__API_CALLS__.push({ method: "delete", url });
      return Promise.resolve({ data: {} });
    },
  },
  fileUrl: (u) => u || "",
}));

let container;
let root;

beforeEach(() => {
  global.__DASH_USER__ = ADMIN_USER;
  global.__API_CALLS__ = [];
  global.__GET__ = {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const renderAt = async (path) => {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/!/dashboard" element={<DashboardLayout />}>
            <Route path="admin" element={<AdminHub />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  });
};

describe("admin navigation", () => {
  it("shows one Admin entry instead of a link per admin page", async () => {
    await renderAt("/!/dashboard/admin");

    // The single entry, pointing at the hub.
    const entry = container.querySelector('[data-testid="tab-admin"]');
    expect(entry).toBeTruthy();
    expect(entry.getAttribute("href")).toBe("/!/dashboard/admin");

    // None of the old top-level admin destinations is still a sidebar link. Only
    // the header tab strip and mobile chips are allowed to link to them, and those
    // carry their own testids.
    for (const path of ["/!/dashboard/bot", "/!/dashboard/users", "/!/dashboard/invites", "/!/dashboard/site"]) {
      expect(container.querySelector(`aside a[href="${path}"]`)).toBeFalsy();
    }
  });

  it("exposes every admin page as a tab of that one section", async () => {
    await renderAt("/!/dashboard/admin");

    // The header strip is where the admin pages live now. Each one has to be
    // reachable from it, and none of them may be missing from the strip. The
    // old Bot tab is gone — its roster is the Users tab now, and /admin/bot is
    // a redirect that exists outside this shell in App.js.
    const expected = {
      "strip-tab-admin-overview": "/!/dashboard/admin",
      "strip-tab-admin-users": "/!/dashboard/admin/users",
      "strip-tab-admin-invites": "/!/dashboard/admin/invites",
      "strip-tab-admin-notify": "/!/dashboard/admin/notify",
      "strip-tab-admin-devlogs": "/!/dashboard/admin/devlogs",
      "strip-tab-admin-site": "/!/dashboard/admin/site",
      "strip-tab-admin-analytics": "/!/dashboard/admin/analytics",
      "strip-tab-admin-audit": "/!/dashboard/admin/audit",
    };

    for (const [id, href] of Object.entries(expected)) {
      const tab = container.querySelector(`[data-testid="${id}"]`);
      expect(tab).toBeTruthy();
      expect(tab.getAttribute("href")).toBe(href);
    }

    expect(container.querySelector("h1").textContent).toBe("Admin");
  });

  it("shows the admin section directly above the page it belongs to", async () => {
    await renderAt("/!/dashboard/admin");
    // Strip and sidebar are two different lists that must not be conflated: the
    // strip holds the sections, the sidebar holds the one entry.
    expect(container.querySelectorAll('[data-testid^="strip-tab-admin-"]')).toHaveLength(8);
    expect(container.querySelectorAll('aside a[href^="/!/dashboard/admin"]')).toHaveLength(1);
  });

  it("does not put the admin entry in a normal user's sidebar", async () => {
    global.__DASH_USER__ = FREE_USER;
    await renderAt("/!/dashboard/admin");

    expect(container.querySelector('[data-testid="tab-admin"]')).toBeFalsy();
    expect(container.querySelectorAll('[data-testid^="tab-admin-"]')).toHaveLength(0);
  });
});

describe("admin hub", () => {
  it("shows the numbers it read, formatted", async () => {
    global.__GET__["/admin/analytics"] = { total_users: 1024, premium_users: 64, total_views: 39012, recent_signups: [] };
    global.__GET__["/admin/discord/roster"] = { users: [], stats: { discord_linked: 700, discord_missing: 324 } };
    global.__GET__["/admin/notify/history"] = [{ batch_id: "b1", recipients: 300 }, { batch_id: "b2", recipients: 12 }];

    await renderAt("/!/dashboard/admin");

    expect(container.querySelector('[data-testid="admin-stat-users"]').textContent).toContain("1,024");
    expect(container.querySelector('[data-testid="admin-stat-users"]').textContent).toContain("700 with Discord linked");
    expect(container.querySelector('[data-testid="admin-stat-premium"]').textContent).toContain("64");
    expect(container.querySelector('[data-testid="admin-stat-views"]').textContent).toContain("39,012");
    // Two sends, 312 recipients in total.
    expect(container.querySelector('[data-testid="admin-stat-sends"]').textContent).toContain("312");
  });

  it("links to every section, and flags accounts with no Discord", async () => {
    global.__GET__["/admin/analytics"] = { total_users: 10, premium_users: 1, total_views: 5, recent_signups: [] };
    global.__GET__["/admin/discord/roster"] = { users: [], stats: { discord_linked: 7, discord_missing: 3 } };
    global.__GET__["/admin/notify/history"] = [];

    await renderAt("/!/dashboard/admin");

    const cards = [...container.querySelectorAll('[data-testid^="admin-card-"]')];
    expect(cards).toHaveLength(7);
    expect(cards.map((c) => c.getAttribute("href"))).toEqual([
      "/!/dashboard/admin/users",
      "/!/dashboard/admin/invites",
      "/!/dashboard/admin/notify",
      "/!/dashboard/admin/devlogs",
      "/!/dashboard/admin/site",
      "/!/dashboard/admin/analytics",
      "/!/dashboard/admin/audit",
    ]);

    // The three unlinked accounts are called out, because the Auth check gate
    // blocks exactly those accounts from editing their profiles.
    const gap = container.querySelector('[data-testid="admin-discord-gap"]');
    expect(gap).toBeTruthy();
    expect(gap.textContent).toContain("3");
  });
});
