import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutGrid } from "lucide-react";
import { WidgetCard } from "@/components/WidgetCards";

// The same accounts the site demonstrates with, rendered through the real
// widget components and the real backend proxy — no screenshots, no typed-out
// numbers.
const WIDGETS = [
  {
    accent: "#1DB954",
    w: { type: "spotify", title: "Spotify", url: "https://open.spotify.com/track/3P61wVXNlCuTa7zSnTN3Zv" },
  },
  {
    accent: "#ff5500",
    w: { type: "soundcloud", title: "SoundCloud", url: "https://soundcloud.com/bondages" },
  },
  {
    accent: "#ff0050",
    w: { type: "tiktok", title: "TikTok", url: "https://www.tiktok.com/@koniwtfs" },
  },
  {
    accent: "#5865F2",
    w: { type: "discord", subtype: "profile", title: "Discord", user_id: "1546745348020772915" },
  },
  {
    accent: "#5865F2",
    w: { type: "discord", subtype: "server", title: "swats.bio", invite_url: "https://discord.gg/a9uwptuepD" },
  },
];

// A resting tilt, so the band reads as 3D even before anything is hovered (and
// on machines with reduced motion, where the pointer response is skipped).
const BASE_TILT = { x: 12, y: 8 };

const Tilt = ({ children, index }) => {
  const tiltRef = useRef(null);
  const reduce = useReducedMotion();
  const baseY = index % 2 === 0 ? -BASE_TILT.y : BASE_TILT.y;
  const rest = `rotateX(${BASE_TILT.x}deg) rotateY(${baseY}deg)`;

  const onMove = (e) => {
    if (reduce || !tiltRef.current) return;
    const box = tiltRef.current.getBoundingClientRect();
    if (!box) return;
    const px = (e.clientX - box.left) / box.width - 0.5;
    const py = (e.clientY - box.top) / box.height - 0.5;
    tiltRef.current.style.transform = `rotateX(${BASE_TILT.x - py * 16}deg) rotateY(${baseY + px * 16}deg)`;
  };

  const reset = () => {
    if (tiltRef.current) tiltRef.current.style.transform = rest;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className="w-full sm:w-[340px]"
    >
      <motion.div whileHover={reduce ? undefined : { y: -6, scale: 1.02 }} className="group relative">
        <div
          ref={tiltRef}
          data-testid={`tilt-${index}`}
          onPointerMove={onMove}
          onPointerLeave={reset}
          style={{ transform: rest, transformStyle: "preserve-3d", transition: "transform .2s ease-out" }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-2 rounded-3xl opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-60"
            style={{ background: "radial-gradient(circle at 50% 30%, rgba(255,127,188,0.25), transparent 70%)" }}
          />
          <div style={{ transform: "translateZ(34px)" }} className="relative">
            {children}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export const WidgetShowcase = () => (
  <section data-testid="widget-showcase" className="relative overflow-hidden border-t border-white/10 py-20">
    <div className="mx-auto mb-12 max-w-xl px-4 text-center">
      <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs font-mono2 text-brand-300">
        <LayoutGrid className="h-3.5 w-3.5" /> Real widgets
      </div>
      <h2 className="mt-4 font-display text-3xl font-black text-zinc-50 sm:text-4xl">The widgets your page actually renders</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Live data straight from Discord, Spotify, SoundCloud and TikTok through our proxy — the
        same cards you drop on your own page. Move your pointer over them.
      </p>
    </div>

    <div
      className="mx-auto flex max-w-5xl flex-wrap justify-center gap-6 px-4"
      style={{ perspective: "1100px" }}
      data-testid="widget-showcase-grid"
    >
      {WIDGETS.map((item, i) => (
        <Tilt key={`${item.w.type}-${item.w.subtype || item.w.url || item.w.user_id}`} index={i}>
          <div className="h-full rounded-2xl" data-testid={`live-widget-${item.w.type}${item.w.subtype ? `-${item.w.subtype}` : ""}`}>
            <WidgetCard w={item.w} accent={item.accent} />
          </div>
        </Tilt>
      ))}
    </div>
  </section>
);

export default WidgetShowcase;
