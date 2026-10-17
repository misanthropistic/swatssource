import { createRoot } from "react-dom/client";
import { act } from "react";
import { ProfilePreview } from "./ProfilePreview";
import { LinkCard } from "./WidgetCards";
import { LAYOUTS } from "@/constants/layouts";

global.IS_REACT_ACT_ENVIRONMENT = true;

const base = {
  username: "tester",
  display_name: "Tester",
  views: 12,
  badges: [],
  profile: {
    bio: "hello world",
    links: [{ platform: "discord", label: "Discord", url: "https://example.com" }],
    widgets: [{ type: "timezone", value: "UTC" }],
    tracks: [],
  },
};

let container;
let root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const waitFrames = async (ms = 60) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const stubRect = (el) => {
  el.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 200, height: 300,
    right: 200, bottom: 300, x: 0, y: 0, toJSON: () => ({}),
  });
};

it("renders the card layout", () => {
  act(() => root.render(<ProfilePreview data={base} />));
  expect(container.querySelector('[data-testid="profile-preview"]')).toBeTruthy();
  expect(container.textContent).toContain("Tester");
  expect(container.textContent).toContain("hello world");
});

it("survives a widget changing type without breaking hook order", () => {
  act(() => root.render(<ProfilePreview data={base} />));
  // The timezone widget used to call useState/useEffect inside a conditional
  // branch of WidgetCard. Switching its type changed the hook count between
  // renders, which React rejects with "Rendered fewer hooks than expected".
  const switched = {
    ...base,
    profile: { ...base.profile, widgets: [{ type: "github", value: "tester" }] },
  };
  act(() => root.render(<ProfilePreview data={switched} />));
  expect(container.textContent).toContain("tester");

  act(() => root.render(<ProfilePreview data={base} />));
  expect(container.textContent).toContain("UTC");
});

it("renders a live clock for the timezone widget", () => {
  act(() => root.render(<ProfilePreview data={base} />));
  expect(container.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
});

const FLOATING = { ...base, profile: { ...base.profile, layout: "floating" } };

it("tilts the card on mousemove and resets on leave", async () => {
  act(() => root.render(<ProfilePreview data={FLOATING} />));
  const card = container.querySelector(".max-w-md");
  expect(card).toBeTruthy();
  stubRect(card);

  act(() => {
    card.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 300, bubbles: true }));
  });
  await waitFrames();

  expect(card.style.transform).toContain("rotateX(-12.00deg)");
  expect(card.style.transform).toContain("rotateY(12.00deg)");

  // React implements onMouseLeave on top of the native `mouseout` event
  // (mouseleave itself does not bubble), so that is what has to be dispatched.
  act(() => {
    card.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
  });
  await waitFrames();

  expect(card.style.transform).toContain("rotateX(0.00deg)");
  expect(card.style.transform).toContain("rotateY(0.00deg)");
});

it("does not tilt when the profile opts out", async () => {
  const off = { ...base, profile: { ...base.profile, layout: "floating", card_tilt: false } };
  act(() => root.render(<ProfilePreview data={off} />));
  const card = container.querySelector(".max-w-md");
  stubRect(card);

  act(() => {
    card.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 300, bubbles: true }));
  });
  await waitFrames();

  expect(card.style.transform).not.toContain("rotateX(-12.00deg)");
});

it("applies the configured text effect class to the name", () => {
  const fx = { ...base, profile: { ...base.profile, name_effect: "rainbow" } };
  act(() => root.render(<ProfilePreview data={fx} />));
  expect(container.querySelector(".fx-text-rainbow")).toBeTruthy();
});

// A badge chip holds a real badge picture (an <img>) rather than a glyph, and it
// is drawn bare at the one size the card uses: the w-9 box.
const badgeChip = () =>
  [...container.querySelectorAll("span")].find(
    (s) => s.querySelector("img") && s.className.includes("w-[22px]")
  );

// Only "showcase" used to be implemented once, so every other layout fell
// through to the same card and choosing one changed nothing. This renders each
// surviving layout and requires every one of them to differ from every other.
it("renders a visibly different structure for every layout mode", () => {
  const ids = LAYOUTS.map((l) => l.id);
  expect(ids).toEqual(["minimal", "floating", "banner", "slideshow"]);

  const html = {};
  for (const layout of ids) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const r = createRoot(el);
    act(() => r.render(<ProfilePreview data={{ ...base, profile: { ...base.profile, layout } }} />));
    html[layout] = el.innerHTML;
    act(() => r.unmount());
    el.remove();
  }

  for (let i = 0; i < ids.length; i++) {
    // The renderer must also report which layout it used.
    expect(html[ids[i]]).toContain(`data-layout="${ids[i]}"`);
    for (let j = i + 1; j < ids.length; j++) {
      expect(html[ids[i]]).not.toBe(html[ids[j]]);
    }
  }
});

