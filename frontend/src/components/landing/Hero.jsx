import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Check, X, Loader2, ArrowRight } from "lucide-react";
import { API } from "@/lib/api";

export const Hero = () => {
  const navigate = useNavigate();
  const [alias, setAlias] = useState("");
  const [status, setStatus] = useState(null); // null | checking | {available, reason}

  // Every check takes a ticket, and only the newest ticket may paint. Two
  // requests are in flight at once whenever somebody types at a normal speed,
  // and without this the slower answer for an earlier name could land last —
  // leaving a tick or a cross describing a name that is no longer in the box.
  const ticket = useRef(0);

  const check = useCallback(async (value) => {
    const mine = ++ticket.current;
    if (!value) { setStatus(null); return; }
    setStatus("checking");
    try {
      const { data } = await axios.get(`${API}/check-username`, { params: { alias: value } });
      if (ticket.current === mine) setStatus(data);
    } catch {
      if (ticket.current === mine) setStatus({ available: false, reason: "Error checking" });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => check(alias.trim()), 420);
    return () => clearTimeout(t);
  }, [alias, check]);

  const claim = () => {
    if (status && status.available) navigate(`/!/login?claim=${encodeURIComponent(alias.trim().toLowerCase())}`);
  };

  return (
    <section data-testid="hero-section" className="relative pt-36 sm:pt-44 pb-20 px-4 flex flex-col items-center text-center overflow-hidden">
      {/* ambient glow. The Sparkle overlay that used to sit here is gone: the
          hero carries the headline and the claim pill, and a scattering of stars
          over the copy was decoration the page did not need. */}
      <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-brand-600/10 blur-[150px] rounded-full" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)", backgroundSize: "60px 60px", maskImage: "radial-gradient(ellipse 60% 50% at 50% 0%, #000 40%, transparent 75%)" }} />

      <div className="relative z-10 fade-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs font-mono2 text-zinc-300 mb-7">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Your whole internet, one link
        </div>

        <h1 className="font-display font-black uppercase leading-[0.95] text-3d text-4xl sm:text-6xl lg:text-7xl max-w-4xl mx-auto">
          The #1 Home<br />for your<br /><span className="bg-gradient-to-b from-brand-300 to-brand-500 bg-clip-text text-transparent" style={{ textShadow: "none" }}>digital identity</span>
        </h1>

        <p className="mt-7 text-zinc-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          One link for everything you are. Build a stunning, fully customizable bio page with
          widgets, effects, badges and real-time analytics — your whole internet, one home.
        </p>

        {/* Claim pill */}
        <div className="mt-9 w-full max-w-lg mx-auto">
          <div
            data-testid="claim-input-wrapper"
            className={`glass-strong rounded-full flex items-center pl-5 pr-2 py-2 transition-all ${status && status.available ? "glow-ring" : "border-white/10"}`}
          >
            <span className="font-mono2 text-sm text-zinc-500 select-none">swats.bio/</span>
            <input
              data-testid="claim-alias-input"
              value={alias}
              onChange={(e) => setAlias(e.target.value.replace(/\s/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && claim()}
              placeholder="yourname"
              className="flex-1 bg-transparent outline-none text-zinc-100 placeholder-zinc-600 text-sm px-1 min-w-0"
            />
            {status === "checking" && <Loader2 className="w-4 h-4 text-zinc-500 animate-spin mr-2" />}
            {status && status !== "checking" && (
              status.available
                ? <Check data-testid="claim-available" className="w-4 h-4 text-green-400 mr-2" />
                : <X data-testid="claim-unavailable" className="w-4 h-4 text-red-400 mr-2" />
            )}
            <button
              data-testid="claim-btn"
              onClick={claim}
              disabled={!status || status === "checking" || !status.available}
              className="shrink-0 inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
            >
              Claim <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {status && status !== "checking" && alias && (
            <p className={`mt-2 text-xs font-mono2 ${status.available ? "text-green-400" : "text-red-400"}`}>
              {status.reason}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
