import { useState } from "react";
import { Crown, Check } from "lucide-react";
import { Modal } from "@/components/ui-shared/Modal";
import PremiumPlansModal from "@/components/PremiumPlansModal";
import { PREMIUM_PERKS } from "@/constants/plans";

/* Every premium gate used to navigate straight to /!/pricing. That threw the
   visitor out of the page they were working on — on Badges it read as the button
   doing nothing at all — and it never said which feature was locked or what
   Premium adds. This dialog keeps them where they are, blurs the page behind it,
   and puts the one button they actually want next to the one they were denied.

   The button opens the dashboard's own plans popup rather than the public
   pricing page: the person reading this is signed in, mid-edit, and the marketing
   page's call to action is "Get started", which they already did.
 */
const PERKS = PREMIUM_PERKS.slice(1, 7);

export function PremiumGate({ open = false, onClose, feature, testid = "premium-gate" }) {
  const [plansOpen, setPlansOpen] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      testid={testid}
      icon={Crown}
      title={feature ? `${feature} is a Premium feature` : "This is a Premium feature"}
      description="Everything on your page stays exactly as it is. Premium unlocks the parts of the editor that are locked today."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            data-testid={`${testid}-dismiss`}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => setPlansOpen(true)}
            data-testid={`${testid}-see-plans`}
            className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:brightness-110"
          >
            See what Premium unlocks
          </button>
        </>
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {PERKS.map((perk) => (
          <li key={perk} className="flex items-start gap-2 text-xs leading-relaxed text-zinc-300">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-300" />
            {perk}
          </li>
        ))}
      </ul>

      {/* The plans, from inside the editor rather than on another page. */}
      <PremiumPlansModal
        open={plansOpen}
        onClose={() => {
          setPlansOpen(false);
          onClose?.();
        }}
        highlight={feature || null}
      />
    </Modal>
  );
}

export default PremiumGate;
