import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import TwoFactorPanel from "@/components/TwoFactorPanel";

/* The panel's job is the order of its own steps, and the tests are about exactly
 * that: nothing is switched on before a code is accepted, and the recovery codes
 * appear once. Both are the kind of promise that would still "look fine" if it
 * silently stopped holding — the account would just quietly be unprotected, or
 * the codes would be gone with no way back in.
 */
global.IS_REACT_ACT_ENVIRONMENT = true;

global.__TFA_CALLS__ = [];
global.__TFA_CODES__ = ["ABCD-EFGH", "JKMN-PQRS", "TUVW-XYZ2"];

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ logout: async () => {} }),
}));

jest.mock("@/lib/notify", () => ({
  toast: Object.assign(() => {}, { success: () => {}, error: () => {}, info: () => {} }),
}));

jest.mock("@/lib/api", () => {
  const log = (entry) => global.__TFA_CALLS__.push(entry);
  return {
    api: {
      get: async (url) => {
        log({ method: "get", url });
        if (url === "/me/2fa") return { data: global.__TFA_STATUS__ || { enabled: false } };
        return { data: {} };
      },
      post: async (url, body) => {
        log({ method: "post", url, body });
        if (url === "/me/2fa/setup")
          return { data: { secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/swats.bio:ada?secret=JBSWY3DPEHPK3PXP" } };
        if (url === "/me/2fa/enable") return { data: { ok: true, recovery_codes: global.__TFA_CODES__ } };
        return { data: { ok: true } };
      },
    },
  };
});

let container;
let root;

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

const type = async (el, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const byTestId = (id) => container.querySelector(`[data-testid="${id}"]`);

beforeEach(() => {
  global.__TFA_CALLS__ = [];
  global.__TFA_STATUS__ = { enabled: false, recovery_codes_remaining: 0 };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = async () => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <TwoFactorPanel />
      </MemoryRouter>,
    );
  });
  await settle();
};

test("starts off, and setting up shows a scannable secret before anything is on", async () => {
  await render();
  expect(byTestId("settings-2fa-status").textContent).toBe("Off");
  expect(byTestId("settings-2fa-qr")).toBeNull();

  click(byTestId("settings-2fa-start"));
  await settle();

  // The QR and the typeable key are both on screen, and the setup call really
  // happened — a secret nobody asked the server for could not be verified.
  expect(byTestId("settings-2fa-qr")).toBeTruthy();
  expect(byTestId("settings-2fa-secret").textContent).toBe("JBSWY3DPEHPK3PXP");
  expect(global.__TFA_CALLS__.some((c) => c.url === "/me/2fa/setup" && c.method === "post")).toBe(true);

  // Nothing is enabled yet: no recovery codes, and the status is still Off.
  expect(byTestId("settings-2fa-recovery-codes")).toBeNull();
  expect(byTestId("settings-2fa-status").textContent).toBe("Off");

  // The confirm button refuses to fire without a code.
  const enable = byTestId("settings-2fa-enable");
  expect(enable.disabled).toBe(true);
  click(enable);
  await settle();
  expect(global.__TFA_CALLS__.some((c) => c.url === "/me/2fa/enable")).toBe(false);
});

test("a code turns it on and reveals the recovery codes exactly once", async () => {
  await render();
  click(byTestId("settings-2fa-start"));
  await settle();

  await type(byTestId("settings-2fa-code"), "123456");
  click(byTestId("settings-2fa-enable"));
  await settle();

  const enableCall = global.__TFA_CALLS__.find((c) => c.url === "/me/2fa/enable");
  expect(enableCall.body).toEqual({ code: "123456" });

  const list = byTestId("settings-2fa-recovery-codes");
  expect(list).toBeTruthy();
  for (const code of global.__TFA_CODES__) expect(list.textContent).toContain(code);
  expect(byTestId("settings-2fa-status").textContent).toBe("On");

  // Acknowledging them closes the reveal — they are shown once, and the server
  // cannot produce them again.
  click(byTestId("settings-2fa-saved-codes"));
  await settle();
  expect(byTestId("settings-2fa-recovery-codes")).toBeNull();
});

test("an account with it on gets a code field to turn it off, and the count of codes left", async () => {
  global.__TFA_STATUS__ = { enabled: true, recovery_codes_remaining: 7 };
  await render();

  expect(byTestId("settings-2fa-status").textContent).toBe("On");
  expect(byTestId("settings-2fa-start")).toBeNull();
  expect(byTestId("settings-2fa-remaining").textContent).toContain("7");

  const off = byTestId("settings-2fa-disable");
  expect(off.disabled).toBe(true); // no code typed yet

  await type(byTestId("settings-2fa-disable-code"), "654321");
  click(off);
  await settle();

  const disableCall = global.__TFA_CALLS__.find((c) => c.url === "/me/2fa/disable");
  expect(disableCall.body).toEqual({ code: "654321" });
  expect(byTestId("settings-2fa-status").textContent).toBe("Off");
});

test("signing out everywhere hits the revocation endpoint", async () => {
  await render();
  click(byTestId("settings-signout-all"));
  await settle();
  expect(global.__TFA_CALLS__.some((c) => c.url === "/me/logout-all" && c.method === "post")).toBe(true);
});
