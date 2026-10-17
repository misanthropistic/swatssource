// Covers the profile music player: the saved default volume, shuffle, the
// one-track-at-a-time rule, and the spinner that used to sit over the cover art.
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ProfilePreview } from "./ProfilePreview";

global.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom cannot actually play audio, so stand in for HTMLAudioElement and record
// what the player does to it.
let created = [];
let realAudio;

// Set to imitate a browser that refuses sound until the visitor interacts:
// the unmuted play is rejected exactly the way Chrome/Safari do.
let blockUnmutedPlay = false;

class FakeAudio {
  constructor(src) {
    this.src = src;
    this.volume = 1;
    this.currentTime = 0;
    this.duration = 100;
    this.paused = true;
    this.muted = false;
    this.playCalls = 0;
    created.push(this);
  }
  play() {
    this.playCalls++;
    if (blockUnmutedPlay && !this.muted) {
      const err = new Error("play() failed because the user didn't interact");
      err.name = "NotAllowedError";
      return Promise.reject(err);
    }
    this.paused = false;
    this.onplay?.();
    return Promise.resolve();
  }
  pause() {
    const wasPaused = this.paused;
    this.paused = true;
    if (!wasPaused) this.onpause?.();
  }
}

const profileWith = (profile) => ({
  username: "tester",
  display_name: "Tester",
  views: 3,
  badges: [],
  equipped_badges: [],
  profile: { links: [], widgets: [], ...profile },
});

let container;
let root;

beforeAll(() => {
  realAudio = global.Audio;
  global.Audio = FakeAudio;
});

afterAll(() => {
  global.Audio = realAudio;
});

