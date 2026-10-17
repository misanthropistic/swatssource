import { PLATFORMS } from "@/constants/platforms";
import { Globe, Package, Link as LinkIcon } from "lucide-react";

const CUSTOM_EXTRA = [
  { id: "website", name: "Custom Website", Icon: Globe, color: "#60a5fa" },
  { id: "product", name: "Product Store", Icon: Package, color: "#34d399" },
];

const ALL_PLATFORMS = [...PLATFORMS, ...CUSTOM_EXTRA];
const row1 = ALL_PLATFORMS.slice(0, Math.ceil(ALL_PLATFORMS.length / 2));
const row2 = ALL_PLATFORMS.slice(Math.ceil(ALL_PLATFORMS.length / 2));

/* Decorative: the logo says which platform is supported and goes nowhere, so it
   must not wear a pointer cursor like a link that does something real. */
const PlatformIcon = ({ item }) => {
  const Icon = item.Icon || LinkIcon;
  return (
    <div
      data-testid={`platform-${item.id}`}
      className="group relative shrink-0 mx-6 flex flex-col items-center justify-center transition-transform duration-300 hover:scale-125"
      title={item.name}
    >
      {/* NO BACKGROUND PILL OR BOX - Pure Floating Icon */}
      <Icon
        className="w-8 h-8 sm:w-10 sm:h-10 transition-transform duration-300 group-hover:scale-110"
        style={{ color: item.color || "#FF7FBC" }}
      />
    </div>
  );
};

export const PlatformsShowcase = () => {
  return (
    <section data-testid="supported-platforms-section" className="py-20 max-w-7xl mx-auto overflow-hidden">
      {/* Centered Title */}
      <div className="text-center mb-12 px-4">
        <h2 className="font-display text-3xl sm:text-5xl font-black text-zinc-50 tracking-tight">
          all the links you can imagine
        </h2>
      </div>

      {/* 2 Lines of Infinite Scrolling Icons without background pills */}
      <div className="space-y-8 relative [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        {/* Line 1: Scroll Left (Pause on hover ONLY this line) */}
        <div className="overflow-hidden">
          <div className="animate-marquee-left hover:[animation-play-state:paused]">
            {row1.concat(row1).concat(row1).map((item, idx) => (
              <PlatformIcon key={`row1-${item.id}-${idx}`} item={item} />
            ))}
          </div>
        </div>

        {/* Line 2: Scroll Right (Pause on hover ONLY this line) */}
        <div className="overflow-hidden">
          <div className="animate-marquee-right hover:[animation-play-state:paused]">
            {row2.concat(row2).concat(row2).map((item, idx) => (
              <PlatformIcon key={`row2-${item.id}-${idx}`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
