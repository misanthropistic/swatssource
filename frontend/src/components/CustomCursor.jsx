import { useEffect, useRef, useState } from "react";
import { fileUrl } from "@/lib/api";
import { crosshairSettings } from "@/lib/crosshair";

/**
 * CustomCursor
 * Renders a high-performance custom cursor follower supporting:
 * - Full animated GIF playback (real <img> element, 60fps)
 * - Normal small cursor sizing (24-32px default, scaled cleanly)
 * - Perfectly centered hotspot (translate(-50%, -50%))
 * - Smooth pointer tracking with requestAnimationFrame
 * - Automatic suppression on touch/mobile devices
 */
export function CustomCursor({ profile }) {
  const settings = crosshairSettings(profile || {});
  const [visible, setVisible] = useState(false);
  const [hoveringClickable, setHoveringClickable] = useState(false);
  const cursorRef = useRef(null);
  const posRef = useRef({ x: -100, y: -100 });
  const rafRef = useRef(0);

  const imgSrc = settings.image ? fileUrl(settings.image) : "";

  useEffect(() => {
    if (!imgSrc || typeof window === "undefined") return undefined;

    // Check if device has fine pointer (mouse/trackpad, not touch)
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;
    if (!isFinePointer) return undefined;

    // Hide default cursor across the page
    document.body.classList.add("custom-cursor-active");

    const onPointerMove = (e) => {
      posRef.current.x = e.clientX;
      posRef.current.y = e.clientY;

      if (!visible) setVisible(true);

      // Check if hovering clickable element
      const target = e.target;
      if (target && (target.closest("a, button, [role=button], input, textarea, select, label, .cursor-pointer"))) {
        setHoveringClickable(true);
      } else {
        setHoveringClickable(false);
      }

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          if (cursorRef.current) {
            cursorRef.current.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0) translate(-50%, -50%) scale(${
              hoveringClickable ? 1.15 : 1
            })`;
          }
          rafRef.current = 0;
        });
      }
    };

    const onPointerLeave = () => {
      setVisible(false);
    };

    const onPointerEnter = () => {
      setVisible(true);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("mouseleave", onPointerLeave);
    document.addEventListener("mouseenter", onPointerEnter);

    return () => {
      document.body.classList.remove("custom-cursor-active");
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("mouseleave", onPointerLeave);
      document.removeEventListener("mouseenter", onPointerEnter);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [imgSrc, visible, hoveringClickable]);

  if (!imgSrc) return null;

  // Normal cursor base dimension: 28px, scaled between 16px and 48px
  const baseSize = 28;
  const currentScale = settings.scale || 1;
  const sizePx = Math.round(Math.max(16, Math.min(64, baseSize * currentScale)));

  return (
    <div
      ref={cursorRef}
      data-testid="custom-cursor-follower"
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[999999] select-none will-change-transform"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 120ms ease-out, transform 40ms linear",
        width: `${sizePx}px`,
        height: `${sizePx}px`,
        transform: `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0) translate(-50%, -50%)`,
      }}
    >
      <img
        src={imgSrc}
        alt=""
        className="w-full h-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
        style={{ pointerEvents: "none" }}
      />
    </div>
  );
}

export default CustomCursor;