// Being different is not enough — each layout has to actually be the thing its
// name promises.
it("gives every layout its own defining structure", () => {
  const htmlFor = (layout) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const r = createRoot(el);
    act(() => r.render(<ProfilePreview data={{ ...base, profile: { ...base.profile, layout } }} />));
    const html = el.innerHTML;
    act(() => r.unmount());
    el.remove();
    return html;
  };

  // Minimal: the wide rectangular card with the avatar pinned to its left.
  const minimal = htmlFor("minimal");
  // The card width is a dial now (Editor → Card) and rides as an inline
  // max-width; 680px is its default so existing profiles hold still.
  expect(minimal).toContain("max-width: 680px");
  expect(minimal).toContain("flex items-center gap-5 sm:gap-6");
  expect(minimal).toContain('data-testid="profile-meta"');
  expect(minimal).not.toContain('data-testid="glass-panel"');
  // Floating: the avatar hangs off the top of a narrower, centred card.
  expect(htmlFor("floating")).toContain("max-w-md");
  // Banner: an edge-to-edge hero band the avatar overlaps.
  expect(htmlFor("banner")).toContain("h-40");
  // Slideshow: the scroll-snap slides with their side indicators.
  expect(htmlFor("slideshow")).toContain('data-testid="slideshow-indicators"');
});

// The four deleted layouts are still stored on real profiles. They must render
// as Minimal rather than as a layout whose renderer no longer exists.
it("renders a deleted layout as the default one", () => {
  for (const removed of ["showcase", "divider", "nowplaying", "rail", "stacks", "panels", "document", "classic"]) {
    act(() => root.render(<ProfilePreview data={{ ...base, profile: { ...base.profile, layout: removed } }} />));
    const card = container.querySelector('[data-layout="minimal"]');
    expect(card).toBeTruthy();
    // ...and it is a whole card, not an empty shell.
    expect(container.textContent).toContain("Tester");
    expect(container.textContent).toContain("hello world");
  }
});

// The screenshot-inspired layouts each own one piece of furniture that no other
// layout has, so "it changed something" is not the only thing being checked.
const SCREENSHOT_DATA = {
  ...base,
  profile: {
    ...base.profile,
    location: "Somewhere",
    links: [
      { platform: "discord", label: "Join the Discord", url: "https://example.com" },
      { platform: "twitter", label: "Twitter", url: "https://example.com", mode: "icon" },
      { platform: "github", label: "GitHub", url: "https://example.com", mode: "icon" },
    ],
  },
};

const htmlForData = (data) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const r = createRoot(el);
  act(() => r.render(<ProfilePreview data={data} />));
  const html = el.innerHTML;
  act(() => r.unmount());
  el.remove();
  return html;
};

// Each surviving layout draws the whole profile: the same name, bio and links
// have to be on the card whichever one is picked. This is the check that used to
// fail silently — a layout that forgot a block rendered "nothing" and nobody
// noticed until somebody's page was empty.
it("draws every block in every layout", () => {
  const missing = [];
  const doubled = [];

  for (const layout of LAYOUTS.map((l) => l.id)) {
    const html = htmlForData({ ...SCREENSHOT_DATA, profile: { ...SCREENSHOT_DATA.profile, layout } });
    const text = html.replace(/<[^>]*>/g, " ");

    for (const [what, needle] of [
      ["display name", "Tester"],
      ["@alias", "@tester"],
      ["bio", "hello world"],
      ["links", "Join the Discord"],
      ["view count", "12"],
    ]) {
      if (!text.includes(needle)) missing.push(`${layout} has no ${what}`);
    }

    // The avatar, exactly once: a layout that draws its own and leaves the other
    // copy in the flow is the "two avatars" bug, and a layout that draws none at
    // all is the "this one shows nothing" bug.
    const avatars = (html.match(/data-block="avatar"/g) || []).length;
    if (avatars !== 1) doubled.push(`${layout} draws the avatar ${avatars} times`);
  }

  expect({ missing, doubled }).toEqual({ missing: [], doubled: [] });
});

