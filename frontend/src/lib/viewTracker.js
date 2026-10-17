import { useEffect, useRef } from "react";
import { api, API, getToken } from "@/lib/api";
import { solveProofAsync } from "@/lib/viewPoW";

/* ---------------------------------------------------------------------------
   Profile view tracker
   ---------------------------------------------------------------------------
   Registers a single profile view, but only after the visitor has genuinely
   engaged:

     1. the page has been visible (not a background tab) for the server's dwell
        time — 1.2s by default,
     2. the client solves the server's proof-of-work challenge,
     3. if Cloudflare Turnstile is configured, a challenge token is attached.

   The server enforces the rest (single-use challenge, one view per visitor per
   hour, IP rate limits), so a client that skips any of this simply never counts.

   Three things keep an HONEST visit from going missing, which is the failure
   that matters here — an inflated counter is annoying, a counter that quietly
   ignores real readers is useless:

     • A browser that already counted inside the current window (the same window
       the server dedupes on) skips the round trip entirely. Nothing is lost: the
       server would have refused the second one anyway.
     • A register that never gets an answer — network blip, a cold API instance,
       a navigation away mid-request — is retried, and if the page is going away
       the same registration is flushed once more with `keepalive` so it survives
       the unload. The server's single-use challenge makes the resend harmless:
       whichever copy arrives second is refused, so it can never double count.
     • View requests are marked `silent`, so a failed counter never prints a red
       API error into a visitor's console.

   A registration belongs to the PAGE, not to a mount. React's <StrictMode>
   mounts every effect, tears it down and mounts it again; the shared promise
   below is what makes the double mount harmless instead of self-cancelling.

   Views stay best-effort: a visitor must never see an error about a counter.
   --------------------------------------------------------------------------- */

// Only used if a challenge response omits dwell_ms; keep it in step with
// backend/views.js VIEW_RULES.dwellMs.
const FALLBACK_DWELL_MS = 1200;

// Keep in step with backend/views.js VIEW_RULES.windowMs (one counted view per
// visitor per window). Local bookkeeping only — the server is the authority.
const VIEW_WINDOW_MS = 60 * 60 * 1000;

const SEEN_KEY = "swats_viewed";
const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/* Diagnostics are opt-in. They used to print on every profile load in
   development, which is the opposite of what a counter should be: set
   localStorage.swats_view_debug = "1" when a count actually needs explaining. */
function debugOn() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("swats_view_debug") === "1";
  } catch {
    return false;
  }
}

function debugLog(message) {
  if (debugOn()) console.info(`[swats.bio] ${message}`);
}

/* ``alias -> timestamp of the last counted view``, kept in localStorage. Only
   ever read to SKIP work that the server would refuse anyway. */
function readSeen() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const map = raw ? JSON.parse(raw) : null;
    return map && typeof map === "object" ? map : {};
  } catch {
    return {};
  }
}

function noteSeen(alias) {
  try {
    const now = Date.now();
    const map = readSeen();
    // Stale entries are worthless the moment their window closes.
    for (const [key, at] of Object.entries(map)) {
      if (now - Number(at) > VIEW_WINDOW_MS * 24) delete map[key];
    }
    map[alias] = now;
    localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  } catch {
    /* private mode / storage disabled — the server still dedupes */
  }
}

function countedInThisWindow(alias) {
  const at = Number(readSeen()[alias]);
  if (!at) return false;
  // Compare WINDOWS, not a rolling hour, so this matches the server's bucket
  // arithmetic: a visitor whose window has ticked over is asked again.
  return Math.floor(at / VIEW_WINDOW_MS) === Math.floor(Date.now() / VIEW_WINDOW_MS);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* One retry, and only for a request that never got an answer (offline blip, a
   sleeping API instance, a 5xx). A 4xx is the server's decision and is never
   repeated. */
async function attempt(run, tries = 2) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await run();
    } catch (err) {
      last = err;
      const status = err?.response?.status;
      if (status && status < 500) throw err;
      if (i < tries - 1) await wait(1200);
    }
  }
  throw last;
}

/* ---------------------------------------------------------------------------
   The unload flush.

   A registration that is still in flight when the visitor navigates away or
   closes the tab is cancelled by the browser, and the view is simply lost. So
   the finished registration is parked in `pending`, and if the page goes away
   before the server has answered, the same body is sent once with
   `keepalive: true` — which the browser is allowed to finish after unload.
   --------------------------------------------------------------------------- */
let flushArmed = false;
let pending = null;

function flushPendingView() {
  const p = pending;
  if (!p || !p.ready || p.sent || p.flushed) return;
  p.flushed = true;
  try {
    fetch(`${API}/views/register`, {
      method: "POST",
      headers: p.headers,
      body: JSON.stringify(p.body),
      keepalive: true,
      credentials: "omit",
      mode: "cors",
    }).catch(() => {});
  } catch {
    /* keepalive unsupported — nothing left to try */
  }
}

function armFlush() {
  if (flushArmed || typeof window === "undefined") return;
  flushArmed = true;
  window.addEventListener("pagehide", flushPendingView);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingView();
  });
}

function loadTurnstile() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loadTurnstile.promise) return loadTurnstile.promise;

  loadTurnstile.promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => reject(new Error("turnstile script failed"));
    document.head.appendChild(script);
  });
  return loadTurnstile.promise;
}

