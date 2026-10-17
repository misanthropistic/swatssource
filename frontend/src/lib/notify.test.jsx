import { createRoot } from "react-dom/client";
import { act } from "react";
import { Toaster, toast, dismissAll } from "./notify";

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  jest.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Toaster />));
});

afterEach(() => {
  act(() => {
    dismissAll();
    jest.advanceTimersByTime(400);
  });
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

const notify = (fn) => act(() => fn());
// Let the store's emit() flush into React.
const settle = () => act(() => jest.advanceTimersByTime(1));

const cards = () => [...container.querySelectorAll("li")];
const text = () => container.textContent;

it("renders notifications in a fixed top-centre region", () => {
  notify(() => toast.success("Profile saved"));

  const region = container.querySelector('[data-testid="notification-region"]');
  expect(region).toBeTruthy();
  // top centre: full-width strip anchored to the top edge, its cards centred
  expect(region.className).toContain("fixed");
  expect(region.className).toContain("top-0");
  expect(region.className).toContain("inset-x-0");
  expect(region.className).toContain("items-center");
  expect(region.className).not.toContain("bottom-0");

  expect(container.querySelector('[data-testid="notification-success"]')).toBeTruthy();
  expect(text()).toContain("Profile saved");
});

it("paints the card opaque, so the page never shows through it", () => {
  notify(() => toast.info("Opaque please"));

  const card = container.querySelector('[data-testid="notification-info"]');
  // A solid fill colour, not a `/95` translucent one.
  expect(card.className).toContain("bg-[#0b0b10]");
  expect(card.className).not.toMatch(/bg-\[#[0-9a-f]+\]\/\d/);
});

it("draws a countdown bar that matches the toast's own lifetime", () => {
  notify(() => toast.success("Profile saved"));

  const timer = container.querySelector('[data-testid="notification-timer"]');
  expect(timer).toBeTruthy();
  // The default 4200ms lifetime, handed to the CSS animation.
  expect(timer.getAttribute("style")).toContain("sw-toast-timer 4200ms");
});

it("keeps the newest notification nearest the top edge", () => {
  notify(() => {
    toast.success("first");
    toast.error("second");
  });

  // DOM order stays oldest-first (what the store holds); the list paints it
  // reversed so the newest arrival sits at the top, where the eye already is.
  expect(cards().map((c) => c.textContent)).toEqual([expect.stringContaining("first"), expect.stringContaining("second")]);
  const list = container.querySelector("ol");
  expect(list.className).toContain("flex-col-reverse");
});

it("uses a distinct variant per notification type", () => {
  notify(() => toast.success("ok"));
  notify(() => toast.error("bad"));
  notify(() => toast.info("fyi"));

  expect(container.querySelector('[data-testid="notification-success"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="notification-error"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="notification-info"]')).toBeTruthy();
});

it("stacks several notifications", () => {
  notify(() => toast.success("first"));
  notify(() => toast.error("second"));
  notify(() => toast.info("third"));

  expect(cards()).toHaveLength(3);
  // newest is appended last, so it renders at the bottom of the stack
  expect(cards()[2].textContent).toContain("third");
});

it("auto-dismisses after its duration", () => {
  notify(() => toast.success("leaving"));

  act(() => jest.advanceTimersByTime(1000));
  expect(cards()).toHaveLength(1);

  // past the default 4200ms duration plus the 180ms exit animation
  act(() => jest.advanceTimersByTime(5000));
  expect(cards()).toHaveLength(0);
});

it("dismisses on demand", () => {
  let handle;
  notify(() => {
    handle = toast.error("dismiss me");
  });

  expect(cards()).toHaveLength(1);
  notify(() => handle.dismiss());
  act(() => jest.advanceTimersByTime(400));
  expect(cards()).toHaveLength(0);
});

it("keeps a loading notification until it is dismissed", () => {
  let handle;
  notify(() => {
    handle = toast.loading("Uploading");
  });

  act(() => jest.advanceTimersByTime(30000));
  expect(cards()).toHaveLength(1);

  notify(() => handle.dismiss());
  act(() => jest.advanceTimersByTime(400));
  expect(cards()).toHaveLength(0);
});

it("caps how many notifications are visible at once", () => {
  notify(() => {
    for (let i = 0; i < 9; i++) toast.info(`n${i}`);
  });

  expect(cards()).toHaveLength(5);
  expect(text()).toContain("n8");
});

it("renders an Error the caller passed instead of an object string", () => {
  notify(() => toast.error(new Error("Network unreachable")));
  expect(text()).toContain("Network unreachable");
  expect(text()).not.toContain("[object Object]");
});

it("dismissAll clears the queue", () => {
  notify(() => {
    toast.success("a");
    toast.error("b");
  });
  expect(cards()).toHaveLength(2);

  notify(() => dismissAll());
  act(() => jest.advanceTimersByTime(400));
  expect(cards()).toHaveLength(0);
});

it("exposes a dismiss control on each notification", () => {
  notify(() => toast.success("closeable"));

  const button = container.querySelector('[aria-label="Dismiss notification"]');
  expect(button).toBeTruthy();

  notify(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  settle();
  act(() => jest.advanceTimersByTime(400));
  expect(cards()).toHaveLength(0);
});
