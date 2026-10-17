import { createRoot } from "react-dom/client";
import { act } from "react";

import { FeaturesCustomizer, DISCORD_SERVERS } from "./FeaturesCustomizer";

/* The Customize band pairs two real Discord servers with the real profiles the
   site draws. The cards used to draw a generic blurple glyph for both servers
   and read live presence from a route that never existed; these pin the live
   widget proxy as the only source, plus the rule that a value Discord does not
   report is never invented.

   They also pin the alignment fix: the second card used to be offset and pushed
   to the right (`sm:mt-10 sm:ml-auto`), which is what made the pair look like
   two unrelated tiles.

   And they pin what is no longer there: the block under the cards that repeated
   each invite, description and staff roster by hand is gone, so the only place
   the community's invite survives is the Join button (whose href Discord
   itself reports). */

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

// The community invite resolves to a full payload (icon, banner, counts,
// avatars, channels). The Acheron server answers with a name and nothing else, so
// the card has to fall back honestly instead of filling in numbers.
const COMMUNITY = {
  kind: "server",
  id: "1557276191050698782",
  name: "^swats.bio^",
  icon: "https://cdn.discordapp.com/icons/1557276191050698782/aaaa.png?size=256",
  banner: "https://cdn.discordapp.com/banners/1557276191050698782/bbbb.png?size=600",
  description: "The official swats.bio community — support, updates and showcase.",
  online: 42,
  total_members: 16230,
  offline: 16188,
  invite_url: "https://discord.gg/a9uwptuepD",
  online_members: [
    { username: "veskx", status: "online", avatar: "https://cdn.discordapp.com/avatars/1/one.png" },
    { username: "swats", status: "idle", avatar: "https://cdn.discordapp.com/avatars/2/two.png" },
    { username: "aki", status: "dnd", avatar: "https://cdn.discordapp.com/avatars/3/three.png" },
  ],
  channels: ["general", "showcase", "support", "off-topic", "ignored"],
};

const ACHERON = {
  kind: "server",
  id: "999999999999999999",
  name: null,
  icon: null,
  banner: null,
  description: null,
  online: null,
  total_members: null,
  offline: null,
  invite_url: null,
  online_members: [{ username: "ghost", status: "offline", avatar: null }],
  channels: [],
};

jest.mock("@/lib/api", () => ({
  api: {
    get: (url, options) => {
      const params = options?.params || {};
      if (url === "/widgets/discord/server") {
        if (params.id === "a9uwptuepD") return Promise.resolve({ data: COMMUNITY });
        if (params.id === "achern") return Promise.resolve({ data: ACHERON });
        return Promise.reject(new Error(`unexpected widget request: ${url}`));
      }
      // Anything else is a request the band no longer makes — a team lookup, or
      // an invite it used to type out itself.
      return Promise.reject(new Error(`unexpected request: ${url}`));
    },
  },
  fileUrl: (p) => p || "",
}));

const mount = async (node) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(node);
  });
  // Let the widget store's and the team lookup's promise chains settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return {
    el,
    cleanup: () => {
      act(() => root.unmount());
      el.remove();
    },
  };
};

const card = (el, key) => el.querySelector(`[data-testid="discord-widget-${key}"]`);

it("renders both Discord server widgets with real invites", async () => {
  const { el, cleanup } = await mount(<FeaturesCustomizer />);

  const widgets = el.querySelectorAll('article[data-testid^="discord-widget-"]');
  expect(widgets).toHaveLength(DISCORD_SERVERS.length);
  expect([...widgets].map((w) => w.dataset.testid)).toEqual([
    "discord-widget-community",
    "discord-widget-acheron",
  ]);

  const hrefs = [...el.querySelectorAll('a[data-testid$="-join"]')].map((a) => a.getAttribute("href"));
  expect(hrefs).toContain("https://discord.gg/a9uwptuepD");
  // Acheron's own invite, not the community's.
  expect(hrefs).toContain("https://discord.gg/achern");

  cleanup();
});

