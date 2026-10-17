import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

import NotificationBell from "@/components/NotificationBell";
import Notices from "./Notices";
import Devlogs from "./Devlogs";

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

// Responses are routed by URL prefix so each test only has to declare the data
// it cares about; everything else answers with an empty array, which is what the
// real endpoints return for an account with nothing in it.
global.__API_CALLS__ = [];
global.__GET__ = {};

jest.mock("@/lib/api", () => ({
  api: {
    get: (url) => {
      global.__API_CALLS__.push({ method: "get", url });
      const entry = Object.entries(global.__GET__).find(([prefix]) => url.startsWith(prefix));
      return Promise.resolve({ data: entry ? entry[1] : [] });
    },
    post: (url, body) => {
      global.__API_CALLS__.push({ method: "post", url, body });
      // Mirrors what each endpoint really answers: a devlog comes back as the
      // created row (the page prepends it to the list), a send reports counts.
      if (url === "/admin/devlogs") {
        return Promise.resolve({ data: { id: "d-new", created_at: new Date().toISOString(), ...body, notified: 2 } });
      }
      if (url === "/admin/notify") return Promise.resolve({ data: { ok: true, sent: 3, batch_id: "batch-1" } });
      return Promise.resolve({ data: { ok: true } });
    },
    patch: (url, body) => {
      global.__API_CALLS__.push({ method: "patch", url, body });
      return Promise.resolve({ data: {} });
    },
    delete: (url) => {
      global.__API_CALLS__.push({ method: "delete", url });
      return Promise.resolve({ data: { ok: true } });
    },
  },
  fileUrl: (u) => u || "",
}));

let container;
let root;

const calls = (method) => global.__API_CALLS__.filter((c) => c.method === method);
const text = () => container.textContent;

const render = async (element) => {
  await act(async () => {
    root.render(<MemoryRouter>{element}</MemoryRouter>);
  });
};

