import { createRoot } from "react-dom/client";
import { act } from "react";
import { api } from "@/lib/api";

/* The invite generator's badge picker. A code that carries badges is what makes
   "this invite hands out OG/Verified/Media" possible at all, so the chips must
   reach the request the admin actually sends — and they must never offer the
   two badges that mean "staff". */

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notify", () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

const { default: InviteCodes } = require("./InviteCodes");

let container;
let root;
let get;
let post;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  get = jest.spyOn(api, "get").mockResolvedValue({ data: [] });
  post = jest.spyOn(api, "post").mockResolvedValue({ data: { code: "VIP2026", grants_badges: ["og"] } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  get.mockRestore();
  post.mockRestore();
});

const draw = async () => {
  await act(async () => {
    root.render(<InviteCodes />);
    await Promise.resolve();
    await Promise.resolve();
  });
};

const chip = (id) => container.querySelector(`[data-testid="invite-badge-${id}"]`);
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

it("offers every grantable badge and none of the staff ones", async () => {
  await draw();
  for (const id of ["og", "verified", "bug_hunter", "team", "media", "featured", "partner", "donater"]) {
    expect(chip(id)).toBeTruthy();
  }
  // A code can never mint staff status.
  expect(chip("owner")).toBeFalsy();
  expect(chip("admin")).toBeFalsy();
});

it("sends the chosen badges with the code it creates", async () => {
  await draw();

  click(chip("og"));
  click(chip("media"));
  expect(chip("og").getAttribute("aria-pressed")).toBe("true");
  // Clicking again takes it back off — the posted list must match the chips.
  click(chip("media"));
  expect(chip("media").getAttribute("aria-pressed")).toBe("false");

  const form = container.querySelector("form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });

  const call = post.mock.calls.find(([url]) => url === "/admin/invites");
  expect(call).toBeTruthy();
  expect(call[1].grants_badges).toEqual(["og"]);
});

it("sends an empty list when no badge was picked", async () => {
  await draw();

  const form = container.querySelector("form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });

  expect(post.mock.calls[0][1].grants_badges).toEqual([]);
});
