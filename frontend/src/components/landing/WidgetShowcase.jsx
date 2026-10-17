import { motion } from "framer-motion";
import { Music2, Users, Hash, AudioLines, Play, ArrowUpRight } from "lucide-react";

const SPOTIFY_TRACK = "3P61wVXNlCuTa7zSnTN3Zv";
const SOUNDCLOUD = "https://soundcloud.com/bondages";
const TIKTOK = "https://www.tiktok.com/@koniwtfs";
const DISCORD_INVITE = "https://discord.com/invite/a9uwptuepD";
const DISCORD_USER = "1546745348020772915";

const tilt = (i) => ({
  initial: { opacity: 0, y: 40, rotateX: 24 },
  whileInView: { opacity: 1, y: 0, rotateX: 14 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
});

const Shell = ({ children, i, testid, accent }) => (
  <motion.div
    {...tilt(i)}
    data-testid={testid}
    whileHover={{ rotateX: 0, y: -6, scale: 1.02 }}
    style={{ transformStyle: "preserve-3d" }}
    className="group relative rounded-2xl border border-white/10 bg-[#0b0b0f] p-0.5 shadow-[0_40px_60px_-30px_rgba(0,0,0,0.9)] transition-colors hover:border-white/20"
  >
    <span aria-hidden className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" style={{ boxShadow: `0 0 50px -12px ${accent}` }} />
    <div className="relative overflow-hidden rounded-[14px]">{children}</div>
  </motion.div>
);

const LinkCard = ({ href, icon: Icon, tag, title, sub, accent, i, testid }) => (
  <Shell i={i} testid={testid} accent={accent}>
    <a href={href} target="_blank" rel="noreferrer" className="block p-5">
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${accent}22`, color: accent }}><Icon className="h-5 w-5" /></span>
        <ArrowUpRight className="h-4 w-4 text-zinc-500 transition group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
      <div className="mt-4 text-[10px] font-mono2 uppercase tracking-widest" style={{ color: accent }}>{tag}</div>
      <div className="mt-1 font-display text-lg font-black text-zinc-50">{title}</div>
      <div className="truncate text-xs text-zinc-500">{sub}</div>
      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition group-hover:brightness-110" style={{ background: accent }}>
        <Play className="h-3 w-3" /> Open
      </div>
    </a>
  </Shell>
);

export const WidgetShowcase = () => (
  <section data-testid="widget-showcase" className="relative overflow-hidden border-t border-white/10 py-20">
    <div className="mx-auto mb-14 max-w-xl text-center px-4">
      <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs font-mono2 text-brand-300"><AudioLines className="h-3.5 w-3.5" /> Live widgets</div>
      <h2 className="mt-4 font-display text-3xl font-black text-zinc-50 sm:text-4xl">A widget for everything you are</h2>
      <p className="mt-2 text-sm text-zinc-400">Drop real, live embeds onto your page — music, socials and your community, all in one link.</p>
    </div>

    <div className="mx-auto max-w-5xl px-4" style={{ perspective: "1400px" }}>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Shell i={0} testid="widget-spotify" accent="#1DB954">
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-mono2 uppercase tracking-widest text-[#1DB954]"><Music2 className="h-3.5 w-3.5" /> Spotify</div>
            <iframe title="Spotify song" loading="lazy" src={`https://open.spotify.com/embed/track/${SPOTIFY_TRACK}?utm_source=generator&theme=0`} width="100%" height="152" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" className="rounded-xl" />
          </div>
        </Shell>

        <Shell i={1} testid="widget-soundcloud" accent="#ff5500">
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-mono2 uppercase tracking-widest text-[#ff5500]"><AudioLines className="h-3.5 w-3.5" /> SoundCloud</div>
            <iframe title="SoundCloud" loading="lazy" width="100%" height="152" frameBorder="0" allow="autoplay" className="rounded-xl" src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(SOUNDCLOUD)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`} />
          </div>
        </Shell>

        <LinkCard i={2} testid="widget-tiktok" href={TIKTOK} icon={Music2} tag="TikTok" title="@koniwtfs" sub="tiktok.com/@koniwtfs" accent="#ff0050" />
        <LinkCard i={3} testid="widget-discord-user" href="https://discord.com" icon={Users} tag="Discord User" title="Discord presence" sub={`ID ${DISCORD_USER}`} accent="#5865F2" />
        <LinkCard i={4} testid="widget-discord-server" href={DISCORD_INVITE} icon={Hash} tag="Discord Server" title="Join the community" sub="discord.gg/a9uwptuepD" accent="#5865F2" />
      </div>
    </div>
  </section>
);

export default WidgetShowcase;