// Renders an invisible Turnstile widget and resolves with its token (or null on
// any failure/timeout). The widget lives off-screen and is removed immediately.
async function getTurnstileToken(siteKey) {
  try {
    const turnstile = await loadTurnstile();
    return await new Promise((resolve) => {
      const host = document.createElement("div");
      host.style.position = "fixed";
      host.style.bottom = "0";
      host.style.right = "0";
      host.style.width = "0";
      host.style.height = "0";
      host.style.overflow = "hidden";
      document.body.appendChild(host);

      let settled = false;
      // Declared before `finish` so a synchronous throw from render() can still
      // settle the promise (clearTimeout(undefined) is a harmless no-op).
      let timer = null;
      const finish = (token) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { turnstile.remove(host); } catch { /* widget already gone */ }
        host.remove();
        resolve(token);
      };
      timer = setTimeout(() => finish(null), 12000);

      try {
        turnstile.render(host, {
          sitekey: siteKey,
          size: "invisible",
          callback: (token) => finish(token),
          "error-callback": () => finish(null),
          "timeout-callback": () => finish(null),
        });
        try { turnstile.execute(host); } catch { /* auto-executes when supported */ }
      } catch {
        finish(null);
      }
    });
  } catch {
    return null;
  }
}

// Waits for `ms` of *visible* time. If the tab is hidden the clock pauses, so a
// person who opens a profile in a background tab is not counted until they
// actually look at it.
function dwellVisible(ms) {
  return new Promise((resolve) => {
    let remaining = ms;
    let last = Date.now();

    const tick = () => {
      const now = Date.now();
      if (typeof document === "undefined" || document.visibilityState !== "hidden") {
        remaining -= now - last;
      }
      last = now;
      if (remaining <= 0) {
        resolve(true);
        return;
      }
      setTimeout(tick, 250);
    };
    setTimeout(tick, 250);
  });
}

// One-shot registration for an alias, deliberately decoupled from any component
// lifetime. Exported so it can be used outside React if needed.
export async function registerProfileView(alias) {
  const { data: challenge } = await attempt(() =>
    api.get("/views/challenge", { params: { u: alias }, silent: true })
  );
  if (!challenge?.challenge_id || !challenge.seed) return { counted: false, reason: "no-challenge" };

  await dwellVisible(Number(challenge.dwell_ms) || FALLBACK_DWELL_MS);

  const nonce = await solveProofAsync(challenge.seed, challenge.difficulty || 15);

  let turnstileToken = null;
  if (challenge.turnstile_site_key) {
    turnstileToken = await getTurnstileToken(challenge.turnstile_site_key);
  }

  const body = {
    challenge_id: challenge.challenge_id,
    nonce,
    turnstile_token: turnstileToken,
  };
  const headers = { "Content-Type": "application/json" };
  try {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* no storage — the request just goes out anonymous */
  }

  // Park the finished registration so an unload can flush it.
  pending = { ready: true, sent: false, flushed: false, body, headers };
  armFlush();

  let data;
  try {
    const res = await attempt(async () => {
      const r = await api.post("/views/register", body, { silent: true });
      pending.sent = true;
      return r;
    });
    data = res.data;
  } catch (err) {
    // A response of any kind means the server decided; only a request that
    // never landed is worth flushing later.
    pending.sent = !!err?.response;
    throw err;
  }

  if (data?.counted) noteSeen(alias);
  reportOutcome(data);
  return data || { counted: false, reason: "no-response" };
}

/* A view that is deliberately not counted used to be impossible to tell apart
   from a broken counter. With localStorage.swats_view_debug = "1" the two are
   named — the owner looking at their own profile, or a second visit inside the
   current uniqueness window. */
function reportOutcome(data) {
  if (!debugOn()) return;
  if (data?.counted) {
    debugLog(`view counted — total ${data.views}`);
    return;
  }
  const why = {
    own_profile: "this is your own profile, so it is never counted",
    duplicate: "this visitor already counted inside the current window",
  }[data?.reason] || `server declined (${data?.reason || "unknown"})`;
  debugLog(`view not counted — ${why}`);
}

// Alias -> in-flight registration, for the lifetime of the page. Sharing the one
// promise is what makes StrictMode's second mount (and any quick remount) attach
// to the run that is already going instead of starting a doomed second one.
const inFlight = new Map();

export function trackProfileView(alias) {
  if (!alias) return Promise.resolve({ counted: false, reason: "no-alias" });
  const running = inFlight.get(alias);
  if (running) return running;

  // Already counted in this window: the server would refuse a second view, so the
  // challenge and its proof of work are not spent on a no-op.
  if (countedInThisWindow(alias)) return Promise.resolve({ counted: false, reason: "already-counted" });

  const promise = registerProfileView(alias)
    .catch((err) => {
      // Best-effort by design: a visitor must never see an error about a counter.
      // The reason still matters when a profile nobody can count needs explaining.
      debugLog(`view registration failed — ${err?.response?.data?.detail || err?.message || err}`);
      return { counted: false, reason: "error" };
    })
    .finally(() => {
      if (inFlight.get(alias) === promise) inFlight.delete(alias);
    });
  inFlight.set(alias, promise);
  return promise;
}

// Only for tests: forgets the shared registrations and the local window
// bookkeeping so each case starts clean.
export function resetViewTrackerCache() {
  inFlight.clear();
  pending = null;
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function useProfileViewTracker(alias, { enabled = true, onCount } = {}) {
  const onCountRef = useRef(onCount);

  useEffect(() => {
    onCountRef.current = onCount;
  }, [onCount]);

  useEffect(() => {
    if (!enabled || !alias) return undefined;
    let live = true;

    trackProfileView(alias).then((data) => {
      if (live && data?.counted && typeof data.views === "number") onCountRef.current?.(data.views);
    });

    // Unmounting only stops this consumer from reading the result — it does not
    // abandon the registration that is already in flight.
    return () => { live = false; };
  }, [alias, enabled]);
}

export default useProfileViewTracker;
