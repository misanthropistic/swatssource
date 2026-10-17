import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Check, Crown, ExternalLink, Heart, Loader2, Sparkles, Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";

import { FREE_PERKS as FREE, PREMIUM_PERKS as PREMIUM, PREMIUM_PRICE } from "@/constants/plans";

/* The Premium page.
 *
 * Two honest states, not a checkbox disguised as a button:
 *   • signed-out or free — "Go Premium" opens Stripe Checkout and returns here
 *     with a real confirmation;
 *   • already Premium — no plan grid to buy twice; a "manage billing" escape
 *     (Stripe portal) and the countdown of nothing to prove.
 *
 * ?upgrade=success and ?upgrade=cancelled are what Checkout redirects back to,
 * so the page greets or explains on arrival. The donations page is linked as
 * the one-time cousin of the subscription. No language switcher: the site is
 * English, and a switcher that only toasts is a lie with a border.
 */
const isStaffLike = (u) => u && (u.tier === "admin" || u.role === "admin" || u.is_owner === true);

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  const alreadyPremium = !!user && user !== false && (user.tier === "premium" || isStaffLike(user));

  useEffect(() => {
    if (params.get("upgrade") === "success") {
      toast.success("You are Premium — everything is unlocked. Thank you.");
    } else if (params.get("upgrade") === "cancelled") {
      toast.info("Checkout closed — you were not charged.");
    }
    // Runs once on arrival (add the params to the deps intentionally never — the greeting is for the arrival navigation only).
  }, []);

  const upgrade = async () => {
    if (!user || user === false) { navigate("/!/login"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/billing/checkout", { plan: "premium" });
      if (data?.url) { window.location.href = data.url; return; }
      toast.info("Billing isn't connected yet.");
    } catch (err) {
      toast.info(err.response?.data?.detail || "Checkout will be available once Stripe is connected on your backend.");
    }
    setBusy(false);
  };

  const portal = async () => {
    setPortalBusy(true);
    try {
      const { data } = await api.get("/billing/portal");
      if (data?.url) { window.location.href = data.url; return; }
      toast.info("The billing portal isn't connected yet.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "No billing subscription found");
    }
    setPortalBusy(false);
  };

  return (
    <div className="min-h-screen sw-page-bg text-zinc-100 grain" data-testid="pricing-page">
      <Navbar />
      <main className="relative z-10 max-w-5xl mx-auto px-4 pt-36 pb-20">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs font-mono2 text-brand-300 mb-5"><Sparkles className="w-3.5 h-3.5" /> SIMPLE PRICING</div>
          <h1 className="font-display text-4xl sm:text-5xl font-black text-zinc-50">
            {alreadyPremium ? "You are Premium." : "Start free. Go premium."}
          </h1>
          <p className="mt-3 text-sm text-zinc-500">
            {alreadyPremium
              ? "Everything is unlocked on this account — no plans to buy, nothing to prove."
              : "No hidden fees. One price. Upgrade whenever you're ready to unlock everything."}
          </p>
        </div>

        <div className={`grid md:grid-cols-2 gap-6 ${alreadyPremium ? "max-w-xl mx-auto" : "max-w-3xl mx-auto"}`}>
          <div data-testid="plan-free" className="glass rounded-3xl p-8">
            <div className="text-sm font-mono2 uppercase tracking-wider text-zinc-500">Free</div>
            <div className="mt-3 font-display text-4xl font-black text-zinc-50">$0<span className="text-base font-normal text-zinc-500">/forever</span></div>
            <Link to="/!/login" data-testid="free-cta" className="mt-6 block text-center py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-semibold transition">Get started</Link>
            <ul className="mt-7 space-y-3">
              {FREE.map((f) => <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-400"><Check className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />{f}</li>)}
            </ul>
          </div>

          <div data-testid="plan-premium" className="relative rounded-3xl p-8 bg-gradient-to-b from-brand-600/15 to-transparent border border-brand-500/30 shadow-[0_0_60px_rgba(240,92,165,0.2)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 text-white text-[10px] font-bold uppercase tracking-wider">Most Popular</div>
            <div className="flex items-center gap-2 text-sm font-mono2 uppercase tracking-wider text-brand-300"><Crown className="w-4 h-4" /> Premium</div>
            <div className="mt-3 font-display text-4xl font-black text-zinc-50">{PREMIUM_PRICE.label}<span className="text-base font-normal text-zinc-500">/{PREMIUM_PRICE.cadence.replace("per ", "")}</span></div>

            {alreadyPremium ? (
              <>
                <div className="mt-6 flex w-full items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/10 text-emerald-300 text-sm font-semibold" data-testid="premium-active">
                  <Zap className="w-4 h-4" /> Active on this account
                </div>
                <button
                  onClick={portal}
                  disabled={portalBusy}
                  data-testid="premium-portal"
                  className="mt-3 w-full text-center py-3 rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 text-sm font-semibold transition hover:bg-white/[0.07] disabled:opacity-50"
                >
                  {portalBusy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : "Manage billing"}
                </button>
              </>
            ) : (
              <button onClick={upgrade} disabled={busy} data-testid="premium-cta" className="mt-6 w-full text-center py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold hover:brightness-110 transition shadow-[0_0_24px_rgba(255,127,188,0.4)] disabled:opacity-50">
                {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : "Go Premium"}
              </button>
            )}
            <ul className="mt-7 space-y-3">
              {PREMIUM.map((f, i) => <li key={f} className={`flex items-start gap-2.5 text-sm ${i === 0 ? "text-zinc-200 font-semibold" : "text-zinc-300"}`}><Check className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />{f}</li>)}
            </ul>
          </div>
        </div>

        {/* The one-time cousin of the subscription: a donation, for people who
            want to help without paying monthly. */}
        <div className="glass mt-10 flex flex-col items-center gap-4 rounded-3xl p-7 text-center sm:flex-row sm:justify-between sm:text-left" data-testid="donation-cta">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/20">
              <Heart className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Prefer a one-time thank-you?</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Donations keep the lights on too — card or crypto, no subscription.</p>
            </div>
          </div>
          <Link
            to="/!/donate"
            data-testid="pricing-donate"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.07]"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open donations
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