// The Slideshow used to draw its own thing: the header had no card at all, and
// the About Me slide painted a hard-coded dark plate while every other layout
// honoured the card style. All three slides now wear the owner's surface, so
// picking a card style changes the Slideshow the same way it changes the rest.
it("dresses the slideshow slides in the owner's card style", () => {
  const data = {
    ...SCREENSHOT_DATA,
    profile: {
      ...SCREENSHOT_DATA.profile,
      layout: "slideshow",
      card_fill_color: "#123456",
      card_fill_alpha: 78,
    },
  };
  act(() => root.render(<ProfilePreview data={data} />));

  const cards = ["slideshow-profile-card", "slideshow-about-card", "slideshow-links-card"]
    .map((id) => container.querySelector(`[data-testid="${id}"]`));
  for (const card of cards) {
    expect(card).toBeTruthy();
    // The fill colour and alpha the profile saved, not a colour of the layout's own.
    expect(card.getAttribute("style")).toContain("rgba(18, 52, 86, 0.78)");
  }
});

// Three things the Slideshow got wrong about the card style it was handed.
it("drops the slideshow's shadow with the surface, and keeps its dots inside", () => {
  const shot = (profile, props) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const r = createRoot(el);
    act(() => r.render(<ProfilePreview data={{ ...SCREENSHOT_DATA, profile: { ...SCREENSHOT_DATA.profile, layout: "slideshow", ...profile } }} {...props} />));
    const out = el.innerHTML;
    const node = el;
    act(() => r.unmount());
    el.remove();
    return { html: out, node };
  };

  // A transparent card style used to keep the slideshow's heavy drop shadow
  // while every other layout dropped it — the fill went away and the dark plate
  // behind the text stayed, which is what "card style does nothing here" was.
  const clear = shot({ card_style: "transparent" });
  expect(clear.html).not.toContain("box-shadow: 0 20px 60px");

  // A card style WITH a surface still gets one.
  expect(shot({ card_style: "classic" }).html).toContain("0 20px 60px");

  // On the real page the dot rail is fixed to the viewport; inside the editor's
  // preview a fixed rail parks itself at the far right of the browser instead.
  expect(shot({ card_style: "classic" }).html).toContain("fixed top-1/2");
  expect(shot({ card_style: "classic" }, { embedded: true }).html).toContain("absolute top-1/2");
});

// The artwork is painted once, on the sticky layer. It used to be painted twice —
// full strength on the scroller and scaled on the layer — so the opacity dial did
// nothing, and the scroller's `background-attachment: fixed` repainted in the
// middle of every scroll, which is what made this layout heavy to scrub.
it("paints the slideshow artwork once, and scrolls the container when a dot is tapped", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const r = createRoot(el);
  const data = {
    ...SCREENSHOT_DATA,
    profile: {
      ...SCREENSHOT_DATA.profile,
      layout: "slideshow",
      background_url: "/uploads/art.png",
      bg_opacity: 40,
    },
  };
  act(() => r.render(<ProfilePreview data={data} />));

  const scroller = el.querySelector('[data-testid="profile-preview"]');
  expect(scroller.style.backgroundImage).toBe("");
  expect(scroller.style.backgroundAttachment).toBe("");
  // Exactly one copy of the picture, at the opacity the owner chose.
  expect(el.innerHTML.split("/api/uploads/art.png").length - 1).toBe(1);

  // Tapping a dot scrolls THIS container. `scrollIntoView` asks the browser to
  // scroll whichever ancestors it likes, which jumped the whole dashboard around
  // an embedded preview instead of the slide.
  const to = jest.fn();
  scroller.scrollTo = to;
  const dot = el.querySelector('[data-testid="slideshow-indicators"] button');
  act(() => dot.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(to).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));

  act(() => r.unmount());
  el.remove();
});

