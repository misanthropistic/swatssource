// The Discord server widget offers three layouts — classic, minimal and banner.
// This proves each one renders its own structure, that the real banner shows up,
// that member pfps are never leaked onto the card, and that a legacy saved style
// falls back safely.
import fs from "fs";
import path from "path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { WidgetCard, LinkCard } from "./WidgetCards";
import { Link as LinkIcon } from "lucide-react";

const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");

global.IS_REACT_ACT_ENVIRONMENT = true;

// The live-data hook is stubbed through a global so each test can supply the
// exact payload the backend would have returned.
jest.mock("@/lib/widgets", () => ({
  ...jest.requireActual("@/lib/widgets"),
  useWidgetData: () => ({
    status: "success",
    error: null,
    refresh: () => {},
    data: globalThis.__WIDGET_DATA__ || null,
  }),
  useTicker: () => 0,
}));

const render = (w) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(<WidgetCard w={w} accent="#5865F2" />));
  const html = el.innerHTML;
  act(() => root.unmount());
  el.remove();
  return html;
};

const SERVER = {
  name: "Discord Developers",
  icon: "https://cdn.example/icon.png",
  invite_code: "discord-developers",
  invite_url: "https://discord.gg/discord-developers",
  online: 52059,
  offline: 255230,
  total_members: 307289,
  banner: "https://cdn.example/banner.png",
  online_members: [{ username: "swats", status: "online", avatar: "https://cdn.example/member.png" }],
};

const MEMBER = {
  username: "swats",
  global_name: "swats",
  status: "online",
  avatar: "https://cdn.example/avatar.png",
  custom_status: "building things",
  activity: { name: "Visual Studio Code", details: "index.js" },
  spotify: { song: "STAR WALKIN", artist: "Lil Nas X", album_art: "https://cdn.example/art.png" },
  location: "United Kingdom",
};

it("renders a distinct layout for every Discord server style", () => {
  globalThis.__WIDGET_DATA__ = SERVER;
  const w = { type: "discord", subtype: "server", span: 2 };

  const html = {};
  for (const style of ["classic", "minimal", "banner"]) {
    html[style] = render({ ...w, discord_style: style });
  }

  expect(html.classic).not.toBe(html.minimal);
  expect(html.classic).not.toBe(html.banner);
  expect(html.minimal).not.toBe(html.banner);

  // Every layout still reports the real online count (abbreviated by formatCount).
  for (const style of ["classic", "minimal", "banner"]) {
    expect(html[style]).toContain("52.1K");
  }
  expect(html.classic).toContain("307.3K");
  expect(html.classic).toContain("Offline");
  expect(html.minimal).toContain("online");

  // Banner shows the server banner; no layout leaks member profile pictures.
  expect(html.banner).toContain("cdn.example/banner.png");
  for (const style of ["classic", "minimal", "banner"]) {
    expect(html[style]).not.toContain("cdn.example/member.png");
  }

  // A legacy saved style falls back to the classic card instead of blanking.
  expect(render({ ...w, discord_style: "discord" })).toContain("307.3K");
});

it("renders a distinct layout for every Discord profile style", () => {
  globalThis.__WIDGET_DATA__ = MEMBER;
  const w = { type: "discord", subtype: "profile", span: 2 };

  const html = {};
  for (const style of ["classic", "minimal", "compact", "discord"]) {
    html[style] = render({ ...w, discord_style: style });
  }

  expect(html.classic).not.toBe(html.minimal);
  expect(html.classic).not.toBe(html.compact);
  expect(html.minimal).not.toBe(html.compact);

  // The simplest layouts keep only what fits: name and status.
  expect(html.minimal).toContain("swats");
  expect(html.minimal).toContain("online");
  expect(html.minimal).not.toContain("Visual Studio Code");
  expect(html.compact).not.toContain("Visual Studio Code");

  // The Discord layout keeps the activity and Spotify rows, on its own panel.
  expect(html.discord).toContain('data-testid="discord-profile-style"');
  expect(html.discord).toContain("rgb(49, 51, 56)");
  expect(html.discord).toContain("Visual Studio Code");
  expect(html.discord).toContain("STAR WALKIN");
});

// A link can wear an uploaded icon instead of the platform glyph.
const renderLink = (link, profile = {}) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(<LinkCard link={link} profile={profile} accent="#FF7FBC" Icon={LinkIcon} />));
  const html = el.innerHTML;
  act(() => root.unmount());
  el.remove();
  return html;
};

it("shows an uploaded link icon in place of the platform glyph", () => {
  const link = { platform: "website", label: "Website", url: "https://example.com", icon_url: "/uploads/mine.png" };

  const html = renderLink(link);
  expect(html).toContain("/api/uploads/mine.png");
});

// The badge overlay was removed from links. A link that still carries a saved
// badge from before must render as a plain link — no sticker over the icon, and
// no account-wide default sneaking one back in.
it("no longer paints a badge overlay on a link, even for saved badge data", () => {
  const link = { platform: "website", label: "Website", url: "https://example.com", icon_url: "/uploads/mine.png", badge: "verified" };
  expect(renderLink(link)).not.toContain("link-badge-overlay");

  const accountWide = { link_global_badge: "star", link_global_badge_pos: "bottom-left", link_global_badge_glow: false };
  const html = renderLink({ ...link, badge: "" }, accountWide);
  expect(html).not.toContain("link-badge-overlay");
  expect(html).not.toContain("-bottom-1.5 -left-1.5");
});

// The card shell resolved an icon and a title on every render and then drew
// neither, so a grid of widgets was a grid of untitled blocks. This pins the
// header, and the sheen that stopped every card reading as the same grey slab.
it("gives every card a titled header and a lit surface", () => {
  globalThis.__WIDGET_DATA__ = SERVER;

  const named = render({ type: "discord", subtype: "server", span: 2, title: "My server" });
  expect(named).toContain('data-testid="widget-header"');
  expect(named).toContain("My server");
  // The header carries the widget's own glyph, tinted to the card.
  expect(named).toContain("svg");
  // The sheen is a real rule in index.css, not a value a renderer may drop.
  expect(named).toContain("widget-card-sheen");
  expect(read("..", "index.css")).toContain(".widget-card-sheen");

  // With no title of its own the card still names itself.
  expect(render({ type: "discord", subtype: "server", span: 2 })).toContain("Discord");

  // The Spotify card used to be handed to the shell "raw" so it could paint
  // its own purple plate. That is the one card that then ignored the owner's
  // fill, radius and border and read as a different product from the rest of
  // the grid, so it wears the same shell (and the same header) now.
  const spotify = render({ type: "spotify", subtype: "media", span: 2 });
  expect(spotify).toContain('data-testid="widget-header"');
  expect(spotify).toContain("Spotify Track Preview");
});

it("only glows a widget when its glow switch is on", () => {
  globalThis.__WIDGET_DATA__ = SERVER;
  const base = { type: "discord", subtype: "server", span: 2, glow: "#ff00ff" };

  expect(render(base)).not.toContain("0 0 22px");
  expect(render({ ...base, glow_on: true })).toContain("0 0 22px #ff00ff");
});
