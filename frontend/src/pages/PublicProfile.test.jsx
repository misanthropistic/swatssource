import { createRoot } from "react-dom/client";
import { act } from "react";

// PublicProfile renders Link / reads the :alias route param. Stub just those two
// so the component can mount outside a <BrowserRouter>.
jest.mock("react-router-dom", () => ({
  useParams: () => ({ alias: "tester" }),
  Link: ({ children, ...rest }) => <a {...rest}>{children}</a>,
}));

// The component must import fileUrl itself; mocking the module still leaves an
// un-imported `fileUrl` as a ReferenceError, which is the bug this covers.
const mockFileUrl = jest.fn();
jest.mock("@/lib/api", () => ({
  api: { get: jest.fn() },
  fileUrl: (p) => mockFileUrl(p),
}));

import { api } from "@/lib/api";
import PublicProfile from "./PublicProfile";

global.IS_REACT_ACT_ENVIRONMENT = true;

// GET /api/u/:alias returns the profile fields at the top level (see
// backend/routes/public.js) — NOT wrapped in a `user` key.
const payload = {
  id: "8b1f0c2e-0000-4000-8000-000000000000",
  username: "tester",
  display_name: "Tester",
  tier: "free",
  views: 12,
  badges: [],
  equipped_badges: [],
  profile: {
    bio: "hello world",
    audio_url: "/api/uploads/song.mp3",
    theme_color: "#A48DF4",
    links: [],
    widgets: [],
    tracks: [],
  },
};

const setMeta = (property, content) => {
  const el = document.createElement("meta");
  el.setAttribute("property", property);
  el.setAttribute("content", content);
  document.head.appendChild(el);
  return el;
};

let container;
let root;
let metas;

