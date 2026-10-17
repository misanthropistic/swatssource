import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import Settings from "./Settings";

global.IS_REACT_ACT_ENVIRONMENT = true;

const USER = {
  id: 1,
  username: "testuser",
  email: "test@example.com",
  role: "user",
  tier: "free",
  discord: { linked: false },
};

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: USER,
    setUser: () => {},
    logout: () => {},
  }),
}));

jest.mock("@/lib/api", () => ({
  api: {
    get: async () => ({ data: {} }),
    put: async () => ({ data: {} }),
    post: async () => ({ data: {} }),
  },
  fileUrl: (u) => u || "",
}));

it("renders Settings page without crashing", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    await Promise.resolve();
  });
  expect(container.querySelector('[data-testid="settings-page"]')).toBeTruthy();
  act(() => root.unmount());
  container.remove();
});
