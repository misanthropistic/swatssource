import { useEffect, useRef } from "react";
import { spanLetters } from "@/lib/ghostFx";

/* ---------------------------------------------------------------------------
   FxText — the runtime half of the text effects, exactly as ghost.html runs
   them. The CSS half lives in effects.css as `.fx-text-<id>` rules carrying
   ghost's files' own keyframes (shake, rainbow, neon aurora, shine, glow,
   glitch, flames' colour, flicker, flip's spin, blackout, bleeding's shadow,
   the shimmer masks, the typewriter caret).

   Everything ghost drives with JavaScript lives here, transcribed from its
   setText() switch — same timers, same randomness, same spawned elements:

     • typewriter — types at 130ms, holds 1500ms, deletes at 70ms, gaps 400ms.
     • the three sparkles — a star (`.fx-spark`, ghost's `.sp` clip-path shape)
       born at a random spot on the text box every 90ms, twinkling out over
       900ms. White / green / rainbow palettes exactly as ghost picks them.
     • flames — embers rising off the tops of the letters every 70ms.
     • bleeding — red drips falling from the letters' undersides.
     • morph — blur out, swap the word, blur back, every 2.2s.
     • scramble — glyphs resolving left to right, then holding.
     • loading — the name trailing "…", cycling 1–3 dots every 450ms.
     • flip — each letter wrapped in a spin (ghost's `.t-flip span`).
     • reactive — letters that rise and glow as the pointer passes them.

   These mutate the DOM imperatively — the DOM, in the words of ghost's script,
   IS the effect, and no canvas middleman renders it. React owns the element and
   the text source; the spawned stars and letter spans are React-invisible
   additions that the timers clean up themselves, so reconciliation never meets
   them.
   --------------------------------------------------------------------------- */

const SCRAMBLE_GLYPHS = "!<>-_/[]{}=+*^?#$%";

/* The ids whose effect is JS-driven (no pure CSS rule renders them). */
export const FX_TEXT_JS_IDS = [
  "typewriter",
  "scramble",
  "white-sparkle",
  "green-sparkle",
  "rainbow-sparkle",
  "flames",
  "bleeding",
  "morph",
  "loading",
  "flip",
  "reactive",
];

/* ghost's gen-token loop: a recursive setTimeout that dies the moment the
   effect changes. */
function makeLoop(genRef) {
  return (step, ms) => {
    const g = genRef.current;
    const run = () => {
      if (genRef.current !== g) return;
      const next = step();
      setTimeout(run, typeof next === "number" ? next : ms);
    };
    run();
  };
}

