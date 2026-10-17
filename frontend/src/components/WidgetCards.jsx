import { useEffect, useState, useRef, useMemo } from "react";
import { fileUrl } from "@/lib/api";
import {
  useWidgetData, useTicker, formatCount, formatDate, discordServerId,
} from "@/lib/widgets";
import { WIDGET_SURFACE_DEFAULTS } from "@/constants/widgets";
import { useTooltip, resolveTooltipStyle } from "@/components/FxTooltip";
import {
  AlertTriangle, ArrowRight, Building2, Calendar, Check, Clock, Code2,
  ExternalLink, Globe, Info, MapPin, Pause, Play, RefreshCw, Sparkles, Star,
  Users, Volume2,
} from "lucide-react";
import {
  FaDiscord, FaGithub, FaSoundcloud, FaSpotify, FaSteam, FaTiktok, FaYoutube,
} from "react-icons/fa6";
import { SiRoblox, SiValorant } from "react-icons/si";

// ---------------------------------------------------------------------------
// Authentic Platform Widgets
// Rebuilt directly from the swats.bio design language & screenshot references:
// Roblox Profile, GitHub Activity Heatmap, Spotify Player, Discord Presence & Invite
// ---------------------------------------------------------------------------

const BRAND_ICON = {
  roblox: SiRoblox,
  discord: FaDiscord,
  spotify: FaSpotify,
  youtube: FaYoutube,
  github: FaGithub,
  steam: FaSteam,
  tiktok: FaTiktok,
  soundcloud: FaSoundcloud,
  valorant: SiValorant,
  timezone: Clock,
  countdown: Calendar,
  "account-date": Calendar,
  custom: Code2,
};

const LIVE_TYPES = new Set(["discord", "roblox:game"]);

// Helper to format relative years ("Joined 9 years ago", "Joined 17 years ago")
function formatYearsAgo(dateValue) {
  if (!dateValue) return "Joined recently";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "Joined recently";
  const year = d.getFullYear();
  const years = Math.max(0, Math.floor((Date.now() - d.getTime()) / (365.25 * 86_400_000)));
  if (years <= 0) return `Joined ${year}`;
  return `Joined ${years} year${years === 1 ? "" : "s"} ago (${year})`;
}

// Card surface & glow calculation
const numOr = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clampPct = (v, fallback) => Math.max(0, Math.min(100, numOr(v, fallback)));

const cardSurface = (w, accent, globalGlow = false) => {
  const color = w.color || accent;
  const glow = (w.glow_on ?? globalGlow) ? (w.glow || `${color}66`) : "";
  const amount = numOr(w.glow_amount, WIDGET_SURFACE_DEFAULTS.glowAmount);
  return {
    boxShadow: glow ? `0 0 ${amount}px ${glow}` : "0 8px 24px rgba(0,0,0,0.4)",
  };
};

// Shared outline/fill/border/radius maths so the card and the pill can never
// drift apart. Every value is saved on the widget, with sane defaults.
const widgetRadius = (v) => {
  const r = numOr(v, WIDGET_SURFACE_DEFAULTS.radius);
  return r >= 999 ? "9999px" : `${r}px`;
};
const widgetBorder = (w, outlineAlpha) => {
  const width = Math.max(0, Math.round(numOr(w.card_border_width, WIDGET_SURFACE_DEFAULTS.borderWidth)));
  return {
    borderWidth: `${width}px`,
    borderStyle: width > 0 ? "solid" : "none",
    borderColor: `rgba(255,255,255,${clampPct(outlineAlpha, WIDGET_SURFACE_DEFAULTS.outlineAlpha) / 100})`,
  };
};

