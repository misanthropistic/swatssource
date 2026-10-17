import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, BellRing, CheckCheck, Mail, Megaphone, Newspaper, Volume2, VolumeX } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";
import { armPing, ping, pingMuted, setPingMuted } from "@/lib/ping";
import DevlogFeedModal from "@/components/DevlogFeedModal";

const POLL_MS = 30000;

const KIND_META = {
  devlog: { Icon: Newspaper, label: "Devlog", tint: "text-sky-300 bg-sky-500/12" },
  inbox: { Icon: Mail, label: "Message", tint: "text-brand-300 bg-brand-500/12" },
  announcement: { Icon: Megaphone, label: "Announcement", tint: "text-amber-300 bg-amber-500/12" },
  system: { Icon: BellRing, label: "System", tint: "text-zinc-300 bg-white/[0.06]" },
};

const timeAgo = (iso) => {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

/* The dashboard's notification bell.
 *
 * Polls the caller's inbox, shows an unread badge, and plays one short ping when
 * something genuinely new arrives. "Genuinely new" is tracked by the newest
 * item's timestamp in localStorage rather than by the unread count: otherwise
 * every reload of every dashboard page would ping about the same message the
 * user chose not to open.
 */
export default function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // The bell lives in the dashboard, so "what has shipped" opens the build log
  // as a popup instead of navigating to the public changelog page.
  const [devlogOpen, setDevlogOpen] = useState(false);
  const [muted, setMuted] = useState(() => pingMuted());

  const announcedRef = useRef(null); // ISO of the newest item already announced
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications", { params: { limit: 30 } });
      const list = data?.items || [];
      setItems(list);
      setUnread(data?.unread || 0);

      const newest = list[0]?.created_at || null;
      const previous = announcedRef.current;

      if (newest && (!previous || new Date(newest).getTime() > new Date(previous).getTime())) {
        // Ping only for arrivals, never for the initial paint of a page that was
        // opened with unread mail already sitting there.
        const isArrival = !!previous;
        announcedRef.current = newest;
        if (isArrival) {
          ping();
          const meta = KIND_META[list[0].kind] || KIND_META.system;
          toast.info(list[0].title, {
            title: `${meta.label} · new in your inbox`,
            description: list[0].body || undefined,
          });
        }
      }
    } catch {
      // A failed poll is not worth a toast; the next one will retry.
    }
  }, []);

  useEffect(() => {
    const release = armPing();
    load();

    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_MS);

    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      release?.();
    };
  }, [load]);

  // Click-away and Escape both close the panel — the two things people reach for.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = async (ids) => {
    // Counted from the list as it stands, so the badge drops by exactly the rows
    // that were actually unread — marking an already-read item is a no-op.
    const wasUnread = ids.filter((id) => items.some((i) => i.id === id && !i.read_at)).length;
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, read_at: i.read_at || new Date().toISOString() } : i)));
    setUnread((n) => Math.max(0, n - wasUnread));
    try {
      await api.post("/notifications/read", { ids });
    } catch {
      load();
    }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at || new Date().toISOString() })));
    setUnread(0);
    try {
      await api.post("/notifications/read", {});
    } catch {
      load();
    }
  };

  const openItem = (item) => {
    if (!item.read_at) markRead([item.id]);
    setOpen(false);
    if (!item.href) return;
    if (/^https?:\/\//i.test(item.href)) window.open(item.href, "_blank", "noopener");
    else navigate(item.href);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setPingMuted(next);
  };

  const badge = unread > 9 ? "9+" : String(unread);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="notification-bell"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-400 outline-none transition-colors duration-200 hover:border-brand-400/30 hover:text-brand-200 focus-visible:ring-2 focus-visible:ring-brand-500/50"
      >
        {unread > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}

        {unread > 0 && (
          <>
            {/* The pulse is what makes a single unread item noticeable in a corner
                of the screen people are not looking at. */}
            <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-brand-400/70" />
            <span
              data-testid="notification-badge"
              className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-brand-500 px-1 text-center font-mono2 text-[10px] font-bold leading-[18px] text-white shadow-[0_0_10px_rgba(164, 141, 244,0.6)]"
            >
              {badge}
            </span>
          </>
        )}
      </button>

      {open && (
        // Solid rather than translucent: at /97 the dashboard rows behind the
        // panel read through it and the list was hard to scan.
        <div
          data-testid="notification-panel"
          className="absolute right-0 top-full z-50 mt-2 w-[23rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-white/12 bg-[#0b0b0f] shadow-[0_30px_90px_-20px_rgba(0,0,0,0.95)] ring-1 ring-black/40"
        >
          {/* Accent hairline + soft brand glow, matching the dashboard cards. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />
          <div className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-brand-600/15 blur-[60px]" />

          <div className="relative flex items-center gap-2 border-b border-white/[0.06] px-4 py-3.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-500/10">
              <Bell className="h-3.5 w-3.5 text-brand-300" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">Notifications</span>
            {unread > 0 && (
              <span className="rounded-full bg-brand-500/15 px-2 py-0.5 font-mono2 text-[10px] font-bold text-brand-300">
                {unread} new
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={toggleMute}
                data-testid="notification-mute"
                title={muted ? "Unmute the notification ping" : "Mute the notification ping"}
                className="rounded-lg p-1.5 text-zinc-500 transition-colors duration-200 hover:bg-white/5 hover:text-zinc-200"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={markAllRead}
                disabled={unread === 0}
                data-testid="notification-mark-all"
                title="Mark everything read"
                className="rounded-lg p-1.5 text-zinc-500 transition-colors duration-200 hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <li className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <BellOff className="h-6 w-6 text-zinc-600" />
                <span className="text-xs text-zinc-500">Nothing yet. Devlogs and admin messages land here.</span>
              </li>
            ) : (
              items.map((item) => {
                const meta = KIND_META[item.kind] || KIND_META.system;
                const { Icon } = meta;
                return (
                  <li key={item.id} className="border-b border-white/[0.04] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      data-testid="notification-item"
                      className={`relative flex w-full items-start gap-3 px-4 py-3.5 text-left outline-none transition-colors duration-200 hover:bg-white/[0.04] focus-visible:bg-white/[0.05] ${
                        item.read_at ? "" : "bg-brand-500/[0.06]"
                      }`}
                    >
                      {/* Unread rows carry an accent bar down the left edge — a
                          filled row alone was easy to miss while scrolling. */}
                      <span
                        className={`absolute inset-y-0 left-0 w-0.5 transition-colors duration-200 ${item.read_at ? "bg-transparent" : "bg-brand-400"}`}
                        aria-hidden="true"
                      />
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-white/[0.06] ${meta.tint}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={`min-w-0 flex-1 truncate text-xs ${item.read_at ? "font-medium text-zinc-300" : "font-bold text-zinc-50"}`}
                          >
                            {item.title}
                          </span>
                          {!item.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />}
                        </span>
                        {item.body && <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-zinc-400">{item.body}</span>}
                        <span className="mt-1 block font-mono2 text-[10px] uppercase tracking-wide text-zinc-600">
                          {meta.label} · {timeAgo(item.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <button
            type="button"
            data-testid="notification-open-devlogs"
            onClick={() => {
              setOpen(false);
              setDevlogOpen(true);
            }}
            className="group relative flex w-full items-center justify-between gap-2 border-t border-white/[0.06] bg-white/[0.015] px-4 py-3.5 text-left text-xs font-semibold text-zinc-400 transition-colors duration-200 hover:bg-brand-500/[0.08] hover:text-brand-100"
          >
            <span className="flex items-center gap-2">
              <Newspaper className="h-3.5 w-3.5 text-brand-400" /> Everything that ships, in order
            </span>
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      )}

      <DevlogFeedModal open={devlogOpen} onClose={() => setDevlogOpen(false)} />
    </div>
  );
}
