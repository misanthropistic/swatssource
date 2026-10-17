import { Navbar } from "@/components/landing/Navbar";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import { Hero } from "@/components/landing/Hero";
import { StatsCounters } from "@/components/landing/StatsCounters";
import { FeaturesCustomizer } from "@/components/landing/FeaturesCustomizer";
import { WidgetShowcase } from "@/components/landing/WidgetShowcase";
import { PlatformsShowcase } from "@/components/landing/PlatformsShowcase";
import { FAQ } from "@/components/landing/FAQ";
import { Footer } from "@/components/landing/Footer";

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#050506] text-zinc-100 grain relative" data-testid="landing-page">
      {/* Page glow: black, with a kiss of pink at the top and nothing below it.
          The page used to carry a second, page-long vertical wash that tinted
          every section down to the footer; it is gone, and this layer is capped
          at a fixed height so the brand colour can only ever touch the top of
          the page — below it the background is plain dark. */}
      <div
        aria-hidden="true"
        data-testid="page-glow"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[46rem]"
        style={{
          background:
            "radial-gradient(120% 100% at 50% -18%, rgba(164, 141, 244,0.40) 0%, rgba(164, 141, 244,0.17) 32%, rgba(164, 141, 244,0.05) 60%, rgba(164, 141, 244,0) 100%)",
        }}
      />
      <Navbar />
      <main className="relative z-10">
        {/* Site-wide announcements, under the floating navbar and above the hero
            so they are read before the marketing copy. The negative bottom margin
            cancels part of the hero's own top padding, which was tuned for a page
            with nothing above it — otherwise a single banner would leave a
            double-height gap. */}
        <AnnouncementBanner className="mx-auto -mb-16 max-w-4xl space-y-2 px-3 pt-20 sm:-mb-20 sm:pt-24" />
        <Hero />
        <StatsCounters />
        <FeaturesCustomizer />
        <WidgetShowcase />
        <PlatformsShowcase />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
