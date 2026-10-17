import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { ProfilePreview } from "@/components/ProfilePreview";
import { useTopProfiles } from "@/lib/landingProfiles";
import { profileUrl } from "@/lib/api";
import { quietProfile } from "@/components/landing/ProfileShowcase";
import { ExternalLink, Trophy, ChevronLeft, ChevronRight, Eye } from "lucide-react";

const SWAP_MS = 5000;
const SPRING = { type: "spring", stiffness: 120, damping: 24, mass: 0.9 };
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n || 0));

// Visual target for a card given its signed offset from the active (centre) card.
function targetFor(offset) {
  if (offset === 0) return { x: "0%", scale: 1, opacity: 1, z: 30, blur: 0, show: true };
  if (offset === -1) return { x: "-58%", scale: 0.82, opacity: 0.5, z: 20, blur: 2, show: true };
  if (offset === 1) return { x: "58%", scale: 0.82, opacity: 0.5, z: 20, blur: 2, show: true };
  // Off-stage: parked behind the visible one it will slide in from, so entering
  // cards glide rather than pop. Never unmounted, so the preview never reloads.
  return { x: offset < 0 ? "-90%" : "90%", scale: 0.7, opacity: 0, z: 0, blur: 4, show: false };
}

const Card = ({ profile, offset, onClick }) => {
  const t = targetFor(offset);
  const center = offset === 0;
  return (
    <motion.div
      data-testid={center ? "lb-seat-center" : undefined}
      onClick={onClick}
      initial={false}
      animate={{ x: t.x, scale: t.scale, opacity: t.opacity, filter: `blur(${t.blur}px)` }}
      transition={SPRING}
      style={{ zIndex: t.z, pointerEvents: t.show ? "auto" : "none" }}
      className="absolute left-1/2 -ml-[140px] sm:-ml-[180px] w-[280px] sm:w-[360px] cursor-pointer will-change-transform"
    >
      <div className={`relative rounded-2xl overflow-hidden border bg-[#0b0b0f] transition-colors duration-300 ${center ? "border-brand-400/50 shadow-[0_28px_70px_-28px_rgba(139,92,246,0.55)]" : "border-white/10 shadow-[0_18px_44px_-24px_rgba(0,0,0,0.95)]"} h-[360px] sm:h-[460px]`}>
        <div aria-hidden="true" inert className="pointer-events-none absolute inset-x-0 top-0">
          <ProfilePreview data={profile} embedded />
        </div>
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-[#0b0b0f] via-[#0b0b0f]/85 to-transparent" />
        <span className="absolute left-3 top-3 z-20 rounded-lg border border-white/10 bg-black/70 px-2 py-0.5 font-display text-xs font-black text-amber-300 backdrop-blur-sm">#{profile.rank}</span>
        <div className="absolute inset-x-0 bottom-0 z-20 p-4 text-left">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-display text-lg font-black text-zinc-50">{profile.display_name || profile.username}</div>
              <div className="truncate font-mono2 text-xs text-zinc-400">swats.bio/{profile.username}</div>
            </div>
            {typeof profile.views === "number" && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs text-zinc-300"><Eye className="h-3.5 w-3.5" /> {fmt(profile.views)}</span>
            )}
          </div>
          {center && (
            <a href={profileUrl(profile.username)} target="_blank" rel="noreferrer" data-testid="lb-visit" onClick={(e) => e.stopPropagation()} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110">
              Visit profile <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const LeaderboardShowcase = () => {
  const { loading, profiles: raw } = useTopProfiles(7);
  const roster = useMemo(() => raw.map(quietProfile).filter(Boolean), [raw]);
  const n = roster.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => { if (active >= n) setActive(0); }, [n, active]);
  useEffect(() => {
    if (paused || n < 2) return undefined;
    const t = setInterval(() => setActive((a) => (a + 1) % n), SWAP_MS);
    return () => clearInterval(t);
  }, [paused, n]);

  // Signed shortest offset of card i from the active card, so wrap-around slides
  // the short way (e.g. last → first glides one step, not all the way back).
  const offsetOf = useCallback((i) => {
    let d = i - active;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    return d;
  }, [active, n]);

  if (!loading && !n) {
    return (
      <section data-testid="leaderboard-showcase" className="border-y border-white/10 py-14">
        <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
          <Trophy className="h-6 w-6 text-zinc-600" />
          <div className="text-sm font-semibold text-zinc-300">The leaderboard is still empty</div>
          <p className="text-xs text-zinc-500">Claim a handle and you could be the first card shown here.</p>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="leaderboard-showcase" className="relative overflow-hidden border-y border-white/10 py-16">
      <div className="mx-auto mb-10 max-w-xl text-center px-4">
        <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs font-mono2 text-amber-300"><Trophy className="h-3.5 w-3.5" /> Top of the leaderboard</div>
        <h2 className="mt-4 font-display text-3xl font-black text-zinc-50 sm:text-4xl">The pages everyone's watching</h2>
        <p className="mt-2 text-sm text-zinc-400">Real pages, ranked by real views — swapping automatically. Tap a side card to bring it forward.</p>
      </div>

      <div className="relative mx-auto h-[380px] sm:h-[480px] max-w-4xl" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} data-testid="lb-stage">
        {loading ? (
          <div className="absolute left-1/2 -ml-[140px] sm:-ml-[180px] w-[280px] sm:w-[360px] h-[360px] sm:h-[460px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
        ) : (
          roster.map((p, i) => {
            const off = offsetOf(i);
            return <Card key={p.username} profile={p} offset={off} onClick={() => setActive(i)} />;
          })
        )}
      </div>

      {n > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <button data-testid="lb-prev" onClick={() => setActive((a) => (a - 1 + n) % n)} className="rounded-full glass p-2 text-zinc-300 hover:text-white hover:border-brand-500/50 border border-white/10 transition"><ChevronLeft className="h-4 w-4" /></button>
          <div className="flex items-center gap-1.5">
            {roster.map((p, i) => (
              <button key={p.username} data-testid={`lb-dot-${i}`} onClick={() => setActive(i)} className={`h-1.5 rounded-full transition-all ${i === active ? "w-6 bg-brand-500" : "w-1.5 bg-white/20 hover:bg-white/40"}`} aria-label={`Show ${p.username}`} />
            ))}
          </div>
          <button data-testid="lb-next" onClick={() => setActive((a) => (a + 1) % n)} className="rounded-full glass p-2 text-zinc-300 hover:text-white hover:border-brand-500/50 border border-white/10 transition"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </section>
  );
};

export default LeaderboardShowcase;