// The dot rail is a pointer control, so a full-page slideshow had no keyboard
// route through it at all: the scroller fills the viewport and has no scrollbar
// to grab. Arrows (and the keys that move any scroll container) step a slide,
// and anything typed into is left alone — the editor embeds this same view.
it("steps between slides with the keyboard, and leaves typing alone", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const r = createRoot(el);
  act(() =>
    r.render(<ProfilePreview data={{ ...SCREENSHOT_DATA, profile: { ...SCREENSHOT_DATA.profile, layout: "slideshow" } }} />),
  );

  const scroller = el.querySelector('[data-testid="profile-preview"]');
  const to = jest.fn();
  scroller.scrollTo = to;
  const press = (key, target) =>
    act(() => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
  const activeDot = () =>
    [...el.querySelectorAll('[data-testid="slideshow-indicators"] button')].findIndex(
      (b) => b.getAttribute("data-active") === "true",
    );

  expect(activeDot()).toBe(0);

  press("ArrowDown", document);
  expect(to).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  expect(activeDot()).toBe(1);

  to.mockClear();
  press("PageUp", document);
  expect(activeDot()).toBe(0);

  to.mockClear();
  press("End", document);
  expect(activeDot()).toBe(2);

  to.mockClear();
  // A key pressed inside a field belongs to the field. The editor puts this
  // same preview next to its own inputs; stealing arrows there would make every
  // text box unusable.
  const field = document.createElement("input");
  document.body.appendChild(field);
  press("ArrowUp", field);
  expect(to).not.toHaveBeenCalled();
  field.remove();

  // A key nothing is bound to is not swallowed either.
  press("Tab", document);
  expect(to).not.toHaveBeenCalled();

  act(() => r.unmount());
  el.remove();
});

it("shows the location in the meta line", () => {
  act(() => root.render(<ProfilePreview data={SCREENSHOT_DATA} />));
  const meta = container.querySelector('[data-testid="profile-meta"]');
  expect(meta).toBeTruthy();
  expect(meta.textContent).toContain("Somewhere");
});

// The floating layouts offer a mute control, but only when there is actually
// background audio on the page to mute.
it("only offers the background audio control when there is audio", () => {
  act(() => root.render(<ProfilePreview data={SCREENSHOT_DATA} backgroundAudio />));
  expect(container.querySelector('[data-testid="bg-audio-toggle"]')).toBeTruthy();

  act(() => root.render(<ProfilePreview data={SCREENSHOT_DATA} />));
  expect(container.querySelector('[data-testid="bg-audio-toggle"]')).toBeFalsy();
});

// The saved lyrics field outlived the Wide player it belonged to: the catalogue
// is three card styles now, and none of them is a lyric panel. Lyrics saved on
// old profiles must not render anything anywhere.
it("ignores saved lyrics — no style renders a lyric panel any more", () => {
  const data = {
    ...SCREENSHOT_DATA,
    profile: {
      ...SCREENSHOT_DATA.profile,
      track_style: "compact",
      tracks: [{ title: "NOBLE", artist: "", url: "" }],
      lyrics: "[0:00] She's got rings covered in gold",
    },
  };

  const el = document.createElement("div");
  document.body.appendChild(el);
  const r = createRoot(el);
  act(() => r.render(<ProfilePreview data={data} />));

  expect(el.querySelector('[data-testid="lyrics-panel"]')).toBeFalsy();

  act(() => r.unmount());
  el.remove();
});


// The per-block placement map is gone from the editor. Profiles that still carry
// its saved `pos_*` keys have to render exactly like an untouched card — the old
// code moved the block, and moving the avatar left a second copy behind.
it("ignores saved placements and draws each block once", () => {
  const data = { ...base, avatar_url: "/me.png", equipped_badges: ["verified"] };
  const placements = {
    pos_avatar: "top-right",
    pos_badges: "next-to-name",
    pos_bio: "out-bottom-left",
    pos_links: "top-center",
    pos_views: "middle-left",
  };

  const problems = [];
  for (const layout of LAYOUTS.map((l) => l.id)) {
    act(() => root.render(<ProfilePreview data={{ ...data, profile: { ...base.profile, layout, ...placements } }} />));
    for (const selector of ['[data-block="avatar"]', '[data-block="name"]', '[data-block="badges"]', '[data-testid="profile-meta"]']) {
      const n = container.querySelectorAll(selector).length;
      if (n > 1) problems.push(`${layout} renders ${selector} ${n} times`);
    }
    // Nothing is positioned outside the card either.
    if (container.querySelectorAll('[data-outside="true"]').length) {
      problems.push(`${layout} still pins a block to the card edge`);
    }
  }

  expect(problems).toEqual([]);
});

