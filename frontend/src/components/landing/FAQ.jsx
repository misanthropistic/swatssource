import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";

/* A plain accordion. This section used to be a two-column layout with a sticky
   intro, a help icon and a search box — but six questions do not need a search
   field, and the box only ever produced an empty "no questions found" state.
   The list is the whole section now, centred at a readable width. */

const FAQS = [
  { q: "What is swats.bio?", a: "swats.bio is the internet's premier bio-link engine — a fully customizable home for your digital identity, social media links, widgets, background music, and badges." },
  { q: "Is swats.bio free to use?", a: "Yes. Core profile customization, free fonts, text effects, link cards, and basic layouts are free forever. Premium unlocks 100+ fonts, custom MP4 backgrounds, custom code widgets, custom badge creation, and priority support." },
  { q: "How do Discord frames & server widgets work?", a: `We provide every Discord avatar decoration preset, animated over your avatar with your own curated catalogue, plus live Discord server cards displaying online member counts and join invites directly on your profile.` },
  { q: "Can I change my username or alias?", a: "Yes. You can claim any available username at swats.bio/username. Username changes are protected with a 48-hour cooldown limit to prevent alias hoarding." },
  { q: "How do community templates work?", a: "You can browse templates published by other swats.bio creators or snapshot your own profile design to share in the Community Templates marketplace!" },
  { q: "What badges can I earn or create?", a: "Badges like OG, Booster, and Premium are automatically granted through Discord and account tier. Premium users can also craft custom badges with custom colors, icons, and glows." },
];

const FAQItem = ({ item, open, onToggle, index }) => (
  <div
    data-testid={`faq-item-${index}`}
    className={`rounded-2xl border transition duration-300 overflow-hidden ${
      open ? "bg-brand-500/10 border-brand-500/40 shadow-[0_0_30px_rgba(255,127,188,0.15)]" : "glass border-white/10 hover:border-white/20"
    }`}
  >
    <button onClick={onToggle} className="w-full flex items-center justify-between gap-4 p-5 text-left">
      <span className="text-sm font-bold text-zinc-100">{item.q}</span>
      <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.25 }} className="shrink-0 text-brand-400">
        <Plus className="w-5 h-5" />
      </motion.span>
    </button>
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <p className="px-5 pb-5 text-xs sm:text-sm text-zinc-400 leading-relaxed">
            {item.a}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

export const FAQ = () => {
  const [open, setOpen] = useState(0);

  return (
    <section data-testid="faq-accordion-section" className="px-4 py-20 max-w-3xl mx-auto">
      <div className="text-center">
        <h2 className="font-display text-2xl sm:text-4xl font-black text-zinc-50 leading-tight">
          Questions &amp; Answers
        </h2>
        <p className="mt-3 text-xs sm:text-sm text-zinc-400 leading-relaxed">
          Everything you need to know about swats.bio features, templates, badges and customization.
        </p>
      </div>

      <div className="mt-10 space-y-3.5">
        {FAQS.map((item, i) => (
          <FAQItem
            key={item.q}
            item={item}
            index={i}
            open={open === i}
            onToggle={() => setOpen(open === i ? -1 : i)}
          />
        ))}
      </div>
    </section>
  );
};

export default FAQ;