beforeEach(() => {
  created = [];
  blockUnmutedPlay = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (data) => act(() => root.render(<ProfilePreview data={data} />));

const renderAutoplaying = async (data) => {
  await act(async () => {
    root.render(<ProfilePreview data={data} autoPlayAudio />);
  });
};

const gesture = async (type) => {
  await act(async () => {
    window.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    await Promise.resolve();
  });
};

const playButtons = () =>
  [...container.querySelectorAll("button")].filter((b) => b.className.includes("rounded-full"));

const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

const track = (title, url) => ({ title, url, artist: "" });

// "The audio never plays by default": the browser refuses sound until the
// visitor touches the page, and the player used to swallow that refusal and
// stop trying. It now falls back to a muted start — which is always allowed, so
// the track really is running — and gives the visitor the sound on the first
// gesture.
it("starts the first track on load even when the browser blocks sound", async () => {
  blockUnmutedPlay = true;
  await renderAutoplaying(profileWith({ tracks: [track("A", "/a.mp3")] }));

  expect(created).toHaveLength(1);
  expect(created[0].paused).toBe(false);
  expect(created[0].muted).toBe(true);

  await gesture("pointerdown");
  expect(created[0].muted).toBe(false);
});

it("starts the first track with sound when the browser allows it", async () => {
  await renderAutoplaying(profileWith({ tracks: [track("A", "/a.mp3")] }));

  expect(created[0].paused).toBe(false);
  expect(created[0].muted).toBe(false);
  // One attempt, not a muted retry on top of a working start.
  expect(created[0].playCalls).toBe(1);
});

it("applies the saved default volume to playback", () => {
  render(profileWith({ tracks: [track("A", "/a.mp3")], track_volume: 30 }));

  click(playButtons()[0]);

  expect(created).toHaveLength(1);
  expect(created[0].volume).toBeCloseTo(0.3);
  expect(created[0].playCalls).toBe(1);
});

it("defaults to 80% when the profile has no volume set", () => {
  render(profileWith({ tracks: [track("A", "/a.mp3")] }));

  click(playButtons()[0]);

  expect(created[0].volume).toBeCloseTo(0.8);
});

it("plays only one track at a time", () => {
  render(
    profileWith({
      tracks: [track("A", "/a.mp3"), track("B", "/b.mp3")],
    }),
  );

  const buttons = playButtons();
  expect(buttons).toHaveLength(2);

  click(buttons[0]);
  click(buttons[1]);

  expect(created).toHaveLength(2);
  // starting the second track stops the first rather than layering over it
  expect(created[0].paused).toBe(true);
  expect(created[1].paused).toBe(false);
});

it("pauses the profile's background audio when a track starts", () => {
  const background = document.createElement("audio");
  background.id = "profile-bg-audio";
  let backgroundPaused = false;
  background.pause = () => { backgroundPaused = true; };
  Object.defineProperty(background, "paused", { get: () => false });
  document.body.appendChild(background);

  render(profileWith({ tracks: [track("A", "/a.mp3")] }));
  click(playButtons()[0]);

  expect(backgroundPaused).toBe(true);
  background.remove();
});

it("keeps every track when shuffle is on", () => {
  render(
    profileWith({
      tracks: [track("A", "/a.mp3"), track("B", "/b.mp3"), track("C", "/c.mp3")],
      track_shuffle: true,
    }),
  );

  // Shuffle may reorder, but it must never drop or duplicate a track.
  const shown = container.textContent;
  for (const title of ["A", "B", "C"]) expect(shown).toContain(title);
  expect(playButtons()).toHaveLength(3);
});

// Every player style HAS to look like its own style. The catalogue is exactly
// three styles now — mini-bar, compact and corner-icon — and each renders
// distinct markup; resolveTrackStyle folds every removed legacy id onto the
// style it most looks like.
it("renders each player style as its own markup", () => {
  const renderStyle = (track_style) => {
    render(profileWith({ tracks: [track("A", "/a.mp3")], track_style }));
    return container.innerHTML;
  };

  const html = {};
  for (const style of ["mini-bar", "compact", "corner-icon"]) {
    html[style] = renderStyle(style);
  }
  expect(new Set(Object.values(html)).size).toBe(3);

  // A removed legacy id must not fall into a dead branch: it renders the
  // compact player, not nothing.
  expect(renderStyle("vinyl")).toContain('data-testid="track-compact"');
  expect(renderStyle("simplistic")).toContain('data-testid="track-corner-icon"');
});

// The corner icon is only a speaker chip until it is hovered; the audio bar
// (title, scrubber, time) rides inside the hover panel.
it("renders the corner icon with its hover panel", () => {
  render(profileWith({ tracks: [track("A", "/a.mp3")], track_style: "corner-icon" }));
  const chip = container.querySelector('[data-testid="track-corner-icon"]');
  expect(chip).toBeTruthy();
  expect(chip.querySelector(".group-hover\\/corner\\:opacity-100")).toBeTruthy();
  expect(chip.textContent).toContain("A");
});

// The player used to paint the accent colour as a glow — a 20px halo around the
// play button and a 10px one under the scrubber — which made a playing card the
// loudest thing on the page.
it("does not paint a neon accent glow around the player", () => {
  render(profileWith({ tracks: [track("A", "/a.mp3")], track_style: "compact" }));
  click(playButtons()[0]);

  const glowing = [...container.querySelectorAll("*")].filter((el) =>
    /0 0 (10|20)px/.test(el.style.boxShadow || ""),
  );
  expect(glowing).toEqual([]);
});

// The compact player's scrubber had been deleted while its click handler was
// left behind as loose text, which parsed as JSX children: the card rendered a
// literal "onClick=" line and could not be seeked.
it("draws the compact player's scrubber instead of stray handler text", () => {
  render(profileWith({ tracks: [track("A", "/a.mp3")], track_style: "compact" }));

  const chip = container.querySelector('[data-testid="track-compact"]');
  expect(chip.querySelector('[data-testid="track-scrubber"]')).toBeTruthy();
  expect(container.textContent).not.toContain("onClick");
});

// A slideshow profile with a track used to throw: the layout read a
// `pinnedPlayer` binding that was never passed to it, blanking the whole page.
it("renders a slideshow profile that carries tracks", () => {
  render(profileWith({ tracks: [track("A", "/a.mp3")], layout: "slideshow" }));

  expect(container.querySelector('[data-testid="track-compact"]')).toBeTruthy();
});

// `fixed` only means "the website's corner" while nothing above the chip is
// transformed: a fixed box inside a transformed ancestor positions against that
// ancestor, and the card runs will-change/transform for the tilt. That is how the
// corner player ended up pinned to the card's top-left, over the header.
it("pins the corner player to the website, not to the tilted card", () => {
  render(profileWith({ tracks: [track("A", "/a.mp3")], track_style: "corner-icon" }));
  const chip = container.querySelector('[data-testid="track-corner-icon"]');

  expect(chip.className).toContain("fixed");
  for (let el = chip.parentElement; el && el !== container; el = el.parentElement) {
    expect(el.style.transform).toBe("");
    expect(el.style.willChange).not.toBe("transform");
  }
});

// The same chip inside the editor's embedded preview has no website corner to
// own, so it anchors to the preview box rather than floating over the dashboard.
it("keeps the corner player inside an embedded preview", () => {
  act(() =>
    root.render(
      <ProfilePreview
        embedded
        data={profileWith({ tracks: [track("A", "/a.mp3")], track_style: "corner-icon" })}
      />,
    ),
  );

  const chip = container.querySelector('[data-testid="track-corner-icon"]');
  expect(chip.className).toContain("absolute");
  expect(chip.className).not.toContain("fixed");
});

it("does not draw a spinner over the cover art while playing", () => {
  render(profileWith({ tracks: [track("A", "/a.mp3")] }));

  expect(container.querySelectorAll(".animate-spin")).toHaveLength(0);
  click(playButtons()[0]);
  // still none once playback has started
  expect(container.querySelectorAll(".animate-spin")).toHaveLength(0);
});
