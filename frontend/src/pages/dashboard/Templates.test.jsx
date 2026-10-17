import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { api } from "@/lib/api";

/* The template marketplace has two jobs this file pins: it must SAY what each
   template is (Free or Premium, read from the template itself) and it must never
   offer to take someone else's links and widgets — a template is a look, and the
   links and cards on your page after an apply are the ones that were on it
   before. */

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockState = { user: null };

const TEMPLATES = [
  {
    id: 1,
    title: "Quiet Dusk",
    description: "a free theme",
    author_username: "someone",
    background_preview: "#123456",
    downloads_count: 3,
    tier: "free",
    config: { theme_color: "#123456" },
  },
  {
    id: 2,
    title: "Neon Slideshow",
    description: "a premium theme",
    author_username: "someone",
    background_preview: "#ff0000",
    downloads_count: 9,
    tier: "premium",
    config: { layout: "slideshow", background_effect: "rain" },
  },
];

jest.mock("@/lib/notify", () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: mockState.user, setUser: jest.fn() }),
}));

// The preview is the real profile renderer and does not matter here.
jest.mock("@/components/ProfilePreview", () => ({
  ProfilePreview: () => <div data-testid="preview" />,
}));

const { default: Templates } = require("./Templates");

// Where the router actually went, recorded from inside it.
const paths = [];
function Spy() {
  const loc = useLocation();
  paths.push(loc.pathname);
  return null;
}

let container;
let root;
let get;
let post;
let patch;

// What GET /templates/mine answers. The slot count lives on the server, so it
// is the server's answer these tests vary — never the marketplace list, which
// is ordered by downloads and capped and therefore cannot count anything.
const MINE = { count: 0, limit: 3, unlimited: false, premium: false, templates: [] };
let mineResponse;

beforeEach(() => {
  paths.length = 0;
  mineResponse = MINE;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // The page's own data, and where an apply would go.
  get = jest.spyOn(api, "get").mockImplementation((url) =>
    Promise.resolve({ data: url === "/templates/mine" ? mineResponse : TEMPLATES }),
  );
  post = jest.spyOn(api, "post").mockResolvedValue({ data: { id: "me" } });
  patch = jest.spyOn(api, "patch").mockResolvedValue({ data: { id: "9", title: "Renamed" } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  get.mockRestore();
  post.mockRestore();
  patch.mockRestore();
});

const draw = () => {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={["/!/dashboard/templates"]}>
        <Spy />
        <Routes>
          <Route path="*" element={<Templates />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  return container;
};

// The list arrives over a couple of promises (the fetch, then the state updates
// React schedules from it), so a real tick has to be let through inside act.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

it("tags every template Free or Premium from the template itself", async () => {
  mockState.user = { id: "me", username: "me", tier: "premium" };

  const el = draw();
  await settle();

  const free = el.querySelector('[data-testid="template-1-tier"]');
  const premium = el.querySelector('[data-testid="template-2-tier"]');
  expect(free.getAttribute("data-tier")).toBe("free");
  expect(free.textContent).toContain("Free");
  expect(premium.getAttribute("data-tier")).toBe("premium");
  expect(premium.textContent).toContain("Premium");
});

it("locks a Premium template for a free account and points at the upgrade", async () => {
  mockState.user = { id: "me", username: "me", tier: "free" };

  const el = draw();
  await settle();

  // The button on the premium card does not post an apply: it asks for the
  // upgrade instead, because the backend would refuse it anyway.
  click(el.querySelector('[data-testid="template-2-apply"]'));
  await settle();
  expect(post).not.toHaveBeenCalled();
  expect(paths).toContain("/!/pricing");

  // A free template still applies in one press, from the card — with no
  // `include`, which is the "take the whole theme" the backend defaults to.
  click(el.querySelector('[data-testid="template-1-apply"]'));
  await settle();
  expect(post).toHaveBeenCalledWith("/templates/1/apply", { include: undefined });
});

/* ---------------------------------------------------------------------------
   Publishing a free template

   "People want to post free templates but it doesn't work" had two causes: a
   free account was allowed exactly one, and the count of used slots was taken
   from the visible marketplace page — so an author whose own template had
   fallen off that page was shown an empty slot, tried again, and was refused by
   a limit the screen never mentioned. These pin both.
   --------------------------------------------------------------------------- */

it("shows the slot count the server reports, not the one visible on the page", async () => {
  mockState.user = { id: "me", username: "me", tier: "free" };
  // Two published, none of them on the loaded page — the old count would say 0.
  mineResponse = { ...MINE, count: 2, templates: [] };

  const el = draw();
  await settle();

  expect(el.querySelector('[data-testid="template-publish-open"]').textContent).toContain("2/3");
  expect(el.querySelector('[data-testid="template-publish-open"]').disabled).toBe(false);
  expect(el.querySelector('[data-testid="template-slot-notice"]')).toBeNull();

  click(el.querySelector('[data-testid="template-publish-open"]'));
  await settle();
  expect(el.querySelector('[data-testid="template-slot-line"]').textContent).toContain("2 / 3");
});

it("stops at the limit and says why, instead of letting the request be refused", async () => {
  mockState.user = { id: "me", username: "me", tier: "free" };
  mineResponse = { ...MINE, count: 3 };

  const el = draw();
  await settle();

  const open = el.querySelector('[data-testid="template-publish-open"]');
  expect(open.disabled).toBe(true);
  expect(open.textContent).toContain("All slots used");
  expect(el.querySelector('[data-testid="template-slot-notice"]').textContent).toContain("Delete one");

  // A disabled button cannot open the form, so no request can be made from here.
  click(open);
  await settle();
  expect(el.querySelector('[data-testid="template-publish-submit"]')).toBeNull();
  expect(post).not.toHaveBeenCalled();
});

it("lets an author rename their own template", async () => {
  mockState.user = { id: "me", username: "me", tier: "free" };
  mineResponse = {
    ...MINE,
    count: 1,
    templates: [{ id: 9, title: "Old name", description: "d", tier: "free", downloads_count: 2 }],
  };

  const el = draw();
  await settle();

  // Your own are listed where they can be acted on, not only in the grid.
  expect(el.querySelector('[data-testid="template-mine"]').textContent).toContain("Old name");

  click(el.querySelector('[data-testid="my-template-9-edit"]'));
  await settle();

  const title = el.querySelector('[data-testid="template-edit-title"]');
  expect(title.value).toBe("Old name");
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(title, "New name");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await act(async () => {
    el.querySelector('[data-testid="template-edit-save"]').closest("form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(patch).toHaveBeenCalledWith("/templates/9", { title: "New name", description: "d" });
});

it("offers no way to take a stranger's links or widgets", async () => {
  mockState.user = { id: "me", username: "me", tier: "premium" };

  const el = draw();
  await settle();
  click(el.querySelector('[data-testid="template-1-view"]'));

  // The groups that CAN be taken…
  expect(el.querySelector('[data-testid="template-include-groups"]')).toBeTruthy();
  for (const forbidden of ["links", "widgets"]) {
    expect(el.querySelector(`[data-testid="template-include-${forbidden}"]`)).toBeNull();
  }

  // …and the two that cannot, stated rather than switched.
  const yours = el.querySelector('[data-testid="template-always-yours"]');
  expect(yours.textContent).toContain("Links");
  expect(yours.textContent).toContain("Widgets");
  expect(yours.textContent).toContain("yours");
});