// The Corner Icon player is the quiet one: a lone speaker chip, with the
// progress line and the track info revealed on hover rather than always on
// screen. Profiles saved with the old "simplistic" id land here too.
it("renders the Corner Icon audio style as a speaker chip with a hover panel", () => {
  const track = { title: "STAR WALKIN", artist: "Lil Nas X", url: "" };
  for (const savedStyle of ["corner-icon", "simplistic"]) {
    const profile = { ...base.profile, tracks: [track], track_style: savedStyle };
    act(() => root.render(<ProfilePreview data={{ ...base, profile }} />));

    const chip = container.querySelector('[data-testid="track-corner-icon"]');
    expect(chip).toBeTruthy();
    // The hover panel carries the track info and only becomes visible on hover.
    expect(chip.textContent).toContain("STAR WALKIN");
    expect(chip.querySelector(".group-hover\\/corner\\:opacity-100")).toBeTruthy();
  }

  // The compact player is a different, always-visible card.
  act(() => root.render(
    <ProfilePreview data={{ ...base, profile: { ...base.profile, tracks: [track], track_style: "compact" } }} />,
  ));
  expect(container.querySelector('[data-testid="track-corner-icon"]')).toBeFalsy();
});

it("shows the UID chip only when it is switched on", () => {
  const off = { ...base, id: "9f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f" };
  act(() => root.render(<ProfilePreview data={off} />));
  expect(container.textContent).not.toContain("UID");

  act(() => root.render(<ProfilePreview data={{ ...off, profile: { ...base.profile, showcase_uid: true } }} />));
  expect(container.textContent).toContain("UID 9f1c2d3e");
});

// The Swats avatar decorations had no reader on the card at all: picking one in
// the modal wrote its id into the Discord-frame field, which then resolved to no
// frame and no effect. They render now.
it("draws the Swats avatar decoration over the picture", () => {
  const profile = { ...base.profile, avatar_effect: "swats_pulse" };
  act(() => root.render(<ProfilePreview data={{ ...base, profile }} />));

  const fx = container.querySelector('[data-testid="avatar-effect"]');
  expect(fx).toBeTruthy();
  expect(fx.className).toContain("fx-ov-swats_pulse");

  // and it goes away when the effect is cleared
  act(() => root.render(<ProfilePreview data={{ ...base, profile: { ...profile, avatar_effect: "" } }} />));
  expect(container.querySelector('[data-testid="avatar-effect"]')).toBeFalsy();
});

// A profile must be able to wear a Discord frame AND a Swats effect together;
// they used to share one field, so one always replaced the other.
it("wears a Discord frame and a Swats effect at the same time", () => {
  const profile = { ...base.profile, avatar_decoration: "/frames/0007.png", avatar_effect: "swats_shine" };
  act(() => root.render(<ProfilePreview data={{ ...base, profile }} />));

  expect(container.querySelector('img[src="/frames/0007.png"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="avatar-effect"]').className).toContain("fx-ov-swats_shine");
});

// A member can wear the decoration their Discord account actually has instead of
// a bundled copy. That one is a full CDN URL, and an animated preset is an APNG
// behind that same `.png` URL — so the card has to hand the URL to an <img>
// untouched, with no `/frames/` prefix and no extension munging.
it("wears a real Discord decoration straight off the CDN", () => {
  const url = "https://cdn.discordapp.com/avatar-decoration-presets/a_fed43ab12698df65902ba06727e20c0e.png";
  const profile = { ...base.profile, avatar_decoration: url };
  act(() => root.render(<ProfilePreview data={{ ...base, profile }} />));

  const overlay = container.querySelector(`img[src="${url}"]`);
  expect(overlay).toBeTruthy();
  // Untouched: no rewritten path, which is what would 404 the animation.
  expect(container.querySelector('img[src^="/frames/"]')).toBeFalsy();
});

// Before the two slots existed, a Swats effect was stored in the frame field.
// Those saved profiles must not silently go blank.
it("honours a legacy Swats effect saved in the frame field", () => {
  const profile = { ...base.profile, avatar_decoration: "swats_mirage" };
  act(() => root.render(<ProfilePreview data={{ ...base, profile }} />));

  const fx = container.querySelector('[data-testid="avatar-effect"]');
  expect(fx).toBeTruthy();
  expect(fx.className).toContain("fx-ov-swats_mirage");
  // it must not be mistaken for a PNG frame asset
  expect(container.querySelector('img[src*="swats_mirage"]')).toBeFalsy();
});

