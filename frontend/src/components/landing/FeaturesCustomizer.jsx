import { ExternalLink, Hash, Users } from "lucide-react";
import { FaDiscord } from "react-icons/fa6";
import { formatCount, useWidgetData } from "@/lib/widgets";

/* The two servers the site actually runs.
 *
 * `serverId` is only set for the server we can pair with its own widget, and
 * every field below the name is printed only when Discord reports it: a card
 * never shows an invented member count, it says "Members online" instead of a
 * number.
 *
 * There used to be a block under the cards repeating each server's invite, its
 * description and a roster of the people who run it. It is gone: the cards
 * already carry the name, the numbers and a Join button that goes to the right
 * invite, so the block was a second, hand-typed copy of the same facts — and a
 * hand-typed invite is exactly the kind of thing that goes stale. Invites are
 * read from Discord (falling back to the value here) and nothing names a person
 * any more.
 */
export const DISCORD_SERVERS = [
  {
    key: "community",
    invite: "https://discord.gg/a9uwptuepD",
    serverId: "1557276191050698782",
    fallbackName: "^swats.bio^",
    blurb: "The official swats.bio community — support, updates and showcase.",
  },
  {
    key: "acheron",
    invite: "https://discord.gg/achern",
    serverId: null,
    fallbackName: "Acheron",
    blurb: "Acheron — /achern — is a multi-game Roblox script, and this is its home.",
  },
];

/* One Discord server card, drawn from the same live proxy the profile widgets
   use — so it carries the server's real icon, banner, description, member
   counts, online avatars and channels straight from Discord. */
