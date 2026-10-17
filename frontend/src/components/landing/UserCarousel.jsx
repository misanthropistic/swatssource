import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Marquee from "react-fast-marquee";
import { BadgeCheck } from "lucide-react";
import { api, fileUrl } from "@/lib/api";

const FeaturedUserCard = ({ u }) => {
  const navigate = useNavigate();
  const avatarSrc = fileUrl(u.avatar);

  return (
    <div
      data-testid={`showcase-card-${u.username}`}
      onClick={() => navigate(`/${u.username}`)}
      className="relative px-6 py-3 cursor-pointer group flex items-center gap-3.5 border-r border-white/10 shrink-0 transition hover:bg-white/[0.02]"
    >
      {/* NO GLOW - NO BOX BACKGROUND */}
      <div className="relative w-11 h-11 rounded-full overflow-hidden shrink-0 border border-white/15">
        {avatarSrc ? (
          <img src={avatarSrc} alt={u.display_name} className="w-full h-full rounded-full object-cover" />
        ) : (
          <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center font-bold text-zinc-300 text-xs">
            {(u.display_name || u.username || "?")[0]?.toUpperCase()}
          </div>
        )}
      </div>

      <div className="min-w-0 text-left">
        <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-100 group-hover:text-brand-300 transition truncate">
          {u.display_name || u.username}
          {u.verified && <BadgeCheck className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
        </div>
        <div className="text-[11px] text-zinc-400 font-mono2 truncate mt-0.5">
          @{u.username}
        </div>
      </div>
    </div>
  );
};

const SkeletonCard = ({ i }) => (
  <div className="flex items-center gap-3.5 border-r border-white/10 px-6 py-3 shrink-0" aria-hidden="true">
    <div className="h-11 w-11 shrink-0 rounded-full bg-white/[0.06] animate-pulse" />
    <div className="space-y-2 text-left">
      <div className="h-2.5 rounded-full bg-white/[0.06] animate-pulse" style={{ width: 70 + (i % 3) * 22 }} />
      <div className="h-2 rounded-full bg-white/[0.04] animate-pulse" style={{ width: 48 + (i % 2) * 18 }} />
    </div>
  </div>
);

export const UserCarousel = () => {
  const [users, setUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get("/users/showcase")
      .then(({ data }) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Only real accounts are ever shown. This used to fall back to five invented,
  // "verified" profiles (koniwtfs, 5fovtraceboss, ...) whenever the showcase feed was
  // empty, so the landing page advertised people who did not exist and every card
  // linked to a 404.
  //
  // The section used to vanish in that case, which left a hole in the middle of the
  // landing page while the feed was still loading (looked half-empty). It now holds
  // its space with placeholder cards and, when the feed is genuinely empty, says so
  // instead of inventing people.
  if (loaded && !users.length) {
    return (
      <section data-testid="infinite-user-carousel" className="py-12 overflow-hidden border-t border-b border-white/10">
        <div className="text-center px-4">
          <h2 className="font-display text-2xl sm:text-4xl font-black text-zinc-100">have a look at our featured users:</h2>
          <p className="mt-3 text-xs sm:text-sm text-zinc-400">
            Nobody has been featured yet — claim your swats.bio handle and you could be first.
          </p>
        </div>
      </section>
    );
  }

  if (!loaded) {
    return (
      <section data-testid="infinite-user-carousel" className="py-12 overflow-hidden border-t border-b border-white/10">
        <div className="text-center mb-8 px-4">
          <h2 className="font-display text-2xl sm:text-4xl font-black text-zinc-100">have a look at our featured users:</h2>
          <p className="mt-2 text-xs sm:text-sm text-zinc-400">Discover creators and power users who built their page with swats.bio</p>
        </div>
        <div className="[mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <div className="flex">
            {[0, 1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} i={i} />)}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="infinite-user-carousel" className="py-12 overflow-hidden border-t border-b border-white/10">
      <div className="text-center mb-8 px-4">
        <h2 className="font-display text-2xl sm:text-4xl font-black text-zinc-100">
          have a look at our featured users:
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-zinc-400">Discover creators and power users who built their page with swats.bio</p>
      </div>

      {/* ONE SINGLE HORIZONTAL LINE - THIN GREY LINE BETWEEN EACH USER - NO GLOW

          The moving row is decorative. react-fast-marquee already draws its
          children twice to loop seamlessly, and this used to hand it the roster
          three times as well — six copies of every member, each of them a click
          target, so the tab order and the screen-reader output named people over
          and over. The marquee is handed the list once and marked decorative; the
          single accessible copy is the visually hidden list underneath it. */}
      <div
        aria-hidden="true"
        className="[mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]"
      >
        <Marquee speed={38} gradient={false} pauseOnHover>
          {users.map((u) => (
            <FeaturedUserCard key={u.id || u.username} u={u} />
          ))}
        </Marquee>
      </div>
      <ul className="sr-only" data-testid="showcase-user-list">
        {users.map((u) => (
          <li key={u.id || u.username}>
            <Link to={`/${u.username}`}>@{u.username}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
