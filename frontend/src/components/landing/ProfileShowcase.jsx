import { useMemo } from "react";
import { ProfilePreview } from "@/components/ProfilePreview";
import { useTopProfiles } from "@/lib/landingProfiles";
import { profileUrl } from "@/lib/api";
import { ExternalLink, Sparkles, Trophy } from "lucide-react";

/* ---------------------------------------------------------------------------
   Profile showcase — the real card, framed like a photograph.

   This replaced three static screenshots of hand-picked profiles. Those were one
   frozen moment each and aged the moment somebody changed their page; this draws
   the actual <ProfilePreview> — the same component a public profile uses — for
   the three most-viewed people on the leaderboard.

   Each card sits in a fixed, photo-proportioned frame: portrait, and the live
   page inside it is drawn at its own scale from the top down, cropped rather
   than shrunk, with a soft fade at the cut so the crop reads as a frame and not
   as a broken card. Nothing is measured at runtime, so a card landing, a widget
   ticking or an image arriving has nothing to resize.

   The frames are as LARGE as the row allows: the three of them plus their gaps
   have to fit the section's own width in ONE row, so a card that stretched to
   the window (the old `w-full` below `lg`, stacked in a column) turned this into
   a full-screen run of tall images on any window narrower than a laptop — a wall
   of scrolling for what is a caption to the section. Each breakpoint therefore
   carries the widest frame that still lets three fit side by side, and on a
   desktop that is a 376px-wide window into each page rather than a thumbnail;
   only the page's own marquees run edge to edge.

   The three sit side by side with a gap between them: rank 1 upright in the
   middle, ranks 2 and 3 leaning gently the opposite way to each other, so the
   row reads as three pages rather than as a small deck. They overlap NOTHING now
   — a lapped fan hid the inside edges of the two outside pages, and at 7deg the
   lean was the loudest thing in the section. Hovering a card straightens it,
   lifts it above the others and grows the frame, so the card being looked at
   shows more of the page than the two beside it. The row reserves the grown size
   up front (`min-h`), so revealing one card never moves the section below it.

   The card *is* the link: an overlay anchor covers the frame, so a click
   anywhere opens the page, with no caption pill underneath. The overlay and the
   preview are siblings, never nested — the preview carries the owner's own
   links, and an <a> may not contain another <a>.

   The profile data is the same `/u/:username` payload the public page gets, so
   nothing here is mocked up. Only the page *dressing* is switched off (background
   image/video, background and overlay effects, cursor effect, entry gate) so
   three live cards side by side stay light and the card itself is the subject.
   --------------------------------------------------------------------------- */

/* The frames, as Tailwind literals (Tailwind only sees class names that appear in
   the source, so these cannot be built from a number). Widths and heights are on
   the same ~5:7 portrait ratio all the way up:

     width      96 → 186 → 232 → 312 → 376 px
     height    134 → 260 → 324 → 436 → 526 px
     revealed  152 → 292 → 364 → 490 → 590 px
     gap         8 →  12 →  14 →  18 →  20 px

   The first figure is what every window gets; the rest are the `sm` (640), `md`
   (768), `lg` (1024) and `xl` (1280) steps. The last is the one that matters: the
   section caps at 1248px of usable width, so three 376px frames plus 20px gaps
   fill it (1168px) instead of leaving two thirds of the band empty. Every step
   down is the widest frame that still lets three fit one row — 3 × 232 + 2 × 14
   is what `md` fits, and so on. */
const FRAME_W = "w-[96px] sm:w-[186px] md:w-[232px] lg:w-[312px] xl:w-[376px]";
const FRAME_H =
  "h-[134px] group-hover:h-[152px] sm:h-[260px] sm:group-hover:h-[292px] md:h-[324px] md:group-hover:h-[364px] lg:h-[436px] lg:group-hover:h-[490px] xl:h-[526px] xl:group-hover:h-[590px]";
const ROW_MIN_H =
  "min-h-[152px] sm:min-h-[292px] md:min-h-[364px] lg:min-h-[490px] xl:min-h-[590px]";
const ROW_GAP =
  "gap-[8px] sm:gap-[12px] md:gap-[14px] lg:gap-[18px] xl:gap-[20px]";

/* Which profile draws in which seat. Rank 1 belongs in the middle, so the row is
 * ordered left-to-right as 2, 1, 3 rather than by rank. */
const ORDER = [1, 0, 2];

const SEATS = [
  // Left of the middle: leaning back a little. The tilt is on at EVERY width, not
  // just desktop — the slight lean is the shape.
  { tilt: "-rotate-[3deg]", z: "z-20" },
  // The middle: straight, in front.
  { tilt: "", z: "z-30" },
  // Right of the middle: leaning the other way.
  { tilt: "rotate-[3deg]", z: "z-10" },
];

// Page dressing a showcase must not carry: three profiles' worth of rain
// canvases, background videos and entry gates is weight for no argument.
const DRESSING = /^(bg_|background|overlay_|overlay$|cursor_effect|audio_url|entry_|video_)/;

/* The public payload with the page dressing removed. Everything a visitor
 * recognises — picture, name, badges, bio, links, widgets, player — is kept. */
export function quietProfile(data) {
  if (!data) return null;
  const profile = Object.fromEntries(
    Object.entries(data.profile || {}).filter(([key]) => !DRESSING.test(key))
  );
  return { ...data, profile };
}