it("honours the footer-line display options", () => {
  const profile = { ...base.profile, meta_style: "pills", showcase_uid: true };
  const data = { ...base, views: 1234, id: "9f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f", profile };
  act(() => root.render(<ProfilePreview data={data} />));

  const views = container.querySelector('[data-testid="meta-views"]');
  // 1234 in the one format there is.
  expect(views.textContent).toContain("1.2k");
  // No member number in this fixture, so the chip falls back to the short id.
  expect(container.querySelector('[data-testid="meta-uid"]').textContent).toContain("9f1c2d3e");

  // pills wraps each item in its own bordered chip
  expect(views.className).toContain("rounded-full");
  expect(views.className).toContain("border");
});

// The count and the member number have one format each now. The editor used to
// offer two of each (1,234 vs 1.2K, and #123 vs #0000123), and a profile that
// still carries one of those saved ids must not change how the card reads.
it("ignores the retired count and UID format settings", () => {
  const render = (profile) => {
    act(() => root.render(<ProfilePreview data={{ ...base, views: 999, uid_number: 123, profile: { ...base.profile, showcase_uid: true, ...profile } }} />));
    return {
      views: container.querySelector('[data-testid="meta-views"]').textContent,
      uid: container.querySelector('[data-testid="meta-uid"]').textContent,
    };
  };

  const plain = render({});
  const legacied = render({ views_format: "full", uid_format: "full" });
  expect(plain.views).toContain("999");
  expect(legacied.views).toEqual(plain.views);
  expect(plain.uid).toContain("UID #123");
  expect(legacied.uid).toEqual(plain.uid);

  // The member number, never a rank: no bare "#1"-style collision with the
  // leaderboard, and unaffected by the raw account id.
  expect(render({}).uid).not.toContain("9f1c2d3e");

  // Past a thousand the count shortens, and stays short.
  act(() => root.render(<ProfilePreview data={{ ...base, views: 1234, profile: base.profile }} />));
  expect(container.querySelector('[data-testid="meta-views"]').textContent).toContain("1.2k");
  act(() => root.render(<ProfilePreview data={{ ...base, views: 3400000, profile: base.profile }} />));
  expect(container.querySelector('[data-testid="meta-views"]').textContent).toContain("3.4m");
});

// The tips used to sit inside the card, so a badge near the card's top edge had
// its tooltip sliced off by the card's own overflow clipping. They render into
// the document now so they always show over everything.
it("portals badge tooltips out of the clipped card", async () => {
  const data = { ...base, equipped_badges: ["verified"] };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const r = createRoot(el);
  act(() => r.render(<ProfilePreview data={data} />));

  const chip = el.querySelector('[data-testid="badge-row"] [data-badge]');
  expect(chip).toBeTruthy();
  // A tip only opens for a pointer that actually moved since it mounted: the
  // hover a browser manufactures for whatever sits under a resting cursor is
  // not a hover. Move, then hover, like a visitor.
  act(() => {
    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
  });
  act(() => {
    chip.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
  });
  // Tips open on a ~150ms show delay (the anti-flicker gate), so wait it out.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  const tip = document.body.querySelector('[role="tooltip"]');
  expect(tip).toBeTruthy();
  expect(tip.textContent).toContain("VERIFIED");

  act(() => r.unmount());
  el.remove();
});

const renderLink = (link, profile = {}) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const r = createRoot(el);
  const Icon = () => <i />;
  act(() => r.render(<LinkCard link={link} profile={profile} accent="#FF7FBC" Icon={Icon} />));
  const html = el.innerHTML;
  act(() => r.unmount());
  el.remove();
  return html;
};

// Link and widget glows used to fire on every platform preset. They are opt-in
// now, so a profile with no glow setting stays flat.
it("leaves link cards unglowed until glow is switched on", () => {
  const bright = { platform: "discord", label: "Discord", url: "https://example.com", glow: "#ff00ff" };
  const off = renderLink(bright, {});
  expect(off).not.toContain("0 0 26px");
  expect(off).not.toContain("0 0 20px");

  const on = renderLink(bright, { link_glow: true, link_global_glow: "#00ff00" });
  // The redone glow is layered — a tight rim plus a wide halo — so the tight
  // ring is the marker that glow is on.
  expect(on).toContain("0 0 10px");
});

