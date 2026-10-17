// A profile view has to survive React remounting the tracker. The app renders
// inside <StrictMode>, which mounts every effect twice in development, and the
// first cleanup used to cancel the only in-flight run while a "already started"
// latch blocked the second one — so the counter never moved at all.
import { createRoot } from "react-dom/client";
import { StrictMode, useRef } from "react";
import { act } from "react";
import { api } from "@/lib/api";
import { useProfileViewTracker, resetViewTrackerCache } from "./viewTracker";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api", () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

// Keep the real proof-of-work maths, but never burn cycles hashing in a test.
jest.mock("@/lib/viewPoW", () => ({
  ...jest.requireActual("@/lib/viewPoW"),
  solveProofAsync: jest.fn(async () => "1"),
}));

const CHALLENGE = {
  challenge_id: "11111111-1111-4111-8111-111111111111",
  seed: "seed",
  difficulty: 8,
  dwell_ms: 1,
  turnstile_site_key: null,
};

const Tracker = ({ alias, counted }) => {
  const seen = useRef(null);
  useProfileViewTracker(alias, { onCount: (v) => { seen.current = v; counted(v); } });
  return null;
};

const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(() => {
  resetViewTrackerCache();
  api.get.mockReset().mockResolvedValue({ data: CHALLENGE });
  api.post.mockReset().mockResolvedValue({ data: { counted: true, views: 7 } });
});

it("registers one view under StrictMode's double-mounted effect", async () => {
  const counted = jest.fn();
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);

  await act(async () => {
    root.render(
      <StrictMode>
        <Tracker alias="tester" counted={counted} />
      </StrictMode>,
    );
  });
  await wait(400);

  expect(api.post).toHaveBeenCalledTimes(1);
  expect(counted).toHaveBeenCalledWith(7);

  act(() => root.unmount());
  el.remove();
});

it("does not register a second view for the same alias", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);

  await act(async () => {
    root.render(
      <StrictMode>
        <Tracker alias="tester" counted={() => {}} />
      </StrictMode>,
    );
  });
  await wait(400);
  await wait(400);

  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  el.remove();
});

it("stays silent when the visitor never dwelled and the register is refused", async () => {
  api.post.mockResolvedValue({ data: { counted: false, reason: "own_profile", views: 3 } });
  const counted = jest.fn();
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);

  await act(async () => {
    root.render(<Tracker alias="tester" counted={counted} />);
  });
  await wait(400);

  expect(counted).not.toHaveBeenCalled();
  act(() => root.unmount());
  el.remove();
});

// The counter has to hold on to honest readers. A register that never got an
// answer is worth one more try; a 4xx is the server's decision and is not.
it("retries a register that never got an answer", async () => {
  const networkError = new Error("Network Error"); // no .response — nothing answered
  api.post.mockRejectedValueOnce(networkError).mockResolvedValue({ data: { counted: true, views: 4 } });
  const counted = jest.fn();
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);

  await act(async () => {
    root.render(<Tracker alias="tester" counted={counted} />);
  });
  await wait(400); // first attempt fails
  await wait(1600); // …and the retry lands after the backoff

  expect(api.post).toHaveBeenCalledTimes(2);
  expect(counted).toHaveBeenCalledWith(4);
  act(() => root.unmount());
  el.remove();
});

it("does not retry a register the server refused", async () => {
  api.post.mockRejectedValue(Object.assign(new Error("bad request"), { response: { status: 400 } }));
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);

  await act(async () => {
    root.render(<Tracker alias="tester" counted={() => {}} />);
  });
  await wait(400);
  await wait(1600);

  expect(api.post).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  el.remove();
});

// Navigating away mid-registration used to cancel the request and lose the view.
// The parked registration is flushed once with keepalive, which outlives the page.
it("flushes a still-pending registration when the page goes away", async () => {
  api.post.mockImplementation(() => new Promise(() => {})); // never answers
  const fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
  const originalFetch = global.fetch;
  global.fetch = fetchMock;

  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);

  await act(async () => {
    root.render(<Tracker alias="tester" counted={() => {}} />);
  });
  await wait(400);
  expect(api.post).toHaveBeenCalledTimes(1);

  act(() => { window.dispatchEvent(new Event("pagehide")); });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain("/views/register");
  expect(init.method).toBe("POST");
  expect(init.keepalive).toBe(true);
  expect(JSON.parse(init.body).challenge_id).toBe(CHALLENGE.challenge_id);

  // A second hide must not send it twice.
  act(() => { window.dispatchEvent(new Event("pagehide")); });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  global.fetch = originalFetch;
  act(() => root.unmount());
  el.remove();
});

// A repeat visit inside the same window would be refused by the server, so the
// challenge and its proof of work are skipped rather than spent on a no-op.
it("skips the round trip for a visit that already counted in this window", async () => {
  localStorage.setItem("swats_viewed", JSON.stringify({ tester: Date.now() }));
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);

  await act(async () => {
    root.render(<Tracker alias="tester" counted={() => {}} />);
  });
  await wait(400);

  expect(api.get).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
  act(() => root.unmount());
  el.remove();
});

it("asks again once the counting window has gone by", async () => {
  // Two hours old: a different window, so this is a new countable visit.
  localStorage.setItem("swats_viewed", JSON.stringify({ tester: Date.now() - 2 * 60 * 60 * 1000 }));
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);

  await act(async () => {
    root.render(<Tracker alias="tester" counted={() => {}} />);
  });
  await wait(400);

  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  el.remove();
});
