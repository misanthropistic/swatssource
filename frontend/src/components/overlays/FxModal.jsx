import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useRegisterOverlay } from "./useActiveOverlay";

/* ---------------------------------------------------------------------------
   FxModal — the editor's centered picker surface.

   Every effect picker used to slide in as a right-edge panel. A panel is the
   wrong shape for choosing an effect: the tiles were in a narrow column, the
   thing you are choosing for (your own card) sat off to the left of it, and on a
   phone the panel covered the page it was changing. This is one wide dialog in
   the middle of a blurred backdrop, so the tiles get the full width and the page
   behind it reads as context, not as a thing the panel is fighting with.

   It renders inline rather than through a portal, like the Drawer it replaces,
   so it stays clipped by — and queryable inside — the tree that owns it.
   --------------------------------------------------------------------------- */

export function FxModal({
  open = false,
  onOpenChange,
  id,
  eyebrow,
  title,
  description,
  testid,
  children,
  footer,
  top,
  className = "",
}) {
  const close = useCallback(() => onOpenChange?.(false), [onOpenChange]);
  const panelRef = useRef(null);

  useRegisterOverlay(id || testid, open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Scroll to the top of the list each time it opens: a picker that remembers
  // where you were scrolled to is disorienting when it has just re-opened.
  useEffect(() => {
    if (open && panelRef.current) panelRef.current.scrollTop = 0;
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="ov-scrim ov-scrim-blur" onClick={close} aria-hidden="true" />

      <div className="ov-modal-wrap" onClick={close}>
        <section
          id={id}
          data-testid={testid}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className={`ov-modal ${className}`}
        >
          <header className="ov-head">
            <div className="ov-head-copy">
              {eyebrow && <div className="ov-eyebrow">{eyebrow}</div>}
              {title && <h2 className="ov-title">{title}</h2>}
              {description && <p className="ov-desc">{description}</p>}
            </div>
            <button type="button" onClick={close} aria-label="Close panel" className="ov-close">
              <X className="h-4 w-4" />
            </button>
          </header>

          {top && <div className="ov-modal-top">{top}</div>}

          <div className="ov-body ov-modal-body">{children}</div>

          {footer && <footer className="ov-foot ov-modal-foot">{footer}</footer>}
        </section>
      </div>
    </>
  );
}

export default FxModal;