// Card Pro is the redesigned link card: an icon plate, a content column and a
// circular action instead of the old flat pill.
it("renders the redesigned Card Pro link style", () => {
  const plain = renderLink({ platform: "discord", label: "Discord", url: "https://example.com" }, {});
  const pro = renderLink({ platform: "discord", label: "Discord", url: "https://example.com", card_style: "new" }, {});
  expect(pro).not.toBe(plain);
  expect(pro).toContain("px-4 py-3.5");

  // The optional description line rides along with it.
  const described = renderLink({ platform: "discord", label: "Discord", url: "https://example.com", card_style: "new", desc: "Our community" }, {});
  expect(described).toContain("Our community");
});

// Icons are bare by default now: the glyph alone with a soft shadow, instead of
// a tinted tile behind every one of them.
it("renders icon-only links without a background plate by default", () => {
  const iconLink = { platform: "discord", label: "Discord", url: "https://example.com", mode: "icon" };
  const html = renderLink(iconLink, {});
  expect(html).toContain("background: transparent");
  expect(html).not.toContain("1px solid");

  // Choosing a plate brings the tile back.
  const plated = renderLink({ ...iconLink, icon_style: "rounded" }, {});
  expect(plated).not.toContain("background: transparent");
  expect(plated).toContain("1px solid");
});

// A custom uploaded icon replaces the platform glyph.
it("uses an uploaded icon when a link has one", () => {
  const withIcon = renderLink({ platform: "discord", label: "Discord", url: "https://example.com", icon_url: "/uploads/custom.png" }, {});
  expect(withIcon).toContain("custom.png");
});

// Overlays render through one painter — the ghost overlay engine — and the
// Transparency slider fades whichever one is in play.
it("renders the overlay through the right painter and fades it with the slider", () => {
  const withOverlay = (overlay, overlay_opacity) => {
    act(() => root.render(<ProfilePreview data={{ ...base, profile: { ...base.profile, overlay, overlay_opacity } }} />));
    return container.querySelector('[data-testid="overlay-layer"], [data-testid="overlay-canvas"]');
  };

  const rain = withOverlay("rain", 40);
  expect(rain.getAttribute("data-testid")).toBe("overlay-canvas");
  expect(rain.getAttribute("data-effect")).toBe("rain");
  expect(rain.style.opacity).toBe("0.4");

  const dotters = withOverlay("dotters", 100);
  expect(dotters.getAttribute("data-testid")).toBe("overlay-canvas");
  expect(dotters.getAttribute("data-effect")).toBe("dotters");
  // 100% is the authored look, so nothing is overridden.
  expect(dotters.style.opacity).toBe("");

  const grain = withOverlay("grain", 25);
  expect(grain.getAttribute("data-testid")).toBe("overlay-canvas");
  expect(grain.getAttribute("data-effect")).toBe("grain");
  expect(grain.style.opacity).toBe("0.25");

  // A legacy overlay resolves the same way: dots still shows up as dotters, and
  // a removed one renders nothing at all.
  const dots = withOverlay("dots", 100);
  expect(dots.getAttribute("data-effect")).toBe("dotters");
  expect(withOverlay("noise", 30)).toBeNull();

  // No overlay selected means no layer at all, whatever the slider says.
  expect(withOverlay("", 30)).toBeNull();
});

// The card draws the same bare art the dashboard does: one size, no plate, no
// box-shadow, no per-badge override, and no overlap pulling the row together.
it("draws every badge bare, at one size, in an evenly spaced row", () => {
  const data = {
    ...base,
    equipped_badges: ["verified", "og", "premium"],
    profile: {
      ...base.profile,
      // Settings a profile may still carry from the retired customiser.
      badge_size: "sm",
      badge_style: "plate",
      badge_overlay_tint: "#00ff00",
      badge_recolor_enabled: true,
      badge_overrides: { premium: { size: "xl", plate: true } },
    },
  };
  act(() => root.render(<ProfilePreview data={data} />));

  const chips = [...container.querySelectorAll("[data-badge]")];
  expect(chips.map((c) => c.getAttribute("data-badge"))).toEqual(["verified", "og", "premium"]);

  for (const chip of chips) {
    // One size, its own picture, and nothing drawn behind or over it.
    expect(chip.className).toContain("w-[22px]");
    expect(chip.querySelector("img")).toBeTruthy();
    expect(chip.querySelector(".badge-art-mono")).toBeNull();
    expect(chip.querySelector(".badge-art-overlay")).toBeNull();
    expect(chip.className).not.toContain("badge-chip--plate");
    expect(chip.style.background).toBe("");
    expect(chip.style.boxShadow).toBe("");
  }

  // The row spaces itself, so no chip is ever placed over its neighbour.
  expect(chips.every((c) => c.style.marginLeft === "")).toBe(true);
  const row = container.querySelector('[data-testid="badge-row"]');
  // A tight gap and no line-height of its own: the box hugs the art, so this
  // 4px is the whole distance between two badges.
  expect(row.className).toContain("gap-1");
  expect(row.className).not.toContain("gap-1.5");
  expect(row.className).toContain("leading-none");
  expect(row.className).toContain("items-center");

  // A profile that still carries the retired overlap setting is not pulled
  // together by it either.
  act(() => root.render(<ProfilePreview data={{ ...data, profile: { ...data.profile, badge_overlap: 100 } }} />));
  const tight = [...container.querySelectorAll("[data-badge]")];
  expect(tight.every((c) => c.style.marginLeft === "")).toBe(true);
});