const DiscordServerCard = ({ server, testid }) => {
  const { status, data } = useWidgetData(
    {
      type: "discord",
      subtype: "server",
      invite_url: server.invite,
      server_id: server.serverId || undefined,
    },
    { auto: true, refreshSec: 60 }
  );

  const name = data?.name || server.fallbackName;
  const online = data?.online ?? null;
  const total = data?.total_members ?? null;
  const icon = data?.icon || null;
  const banner = data?.banner || null;
  const joinHref = data?.invite_url || server.invite;
  const channels = (data?.channels || []).slice(0, 4);
  // Only real avatars: a member entry without one is left out rather than
  // rendered as an empty circle.
  const members = (data?.online_members || []).filter((m) => m?.avatar).slice(0, 8);
  const extra = online != null && members.length ? Math.max(0, online - members.length) : 0;

  return (
    <article
      data-testid={testid}
      className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-colors duration-200 hover:border-brand-400/30"
    >
      {/* Banner: the server's own, or its own icon blown up and blurred when the
          server has no banner art (most don't). */}
      <div className="relative h-14 w-full overflow-hidden sm:h-20">
        {banner ? (
          <img src={banner} alt="" className="h-full w-full object-cover" data-testid={`${testid}-banner`} />
        ) : icon ? (
          <img
            src={icon}
            alt=""
            aria-hidden="true"
            data-testid={`${testid}-banner`}
            className="h-full w-full scale-150 object-cover opacity-70 blur-xl"
          />
        ) : (
          <div className="h-full w-full" style={{ background: "linear-gradient(120deg, #5865F2, #F05CA5)" }} />
        )}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(9,9,12,0.94), rgba(9,9,12,0.12))" }}
        />
      </div>

      {/* z-10 so the icon that straddles the banner's edge always paints above
          the banner's own overlay instead of being shaded by it. */}
      <div className="relative z-10 flex flex-1 flex-col px-3 pb-3 sm:px-4 sm:pb-4">
        {/* The icon straddles the bottom edge of the banner; the text starts
            below it, so a bright banner never washes the name out. */}
        <div className="-mt-5 flex items-start gap-2.5 sm:-mt-7 sm:gap-3">
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-[#0b0b0f] shadow-lg sm:h-14 sm:w-14 sm:rounded-2xl">
            {icon ? (
              <img src={icon} alt={name} className="h-full w-full object-cover" data-testid={`${testid}-icon`} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#5865F2]/15 text-[#8ea1ff]">
                <FaDiscord className={`h-6 w-6 ${status === "loading" ? "animate-pulse" : ""}`} />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-6 sm:pt-8">
            <div className="truncate text-sm font-bold text-zinc-100 sm:text-base" data-testid={`${testid}-name`}>
              {name}
            </div>
            {/* Real numbers whenever Discord gives them. "Members online" is the
                honest fallback for a card whose data has not arrived yet. */}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono2 text-[10px] text-zinc-400">
              <span className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${online != null ? "bg-emerald-400" : "bg-zinc-600"}`} />
                {online != null ? `${formatCount(online)} online` : "Members online"}
              </span>
              {total != null && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-500">{formatCount(total)} members</span>
                </>
              )}
            </div>
          </div>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500 sm:mt-3 sm:text-[11px]">{data?.description || server.blurb}</p>

        {/* Who is actually online right now, from Discord's own widget. */}
        {members.length > 0 && (
          <div className="mt-3 flex items-center gap-2" data-testid={`${testid}-members`}>
            <div className="flex -space-x-2">
              {members.map((m, i) => (
                <img
                  key={`${m.username}-${i}`}
                  src={m.avatar}
                  alt={m.username}
                  title={`${m.username}${m.status ? ` · ${m.status}` : ""}`}
                  className="h-6 w-6 rounded-full border-2 border-[#0b0b0f] bg-zinc-800 object-cover"
                />
              ))}
            </div>
            {extra > 0 && (
              <span className="font-mono2 text-[10px] text-zinc-500">+{formatCount(extra)} more online</span>
            )}
          </div>
        )}

        {channels.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 sm:mt-3">
            {channels.map((channel) => (
              <span
                key={channel}
                className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono2 text-[10px] text-zinc-400"
              >
                <Hash className="h-3 w-3" />
                {channel}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto">
          <a
            href={joinHref}
            target="_blank"
            rel="noreferrer"
            data-testid={`${testid}-join`}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2 text-xs font-semibold text-[#08080a] outline-none transition-colors duration-200 hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-brand-500/60 sm:mt-4 sm:py-2.5 sm:text-sm"
          >
            <Users className="h-4 w-4" /> Join server
            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
          </a>
        </div>
      </div>
    </article>
  );
};

export const FeaturesCustomizer = () => (
  <section data-testid="features-customizer-section" className="px-4 py-12 max-w-7xl mx-auto space-y-10 sm:py-16 sm:space-y-16">
    {/* Header (NO PILLS) */}
    <div className="text-left max-w-2xl">
      <h2 className="font-display text-3xl sm:text-5xl font-black text-zinc-50 tracking-tight leading-tight">
        Customize <span className="text-brand-400">Without Limits</span>
      </h2>
      <p className="mt-3 text-sm sm:text-base text-zinc-400 leading-relaxed">
        Make your link-in-bio page yours. Intuitively customize the layout, colors, and content to match your style.
      </p>
    </div>

    {/* Two live Discord widgets, drawn with each server's own art. The pair is
        one aligned grid: same width, same height, tops level. The old version
        pushed the second card down and beside itself with `sm:mt-10 sm:ml-auto`,
        which is what made the two look unaligned. */}
    <div>
      <div>
        <h3 className="text-xl font-bold text-zinc-100">Discord Servers</h3>
        <p className="mt-2 text-xs text-zinc-400 leading-relaxed max-w-md">
          Drop a live Discord widget on your page, or hop into ours — with the real
          icon, member count and who is online, pulled from Discord itself.
        </p>
      </div>

      {/* Two cards, and a compact one on a phone: they used to be full-width, so
          each server took a screen of its own on mobile. `max-w-sm` caps the card
          on the widths where a single column would otherwise stretch it across
          the page. */}
      <div className="mx-auto mt-5 grid max-w-sm items-stretch gap-3 sm:mt-6 sm:max-w-none sm:grid-cols-2 sm:gap-5">
        {DISCORD_SERVERS.map((server) => (
          <DiscordServerCard key={server.key} server={server} testid={`discord-widget-${server.key}`} />
        ))}
      </div>
    </div>
  </section>
);