export function FxText({
  id = "",
  text,
  className = "",
  style,
  as: Tag = "span",
  caret = true,
  ...rest
}) {
  void caret;
  const source = text === undefined || text === null ? "" : String(text);
  const hostRef = useRef(null);
  const genRef = useRef(0);
  const listenerRef = useRef(null);

  // Every id carrying CSS keys keeps its fx-text-<id> rule even when the effect
  // also has a JS half (ghost does the same: `t-flip` has JS letters AND CSS
  // keys). JS-only ids still get their class for their spawned-element rules.
  const fxClass = id ? `fx-text-${id}` : "";
  const merged = [fxClass, className].filter(Boolean).join(" ");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    genRef.current += 1;
    const gen = () => genRef.current;
    const loop = makeLoop(genRef);

    // Per-run teardown for the modes that own listeners or frames of their own.
    const cleanups = [];

    // Every mode starts from the same reset (ghost's setText prologue), minus
    // React's own inline styles: cssText.clearRectW from the caller (the bio's
    // font size, the name's colour) must survive, so only the two properties
    // morph touches are cleared.
    host.style.removeProperty("filter");
    host.style.removeProperty("opacity");
    if (host.dataset.text !== undefined) host.dataset.text = source;
    host.textContent = source;

    const spawn = (cls, css, life) => {
      const e = document.createElement("i");
      e.className = cls;
      e.style.cssText = css;
      host.append(e);
      setTimeout(() => e.remove(), life);
    };
    const letters = () => {
      host.innerHTML = spanLetters(source);
    };

    if (id === "typewriter") {
      let i = 0;
      let deleting = false;
      loop(() => {
        if (gen() !== genRef.current) return undefined;
        host.textContent = source.slice(0, i) || "\u200b";
        if (!deleting) {
          if (i < source.length) {
            i += 1;
            return 130;
          }
          deleting = true;
          return 1500;
        }
        if (i > 0) {
          i -= 1;
          return 70;
        }
        deleting = false;
        return 400;
      }, 100);
    } else if (/sparkle/.test(id)) {
      const col =
        id[0] === "w"
          ? () => "#fff"
          : id[0] === "g"
            ? () => (Math.random() < 0.5 ? "#4dff88" : "#b6ffd0")
            : () => `hsl(${(Math.random() * 360) | 0},100%,70%)`;
      loop(() => {
        if (gen() !== genRef.current) return undefined;
        spawn("fx-spark", `left:${Math.random() * 100}%;top:${Math.random() * 100}%;background:${col()}`, 900);
        return 90;
      }, 90);
    } else if (id === "flames") {
      loop(() => {
        if (gen() !== genRef.current) return undefined;
        spawn("fx-ember", `left:${Math.random() * 100}%;top:35%;--dx:${(Math.random() - 0.5) * 14}px`, 1100);
        return 70;
      }, 70);
    } else if (id === "bleeding") {
      loop(() => {
        if (gen() !== genRef.current) return undefined;
        spawn("fx-drip", `left:${8 + Math.random() * 84}%;top:80%`, 2300);
        return 600 + Math.random() * 900;
      }, 600);
    } else if (id === "morph") {
      // A morph is the blur transition in effects.css, not a word swap. It used
      // to cycle the owner's name through "phantom", "spirit" and "nobody" —
      // on a profile that is the display name, so the effect renamed people.
      // The text now blurs out and resolves back into itself.
      loop(() => {
        if (gen() !== genRef.current) return undefined;
        host.style.filter = "blur(9px)";
        host.style.opacity = "0.2";
        setTimeout(() => {
          if (gen() !== genRef.current) return;
          host.style.filter = "";
          host.style.opacity = "";
        }, 350);
        return 2200;
      }, 0);
    } else if (id === "scramble") {
      let f = 0;
      const N = source.length * 3;
      const ch = SCRAMBLE_GLYPHS;
      loop(() => {
        if (gen() !== genRef.current) return undefined;
        if (f > N) {
          host.textContent = source;
          if (++f > N + 40) f = 0;
          return 45;
        }
        let out = "";
        for (let j = 0; j < source.length; j++) out += j < f / 3 ? source[j] : ch[(Math.random() * ch.length) | 0];
        host.textContent = out;
        f += 1;
        return 45;
      }, 45);
    } else if (id === "loading") {
      let k = 0;
      loop(() => {
        if (gen() !== genRef.current) return undefined;
        host.textContent = `${source}${".".repeat(k)}${"\u2007".repeat(3 - k)}`;
        k = (k + 1) % 4;
        return 450;
      }, 450);
    } else if (id === "flip") {
      letters();
    } else if (id === "reactive") {
      letters();
      const spans = [...host.children];

      // The letters do not move between pointer moves, so their boxes are
      // measured once (and again on resize) instead of read for every letter on
      // every move — that was ~15 forced layouts per mouse event, which is why
      // the effect lagged behind the cursor on a name. One rAF per frame gates
      // the writes too.
      let rects = [];
      const measure = () => {
        rects = spans.map((s) => s.getBoundingClientRect());
      };
      measure();

      let pending = null;
      let frame = 0;
      const flush = () => {
        frame = 0;
        const e = pending;
        pending = null;
        if (!e || gen() !== genRef.current) return;
        spans.forEach((s, i) => {
          const r = rects[i];
          if (!r) return;
          const k = 1 - Math.min(1, Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / 140);
          s.style.transform = `translateY(${-k * 10}px) scale(${1 + k * 0.45})`;
          s.style.textShadow = `0 0 ${k * 20}px rgba(255,255,255,${k})`;
        });
      };
      const handler = (e) => {
        pending = e;
        if (!frame) frame = requestAnimationFrame(flush);
      };
      listenerRef.current = handler;
      addEventListener("pointermove", handler, { passive: true });
      addEventListener("resize", measure);
      // The effect's own cleanup removes `listenerRef.current`; the resize hook
      // and the queued frame are torn down here.
      cleanups.push(() => {
        removeEventListener("resize", measure);
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      });
    }

    return () => {
      genRef.current += 1;
      for (const fn of cleanups) fn();
      if (listenerRef.current) {
        removeEventListener("pointermove", listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, [id, source]);

  // JS-driven ids render no static children: the effect owns the element's text
  // (ghost types / scrambles / morphs straight into textContent). The spawned
  // stars, embers and drips are React-invisible siblings cleaned up by their
  // own timers, so reconciliation never meets them.
  // CSS ids render the text plainly — pure CSS paints them.
  const isJs = FX_TEXT_JS_IDS.includes(id);
  return (
    <Tag ref={hostRef} className={merged} style={style} data-fx-text={id || undefined} data-text={id === "glitch" ? source : undefined} {...rest}>
      {isJs ? null : source}
    </Tag>
  );
}

export default FxText;