// The card's little extras: the join date the API now sends, the bio size, and
// a view counter that the owner has moved off the meta line.
it("shows the join date, the bio size and a moved view counter", () => {
  const withJoin = {
    ...base,
    created_at: "2026-03-04T12:00:00.000Z",
    profile: { ...base.profile, show_join_date: true, bio_size: 150 },
  };
  act(() => root.render(<ProfilePreview data={withJoin} />));

  const joined = container.querySelector('[data-testid="meta-joined"]');
  expect(joined).toBeTruthy();
  expect(joined.textContent).toContain("2026");
  // A percentage of the card's default size, not a class the breakpoint can win.
  expect(container.querySelector('[data-block="bio"] p').style.fontSize).toBe("21px");

  // An API with no join date must not print "Joined Invalid Date".
  act(() => root.render(<ProfilePreview data={{ ...base, profile: { ...base.profile, show_join_date: true } }} />));
  expect(container.querySelector('[data-testid="meta-joined"]')).toBeNull();

  // Moving the count to a corner takes it out of the meta line.
  act(() => root.render(<ProfilePreview data={{ ...base, profile: { ...base.profile, views_position: "br" } }} />));
  expect(container.querySelector('[data-testid="meta-views"]')).toBeNull();
});

it("paints the badge glow settings saved from the Badges page", () => {
  const plain = { ...base, equipped_badges: ["verified"], profile: { ...base.profile, badge_glow_color: "#ff0000", badge_glow_intensity: 100 } };
  act(() => root.render(<ProfilePreview data={plain} />));
  // 6px base + 14px at full intensity, painted in the chosen colour — as a
  // drop-shadow of the art, never as a shadow of the chip's box.
  expect(badgeChip().style.getPropertyValue("--badge-glow")).toBe("drop-shadow(0 0 20.0px #ff0000ff)");
  expect(badgeChip().style.boxShadow).toBe("");

  // intensity 0 means no glow at all
  const off = { ...base, equipped_badges: ["verified"], profile: { ...base.profile, badge_glow_color: "#ff0000", badge_glow_intensity: 0 } };
  act(() => root.render(<ProfilePreview data={off} />));
  expect(badgeChip().style.getPropertyValue("--badge-glow")).toBe("");
});

it("lays the badge overlay color over the art, and only when it is on", () => {
  const on = {
    ...base,
    equipped_badges: ["verified"],
    profile: { ...base.profile, badge_overlay: true, badge_overlay_color: "#00ff00", badge_overlay_strength: 50 },
  };
  act(() => root.render(<ProfilePreview data={on} />));
  const wash = badgeChip().querySelector('[data-testid="badge-overlay"]');
  expect(wash).toBeTruthy();
  expect(wash.style.opacity).toBe("0.5");
  expect(wash.style.getPropertyValue("--badge-mask")).toContain("/badges/");
  // The art is still there underneath it.
  expect(badgeChip().querySelector(".badge-art-img")).toBeTruthy();

  // Off — or on with no colour — draws the art as it is.
  for (const profile of [
    { ...base.profile, badge_overlay: false, badge_overlay_color: "#00ff00" },
    { ...base.profile, badge_overlay: true, badge_overlay_color: "" },
    { ...base.profile },
  ]) {
    act(() => root.render(<ProfilePreview data={{ ...base, equipped_badges: ["verified"], profile }} />));
    expect(container.querySelector('[data-testid="badge-overlay"]')).toBeNull();
  }
});
