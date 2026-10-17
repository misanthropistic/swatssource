import { useState } from "react";
import { Check, Crown, Loader2, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui-shared/Modal";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";
import { FREE_PERKS, PREMIUM_PERKS, PREMIUM_PRICE } from "@/constants/plans";

/* Premium, as a popup inside the dashboard.
 *
 * Clicking "Premium" in the dashboard used to leave the dashboard entirely and
 * land on the public marketing page — a page written for people who do not have
 * an account yet, with a "Get started" button pointing at sign-up. This is the
 * signed-in version: the same two tiers, the plan the visitor is already on
 * marked, and one button that goes straight to checkout. Nothing they were doing
 * is thrown away to read it.
 *
 * It is used two ways: from the sidebar, and as the upsell behind a locked
 * feature (`highlight` names that feature, so the copy answers "why am I here").
 */
export function PremiumPlansModal({ open = false, onClose, highlight = null }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const isPremium = !!user && user.tier !== "free";
  const perks = isPremium ? PREMIUM_PERKS : PREMIUM_PERKS;

  const upgrade = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/billing/checkout", { plan: "premium" });
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      toast.info("Billing isn't connected yet.", {
        description: "Checkout opens here as soon as Stripe is configured on the backend.",
      });
    } catch (err) {
      toast.info(err.response?.data?.detail || "Checkout will be available once Stripe is connected.", {
        description: "Nothing on your page changes in the meantime.",
      });
    }
    setBusy(false);
  };

  const manage = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/billing/portal");
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      toast.info("The billing portal is not connected yet.");
    } catch {
      toast.info("The billing portal is not connected yet.");
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      testid="premium-plans"
      icon={Crown}
      title={highlight ? `${highlight} is a Premium feature` : "Premium"}
      description={
        highlight
          ? `${highlight} needs Premium. Everything already on your page stays exactly as it is.`
          : "One tier, everything unlocked. Upgrade or manage the plan you already have."
      }
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            data-testid="premium-plans-dismiss"
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
          >
            Not now
          </button>
          {isPremium ? (
            <button
              type="button"
              onClick={manage}
              disabled={busy}
              data-testid="premium-plans-manage"
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-5 py-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.09] disabled:opacity-60"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Manage billing
            </button>
          ) : (
            <button
              type="button"
              onClick={upgrade}
              disabled={busy}
              data-testid="premium-plans-upgrade"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Go Premium · {PREMIUM_PRICE.label}/mo
            </button>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div data-testid="premium-plan-free" className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between">
            <span className="font-mono2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Free</span>
            {!isPremium && (
              <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 font-mono2 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                Your plan
              </span>
            )}
          </div>
          <div className="mt-2 font-display text-3xl font-black text-zinc-100">
            $0<span className="text-sm font-normal text-zinc-500">/forever</span>
          </div>
          <ul className="mt-4 space-y-2">
            {FREE_PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2 text-xs leading-relaxed text-zinc-400">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
                {perk}
              </li>
            ))}
          </ul>
        </div>

        <div
          data-testid="premium-plan-premium"
          className="relative overflow-hidden rounded-2xl border border-brand-500/30 bg-gradient-to-b from-brand-600/15 to-transparent p-5 shadow-[0_0_50px_-12px_rgba(240,92,165,0.45)]"
        >
          <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-brand-600/25 blur-[50px]" />
          <div className="relative flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono2 text-[10px] font-bold uppercase tracking-widest text-brand-300">
              <Sparkles className="h-3 w-3" /> Premium
            </span>
            {isPremium && (
              <span className="rounded-full border border-brand-400/30 bg-brand-500/15 px-2 py-0.5 font-mono2 text-[9px] font-bold uppercase tracking-wider text-brand-200">
                Your plan
              </span>
            )}
          </div>
          <div className="relative mt-2 font-display text-3xl font-black text-zinc-50">
            {PREMIUM_PRICE.label}<span className="text-sm font-normal text-zinc-400">/{PREMIUM_PRICE.cadence.replace("per ", "")}</span>
          </div>
          <ul className="relative mt-4 space-y-2">
            {perks.map((perk) => (
              <li key={perk} className="flex items-start gap-2 text-xs leading-relaxed text-zinc-200">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                {perk}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

export default PremiumPlansModal;
