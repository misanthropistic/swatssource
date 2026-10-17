/* The "ping" the dashboard bell plays when something new arrives.
 *
 * Two short sine notes through a gain envelope — deliberately quiet and under a
 * fifth of a second, because this fires while someone is reading.
 *
 * Browsers refuse to start an AudioContext until the user has interacted with
 * the page, so `armPing()` is called on mount and unlocks the context on the
 * first click/keypress. Before that, ping() simply stays silent rather than
 * throwing or warning in the console.
 */
const MUTE_KEY = "swats_notify_sound";

let ctx = null;
let armed = false;

export const pingMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === "off";
  } catch {
    return false;
  }
};

export const setPingMuted = (muted) => {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "off" : "on");
  } catch {
    /* private mode: the sound preference just will not persist */
  }
};

const ensureContext = () => {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
};

/* Called once from the bell. Adds self-removing gesture listeners so the very
   first interaction anywhere on the page unlocks audio for later pings. */
export function armPing() {
  if (armed || typeof window === "undefined") return () => {};
  armed = true;

  const unlock = () => {
    const context = ensureContext();
    if (context?.state === "suspended") context.resume().catch(() => {});
    remove();
  };
  const remove = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  return remove;
}

// Plays the ping. Never throws: a blocked or unsupported audio context is not a
// reason for the notification poller to break.
export function ping() {
  if (pingMuted()) return;
  const context = ensureContext();
  if (!context || context.state !== "running") return;

  try {
    const now = context.currentTime;
    const notes = [
      { freq: 880, at: 0 },
      { freq: 1318.5, at: 0.09 },
    ];

    for (const { freq, at } of notes) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      // Short attack, exponential tail: a blip, not a beep that holds.
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.09, now + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.16);
      osc.connect(gain).connect(context.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.18);
    }
  } catch {
    /* audio is best-effort */
  }
}