const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const type = async (el, value) => {
  await act(async () => {
    // React reads the value off the element's own prototype, so a textarea needs
    // the textarea setter — calling the input one throws.
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

/* The user picker debounces its roster request, so an element that depends on it
   does not exist yet on the next tick. */
const waitFor = async (finder, timeout = 2000) => {
  const started = Date.now();
  for (;;) {
    const found = finder();
    if (found) return found;
    if (Date.now() - started > timeout) throw new Error("waitFor timed out");
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
};

beforeEach(() => {
  global.__API_CALLS__ = [];
  global.__GET__ = {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const inboxItems = [
  { id: "n1", kind: "devlog", title: "Custom code widgets are live", body: "Short body", href: "/!/devlogs", read_at: null, created_at: new Date().toISOString() },
  { id: "n2", kind: "inbox", title: "Premium weekend", body: null, href: null, read_at: new Date().toISOString(), created_at: new Date().toISOString() },
];

describe("notification bell", () => {
  it("shows the unread count and lists the inbox", async () => {
    global.__GET__["/notifications"] = { items: inboxItems, unread: 1 };
    await render(<NotificationBell />);

    expect(container.querySelector('[data-testid="notification-badge"]').textContent).toBe("1");

    await click(container.querySelector('[data-testid="notification-bell"]'));
    expect(container.querySelector('[data-testid="notification-panel"]')).toBeTruthy();
    expect(text()).toContain("Custom code widgets are live");
    expect(container.querySelectorAll('[data-testid="notification-item"]')).toHaveLength(2);
  });

  it("has no badge at all when there is nothing unread", async () => {
    global.__GET__["/notifications"] = { items: [inboxItems[1]], unread: 0 };
    await render(<NotificationBell />);

    expect(container.querySelector('[data-testid="notification-badge"]')).toBeFalsy();
    await click(container.querySelector('[data-testid="notification-bell"]'));
    // The read item is still listed — no badge simply means nothing new.
    expect(container.querySelectorAll('[data-testid="notification-item"]')).toHaveLength(1);
  });

  it("says so when the inbox is empty", async () => {
    global.__GET__["/notifications"] = { items: [], unread: 0 };
    await render(<NotificationBell />);
    await click(container.querySelector('[data-testid="notification-bell"]'));

    expect(text()).toContain("Nothing yet");
    expect(container.querySelectorAll('[data-testid="notification-item"]')).toHaveLength(0);
  });

  it("marks a single item read with its id, and only that one", async () => {
    global.__GET__["/notifications"] = { items: inboxItems, unread: 1 };
    await render(<NotificationBell />);
    await click(container.querySelector('[data-testid="notification-bell"]'));

    const unread = [...container.querySelectorAll('[data-testid="notification-item"]')].find((b) =>
      b.textContent.includes("Custom code widgets are live"),
    );
    await click(unread);

    const reads = calls("post").filter((c) => c.url === "/notifications/read");
    expect(reads).toHaveLength(1);
    expect(reads[0].body).toEqual({ ids: ["n1"] });
  });

  it("marks everything read with an empty id list", async () => {
    global.__GET__["/notifications"] = { items: inboxItems, unread: 4 };
    await render(<NotificationBell />);
    await click(container.querySelector('[data-testid="notification-bell"]'));
    await click(container.querySelector('[data-testid="notification-mark-all"]'));

    const reads = calls("post").filter((c) => c.url === "/notifications/read");
    expect(reads[0].body).toEqual({});
    expect(container.querySelector('[data-testid="notification-badge"]')).toBeFalsy();
  });
});

describe("admin inbox composer", () => {
  it("shows the recipient count it read from the server", async () => {
    global.__GET__["/admin/notify/audiences"] = { audiences: ["all", "specific"], counts: { all: 128 } };
    await render(<Notices />);

    expect(text()).toContain("128 recipients");
  });

  it("sends to everyone by default", async () => {
    global.__GET__["/admin/notify/audiences"] = { audiences: ["all"], counts: { all: 5 } };
    await render(<Notices />);

    await type(container.querySelector('[data-testid="notice-title"]'), "Server maintenance tonight");
    await type(container.querySelector('[data-testid="notice-body"]'), "Uploads pause from 02:00 UTC.");
    await act(async () => {
      container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const sent = calls("post").filter((c) => c.url === "/admin/notify");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({
      title: "Server maintenance tonight",
      body: "Uploads pause from 02:00 UTC.",
      href: null,
      audience: "all",
      user_ids: [],
    });
  });

  it("refuses to send without a title", async () => {
    global.__GET__["/admin/notify/audiences"] = { audiences: ["all"], counts: { all: 5 } };
    await render(<Notices />);

    await act(async () => {
      container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(calls("post").filter((c) => c.url === "/admin/notify")).toHaveLength(0);
  });

  it("only offers the hand-picked picker when 'specific people' is chosen", async () => {
    global.__GET__["/admin/notify/audiences"] = { audiences: ["all", "specific"], counts: { all: 5 } };
    global.__GET__["/admin/discord/roster"] = {
      users: [
        { id: "u1", username: "tester", email: "t@example.com", tier: "free", discord_linked: true, discord_username: "tester#1" },
      ],
      stats: {},
    };
    await render(<Notices />);

    expect(container.querySelector('[data-testid="notice-user-picker"]')).toBeFalsy();

    // The audience select is the shared SmartSelect: open it and click the option.
    await click(container.querySelector('[data-testid="notice-audience"] button'));
    const options = [...container.querySelectorAll('[data-testid="notice-audience"] button')];
    await click(options.find((b) => b.textContent.includes("Specific people")));

    expect(container.querySelector('[data-testid="notice-user-picker"]')).toBeTruthy();

    // Picking someone threads their id into the send payload. The roster request
    // is debounced, so the row appears a moment after the picker does.
    const option = await waitFor(() => container.querySelector('[data-testid="notice-user-picker-option"]'));
    await click(option);
    await type(container.querySelector('[data-testid="notice-title"]'), "Just for you");
    await act(async () => {
      container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const sent = calls("post").filter((c) => c.url === "/admin/notify");
    expect(sent[0].body).toMatchObject({ audience: "specific", user_ids: ["u1"] });
  });
});

describe("admin devlog publisher", () => {
  it("publishes with a notification audience and reports how many were told", async () => {
    global.__GET__["/admin/devlogs"] = [];
    await render(<Devlogs />);

    await type(container.querySelector('[data-testid="devlog-title"]'), "Widgets are live");
    await type(container.querySelector('[data-testid="devlog-body"]'), "Full rewrite of the widget editor.");
    await act(async () => {
      container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const published = calls("post").filter((c) => c.url === "/admin/devlogs");
    expect(published).toHaveLength(1);
    expect(published[0].body).toMatchObject({
      title: "Widgets are live",
      notify: true,
      audience: "all",
      published: true,
    });

    // The created post is prepended to the list, so the page proves it landed.
    expect(container.querySelectorAll('[data-testid="devlog-row"]')).toHaveLength(1);
    expect(text()).toContain("Widgets are live");
  });

  it("will not publish a devlog with no title", async () => {
    global.__GET__["/admin/devlogs"] = [];
    await render(<Devlogs />);

    await act(async () => {
      container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(calls("post").filter((c) => c.url === "/admin/devlogs")).toHaveLength(0);
  });

  it("lists what was published and can unpublish it", async () => {
    global.__GET__["/admin/devlogs"] = [
      { id: "d1", title: "Older post", body: "body", tag: "Fix", pinned: false, published: true, created_at: new Date().toISOString() },
    ];
    await render(<Devlogs />);

    expect(container.querySelectorAll('[data-testid="devlog-row"]')).toHaveLength(1);

    const unpublish = container.querySelector('[data-testid="devlog-row"] button[title="Unpublish"]');
    await click(unpublish);

    const patched = calls("patch").filter((c) => c.url === "/admin/devlogs/d1");
    expect(patched[0].body).toEqual({ published: false });
  });
});
