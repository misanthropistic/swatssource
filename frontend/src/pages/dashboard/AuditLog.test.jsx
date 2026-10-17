import { createRoot } from "react-dom/client";
import { act } from "react";
import { api } from "@/lib/api";

/* The audit log is the admin's answer to "who did what, and to what". These pin
   the parts that make it usable rather than a JSON dump: every row says what the
   action WAS, a filter actually reaches the server, paging is honest about the
   total, and the detail is there on demand. */

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notify", () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

const { default: AuditLog } = require("./AuditLog");
const { actionLabel, actionTone } = require("@/constants/audit");

const EVENTS = [
  {
    id: 3,
    created_at: "2026-10-17T09:00:00.000Z",
    actor_id: "u1",
    actor_username: "sam",
    actor_role: "admin",
    action: "user.update",
    target_type: "user",
    target_id: "8f1c2d3e-0000",
    detail: { username: { from: "old", to: "new" }, role: { from: "user", to: "premium" } },
    ip: "203.0.113.9",
    user_agent: "Mozilla/5.0",
  },
  {
    id: 2,
    created_at: "2026-10-17T08:00:00.000Z",
    actor_id: null,
    actor_username: null,
    actor_role: "system",
    action: "rewards.grant",
    target_type: "user",
    target_id: "8f1c2d3e-1111",
    detail: { milestone_views: 1000, premium_days: 3 },
    ip: null,
    user_agent: null,
  },
  {
    id: 1,
    created_at: "2026-10-17T07:00:00.000Z",
    actor_id: "u1",
    actor_username: "sam",
    actor_role: "admin",
    action: "user.delete",
    target_type: "user",
    target_id: "8f1c2d3e-2222",
    detail: { username: "gone" },
    ip: null,
    user_agent: null,
  },
];

let container;
let root;
let get;

const response = (over = {}) => ({
  data: { events: EVENTS, total: EVENTS.length, actions: ["rewards.grant", "user.delete", "user.update"], limit: 50, offset: 0, ...over },
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  get = jest.spyOn(api, "get").mockResolvedValue(response());
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  get.mockRestore();
});

const draw = async () => {
  await act(async () => {
    root.render(<AuditLog />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return container;
};

const rows = () => [...container.querySelectorAll('[data-testid="audit-row"]')];

// A visible rate limit for the search box: every keystroke must not fire its own
// request, or typing an actor's name hammers the admin API.
it("reads the trail once on mount and lists a row per event", async () => {
  await draw();
  expect(get).toHaveBeenCalledWith("/admin/audit", expect.objectContaining({ params: expect.anything() }));
  expect(get).toHaveBeenCalledTimes(1);
  expect(rows()).toHaveLength(3);
  expect(container.textContent).toContain("Account edited");
  expect(container.textContent).toContain("View reward granted");
  expect(container.textContent).toContain("Account deleted");
});

it("says what kind of event each row is, not just its id", () => {
  expect(actionLabel("user.update")).toBe("Account edited");
  expect(actionLabel("rewards.grant")).toBe("View reward granted");
  // An event type added later still renders readably instead of disappearing.
  expect(actionLabel("user.shadow_ban")).toBe("User shadow ban");
  expect(actionLabel("")).toBe("Event");
  expect(actionTone("user.delete")).toBe("danger");
  expect(actionTone("auth.signin")).toBe("accent");
  expect(actionTone("billing.premium")).toBe("good");
});

it("shows the system as the actor when no account made the change", async () => {
  await draw();
  const reward = rows()[1];
  expect(reward.textContent).toContain("system");
  expect(reward.textContent).toContain("1000 views → 3d Premium");
});

it("passes the filters to the server and starts again at the first page", async () => {
  // More than one page of events, so "Older" is actually available.
  get.mockResolvedValueOnce(response({ total: 120 }));
  await draw();
  // Page forward, then filter: the offset must reset, or the admin lands on an
  // empty page of a smaller result set.
  const next = container.querySelector('[data-testid="audit-next"]');
  await act(async () => { next.click(); await Promise.resolve(); });
  expect(get).toHaveBeenLastCalledWith("/admin/audit", expect.objectContaining({
    params: expect.objectContaining({ offset: 50 }),
  }));

  const action = container.querySelector('[data-testid="audit-action"]');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    setter.call(action, "user.update");
    action.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
  expect(get).toHaveBeenLastCalledWith("/admin/audit", expect.objectContaining({
    params: expect.objectContaining({ action: "user.update", offset: 0 }),
  }));

  const actor = container.querySelector('[data-testid="audit-actor"]');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(actor, "sam");
    actor.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
  expect(get).toHaveBeenLastCalledWith("/admin/audit", expect.objectContaining({
    params: expect.objectContaining({ actor: "sam", offset: 0 }),
  }));
});

it("keeps the full payload one click away instead of in the row", async () => {
  await draw();
  expect(container.querySelector('[data-testid="audit-detail"]')).toBeNull();

  await act(async () => {
    rows()[0].querySelector('[data-testid="audit-detail-toggle"]').click();
    await Promise.resolve();
  });

  const detail = container.querySelector('[data-testid="audit-detail"]');
  expect(detail).toBeTruthy();
  // Before AND after, which is the reason the row stores both.
  expect(detail.textContent).toContain('"from": "old"');
  expect(detail.textContent).toContain('"to": "new"');
  expect(detail.textContent).toContain("user-agent: Mozilla/5.0");
});

it("counts honestly and disables paging at the edges", async () => {
  await draw();
  expect(container.querySelector('[data-testid="audit-count"]').textContent).toContain("1–3 of 3");
  expect(container.querySelector('[data-testid="audit-prev"]').disabled).toBe(true);
  expect(container.querySelector('[data-testid="audit-next"]').disabled).toBe(true);
});

it("says so when the server refuses, instead of an empty table with no reason", async () => {
  get.mockRejectedValueOnce({ response: { data: { detail: "Admin privileges required" } } });
  await draw();
  expect(container.querySelector('[data-testid="audit-error"]').textContent).toContain("Admin privileges required");
});

it("shows the empty state for a filter that matches nothing", async () => {
  get.mockResolvedValueOnce(response({ events: [], total: 0 }));
  await draw();
  expect(container.querySelector('[data-testid="audit-empty"]').textContent).toContain("Nothing recorded yet");
});