beforeEach(() => {
  document.title = "";
  metas = {
    title: setMeta("og:title", "swats.bio | claim your digital identity"),
    desc: setMeta("og:description", "default description"),
    image: setMeta("og:image", "/logo.png"),
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // CRA's Jest config sets `resetMocks: true`, which strips every mock's
  // implementation before each test — so implementations are (re)declared here
  // rather than once at module scope.
  mockFileUrl.mockImplementation((p) => (p ? `https://cdn.example.com${p}` : ""));
  api.get.mockResolvedValue({ data: payload });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Object.values(metas).forEach((el) => el.remove());
  jest.clearAllMocks();
});

const mount = async () => {
  await act(async () => {
    root.render(<PublicProfile />);
  });
};

it("renders a profile that has background audio instead of crashing", async () => {
  await mount();

  // Before the fix the component called fileUrl() without importing it, so a
  // profile with audio_url threw ReferenceError and the page rendered nothing.
  expect(container.querySelector('[data-testid="public-profile-page"]')).toBeTruthy();
  expect(container.textContent).toContain("hello world");

  const audio = container.querySelector("#profile-bg-audio");
  expect(audio).toBeTruthy();
  expect(audio.getAttribute("src")).toBe("https://cdn.example.com/api/uploads/song.mp3");
  expect(mockFileUrl).toHaveBeenCalledWith("/api/uploads/song.mp3");
});

it("keeps the page closed until the correct entry PIN is typed", async () => {
  api.get.mockResolvedValue({
    data: {
      ...payload,
      profile: { ...payload.profile, entry_enabled: true, entry_style: "codelock", entry_text: "1234" },
    },
  });
  await mount();

  expect(container.querySelector('[data-testid="codelock-gate"]')).toBeTruthy();

  const type = async (key) => {
    await act(async () => {
      window.dispatchEvent(new window.KeyboardEvent("keydown", { key }));
    });
  };

  await type("9");
  await type("9");
  await type("9");
  await type("9");
  expect(container.querySelector('[data-testid="codelock-error"]')).toBeTruthy();
  expect(container.querySelector("[data-testid=\"codelock-gate\"]")).toBeTruthy();

  await type("1");
  await type("2");
  await type("3");
  await type("4");
  expect(container.querySelector('[data-testid="codelock-gate"]')).toBeNull();
});

it("titles the tab and fills Open Graph tags from the flat API payload", async () => {
  await mount();

  expect(document.title).toBe("swats | Tester");
  expect(metas.title.getAttribute("content")).toBe("Tester on swats.bio");
  expect(metas.desc.getAttribute("content")).toBe("hello world");
});

it("lets the profile's metadata-editor fields override the defaults", async () => {
  api.get.mockResolvedValueOnce({
    data: {
      ...payload,
      profile: {
        ...payload.profile,
        meta_title: "Custom lede",
        meta_description: "Custom description",
        meta_image: "https://cdn.example.com/card.png",
      },
    },
  });
  await mount();

  expect(document.title).toBe("swats | Custom lede");
  expect(metas.title.getAttribute("content")).toBe("Custom lede");
  expect(metas.desc.getAttribute("content")).toBe("Custom description");
  expect(metas.image.getAttribute("content")).toBe("https://cdn.example.com/card.png");
});
// The four corners are the page's, so a moved counter stays put whatever the
// card is doing — and "hidden" means neither the corner nor the meta line.
const withProfiles = (patch) => {
  api.get.mockResolvedValue({ data: { ...payload, profile: { ...payload.profile, ...patch } } });
};

it("moves the view counter into a corner when the owner asks for one", async () => {
  withProfiles({ views_position: "tr" });
  await mount();

  const corner = container.querySelector('[data-testid="views-corner"]');
  expect(corner).toBeTruthy();
  expect(corner.textContent).toContain("12");
  // It is gone from the card's meta line, so the count is not stated twice.
  expect(container.querySelector('[data-testid="meta-views"]')).toBeNull();
});

it("draws the view counter nowhere when it is hidden", async () => {
  withProfiles({ views_position: "hidden" });
  await mount();

  expect(container.querySelector('[data-testid="views-corner"]')).toBeNull();
  expect(container.querySelector('[data-testid="meta-views"]')).toBeNull();
});

// The 18+ gate is retired: a profile with `nsfw_gate` in its saved settings
// simply renders like any other now, warning or not.
it("ignores the retired 18+ flag and shows the profile straight away", async () => {
  withProfiles({ nsfw_gate: true, nsfw_text: "Adults only, please." });
  await mount();

  expect(container.querySelector('[data-testid="age-gate"]')).toBeNull();
  expect(container.textContent).toContain("hello world");
});

it("keeps the footer nudge by default", async () => {
  await mount();
  // The footer is the short logotype pill: logo + "swats", not the long
  // "made with swats.bio" string it used to render, and it hugs its own content
  // (no stretched glass bar across the bottom of the page).
  expect(container.textContent).toContain("swats");
  const pill = container.querySelector('[data-testid="profile-footer-pill"]');
  expect(pill).toBeTruthy();
  expect(pill.className).toContain("w-auto");
  expect(pill.className).toContain("text-[10px]");
  expect(pill.className).not.toContain("px-3");
});

it("hides the footer nudge when the owner has paid for that", async () => {
  withProfiles({ hide_footer: true });
  await mount();

  expect(container.querySelector('[data-testid="public-profile-page"]')).toBeTruthy();
  expect(container.textContent).not.toContain("swats");
});

// The pet chases the pointer across the whole page, so the PAGE mounts it and
// not the card — a fixed canvas inside the card's scroll box would be clipped
// to the card. A profile with no pet mounts nothing at all.
it("renders nothing for a stale cursor-buddy field — the pets are fully retired", async () => {
  // An old profile can still carry cursor_widget keys; the backend strips them
  // on write, and no renderer exists to draw them, so the page must mount a
  // cursor widget never — with or without the stale field in the payload.
  expect(container.querySelector('[data-testid="cursor-widget"]')).toBeNull();

  withProfiles({ cursor_widget: "cat", cursor_widget_speed: 80, cursor_widget_delay: 400 });
  await mount();

  expect(container.querySelector('[data-testid="cursor-widget"]')).toBeNull();
});

it("shows the claim CTA when the alias does not exist", async () => {
  api.get.mockRejectedValue(new Error("404"));

  await mount();

  expect(container.querySelector('[data-testid="public-notfound"]')).toBeTruthy();
  expect(document.title).toBe("swats | User Not Found");
});
