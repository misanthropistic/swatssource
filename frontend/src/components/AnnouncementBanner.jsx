import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Info, Megaphone, Siren, X } from "lucide-react";
import { api } from "@/lib/api";

/* Live announcements from the admin panel.
 *
 * Reads GET /announcements, which already filters by time window and audience
 * server-side, so this only has to decide how a level looks. Anything the viewer
 * dismissed is remembered by id, which is what makes a banner tolerable when it
 * stays up for a week.
 */
const LEVELS = {
  info: { Icon: Info, ring: "border-sky-400/25", bg: "bg-sky-500/[0.10]", text: "text-sky-100", accent: "text-sky-300" },
  success: { Icon: CheckCircle2, ring: "border-emerald-400/25", bg: "bg-emerald-500/[0.10]", text: "text-emerald-100", accent: "text-emerald-300" },
  warning: { Icon: AlertTriangle, ring: "border-amber-400/25", bg: "bg-amber-500/[0.10]", text: "text-amber-100", accent: "text-amber-300" },
  critical: { Icon: Siren, ring: "border-rose-400/30", bg: "bg-rose-500/[0.12]", text: "text-rose-100", accent: "text-rose-300" },
};

const DISMISS_KEY = "swats_dismissed_announcements";

const readDismissed = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

export default function AnnouncementBanner({ className = "" }) {
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    let alive = true;
    api.get("/announcements")
      .then(({ data }) => {
        if (alive && Array.isArray(data)) setItems(data);
      })
      .catch(() => {
        // A missing banner is not an error worth surfacing.
      });
    return () => { alive = false; };
  }, []);

  const dismiss = (id) => {
    const next = [...new Set([...dismissed, id])].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* private mode: the banner returns next visit */
    }
  };

  const visible = items.filter((a) => !dismissed.includes(a.id));
  if (!visible.length) return null;

  return (
    <div className={`space-y-2 ${className}`} data-testid="announcement-banners">
      {visible.map((a) => {
        const level = LEVELS[a.level] || LEVELS.info;
        const { Icon } = level;
        const linkText = a.href_label || "Learn more";
        const external = /^https?:\/\//i.test(a.href || "");

        return (
          <div
            key={a.id}
            data-testid={`announcement-${a.level || "info"}`}
            className={`relative flex items-start gap-3 overflow-hidden rounded-2xl border px-4 py-3 ${level.ring} ${level.bg}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${level.accent}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-xs leading-relaxed sm:text-sm ${level.text}`}>{a.message}</p>
              {a.href && (
                external ? (
                  <a
                    href={a.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2 ${level.accent}`}
                  >
                    <Megaphone className="h-3 w-3" /> {linkText}
                  </a>
                ) : (
                  <Link
                    to={a.href}
                    className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2 ${level.accent}`}
                  >
                    <Megaphone className="h-3 w-3" /> {linkText}
                  </Link>
                )
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(a.id)}
              aria-label="Dismiss announcement"
              className="shrink-0 rounded-lg p-1 text-zinc-500 transition-colors duration-200 hover:bg-white/5 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
