import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { toast } from "@/lib/notify";

/* Discord is how accounts are made here, so "Add another account" now ends on
 * this page with a pair result instead of a session. Each outcome has to say
 * something true — and a pair must never adopt a token, because the account on
 * screen is deliberately unchanged. */

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notify", () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

const mockRefresh = jest.fn(() => Promise.resolve({ id: "u1" }));
jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ refresh: mockRefresh }),
}));
const refresh = mockRefresh;

const { default: DiscordCallback } = require("./DiscordCallback");

const paths = [];
function Spy() {
  paths.push(useLocation().pathname);
  return null;
}

let container;
let root;

beforeEach(() => {
  paths.length = 0;
  // CRA resets mock implementations between tests, so re-arm it here.
  refresh.mockReset();
  refresh.mockImplementation(() => Promise.resolve({ id: "u1" }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const land = async (search) => {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/!/auth/discord${search}`]}>
        <Spy />
        <Routes>
          {/* The real route: once the page navigates away it unmounts, exactly
              like the app — a catch-all would keep it mounted and re-run its
              effect on the new location. */}
          <Route path="/!/auth/discord" element={<DiscordCallback />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </MemoryRouter>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
};

it("confirms a successful pairing and returns to the dashboard", async () => {
  await land("?paired=1");
  expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Account added"));
  expect(paths.at(-1)).toBe("/!/dashboard");
  // Pairing is not a sign-in: nothing to refresh, no session to adopt.
  expect(refresh).not.toHaveBeenCalled();
});

it("explains a Discord account that has never signed up here", async () => {
  await land("?pair=missing");
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("isn't connected to a swats.bio account"));
  expect(paths.at(-1)).toBe("/!/dashboard");
});

it("refuses to pair an account with itself", async () => {
  await land("?pair=same");
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("already signed into"));
  expect(paths.at(-1)).toBe("/!/dashboard");
});

it("still signs in when a token comes back", async () => {
  await land("?token=abc");
  expect(refresh).toHaveBeenCalled();
  expect(paths.at(-1)).toBe("/!/dashboard");
});
