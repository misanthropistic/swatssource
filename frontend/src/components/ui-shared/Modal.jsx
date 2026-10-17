import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

/* ---------------------------------------------------------------------------
   Modal — the dashboard's single dialog primitive.

   Every page had grown its own `fixed inset-0 …` block (Settings' delete
   confirm, Links' editor, Widgets' editor …), each with slightly different
   padding, blur and dismissal. This replaces the ad-hoc shells with one
   component so a dialog looks and behaves the same everywhere:

     • portalled to <body> so it is never clipped by an `overflow-hidden` card
     • Escape and backdrop click close it
     • background scroll is locked while open
     • a title/description are wired to aria-labelledby / aria-describedby
     • enter/exit animation (skipped automatically for reduced-motion users)

   It is deliberately uncontrolled-visibility: the caller owns `open` and
   `onClose`, so a dialog can be opened from anywhere without a context.
   --------------------------------------------------------------------------- */

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const EASE = [0.16, 1, 0.3, 1];

export function Modal({
  open = false,
  onClose,
  title,
  description,
  icon: Icon,
  children,
  footer,
  size = "md",
  testid,
  closeOnBackdrop = true,
}) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          data-testid={testid}
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6"
        >
          <motion.div
            data-testid={testid ? `${testid}-backdrop` : undefined}
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.24, ease: EASE }}
            className={`relative z-10 my-auto w-full overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0f]/95 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl ${SIZES[size] || SIZES.md}`}
          >
            {/* Accent hairline + soft brand glow, matching the page cards. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-brand-600/20 blur-[70px]" />

            <header className="relative flex items-start gap-3 border-b border-white/[0.06] px-6 py-5">
              {Icon && (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-brand-400/20 bg-brand-500/10">
                  <Icon className="h-5 w-5 text-brand-300" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                {title && (
                  <h2 id={titleId} className="font-display text-lg font-extrabold tracking-tight text-zinc-50">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descId} className="mt-1 text-xs leading-relaxed text-zinc-400">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-1 -mt-1 shrink-0 rounded-xl p-2 text-zinc-500 outline-none transition-colors duration-200 hover:bg-white/5 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-brand-500/50"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="relative px-6 py-5">{children}</div>

            {footer && (
              <footer className="relative flex flex-col-reverse gap-2 border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:flex-row sm:justify-end">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default Modal;
