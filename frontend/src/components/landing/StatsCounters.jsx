import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { Link2, Eye, DollarSign } from "lucide-react";

const useCountUp = (target, active, duration = 1600) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active || !target) return;
    let start = null;
    let raf;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.floor(eased * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);
  return val;
};

const fmt = (n, prefix = "", suffix = "+") => {
  if (!n) return `${prefix}0${suffix}`;
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M${suffix}`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K${suffix}`;
  return `${prefix}${n.toLocaleString()}${suffix}`;
};

export const StatsCounters = () => {
  // `null` until the API answers, and `"error"` when it refuses. The page used to
  // seed these with 5 / 120 / 0 and count up to them, so a deployment whose stats
  // had not loaded advertised "120+ total profile views" as if somebody had
  // earned them. A figure is now drawn only when the server sent one.
  const [stats, setStats] = useState(null);
  const [active, setActive] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    let alive = true;
    api.get("/stats")
      .then(({ data }) => {
        if (alive) setStats(data && typeof data === "object" ? data : "error");
      })
      .catch(() => {
        if (alive) setStats("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setActive(true), { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const real = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const links = useCountUp(real(stats?.bio_links) || 0, active && real(stats?.bio_links) !== null);
  const views = useCountUp(real(stats?.total_views) || 0, active && real(stats?.total_views) !== null);
  const money = useCountUp(real(stats?.money_funded) || 0, active && real(stats?.money_funded) !== null);

  const items = [
    { icon: Link2, label: "Bio Links Created", value: real(stats?.bio_links) === null ? "—" : fmt(links), testid: "stat-bio-links" },
    { icon: Eye, label: "Total Profile Views", value: real(stats?.total_views) === null ? "—" : fmt(views), testid: "stat-total-views" },
    { icon: DollarSign, label: "Money Funded", value: real(stats?.money_funded) === null ? "—" : fmt(money, "$"), testid: "stat-money-funded" },
  ];

  return (
    <section ref={ref} data-testid="live-stats-counters" className="px-4 py-8 max-w-4xl mx-auto">
      {/* Three compact cards side by side at EVERY width. They used to be a single
          column below `sm`, so a phone got three full-screen panels and the page
          opened with a stack of scrolling for three numbers. */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        {items.map((it) => (
          <div key={it.label} data-testid={it.testid} className="glass relative overflow-hidden group rounded-xl border border-white/10 p-3 sm:rounded-2xl sm:p-5">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />
            <it.icon className="mb-2.5 h-4 w-4 text-brand-400 sm:mb-4 sm:h-5 sm:w-5" />
            <div className="font-display text-lg font-extrabold text-zinc-50 tabular-nums sm:text-4xl">{it.value}</div>
            <div className="mt-1 font-mono2 text-[9px] uppercase tracking-wider text-zinc-400 sm:text-xs">{it.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
};
