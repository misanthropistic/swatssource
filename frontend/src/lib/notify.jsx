// Custom notification system: stacked cards pinned to the TOP CENTRE of the
// screen.
//
// Replaces sonner. The `toast` object keeps the same call shape that was already
// used in ~70 places (`toast.success("...")`, `toast.error("...")`,
// `toast.info("...")`), so those call sites only needed their import changed.
//
// Mount <Toaster /> exactly once, in App.js. Mounting it per-page (which is what
// Login and Pricing used to do) renders every notification once per instance.
import { useSyncExternalStore } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2, X } from "lucide-react";

const DEFAULT_DURATION = 4200;
const EXIT_MS = 180; // must match the exit animation below
const MAX_VISIBLE = 5;

let items = [];
const listeners = new Set();
let nextId = 1;

const emit = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => items;

const normalize = (value) => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (typeof value === "object" && typeof value.message === "string") return value.message;
  return String(value);
};

export function dismiss(id) {
  if (!items.some((item) => item.id === id && !item.closing)) return;
  items = items.map((item) => (item.id === id ? { ...item, closing: true } : item));
  emit();
  setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    emit();
  }, EXIT_MS);
}

// Drops everything currently on screen. Useful after a route change or sign-out,
// so a notification from the previous screen is not left hanging around.
export function dismissAll() {
  if (!items.length) return;
  items = items.map((item) => ({ ...item, closing: true }));
  emit();
  setTimeout(() => {
    items = [];
    emit();
  }, EXIT_MS);
}

function push(type, message, options = {}) {
  const id = options.id ?? nextId++;
  const duration = options.duration ?? DEFAULT_DURATION;

  const item = {
    id,
    type,
    title: options.title ?? null,
    description: options.description ?? null,
    message: normalize(message),
    // Kept so the card can draw a countdown bar that matches its own lifetime.
    duration,
    closing: false,
  };

  // Re-adding an existing id replaces it in place rather than duplicating.
  items = [...items.filter((entry) => entry.id !== id), item].slice(-MAX_VISIBLE);
  emit();

  if (duration > 0) setTimeout(() => dismiss(id), duration);
  // Callers that want to dismiss early (a loading toast, say) get the handle back.
  return { id, dismiss: () => dismiss(id) };
}

const factory = (type) => (message, options) => push(type, message, options);

export const toast = {
  success: factory("success"),
  error: factory("error"),
  info: factory("info"),
  warning: factory("warning"),
  message: factory("info"),
  // Stays until dismissed — used for in-flight work.
  loading: (message, options) => push("loading", message, { duration: 0, ...options }),
  dismiss,
  dismissAll,
};

const VARIANTS = {
  success: { Icon: CheckCircle2, accent: "text-emerald-300", ring: "ring-emerald-400/25", chip: "bg-emerald-500/15", bar: "bg-emerald-400", edge: "border-emerald-400/25" },
  error: { Icon: AlertCircle, accent: "text-rose-300", ring: "ring-rose-400/25", chip: "bg-rose-500/15", bar: "bg-rose-400", edge: "border-rose-400/25" },
  warning: { Icon: AlertTriangle, accent: "text-amber-300", ring: "ring-amber-400/25", chip: "bg-amber-500/15", bar: "bg-amber-400", edge: "border-amber-400/25" },
  info: { Icon: Info, accent: "text-brand-300", ring: "ring-brand-400/25", chip: "bg-brand-500/15", bar: "bg-brand-400", edge: "border-brand-400/25" },
  loading: { Icon: Loader2, accent: "text-brand-300", ring: "ring-brand-400/25", chip: "bg-brand-500/15", bar: "bg-brand-400", edge: "border-brand-400/25" },
};

/* One notification.
 *
 * Solid `#0b0b10` rather than a translucent blur: at /95 behind a backdrop blur
 * the page showed through a toast and its text lost contrast over busy profile
 * backgrounds. The accent hairline down the left edge and the countdown bar
 * along the bottom are what make the type readable at a glance. */
function NotificationCard({ item }) {
  const variant = VARIANTS[item.type] || VARIANTS.info;
  const { Icon } = variant;
  const text = item.message || item.title;

  return (
    <li
      data-testid={`notification-${item.type}`}
      className={`pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border border-white/12 bg-[#0b0b10] px-4 py-3.5 text-left shadow-[0_24px_60px_-16px_rgba(0,0,0,0.95)] ring-1 backdrop-blur-xl ${variant.ring} ${variant.edge} ${
        item.closing
          ? "animate-out fade-out slide-out-to-top-2 duration-200"
          : "animate-in fade-in slide-in-from-top-2 duration-200"
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-0.5 ${variant.bar}`} aria-hidden="true" />

      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${variant.chip}`}>
        <Icon className={`h-3.5 w-3.5 ${variant.accent} ${item.type === "loading" ? "animate-spin" : ""}`} />
      </span>

      <div className="min-w-0 flex-1">
        {item.title && <div className="text-xs font-bold text-zinc-50">{item.title}</div>}
        {text && (
          <div className={`text-xs leading-relaxed text-zinc-200 ${item.title ? "mt-0.5" : ""}`}>
            {item.message || (item.title ? "" : null)}
          </div>
        )}
        {item.description && (
          <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{item.description}</div>
        )}
      </div>

      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(item.id)}
        className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-zinc-500 outline-none transition-colors duration-200 hover:bg-white/5 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-brand-500/50"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {item.type !== "loading" && item.duration > 0 && !item.closing && (
        <span
          data-testid="notification-timer"
          aria-hidden="true"
          className={`absolute bottom-0 left-0 h-0.5 ${variant.bar} opacity-60`}
          style={{ animation: `sw-toast-timer ${item.duration}ms linear forwards` }}
        />
      )}
    </li>
  );
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);

  return (
    <div
      data-testid="notification-region"
      role="status"
      aria-live="polite"
      // Top centre, growing downwards. `flex-col-reverse` keeps the DOM order
      // (oldest first — the order the store holds) while painting the newest
      // arrival nearest the top edge, where the eye already is.
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] flex flex-col items-center p-3 sm:p-4"
    >
      <ol className="flex w-full max-w-md flex-col-reverse gap-2.5">
        {list.map((item) => (
          <NotificationCard key={item.id} item={item} />
        ))}
      </ol>
    </div>
  );
}