it("draws the server's own icon and banner, not a generic glyph", async () => {
  const { el, cleanup } = await mount(<FeaturesCustomizer />);

  expect(card(el, "community").querySelector('[data-testid="discord-widget-community-icon"]').src).toBe(
    COMMUNITY.icon
  );
  expect(card(el, "community").querySelector('[data-testid="discord-widget-community-banner"]').src).toBe(
    COMMUNITY.banner
  );

  // The server with no art still gets its name and the Discord glyph behind it.
  expect(card(el, "acheron").querySelector('[data-testid="discord-widget-acheron-icon"]')).toBeNull();
  expect(card(el, "acheron").querySelector("svg")).toBeTruthy();

  cleanup();
});

it("shows the counts, avatars and channels Discord reports", async () => {
  const { el, cleanup } = await mount(<FeaturesCustomizer />);

  const text = card(el, "community").textContent;
  expect(text).toContain("^swats.bio^");
  expect(text).toContain("42 online");
  expect(text).toContain("16.2K members");
  expect(text).toContain("+39 more online");
  // The real channel names, capped at four so the card keeps its shape.
  expect(text).toContain("general");
  expect(text).toContain("showcase");
  expect(text).not.toContain("ignored");
  // The section's own blurb is replaced by the server's real description.
  expect(text).toContain("The official swats.bio community");

  const avatars = card(el, "community").querySelectorAll('[data-testid="discord-widget-community-members"] img');
  expect([...avatars].map((a) => a.src)).toEqual(COMMUNITY.online_members.map((m) => m.avatar));

  cleanup();
});

it("invents nothing for a server that reports nothing", async () => {
  const { el, cleanup } = await mount(<FeaturesCustomizer />);

  const text = card(el, "acheron").textContent;
  // The name falls back to the one we know; the number never does.
  expect(text).toContain("Acheron");
  expect(text).toContain("Members online");
  expect(text).not.toMatch(/\d+ online/);
  expect(text).not.toContain("members");
  // No avatars and no channels: a member entry without one is dropped, not
  // drawn as an empty circle.
  expect(card(el, "acheron").querySelector('[data-testid="discord-widget-acheron-members"]')).toBeNull();

  cleanup();
});

it("keeps the two server cards level, one per column", async () => {
  const { el, cleanup } = await mount(<FeaturesCustomizer />);

  const grid = card(el, "community").parentElement;
  expect(grid.className).toContain("sm:grid-cols-2");
  expect(grid.className).toContain("items-stretch");
  // The second card shares that grid instead of being moved down and aside.
  expect(grid.children).toHaveLength(2);
  expect(grid.children[1].dataset.testid).toBe("discord-widget-acheron");

  for (const key of ["community", "acheron"]) {
    const node = card(el, key);
    expect(node.className).toContain("h-full");
    expect(node.className).not.toContain("sm:mt-10");
    expect(node.className).not.toContain("ml-auto");
  }

  cleanup();
});

it("keeps no second, hand-typed copy of the invites or the rosters", async () => {
  const { el, cleanup } = await mount(<FeaturesCustomizer />);

  // The divider, the two server descriptions and the staff rows are gone.
  expect(el.querySelector('[data-testid="discord-divider"]')).toBeNull();
  expect(el.querySelector('[data-testid^="discord-info-"]')).toBeNull();
  expect(el.querySelector('[data-testid^="team-member-"]')).toBeNull();
  // …and so is the invite written out as text under each card. The only place
  // an invite survives is the Join button's href, which Discord supplies.
  const text = [...el.querySelectorAll('[data-testid^="discord-widget-"]')]
    .map((n) => n.textContent)
    .join(" ");
  expect(text).not.toContain("discord.gg/");
  expect(text).not.toContain("@discord");

  // The section still says what the cards are for.
  expect(el.textContent).toContain("Discord Servers");

  cleanup();
});

it("no longer renders the music player or static screenshots", async () => {
  const { el, cleanup } = await mount(<FeaturesCustomizer />);

  expect(el.querySelector('[data-testid="widget-music"]')).toBeNull();
  expect(el.querySelector("audio")).toBeNull();
  expect(el.textContent).not.toContain("PRETENDERS");
  expect(el.textContent).not.toContain("Music Player");
  // The static screenshot band is gone; the live full-size showcase replaced it.
  expect(el.querySelector('[data-testid="screenshot-stack"]')).toBeNull();
  expect(el.querySelector('[data-testid="profile-showcase"]')).toBeTruthy();

  cleanup();
});