function WidgetShell({
  w,
  accent,
  headerTitle,
  HeaderIcon,
  children,
  className = "",
  innerClassName = "",
  innerStyle,
  raw = false,
}) {
  const full = Number(w.span ?? 2) === 2;
  // Density is the owner's call. A tall profile of six cards was reading as six
  // oversized boxes because every card carried the same generous padding; this
  // dials that padding (and the corner it sits in) down without changing what
  // the card says.
  const tight = w?.compact === true;
  const pad = tight ? "p-2.5 sm:p-3" : "p-3.5 sm:p-4";
  const Icon = HeaderIcon || BRAND_ICON[w?.type] || Globe;
  const title = headerTitle || w?.title || `${(w?.type || "Widget").toUpperCase()} PREVIEW`;
  const bgEnabled = w?.background !== false && w?.bg_enabled !== false && w?.show_bg !== false && !w?.transparent && w?.card_style !== "transparent";
  const fillAlpha = clampPct(w?.card_fill_alpha, WIDGET_SURFACE_DEFAULTS.fillAlpha);
  const tint = w?.color || accent;
  // The header the shell was already computing and then throwing away: the icon
  // and title were resolved on every render and never reached the page, so every
  // card opened on bare content with no way to tell a Steam card from a Spotify
  // one at a glance. It is a title bar now — a tinted icon tile and the name —
  // and it sits above a hairline so the card reads as one card, not a floating
  // block of text.
  const showHeader = !raw;
  // Optional owner-authored tooltip. Attached to the card itself (a hook, not a
  // wrapper) so the full-width col-span and grid placement stay untouched.
  const { tipProps, tipNode } = useTooltip(w?.tooltip);

  const surface = {
    ...widgetBorder(w, w?.card_outline_alpha),
    borderRadius: widgetRadius(w?.card_radius),
    ...(bgEnabled
      ? {
          background: `rgba(12,13,18,${fillAlpha / 100})`,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }
      : { background: "transparent" }),
    ...cardSurface(w, accent),
  };

  return (
    <div
      data-widget={w?.type || "widget"}
      {...tipProps}
      className={`${full ? "col-span-2" : ""} flex flex-col text-left transition duration-300 ${className}`}
    >


      {/* Inner Preview Card */}
      {raw ? (
        children
      ) : (
        <div
          // `widget-card-sheen` is a whisper of light across the top of the card:
          // at the old flat fill six cards in a grid read as six identical grey
          // slabs. It lives in index.css rather than inline because a
          // `linear-gradient` in a style attribute is dropped by some renderers.
          className={`${pad} text-left relative overflow-hidden transition duration-300 ${bgEnabled ? "widget-card-sheen" : ""} ${innerClassName}`}
          style={{ ...surface, ...innerStyle }}
        >
          {showHeader && (
            <div className={`flex items-center gap-2 ${tight ? "mb-2" : "mb-2.5"}`} data-testid="widget-header">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${tint}1f`, border: `1px solid ${tint}33` }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: tint }} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                {title}
              </span>
            </div>
          )}
          <div className={showHeader ? (tight ? "pt-2" : "pt-2.5") : ""} style={showHeader ? { borderTop: "1px solid rgba(255,255,255,0.06)" } : undefined}>
            {children}
          </div>
        </div>
      )}
      {tipNode}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse" data-testid="widget-skeleton">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.06]" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 rounded bg-white/[0.08] w-2/3" />
          <div className="h-2.5 rounded bg-white/[0.05] w-1/3" />
        </div>
      </div>
      <div className="h-10 rounded-xl bg-white/[0.04]" />
    </div>
  );
}

function WidgetError({ w, accent, Icon, message, onRetry }) {
  return (
    <div className="space-y-2.5" data-testid="widget-error">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.05] border border-white/10 shrink-0">
          <Icon className="w-4 h-4 text-zinc-400" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-bold text-zinc-200 truncate">{w.title || "—"}</div>
          <div className="text-[10px] text-zinc-500 truncate">Live data unavailable</div>
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-xl bg-black/50 border border-white/5 p-2.5">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400/90 shrink-0 mt-0.5" />
        <div className="text-[10px] leading-relaxed text-zinc-400">{message}</div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="w-full py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[10px] font-semibold text-zinc-300 transition flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Roblox Profile Preview (Directly matches Image 1)
// ---------------------------------------------------------------------------

function RobloxProfile({ w, accent, data, status, error, refresh }) {
  const username = w.username || w.value || "";
  if (status === "loading") return <Skeleton />;
  if (status !== "success" || !data) {
    return (
      <WidgetError
        w={w}
        accent={accent}
        Icon={SiRoblox}
        message={error || "Add your Roblox username to light this card up."}
        onRetry={username ? refresh : null}
      />
    );
  }

  const friendsCount = data.friends != null ? formatCount(data.friends) : "—";
  const followersCount = data.followers != null ? formatCount(data.followers) : "—";
  const joinedText = formatYearsAgo(data.created);
  const isOnline = data.is_online || false;

  return (
    <>
      <div className="flex items-center gap-3.5 mb-3">
        {/* Avatar with Status Dot */}
        <div className="relative shrink-0">
          <div className="w-[58px] h-[58px] rounded-2xl overflow-hidden bg-zinc-900 border border-white/10">
            {data.avatar ? (
              <img src={data.avatar} alt={data.username} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600">
                <SiRoblox className="w-6 h-6" />
              </div>
            )}
          </div>
          {/* Presence Indicator Dot */}
          <span
            className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#0c0d12] ${
              isOnline ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-zinc-400"
            }`}
          />
        </div>

        {/* Name, Handle, Counts */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold text-white tracking-wide truncate">
              {data.display_name || data.username}
            </span>
            {data.verified && <Check className="w-3.5 h-3.5 text-brand-300 shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium truncate mt-0.5">
            <SiRoblox className="w-3 h-3 text-zinc-400 shrink-0" />
            <span>@{data.username}</span>
          </div>
          <div className="text-xs text-zinc-300 font-normal mt-1 truncate">
            <span>{friendsCount} Friends</span>
            <span className="mx-1.5 text-zinc-500">•</span>
            <span>{followersCount} Followers</span>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-1.5 text-xs">
        <div className="text-[11px] font-semibold text-zinc-400">About</div>
        <div className="flex items-start gap-2 text-zinc-300 leading-snug">
          <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
          <span className="line-clamp-2">
            {data.about || w.about || "No description provided."}
          </span>
        </div>
        <div className="flex items-center gap-2 text-zinc-400 font-normal">
          <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>{joinedText}</span>
        </div>
      </div>
    </>
  );
}

function RobloxGroup({ w, accent, data, status, error, refresh }) {
  if (status === "loading") return <Skeleton />;
  if (status !== "success" || !data) {
    return (
      <WidgetError
        w={w}
        accent={accent}
        Icon={SiRoblox}
        message={error || "Add a Roblox group link or ID."}
        onRetry={refresh}
      />
    );
  }

  return (
    <>
      <div className="flex items-center gap-3.5 mb-2.5">
        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 shrink-0">
          {data.icon ? (
            <img src={data.icon} alt={data.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <Users className="w-6 h-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">{data.name}</div>
          <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5">
            <Users className="w-3 h-3 text-zinc-500" />
            <span>{data.members != null ? `${formatCount(data.members)} members` : "Roblox Group"}</span>
          </div>
          {data.owner && (
            <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
              Owner: <span className="text-zinc-300 font-medium">@{data.owner}</span>
            </div>
          )}
        </div>
      </div>
      {data.description && (
        <div className="mt-2 pt-2 border-t border-white/[0.06] text-xs text-zinc-300 leading-snug line-clamp-2">
          {data.description}
        </div>
      )}
    </>
  );
}

function RobloxGame({ w, accent, data, status, error, refresh }) {
  if (status === "loading") return <Skeleton />;
  if (status !== "success" || !data) {
    return (
      <WidgetError
        w={w}
        accent={accent}
        Icon={SiRoblox}
        message={error || "Add a Roblox game link to show live player counts."}
        onRetry={refresh}
      />
    );
  }

  return (
    <>
      <div className="flex items-center gap-3.5 mb-2.5">
        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 shrink-0">
          {data.icon ? (
            <img src={data.icon} alt={data.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <Play className="w-6 h-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">{data.name}</div>
          <div className="text-xs text-zinc-400 mt-0.5">
            {data.creator ? `by ${data.creator}` : "Roblox Experience"}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
            <span>{data.playing != null ? `${formatCount(data.playing)} playing now` : "Live counts unavailable"}</span>
          </div>
        </div>
      </div>
      <div className="mt-2.5 pt-2 border-t border-white/[0.06] grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <div className="font-bold text-white">{data.visits != null ? formatCount(data.visits) : "—"}</div>
          <div className="text-[10px] text-zinc-500">Visits</div>
        </div>
        <div>
          <div className="font-bold text-white">{data.favorites != null ? formatCount(data.favorites) : "—"}</div>
          <div className="text-[10px] text-zinc-500">Favourites</div>
        </div>
        <div>
          <div className="font-bold text-white">{data.max_players ?? "—"}</div>
          <div className="text-[10px] text-zinc-500">Max Players</div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. GitHub Profile Preview & Activity Graph (Directly matches Image 2)
// ---------------------------------------------------------------------------

function GithubHeatmap({ username = "", seed = 42 }) {
  const months = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  const days = ["Mon", "Wed", "Fri"];

  // Generate deterministic 48 columns x 7 days realistic commit matrix
  const matrix = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) & 0xffffffff;
    hash = Math.abs(hash || seed);

    const cols = [];
    const colors = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];

    for (let c = 0; c < 48; c++) {
      const col = [];
      for (let r = 0; r < 7; r++) {
        // Bias towards higher commit density to match Image 2
        const p = ((hash * (c + 1) * (r + 3)) % 100) / 100;
        let lvl = 0;
        if (p > 0.75) lvl = 4;
        else if (p > 0.5) lvl = 3;
        else if (p > 0.28) lvl = 2;
        else if (p > 0.12) lvl = 1;
        col.push(colors[lvl]);
      }
      cols.push(col);
    }
    return cols;
  }, [username, seed]);

  return (
    <div className="mt-3 pt-2.5 border-t border-white/[0.06] overflow-x-auto select-none">
      {/* Month Header */}
      <div className="flex justify-between text-[9px] text-zinc-500 font-mono mb-1.5 pl-6 pr-1">
        {months.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>

      <div className="flex gap-2 items-center">
        {/* Day Labels */}
        <div className="flex flex-col justify-between h-[52px] text-[8px] text-zinc-500 font-mono">
          {days.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        {/* Heatmap Grid */}
        <div className="flex gap-[2.5px] flex-1">
          {matrix.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-[2.5px]">
              {col.map((color, ri) => (
                <span
                  key={ri}
                  className="w-[7px] h-[7px] rounded-[1.5px] transition hover:scale-125"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GitHubUser({ w, accent, data, status, error, refresh }) {
  const username = (w.username || w.value || "").replace(/^@/, "");
  if (status === "loading") return <Skeleton />;
  if (status !== "success" || !data) {
    return (
      <WidgetError
        w={w}
        accent={accent}
        Icon={FaGithub}
        message={error || "Add a GitHub username to pull real stats."}
        onRetry={username ? refresh : null}
      />
    );
  }

  const followers = data.followers != null ? formatCount(data.followers) : "—";
  const following = data.following != null ? formatCount(data.following) : "0";
  const repos = data.repos != null ? formatCount(data.repos) : "—";
  const joinedText = formatYearsAgo(data.created_at || data.created);

  return (
    <>
      <div className="flex items-center gap-3.5 mb-2.5">
        <div className="w-[58px] h-[58px] rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 shrink-0">
          {data.avatar ? (
            <img src={data.avatar} alt={data.username} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <FaGithub className="w-6 h-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-white truncate tracking-wide">
            {data.name || data.username}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium truncate mt-0.5">
            <FaGithub className="w-3 h-3 text-zinc-400 shrink-0" />
            <span>@{data.username}</span>
          </div>
          <div className="text-xs text-zinc-300 font-normal mt-1 truncate">
            <span>{followers} Followers</span>
            <span className="mx-1 text-zinc-500">•</span>
            <span>{following} Following</span>
            <span className="mx-1 text-zinc-500">•</span>
            <span>{repos} Repos</span>
          </div>
        </div>
      </div>

      {/* About, Company, Joined */}
      <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-1.5 text-xs">
        <div className="text-[11px] font-semibold text-zinc-400">About</div>
        <div className="text-zinc-200 leading-snug line-clamp-2">
          {data.bio || w.bio || "No description provided."}
        </div>
        {data.company && (
          <div className="flex items-center gap-2 text-zinc-400">
            <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>{data.company.startsWith("@") ? data.company : `@${data.company}`}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-zinc-400">
          <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>{joinedText}</span>
        </div>
      </div>

      {/* Realistic Activity Graph Heatmap */}
      <GithubHeatmap username={data.username} seed={data.repos || 228} />
    </>
  );
}

function GitHubRepo({ w, accent, data, status, error, refresh }) {
  if (status === "loading") return <Skeleton />;
  if (status !== "success" || !data) {
    return (
      <WidgetError
        w={w}
        accent={accent}
        Icon={FaGithub}
        message={error || "Add a repository as owner/name."}
        onRetry={refresh}
      />
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
          {data.avatar ? (
            <img src={data.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <FaGithub className="w-5 h-5 text-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">{data.full_name}</div>
          <div className="text-xs text-zinc-400 truncate">
            {data.language && <span className="text-emerald-400 font-medium mr-2">● {data.language}</span>}
            {data.license}
          </div>
        </div>
      </div>
      {data.description && (
        <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2 mb-2.5">
          {data.description}
        </p>
      )}
      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-300">
        <span className="flex items-center gap-1 font-semibold text-white">
          <Star className="w-3.5 h-3.5 text-amber-400" /> {formatCount(data.stars)} Stars
        </span>
        <span className="text-zinc-400">{formatCount(data.forks)} Forks</span>
        <span className="text-zinc-400">{formatCount(data.open_issues)} Issues</span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Spotify Track Preview (Directly matches Image 3)
// ---------------------------------------------------------------------------

function SpotifyTrackCard({ w, accent, data, status, error, refresh }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  if (status === "loading") return <Skeleton />;
  if (status !== "success" || !data) {
    return (
      <WidgetError
        w={w}
        accent={accent}
        Icon={FaSpotify}
        message={error || "Paste a link to a Spotify track or album."}
        onRetry={refresh}
      />
    );
  }

  // The oEmbed endpoint behind this widget returns a title, an author, artwork
  // and the page link — it never returns a clip, so the old `preview_url`
  // branch was dead and the play button did nothing when pressed. The card
  // plays a clip when a widget genuinely carries one, and otherwise opens the
  // track on Spotify instead of pretending to play it.
  const previewAudio = data.preview_url || data.audio_url || "";
  const pageHref = data.page_url || data.url || "";

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    // One source of sound per profile: a Spotify preview must not layer over
    // the owner's track player or their background music.
    document.querySelectorAll("audio").forEach((other) => {
      if (other !== el && !other.paused) other.pause();
    });
    el.play().catch(() => setIsPlaying(false));
  };

  const cover = data.thumbnail || data.artwork || "";
  // Honest placeholders: the card used to invent a track name and an artist
  // when the link had none, which read as somebody else's music on the profile.
  const title = data.title || "Untitled track";
  const artist = data.author || data.artist || "Unknown artist";

  return (
    <div className="relative text-white">
      {previewAudio && (
        <audio
          ref={audioRef}
          src={previewAudio}
          // State follows the element, so a clip stopped by another widget (or
          // by the browser) can never leave this card claiming it is playing.
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {/* Top Row: Track & Action Icons */}
      <div className="flex items-center gap-3">
        {/* Album Artwork */}
        <div
          className="w-14 h-14 rounded-xl overflow-hidden bg-black/40 shrink-0 shadow-md"
          style={{ border: `1px solid ${accent}33`, background: `linear-gradient(135deg, ${accent}22, transparent)` }}
        >
          {cover ? (
            <img src={cover} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/50">
              <FaSpotify className="w-7 h-7" />
            </div>
          )}
        </div>

        {/* Track Title, Artist, Badges */}
        <div className="min-w-0 flex-1">
          <div className="text-sm sm:text-base font-bold text-white truncate leading-tight">
            {title}
          </div>
          <div className="text-xs text-white/80 font-normal truncate mt-0.5">
            {artist}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            {previewAudio ? (
              <button
                type="button"
                onClick={togglePlay}
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/15 hover:bg-white/25 text-white transition cursor-pointer select-none"
              >
                {isPlaying ? "Playing" : "Preview"}
              </button>
            ) : pageHref ? (
              <a
                href={pageHref}
                target="_blank"
                rel="noreferrer"
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/15 hover:bg-white/25 text-white transition select-none"
              >
                Open on Spotify
              </a>
            ) : null}
          </div>
        </div>

        {/* Right Corner: Spotify Logo & the one real action. The "add to
            library" and "more options" buttons were decoration that did
            nothing when pressed, so they are gone. */}
        <div className="flex flex-col items-end justify-between self-stretch shrink-0 pl-1">
          <FaSpotify className="w-4 h-4 text-white/90" />
          <div className="flex items-center gap-2 mt-auto">
            {previewAudio ? (
              <button
                type="button"
                onClick={togglePlay}
                className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow-md cursor-pointer ml-1"
                title={isPlaying ? "Pause" : "Play preview"}
                aria-label={isPlaying ? "Pause preview" : "Play preview"}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-black text-black" />
                ) : (
                  <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                )}
              </button>
            ) : pageHref ? (
              <a
                href={pageHref}
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow-md cursor-pointer ml-1"
                title="Open on Spotify"
                aria-label="Open on Spotify"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Discord Presence & Server Widgets (Matches Images 4 & 5 + Test Styles)
// ---------------------------------------------------------------------------

const DC = {
  panel: "#313338",
  row: "#2b2d31",
  text: "#f2f3f5",
  muted: "#b5bac1",
  green: "#23a55a",
  grey: "#80848e",
  blurple: "#5865F2",
};

const STATUS_DOT = {
  online: "bg-emerald-400 shadow-[0_0_8px_#34d399]",
  idle: "bg-amber-400 shadow-[0_0_8px_#fbbf24]",
  dnd: "bg-red-400 shadow-[0_0_8px_#f87171]",
  offline: "bg-zinc-500",
};

function DiscordProfile({ w, accent, data, status, error, refresh }) {
  if (status === "loading") return <Skeleton />;
  if (status !== "success" || !data) {
    return (
      <WidgetError
        w={w}
        accent={accent}
        Icon={FaDiscord}
        message={error || "Add your Discord user ID."}
        onRetry={refresh}
      />
    );
  }

  const dot = STATUS_DOT[data.status] || STATUS_DOT.offline;
  const style = w.discord_style || "classic";
  const display = data.global_name || data.username;
  const handle = data.username;

  // Minimal style for tests & compact profiles
  if (style === "minimal") {
    return (
      <div className="flex items-center gap-3">
        <span className="relative shrink-0">
          <img src={data.avatar} alt={handle} className="w-11 h-11 rounded-full object-cover bg-zinc-900 border border-white/10" />
          <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0c0d12] ${dot}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold text-zinc-100">{display}</div>
          <div className="truncate text-[10px] text-zinc-400">@{handle} · {data.status || "offline"}</div>
        </div>
      </div>
    );
  }

  // Compact style
  if (style === "compact") {
    return (
      <div className="flex items-center gap-2.5">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-100">
          {display} <span className="font-normal text-zinc-500">@{handle}</span>
        </span>
        {data.spotify?.song && (
          <span className="shrink-0 truncate text-[11px] text-emerald-400 font-medium">
            {data.spotify.song}
          </span>
        )}
      </div>
    );
  }

  // Official Discord client popout style
  if (style === "discord") {
    return (
      <div className="-m-4 overflow-hidden rounded-2xl" style={{ background: DC.panel }} data-testid="discord-profile-style">
        <div className="h-14" style={{ background: `linear-gradient(120deg, ${DC.blurple}, #8C71E8)` }} />
        <div className="px-3 pb-3">
          <span className="relative -mt-7 mb-1 inline-block">
            <span className="block rounded-full border-4" style={{ borderColor: DC.panel }}>
              <img src={data.avatar} alt={handle} className="w-14 h-14 rounded-full object-cover" />
            </span>
            <span className={`absolute -bottom-0.5 right-0.5 h-4 w-4 rounded-full border-4 ${dot}`} style={{ borderColor: DC.panel }} />
          </span>
          <div className="text-sm font-bold" style={{ color: DC.text }}>{display}</div>
          <div className="text-[11px]" style={{ color: DC.muted }}>@{handle}</div>

          <div className="mt-2.5 space-y-1.5 rounded-xl p-2.5" style={{ background: DC.row }}>
            {data.custom_status && <div className="text-[11px]" style={{ color: DC.text }}>{data.custom_status}</div>}
            {data.activity && (
              <div className="text-[11px]" style={{ color: DC.muted }}>
                {data.activity.name}{data.activity.details ? ` · ${data.activity.details}` : ""}
              </div>
            )}
            {data.spotify && (
              <div className="flex items-center gap-2">
                {data.spotify.album_art && (
                  <img src={data.spotify.album_art} alt="" className="h-8 w-8 rounded-md object-cover" loading="lazy" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-bold text-[#1DB954]">{data.spotify.song}</div>
                  <div className="truncate text-[9px]" style={{ color: DC.muted }}>{data.spotify.artist}</div>
                </div>
              </div>
            )}
            {!data.custom_status && !data.activity && !data.spotify && (
              <div className="text-[10px]" style={{ color: DC.muted }}>No status set right now</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Classic: Authentic Discord Presence Preview (Directly matches Image 4)
  return (
    <div className="flex items-center gap-3.5">
      <div className="relative shrink-0">
        <div className="w-[54px] h-[54px] rounded-2xl overflow-hidden bg-zinc-900 border border-white/10">
          <img src={data.avatar} alt={handle} className="w-full h-full object-cover" />
        </div>
        <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#0c0d12] ${dot}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold text-white tracking-wide truncate">
          {display}
        </div>
        <div className="text-xs text-zinc-400 font-medium truncate mt-0.5">
          @{handle}
        </div>
        {data.custom_status ? (
          <div className="text-xs text-zinc-300 truncate mt-1">
            {data.custom_status}
          </div>
        ) : data.activity ? (
          <div className="text-xs text-emerald-400 truncate mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Playing {data.activity.name}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DiscordServer({ w, accent, data, status, error, refresh }) {
  if (status === "loading") return <Skeleton />;
  if (status !== "success" || !data) {
    return (
      <WidgetError
        w={w}
        accent={accent}
        Icon={FaDiscord}
        message={error || "Add your Discord invite link or code."}
        onRetry={refresh}
      />
    );
  }

  // Legacy "compact" / "discord" values fall back to the classic card so older
  // saved widgets keep rendering instead of silently losing their layout.
  const style = w.discord_style === "banner" ? "banner" : w.discord_style === "minimal" ? "minimal" : "classic";
  const name = data.name || w.title || w.server_name || "swats.bio";
  const members = data.total_members != null ? formatCount(data.total_members) : "—";
  const online = data.online != null ? formatCount(data.online) : "—";
  const offline = data.offline != null ? formatCount(data.offline) : "—";
  const joinHref = w.invite_url || data.invite_url || data.url || "";
  const bannerSrc = fileUrl(w.banner_url) || data.banner || "";

  const ServerGlyph = ({ size }) =>
    data.icon ? (
      <img src={data.icon} alt={name} className="w-full h-full object-cover" />
    ) : (
      <div className="w-full h-full flex items-center justify-center text-[#8ea1ff] bg-[#5865F2]/15">
        <FaDiscord style={{ width: size, height: size }} />
      </div>
    );

  if (style === "minimal") {
    return (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-900 border border-white/10 shrink-0 relative">
          <ServerGlyph size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold text-zinc-100">{name}</div>
          <div className="text-[10px] text-zinc-400 truncate">
            <span className="text-emerald-400 font-medium">{online} online</span>
            {data.total_members != null && <span> · {members} members</span>}
          </div>
        </div>
        {joinHref && (
          <a
            href={joinHref}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white transition"
          >
            Join
          </a>
        )}
      </div>
    );
  }

  // Banner: the server banner fills the top half of the card and the icon
  // straddles the halfway mark. A server without a banner falls back to an
  // uploadable one (w.banner_url) or a brand gradient.
  if (style === "banner") {
    return (
      <>
        <div className="relative h-24 w-full overflow-hidden rounded-2xl">
          {bannerSrc ? (
            <img src={bannerSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" style={{ background: `linear-gradient(120deg, ${DC.blurple}, #8C71E8)` }} />
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: "linear-gradient(to top, rgba(12,13,18,0.9), transparent)" }} />
        </div>

        <div className="relative z-10 -mt-7 px-2 flex items-end gap-3">
          <div className="h-14 w-14 rounded-2xl overflow-hidden bg-zinc-900 shrink-0 ring-4 ring-[#0c0d12]">
            <ServerGlyph size={24} />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white tracking-wide truncate">{name}</span>
              <Sparkles className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            </div>
          </div>
        </div>

        <div className="px-2 pt-2.5 space-y-2.5">
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <span className="flex items-center gap-1.5 text-zinc-200 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              {online} online
            </span>
            {data.offline != null && (
              <span className="flex items-center gap-1.5 text-zinc-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-zinc-500" />
                {offline} offline
              </span>
            )}
            {members !== "—" && <span className="text-zinc-500 text-[11px]">· {members} total</span>}
          </div>
          <div className="flex items-center justify-between gap-3 pt-0.5">
            <p className="text-xs text-zinc-300 leading-snug truncate flex-1">
              {data.description || `The official discord server for ${name}`}
            </p>
            <a
              href={joinHref || "#"}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-semibold transition border border-white/5 shrink-0"
            >
              Join
            </a>
          </div>
        </div>
      </>
    );
  }

  // Classic: Authentic Discord Invite Preview (Directly matches Image 5)
  return (
    <>
      <div className="flex items-center gap-3.5 mb-2.5">
        {/* The real server icon, straight from Discord's CDN. */}
        <div className="w-[52px] h-[52px] rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 shrink-0 shadow-md">
          <ServerGlyph size={24} />
        </div>

        {/* Server Name, Verified Badge & Online/Member counts */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold text-white tracking-wide truncate">
              {name}
            </span>
            <Sparkles className="w-3.5 h-3.5 text-brand-400 shrink-0" />
          </div>
          <div className="flex items-center gap-3 text-xs mt-1 flex-wrap">
            <span className="flex items-center gap-1.5 text-zinc-200 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              {online} online
            </span>
            <span className="flex items-center gap-1.5 text-zinc-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-zinc-500" />
              {offline} Offline
            </span>
            {members !== "—" && (
              <span className="text-zinc-500 text-[11px]">
                · {members} total
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description & Join Button */}
      <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-300 leading-snug truncate flex-1">
          {data.description || `The official discord server for ${name}`}
        </p>
        <a
          href={joinHref || "#"}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-semibold transition border border-white/5 shrink-0"
        >
          Join
        </a>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 5. YouTube Channel Preview
// ---------------------------------------------------------------------------

function YouTubeChannel({ w, accent, data, status, error, refresh }) {
  if (status === "loading") return <Skeleton />;
  if (status !== "success" || !data) {
    return (
      <WidgetError
        w={w}
        accent={accent}
        Icon={FaYoutube}
        message={error || "Add your YouTube channel link or @handle."}
        onRetry={refresh}
      />
    );
  }

  const subs = data.stats?.subscribers != null ? formatCount(data.stats.subscribers) : data.subscribers_text;

  return (
    <>
      <div className="flex items-center gap-3.5 mb-2.5">
        <div className="w-[52px] h-[52px] rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 shrink-0">
          <img src={data.avatar} alt={data.title} className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-white truncate flex items-center gap-1.5">
            {data.title || "YouTube"}
            <Check className="w-3.5 h-3.5 text-red-500 shrink-0" />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5 truncate">
            <FaYoutube className="w-3 h-3 text-red-500 shrink-0" />
            <span>{data.handle || subs || "YouTube"}</span>
          </div>
          {subs && (
            <div className="text-xs text-zinc-300 font-medium mt-1 truncate">
              {subs} subscribers
            </div>
          )}
        </div>
      </div>
      {data.description && (
        <div className="mt-2 pt-2 border-t border-white/[0.06] text-xs text-zinc-300 line-clamp-2 leading-relaxed">
          {data.description}
        </div>
      )}
      {data.latest && (
        <a
          href={data.latest.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-black/40 border border-white/5 p-2 hover:border-red-500/40 transition group"
        >
          {data.latest.thumbnail && (
            <div className="relative w-16 h-10 rounded-lg overflow-hidden bg-black shrink-0">
              <img src={data.latest.thumbnail} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition">
                <Play className="w-3.5 h-3.5 text-white fill-white" />
              </div>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-white truncate">{data.latest.title}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Newest upload</div>
          </div>
        </a>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 6. Steam Profile Preview
// ---------------------------------------------------------------------------

function SteamProfile({ w, accent, data, status, error, refresh }) {
  if (status === "loading") return <Skeleton />;
  if (status !== "success" || !data) {
    return (
      <WidgetError
        w={w}
        accent={accent}
        Icon={FaSteam}
        message={error || "Add your Steam profile link."}
        onRetry={refresh}
      />
    );
  }

  const inGame = !!data.current_game;
  const statusColor = inGame ? "#a4d007" : data.online ? "#57cbde" : "#898989";

  return (
    <>
      <div className="flex items-center gap-3.5 mb-2.5">
        <div
          className="w-[52px] h-[52px] rounded-2xl overflow-hidden bg-zinc-900 shrink-0 border-2 transition"
          style={{ borderColor: statusColor }}
        >
          <img src={data.avatar} alt={data.persona} className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-white truncate">{data.persona || "Steam"}</div>
          <div className="flex items-center gap-1.5 text-xs font-medium mt-0.5 truncate" style={{ color: statusColor }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
            <span>{inGame ? `Playing ${data.current_game.name}` : data.state_message || (data.online ? "Online" : "Offline")}</span>
          </div>
          {data.member_since && (
            <div className="text-[11px] text-zinc-400 mt-1 truncate">
              Member since {data.member_since}
            </div>
          )}
        </div>
      </div>
      {data.summary && (
        <div className="mt-2 pt-2 border-t border-white/[0.06] text-xs text-zinc-300 line-clamp-2 leading-relaxed">
          {data.summary}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 7. Valorant Stats Preview
// ---------------------------------------------------------------------------

function ValorantCard({ w, accent, data, status, error, refresh }) {
  const riotId = w.riot_id || w.username || w.value || "";
  if (status === "loading") return <Skeleton />;
  if (status !== "success" || !data) {
    return (
      <WidgetError
        w={w}
        accent={accent}
        Icon={SiValorant}
        message={error || "Add your Riot ID as Name#TAG."}
        onRetry={riotId ? refresh : null}
      />
    );
  }

  return (
    <>
      <div className="flex items-center gap-3.5 mb-2.5">
        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-red-950/40 border border-red-500/30 flex items-center justify-center shrink-0">
          <SiValorant className="w-6 h-6 text-red-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-white truncate">
            {data.game_name}#{data.tag_line}
          </div>
          <div className="text-xs text-red-400 font-semibold uppercase mt-0.5">
            {data.rank || "Unrated"}
            {data.rr != null && ` · ${data.rr} RR`}
          </div>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-300">
        <span>Wins: <strong className="text-white">{data.wins != null ? formatCount(data.wins) : "—"}</strong></span>
        <span>Peak: <strong className="text-amber-400">{data.peak || "—"}</strong></span>
        {data.account_level != null && <span>Level: <strong className="text-white">{data.account_level}</strong></span>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 8. Timezone Clock, Countdown, Account Date & Custom
// ---------------------------------------------------------------------------

function TimezoneClock({ w, accent }) {
  const tz = w.value || w.timezone || "UTC";
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  let time = "";
  let date = "";
  try {
    time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz });
    date = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: tz });
  } catch {
    time = now.toLocaleTimeString();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2.5 text-xs font-bold text-zinc-100">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.06] border border-white/10 shrink-0">
          <Clock className="w-4 h-4 text-white" />
        </span>
        <span className="font-mono text-base tracking-widest text-white font-bold">{time}</span>
      </div>
      <div className="text-xs text-zinc-400 font-medium pl-1 truncate">
        {tz} · {date}
      </div>
    </div>
  );
}

function CountdownCard({ w, accent }) {
  const target = new Date(w.date || w.value || "");
  useTicker(1);
  const valid = !Number.isNaN(target.getTime());
  const diff = valid ? target.getTime() - Date.now() : 0;
  const past = valid && diff <= 0;

  const parts = valid
    ? [
        { v: Math.floor(diff / 86_400_000), l: "days" },
        { v: Math.floor(diff / 3_600_000) % 24, l: "hrs" },
        { v: Math.floor(diff / 60_000) % 60, l: "min" },
        { v: Math.floor(diff / 1000) % 60, l: "sec" },
      ]
    : [];

  return (
    <div className="space-y-2">
      <div className="text-xs font-bold text-white">{w.title || "Countdown"}</div>
      {!valid ? (
        <div className="text-xs text-zinc-500 font-mono">Pick a date in widget settings</div>
      ) : past ? (
        <div className="text-xs text-emerald-400 font-semibold">Event is live! 🎉</div>
      ) : (
        <div className="grid grid-cols-4 gap-2 text-center">
          {parts.map((p) => (
            <div key={p.l} className="rounded-xl bg-black/40 border border-white/5 py-1.5">
              <div className="text-base font-bold text-white font-mono">{String(p.v).padStart(2, "0")}</div>
              <div className="text-[9px] uppercase tracking-wider text-zinc-400">{p.l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountDateCard({ w, accent, ownerCreated }) {
  const value = w.value || ownerCreated;
  const label = formatDate(value);
  const years = formatYearsAgo(value);

  return (
    <div className="flex items-center gap-3">
      <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.06] border border-white/10 shrink-0">
        <Calendar className="w-5 h-5 text-white" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-bold text-white">{w.title || "Member since"}</div>
        <div className="text-xs text-zinc-300 font-medium truncate">{label || "—"} ({years})</div>
      </div>
    </div>
  );
}

function CustomCard({ w, accent }) {
  const code = w.code || w.value || w.content || "";
  return (
    <WidgetShell w={w} accent={accent} headerTitle={w.title || "Custom Widget"} HeaderIcon={Code2}>
      <div className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">
        {code}
      </div>
    </WidgetShell>
  );
}

// TikTok / SoundCloud and any other oEmbed link. These used to fall through to
// the generic "Configured" placeholder, which is why a TikTok card looked like
// it did nothing at all.
function MediaCard({ w, accent, data, status, error, refresh, provider, HeaderIcon }) {
  if (status === "loading") return <Skeleton />;
  if (status !== "success" || !data) {
    return (
      <WidgetError
        w={w}
        accent={accent}
        Icon={HeaderIcon || FaTiktok}
        message={error || "Paste a link to a video or post."}
        onRetry={refresh}
      />
    );
  }

  const label = provider === "tiktok" ? "TikTok" : provider === "soundcloud" ? "SoundCloud" : "Media";

  return (
    <a
      href={data.url || data.page_url || "#"}
      target="_blank"
      rel="noreferrer"
      className="group block"
    >
      <div className="flex items-center gap-3.5">
        <div className="relative w-[58px] h-[58px] rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 shrink-0">
          {data.thumbnail ? (
            <img src={data.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <HeaderIcon className="w-6 h-6" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 transition group-hover:bg-black/10">
            <Play className="w-5 h-5 text-white fill-white" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate leading-snug">
            {data.title || `${label} post`}
          </div>
          <div className="text-xs text-zinc-400 truncate mt-0.5">
            {data.author || label}
          </div>
          <span
            className="inline-block mt-1.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
            style={{ background: `${accent}22`, color: accent }}
          >
            {label}
          </span>
        </div>
      </div>
    </a>
  );
}

function GenericCard({ w, accent }) {
  const Icon = BRAND_ICON[w?.type] || Globe;
  return (
    <WidgetShell w={w} accent={accent}>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.06] border border-white/10 shrink-0">
          <Icon className="w-5 h-5 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-white capitalize truncate">{w.title || w.type}</div>
          <div className="text-xs text-zinc-400 truncate">{w.value || w.username || "Configured"}</div>
        </div>
      </div>
    </WidgetShell>
  );
}

// ---------------------------------------------------------------------------
// Main Widget Router
// ---------------------------------------------------------------------------

export function WidgetCard({ w, accent = "#A48DF4", ownerCreated, owner = "", profileRadius }) {
  // The rounding dial from the profile's Card section reaches every widget:
  // a widget without its own card_radius inherits the card's corner instead of
  // standing at a fixed radius the owner cannot change.
  if (profileRadius !== undefined && w && w.card_radius === undefined) {
    w = { ...w, card_radius: profileRadius };
  }
  const type = (w?.type || "").toLowerCase();
  const sub = (w?.subtype || "").toLowerCase();
  const live = LIVE_TYPES.has(type) || (type === "roblox" && sub === "game");
  const { status, data, error, refresh } = useWidgetData(w, { refreshSec: live ? 60 : 0, owner });

  const props = { w, accent, data, status, error, refresh };

  if (type === "roblox") {
    const isProfile = sub === "profile" || (!sub && (w.username || w.value));
    const title = sub === "group" ? "Roblox Group Preview" : sub === "game" ? "Roblox Game Preview" : "Roblox Profile Preview";
    const inner = sub === "group" ? <RobloxGroup {...props} /> : sub === "game" ? <RobloxGame {...props} /> : <RobloxProfile {...props} />;
    return (
      <WidgetShell w={w} accent={accent} headerTitle={w.title || title} HeaderIcon={SiRoblox}>
        {inner}
      </WidgetShell>
    );
  }

  if (type === "github") {
    const isRepo = sub === "repo";
    const title = isRepo ? "Github Repo Preview" : "Github Profile Preview";
    return (
      <WidgetShell w={w} accent={accent} headerTitle={w.title || title} HeaderIcon={FaGithub}>
        {isRepo ? <GitHubRepo {...props} /> : <GitHubUser {...props} />}
      </WidgetShell>
    );
  }

  if (type === "spotify") {
    // Not `raw`: the Spotify card used to opt out of the shell and paint its own
    // hard-coded purple plate, which is why the music widget ignored the owner's
    // fill, radius and border and looked like a different product from every
    // other card on the page. It wears the same surface as the rest now.
    return (
      <WidgetShell w={w} accent={accent} headerTitle={w.title || "Spotify Track Preview"} HeaderIcon={FaSpotify}>
        <SpotifyTrackCard {...props} />
      </WidgetShell>
    );
  }

  if (type === "tiktok" || type === "soundcloud") {
    const HeaderIcon = type === "tiktok" ? FaTiktok : FaSoundcloud;
    const title = type === "tiktok" ? "TikTok Preview" : "SoundCloud Preview";
    return (
      <WidgetShell w={w} accent={accent} headerTitle={w.title || title} HeaderIcon={HeaderIcon}>
        <MediaCard {...props} provider={type} HeaderIcon={HeaderIcon} />
      </WidgetShell>
    );
  }

  if (type === "discord") {
    const isProfile = sub === "profile";
    const title = isProfile ? "Discord Presence Preview" : "Discord Invite Preview";
    return (
      <WidgetShell w={w} accent={accent} headerTitle={w.title || title} HeaderIcon={FaDiscord}>
        {isProfile ? <DiscordProfile {...props} /> : <DiscordServer {...props} />}
      </WidgetShell>
    );
  }

  if (type === "youtube") {
    return (
      <WidgetShell w={w} accent={accent} headerTitle={w.title || "YouTube Channel Preview"} HeaderIcon={FaYoutube}>
        <YouTubeChannel {...props} />
      </WidgetShell>
    );
  }

  if (type === "steam") {
    return (
      <WidgetShell w={w} accent={accent} headerTitle={w.title || "Steam Profile Preview"} HeaderIcon={FaSteam}>
        <SteamProfile {...props} />
      </WidgetShell>
    );
  }

  if (type === "valorant") {
    return (
      <WidgetShell w={w} accent={accent} headerTitle={w.title || "Valorant Stats Preview"} HeaderIcon={SiValorant}>
        <ValorantCard {...props} />
      </WidgetShell>
    );
  }

  if (type === "timezone" || type === "clock") {
    return (
      <WidgetShell w={w} accent={accent} headerTitle={w.title || "Timezone Clock Preview"} HeaderIcon={Clock}>
        <TimezoneClock w={w} accent={accent} />
      </WidgetShell>
    );
  }

  if (type === "countdown") {
    return (
      <WidgetShell w={w} accent={accent} headerTitle={w.title || "Countdown Preview"} HeaderIcon={Calendar}>
        <CountdownCard w={w} accent={accent} />
      </WidgetShell>
    );
  }

  if (type === "account-date") {
    return (
      <WidgetShell w={w} accent={accent} headerTitle={w.title || "Account Date Preview"} HeaderIcon={Calendar}>
        <AccountDateCard w={w} accent={accent} ownerCreated={ownerCreated} />
      </WidgetShell>
    );
  }

  if (type === "code" || type === "custom") {
    return <CustomCard w={w} accent={accent} />;
  }

  return <GenericCard w={w} accent={accent} />;
}

// ---------------------------------------------------------------------------
// Link Cards & Overlays
// ---------------------------------------------------------------------------

/* The link card surfaces, redone. Every look now follows the same three-layer
   glow recipe: a tight tinted rim right at the edge, a wide soft halo behind
   it, and a plain drop shadow underneath for depth. Styles that used to paint
   one flat `0 0 Npx glow` box-shadow read as a blurry smear next to the card's
   other shadows — the layering is what fixes that. */
export function linkSurface({ color, glow, style }) {
  const glowLayers = (tight, wide) =>
    glow ? `0 0 ${tight}px ${glow}, 0 0 ${wide}px ${glow}55, 0 6px 18px rgba(0,0,0,0.35)` : "";
  switch (style) {
    case "solid":
      return { background: `linear-gradient(180deg, ${color}31, ${color}1f)`, border: `1px solid ${color}6b`, borderRadius: 14, boxShadow: glowLayers(10, 26) || "0 6px 18px rgba(0,0,0,0.35)" };
    case "gradient":
      return { background: `linear-gradient(120deg, ${color}3d, ${color}0f 70%)`, border: `1px solid ${color}55`, borderRadius: 14, boxShadow: glowLayers(12, 30) || `0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)` };
    case "frosted":
      return { background: "rgba(255,255,255,0.08)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 14, boxShadow: glowLayers(12, 30) || "0 6px 18px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)" };
    case "outline":
      return { background: "transparent", border: `1.5px solid ${color}`, borderRadius: 14, boxShadow: glowLayers(10, 28) || "none" };
    case "glass":
      return { background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: `1px solid ${color}40`, borderRadius: 14, boxShadow: glowLayers(12, 30) || `0 6px 18px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.14)` };
    case "aurora":
      return { background: `linear-gradient(135deg, ${color}33, rgba(15,16,21,0.85))`, border: `1px solid ${color}55`, borderRadius: 14, boxShadow: glowLayers(14, 36) || `0 8px 22px rgba(0,0,0,0.4), inset 0 0 24px ${color}22` };
    case "neon":
      // The loudest of the set: dark body, bright rim, glow dialed on even
      // without the owner turning the glow toggle — the style IS the glow.
      return { background: "rgba(10,10,14,0.85)", border: `1.5px solid ${color}`, borderRadius: 14, boxShadow: `0 0 14px ${color}cc, 0 0 44px ${color}55, 0 8px 26px rgba(0,0,0,0.45), inset 0 0 18px ${color}1f` };
    case "minimal":
      // The quiet one: a near-flat tint, no border, no shadow until hover.
      return { background: "rgba(255,255,255,0.04)", border: "1px solid transparent", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.25)" };
    case "new":
      return {
        background: `linear-gradient(160deg, ${color}26, rgba(12,13,18,0.94) 58%)`,
        border: `1px solid ${color}3d`,
        borderRadius: 16,
        boxShadow: glowLayers(14, 38) || "0 10px 26px rgba(0,0,0,0.42)",
      };
    default:
      return { background: `linear-gradient(180deg, ${color}24, ${color}12)`, border: `1px solid ${color}40`, borderRadius: 14, boxShadow: glowLayers(10, 26) || "0 6px 16px rgba(0,0,0,0.3)" };
  }
}

const ICON_RADIUS = { rounded: "rounded-xl", square: "rounded-md", circle: "rounded-full" };
const ICON_PX = { sm: 40, md: 48, lg: 58 };

export function LinkCard({ link, profile, accent, Icon, compact = false }) {
  const color = link.color || profile?.link_global_color || accent;
  const glow = (link.glow_on ?? profile?.link_glow)
    ? (link.glow || profile?.link_global_glow || `${color}66`)
    : "";
  const mode = link.mode || profile?.link_global_mode || "card";
  const cardStyle = link.card_style || profile?.link_global_card_style || "";
  const iconStyle = link.icon_style || profile?.link_global_icon_style || "bare";
  const bare = iconStyle === "bare";
  const iconSize = ICON_PX[link.icon_size || profile?.link_global_icon_size || "md"] || 48;
  const iconFill = link.icon_fill ?? profile?.link_global_icon_fill ?? true;
  const surface = linkSurface({ color, glow, style: cardStyle });
  const radius = ICON_RADIUS[iconStyle] || ICON_RADIUS.rounded;
  const label = link.label || link.platform || link.url;
  const customIcon = fileUrl(link.icon_url);
  const desc = link.desc || link.description || "";
  const fold = link.fold || "";
  const href = link.url || "#";
  const external = /^https?:/i.test(href);
  // Optional owner-authored tooltip for this link. The profile can switch link
  // tips off entirely and restyle them (Editor → Tooltips).
  //
  // When the owner has not written a note, the link's own description stands in
  // — but only where that description is not already on screen, which is why an
  // icon-only link and a folded description get a tip and a plain card does not.
  // Those two cases are exactly the ones that used to show nothing at all.
  const descHidden = compact || fold !== "";
  const tipLabel = profile?.link_tooltips === false
    ? ""
    : (link.tooltip || (descHidden ? desc : ""));
  const { tipProps, tipNode } = useTooltip(tipLabel, {
    // One look and one entrance for the whole profile, set on the Editor's
    // tooltip panel. The per-tip style id is only a fallback for a profile that
    // saved one before there was a global look.
    style: resolveTooltipStyle(profile?.tooltip_style, profile?.link_tooltip_style),
    anim: profile?.tooltip_anim,
    accent,
    size: profile?.tooltip_size,
  });
  const hasTip = !!tipProps.ref;

  const isDiscord = link.platform === "discord" || /(?:discord(?:app)?\.(?:gg|com\/invite)\/)/i.test(link.url || "");
  const discordCode = isDiscord ? discordServerId(link.url) : null;
  const { data: discordData } = useWidgetData(
    discordCode ? { type: "discord", subtype: "server", invite_url: link.url, value: discordCode } : null
  );

  const realDiscordIcon = discordData?.icon || null;
  const discordOnline = discordData?.online != null ? formatCount(discordData.online) : null;
  const discordOffline = discordData?.offline != null
    ? formatCount(discordData.offline)
    : (discordData?.total_members != null && discordData?.online != null
        ? formatCount(Math.max(0, discordData.total_members - discordData.online))
        : null);
  const discordServerName = discordData?.name || "";

  const effectiveLabel = (discordServerName && (!link.label || link.label.toLowerCase() === "discord"))
    ? discordServerName
    : label;

  const Glyph = ({ big = false }) => {
    const iconSrc = customIcon || realDiscordIcon;
    return iconSrc
      ? <img src={iconSrc} alt="" className={`object-cover ${big ? "h-6 w-6 rounded-lg" : "h-4 w-4 rounded"}`} />
      : <Icon className={big ? "w-5 h-5" : "w-4 h-4"} style={{ color }} />;
  };

  const BareGlyph = ({ size = 28 }) => {
    const iconSrc = customIcon || realDiscordIcon;
    return iconSrc
      ? <img src={iconSrc} alt="" style={{ width: size, height: size, objectFit: "cover", borderRadius: size > 40 ? 12 : 8 }} />
      : <Icon style={{ width: size, height: size, color }} />;
  };

  if (mode === "icon") {
    const size = compact ? Math.round(iconSize * 0.86) : iconSize;
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        {...tipProps}
        data-menu-id="link"
        data-menu-href={href}
        title={hasTip ? undefined : (discordOnline && discordOffline ? `${effectiveLabel} — ${discordOnline} online, ${discordOffline} offline` : (desc ? `${label} — ${desc}` : label))}
        aria-label={label}
        className={`relative inline-flex items-center justify-center transition duration-200 hover:scale-110 hover:brightness-125 ${bare ? "" : radius}`}
        style={
          bare
            ? { width: size, height: size, background: "transparent", border: "none", filter: glow ? `drop-shadow(0 0 10px ${glow})` : "drop-shadow(0 4px 10px rgba(0,0,0,0.55))" }
            : {
              width: size,
              height: size,
              background: iconFill ? `${color}2b` : "rgba(255,255,255,0.04)",
              border: `1px solid ${color}55`,
              boxShadow: glow ? `0 0 18px ${glow}` : "0 6px 16px rgba(0,0,0,0.3)",
            }
        }
      >
        {bare ? <BareGlyph big size={Math.round(size * 0.58)} /> : <Glyph big />}
        {tipNode}
      </a>
    );
  }

  const pro = cardStyle === "new";

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      data-menu-id="link"
      data-menu-href={href}
      {...tipProps}
      className={`group relative flex items-center text-xs font-bold text-white transition duration-200 hover:scale-[1.02] hover:brightness-110 ${pro ? "gap-3.5 px-4 py-3.5" : "gap-3 py-3 px-4"}`}
      style={surface}
    >
      <span
        className={`relative shrink-0 flex items-center justify-center ${bare ? "" : radius}`}
        style={{
          width: pro ? 40 : 30,
          height: pro ? 40 : 30,
          background: bare ? "transparent" : iconFill ? `${color}2b` : "transparent",
          ...(pro && !bare ? { border: `1px solid ${color}33` } : null),
        }}
      >
        {bare ? <BareGlyph size={pro ? 26 : 22} /> : <Glyph big={pro} />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={`block truncate ${pro ? "text-[13px]" : ""}`}>{effectiveLabel}</span>
        {discordOnline && discordOffline && (
          <span className="flex items-center gap-2 mt-0.5 text-[10px]">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />
              {discordOnline} online
            </span>
            <span className="flex items-center gap-1 text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              {discordOffline} offline
            </span>
          </span>
        )}
        {desc && (
          <span
            className={`block text-[10px] font-normal text-zinc-400 ${
              fold === "hover"
                ? "max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:max-h-10 group-hover:opacity-100"
                : fold === "folded"
                  ? "max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-focus:max-h-10 group-focus:opacity-100"
                  : "mt-0.5 line-clamp-2"
            }`}
          >
            {desc}
          </span>
        )}
      </span>
      {pro ? (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-zinc-200 transition duration-200 group-hover:translate-x-0.5"
          style={{ background: `${color}1f` }}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      ) : (
        <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" />
      )}
      {tipNode}
    </a>
  );
}

export function LinkIcons({ links, profile, accent, PLAT_MAP, compact }) {
  const iconLinks = links.filter((l) => (l.mode || profile?.link_global_mode || "card") === "icon");
  if (!iconLinks.length) return null;
  return (
    <div className="flex flex-wrap gap-2.5">
      {iconLinks.map((l, i) => {
        const Icon = PLAT_MAP[l.platform]?.Icon || Globe;
        return <LinkCard key={i} link={l} profile={profile} accent={accent} Icon={Icon} compact={compact} />;
      })}
    </div>
  );
}

export function WidgetPill({ w, accent = "#A48DF4", ownerCreated, owner = "", p }) {
  const type = (w?.type || "").toLowerCase();
  const sub = (w?.subtype || "").toLowerCase();
  const live = LIVE_TYPES.has(type) || (type === "roblox" && sub === "game");
  const { status, data } = useWidgetData(w, { refreshSec: live ? 60 : 0, owner });

  const bgEnabled = w?.background !== false && w?.bg_enabled !== false && w?.show_bg !== false && !w?.transparent && w?.card_style !== "transparent" && (w?.card_fill_alpha === undefined || Number(w.card_fill_alpha) > 0);
  const fillAlpha = Number.isFinite(Number(w?.card_fill_alpha ?? p?.card_fill_alpha)) ? Number(w?.card_fill_alpha ?? p?.card_fill_alpha) : 65;
  const outlineAlpha = Number.isFinite(Number(w?.card_outline_alpha ?? p?.card_outline_alpha)) ? Number(w?.card_outline_alpha ?? p?.card_outline_alpha) : 25;
  const brandColor = w?.color || accent || "#A48DF4";
  const pillBorderWidth = Math.max(0, Math.round(numOr(w?.card_border_width, WIDGET_SURFACE_DEFAULTS.borderWidth)));
  const pillGlowAmount = numOr(w?.glow_amount, 18);

  const Icon = BRAND_ICON[type] || Globe;
  const { tipProps, tipNode } = useTooltip(w?.tooltip);
  let title = w?.title || "";
  let subtitle = w?.value || w?.username || "";
  let avatarUrl = "";
  let href = w?.url || w?.link || "";
  let isLive = false;

  if (type === "discord") {
    if (sub === "profile") {
      title = data?.global_name || data?.username || w?.username || "Discord Presence";
      subtitle = data?.activity?.name ? `Playing ${data.activity.name}` : data?.custom_status || (data?.status ? data.status.toUpperCase() : "Online");
      avatarUrl = data?.avatar || "";
      isLive = data?.status === "online";
    } else {
      title = data?.name || w?.server_name || "Discord Server";
      const on = data?.online !== undefined ? formatCount(data.online) : null;
      const tot = data?.total_members !== undefined ? formatCount(data.total_members) : (data?.offline !== undefined ? formatCount(data.offline) : null);
      subtitle = on && tot ? `${on} online · ${tot} members` : (on ? `${on} online` : (w?.invite_url || "Join Community"));
      avatarUrl = data?.icon || "";
      href = data?.invite_url || w?.invite_url || href;
      isLive = Number(data?.online) > 0;
    }
  } else if (type === "spotify") {
    title = data?.song || data?.track || w?.track || w?.title || "Spotify";
    subtitle = data?.artist || w?.artist || "Listening on Spotify";
    avatarUrl = data?.album_art || "";
    href = data?.url || w?.url || href;
    isLive = !!(data?.song || data?.track);
  } else if (type === "roblox") {
    if (sub === "game") {
      title = data?.name || w?.title || "Roblox Experience";
      subtitle = data?.playing !== undefined ? `${formatCount(data.playing)} active players` : "Roblox Game";
      avatarUrl = data?.icon || "";
      href = data?.url || w?.game_url || href;
      isLive = Number(data?.playing) > 0;
    } else if (sub === "group") {
      title = data?.name || w?.title || "Roblox Group";
      subtitle = data?.member_count !== undefined ? `${formatCount(data.member_count)} members` : "Roblox Group";
      avatarUrl = data?.icon || "";
      href = data?.url || href;
    } else {
      title = data?.display_name || data?.username || w?.username || "Roblox User";
      subtitle = data?.presence?.last_location ? `Playing ${data.presence.last_location}` : formatYearsAgo(data?.created_at || w?.created_at);
      avatarUrl = data?.avatar || data?.headshot || "";
      href = data?.url || (w?.username ? `https://www.roblox.com/users/${w.username}` : "");
      isLive = !!data?.presence?.is_online;
    }
  } else if (type === "github") {
    if (sub === "repo") {
      title = data?.name || w?.repo || "GitHub Repo";
      subtitle = data?.stars !== undefined ? `${formatCount(data.stars)} stars · ${formatCount(data.forks || 0)} forks` : (data?.description || "Repository");
      avatarUrl = data?.owner_avatar || "";
      href = data?.html_url || href;
    } else {
      title = data?.name || data?.login || w?.username || "GitHub Profile";
      subtitle = data?.followers !== undefined ? `${formatCount(data.followers)} followers · ${formatCount(data.public_repos || 0)} repos` : (data?.bio || "Developer");
      avatarUrl = data?.avatar_url || "";
      href = data?.html_url || (w?.username ? `https://github.com/${w.username}` : "");
    }
  } else if (type === "youtube") {
    title = data?.title || w?.channel || "YouTube Channel";
    subtitle = data?.subscribers !== undefined ? `${formatCount(data.subscribers)} subscribers` : (data?.description || "Channel");
    avatarUrl = data?.thumbnail || "";
    href = data?.url || href;
  } else if (type === "steam") {
    title = data?.personaname || w?.username || "Steam Profile";
    subtitle = data?.game_extra_info ? `Playing ${data.game_extra_info}` : (data?.level !== undefined ? `Level ${data.level}` : (data?.status || "Steam User"));
    avatarUrl = data?.avatar || "";
    href = data?.profileurl || href;
    isLive = !!data?.game_extra_info;
  } else if (type === "valorant") {
    title = data?.name ? `${data.name}#${data.tag}` : w?.riot_id || "Valorant Stats";
    subtitle = data?.current_tier_patched ? `${data.current_tier_patched} (${data.ranking_in_tier || 0} RR)` : (data?.rank || "Competitive");
    avatarUrl = data?.card_small || "";
  } else if (type === "timezone") {
    const tz = w?.value || w?.timezone || data?.timezone || "UTC";
    title = w?.title || "Timezone";
    let curTime = "";
    try {
      curTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz });
    } catch {
      curTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    subtitle = `${tz} · ${curTime}`;
  } else if (type === "account-date" || type === "countdown") {
    title = w?.title || (type === "countdown" ? "Countdown" : "Account Age");
    subtitle = formatYearsAgo(ownerCreated || data?.created_at || w?.date);
  } else {
    title = w?.title || type.toUpperCase();
    subtitle = w?.value || w?.url || "Configured";
  }

  const Tag = href ? "a" : "div";
  const linkProps = href ? { href, target: "_blank", rel: "noopener noreferrer" } : {};

  return (
    <Tag
      {...linkProps}
      {...tipProps}
      data-widget={type || "widget"}
      data-widget-pill="true"
      className="group relative flex items-center gap-3 px-3.5 py-2.5 rounded-full border transition-all duration-300 hover:scale-[1.02] cursor-pointer min-h-[50px] w-full"
      style={{
        background: bgEnabled ? `rgba(20, 20, 30, ${fillAlpha / 100})` : "transparent",
        borderStyle: pillBorderWidth > 0 ? "solid" : "none",
        borderWidth: `${pillBorderWidth}px`,
        borderColor: `rgba(255, 255, 255, ${outlineAlpha / 100})`,
        // A pill inherits the profile's corner dial too; only an EXPLICIT
        // per-widget radius overrides it.
        ...(w?.card_radius === undefined
          ? (p?.card_radius === undefined ? null : { borderRadius: widgetRadius(p.card_radius) })
          : { borderRadius: widgetRadius(w.card_radius) }),
        backdropFilter: bgEnabled ? "blur(14px)" : "none",
        boxShadow: (w?.glow_on) ? `0 0 ${pillGlowAmount}px ${w.glow || brandColor}55` : "0 4px 14px rgba(0,0,0,0.3)",
      }}
    >
      <div
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden"
        style={{
          background: avatarUrl ? "transparent" : `${brandColor}22`,
          border: `1px solid ${brandColor}44`,
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Icon className="w-4 h-4" style={{ color: brandColor }} />
        )}
      </div>

      <div className="min-w-0 flex-1 flex flex-col justify-center text-left">
        <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
          <span className="truncate">{title}</span>
          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse shadow-[0_0_6px_#34d399]" />}
        </div>
        <div className="text-[11px] text-zinc-400 truncate">
          {subtitle}
        </div>
      </div>

      <div className="shrink-0 text-zinc-500 group-hover:text-zinc-200 transition-colors">
        {href ? <ExternalLink className="w-3.5 h-3.5 opacity-60" /> : <ArrowRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-80" />}
      </div>
      {tipNode}
    </Tag>
  );
}