/* One framed card. The preview inside is inert and untouchable so a click
 * anywhere on the frame reaches the overlay link instead of a widget's own
 * button; the overlay is what makes the whole frame the link. */
const ShowcaseCard = ({ profile, index }) => {
  const name = profile.display_name || profile.username;
  const seat = SEATS[index] || SEATS[1];

  return (
    <article
      data-testid={`showcase-seat-${index}`}
      // The width is a fixed size at every breakpoint (never `w-full`, never
      // `flex-1`) because SEATS derives its overlaps from it: a card that stretched
      // would not line up with its neighbour, and three of them could not sit in
      // one row.
      className={`group relative shrink-0 ${FRAME_W} ${seat.tilt} ${seat.z} hover:z-40 hover:rotate-0 hover:scale-[1.03] transition-transform duration-300`}
    >
      {/* The frame: fixed, photo-proportioned, and cropped rather than scaled. */}
      <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] shadow-[0_18px_44px_-24px_rgba(0,0,0,0.95)] transition-all duration-300 group-hover:border-brand-400/40 group-hover:shadow-[0_22px_52px_-26px_rgba(0,0,0,1)] ${FRAME_H}`}>
        <div aria-hidden="true" inert className="pointer-events-none absolute inset-x-0 top-0">
          <ProfilePreview data={profile} embedded />
        </div>

        {/* The cut. Without it a cropped card looks like a broken one; with it the
            frame reads as a photograph of the top of the page. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t from-[#0b0b0f] via-[#0b0b0f]/70 to-transparent"
        />

        {/* The whole frame, clickable. `absolute inset-0` keeps the preview and
            the anchor as siblings, so no link ends up inside another. */}
        <a
          href={profileUrl(profile.username)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${name}'s swats.bio page`}
          data-testid={`showcase-link-${index}`}
          className="absolute inset-0 z-20 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/70"
        >
          <span className="pointer-events-none absolute right-2 top-2 inline-flex translate-y-1 items-center gap-1 rounded-lg border border-brand-400/40 bg-black/75 px-1.5 py-0.5 font-mono2 text-[10px] text-brand-100 opacity-0 backdrop-blur-sm transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            Visit
            <ExternalLink className="h-3 w-3" />
          </span>
        </a>

        {/* Which rank this is. It is the one fact the card itself cannot show,
            and it sits in the corner rather than in a pill underneath. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-2 z-30 rounded-lg border border-white/10 bg-black/70 px-1.5 py-0.5 font-display text-[10px] font-black text-amber-300 backdrop-blur-sm"
        >
          #{profile.rank}
        </span>
      </div>
    </article>
  );
};

const CardSkeleton = ({ index }) => (
  <div
    data-testid={`showcase-seat-${index}`}
    className={`shrink-0 ${FRAME_W} ${SEATS[index]?.tilt}`}
  >
    {/* The same frame the real card gets, at its un-hovered height. */}
    <div
      className="h-[134px] w-full animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] sm:h-[260px] md:h-[324px] lg:h-[436px] xl:h-[526px]"
      aria-hidden="true"
    />
  </div>
);

export const ProfileShowcase = () => {
  const { loading, profiles: raw } = useTopProfiles(3);
  const profiles = useMemo(() => raw.slice(0, 3).map(quietProfile), [raw]);

  return (
    <div data-testid="profile-showcase" className="border-y border-white/10 py-10 sm:py-14">
      <div className="mb-8 max-w-xl">
        <h3 className="font-display text-xl font-bold text-zinc-100 sm:text-2xl">
          Real pages, straight from the leaderboard
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
          The three most-viewed pages on swats.bio, drawn by the same component
          their owners see in the editor. Hover a card to see more of it; click it
          to open the page.
        </p>
      </div>

      {loading ? (
        // One row, at every width: `flex-nowrap` and no stacking, so the section
        // is always about a card tall rather than three of them.
        <div className={`flex flex-row flex-nowrap items-center justify-center ${ROW_GAP} overflow-hidden sm:overflow-visible ${ROW_MIN_H}`}>
          {[0, 1, 2].map((i) => (
            <CardSkeleton key={i} index={i} />
          ))}
        </div>
      ) : profiles.length ? (
        <div
          data-testid="showcase-fan"
          className={`flex flex-row flex-nowrap items-center justify-center ${ROW_GAP} overflow-hidden sm:overflow-visible ${ROW_MIN_H}`}
        >
          {ORDER.map((profileIndex, seat) =>
            profiles[profileIndex] ? (
              <ShowcaseCard
                key={profiles[profileIndex].username}
                profile={profiles[profileIndex]}
                index={seat}
              />
            ) : (
              <span key={`empty-${seat}`} className={`shrink-0 ${FRAME_W}`} />
            )
          )}
        </div>
      ) : (
        <div
          data-testid="showcase-empty"
          className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center"
        >
          <Trophy className="h-6 w-6 text-zinc-600" />
          <div className="text-sm font-semibold text-zinc-300">The leaderboard is still empty</div>
          <p className="text-xs leading-relaxed text-zinc-500">
            Claim a handle, build a page and you could be the first card shown here.
          </p>
          <a
            href="/!/login"
            className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110"
          >
            <Sparkles className="h-3.5 w-3.5" /> Claim your page
          </a>
        </div>
      )}
    </div>
  );
};
