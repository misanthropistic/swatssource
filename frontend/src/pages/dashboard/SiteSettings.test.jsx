import { createRoot } from "react-dom/client";
import { act } from "react";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";

/* View rewards are the one admin panel where "I set it and nothing happened"
 * was true twice over: the milestone row was keyed by its own VALUES, so typing
 * a number remounted the input and dropped focus after one digit; and a failed
 * save threw the server's reason away and showed a generic toast. Both are
 * pinned here, because neither is visible from a screenshot. */

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notify", () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

// The announcement panel has its own reads and writers; it is not this page's job.
jest.mock("@/components/AnnouncementManager", () => ({ __esModule: true, default: () => <div data-testid="announcements" /> }));

const { default: SiteSettings } = require("./SiteSettings");

let container;
let root;
let get;
let put;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  get = jest.spyOn(api, "get").mockImplementation((url) =>
    Promise.resolve({
      data: url === "/admin/rewards-settings"
        ? { enabled: true, milestones: [{ views: 1000, premium_days: 3 }] }
        : { registration_open: true, discord_required: false },
    }),
  );
  put = jest.spyOn(api, "put").mockResolvedValue({ data: { enabled: true, milestones: [{ views: 1000, premium_days: 3 }] } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  get.mockRestore();
  put.mockRestore();
});

const draw = async () => {
  await act(async () => {
    root.render(<SiteSettings />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return container;
};

const type = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
};

const viewsInput = () => container.querySelector('[data-testid="reward-row-0"] input[type="number"]');

it("keeps the milestone field focused while a number is typed", async () => {
  await draw();
  const input = viewsInput();
  expect(input.value).toBe("1000");

  input.focus();
  await type(input, "2");
  // The same DOM node, still focused: the row is keyed by its position, not by
  // the value being edited.
  expect(viewsInput()).toBe(input);
  expect(document.activeElement).toBe(input);

  await type(input, "25");
  expect(document.activeElement).toBe(input);
  expect(viewsInput().value).toBe("25");
});

it("adds a milestone and saves the list it shows", async () => {
  await draw();
  await act(async () => {
    container.querySelector('[data-testid="rewards-add-milestone"]').click();
    await Promise.resolve();
  });
  expect(container.querySelectorAll('[data-testid^="reward-row-"]')).toHaveLength(2);

  await act(async () => {
    container.querySelector('[data-testid="rewards-save"]').click();
    await Promise.resolve();
  });

  expect(put).toHaveBeenCalledWith("/admin/rewards-settings", {
    enabled: true,
    milestones: [{ views: 1000, premium_days: 3 }, { views: 1000, premium_days: 3 }],
  });
  expect(toast.success).toHaveBeenCalledWith("View rewards saved");
});

it("refuses to save a milestone the engine would silently drop", async () => {
  await draw();
  await type(viewsInput(), "");

  await act(async () => {
    container.querySelector('[data-testid="rewards-save"]').click();
    await Promise.resolve();
  });

  expect(put).not.toHaveBeenCalled();
  expect(container.querySelector('[data-testid="rewards-problems"]').textContent).toContain("view count of 1 or more");
  expect(toast.error).toHaveBeenCalled();
});

it("reports the server's reason when the save is refused", async () => {
  put.mockRejectedValueOnce({ response: { data: { detail: "Failed to save reward settings" } } });
  await draw();

  await act(async () => {
    container.querySelector('[data-testid="rewards-save"]').click();
    await Promise.resolve();
  });

  expect(toast.error).toHaveBeenCalledWith("Failed to save reward settings");
  expect(toast.success).not.toHaveBeenCalled();
});
