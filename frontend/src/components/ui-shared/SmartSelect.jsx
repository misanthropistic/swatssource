import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/* ---------------------------------------------------------------------------
   SmartSelect — a styled dropdown that replaces native <select>.

   Native selects can't be themed: the popup list is drawn by the OS, so a
   carefully styled dark UI still opened a light system menu (and on Windows a
   grey one), which is the "popup menu" jank this fixes. A native <select> also
   can't show an icon or a check per row.

   Keyboard model follows the ARIA listbox pattern:
     closed:  Enter / Space / ArrowDown / ArrowUp open
     open:    ArrowUp/Down move, Home/End jump, Enter/Space commit, Esc close
   Clicking outside closes. Nothing is portalled, so it stays inside the normal
   DOM (testable with querySelector and correctly clipped by its container).
   --------------------------------------------------------------------------- */

export function SmartSelect({
  value,
  onChange,
  options = [],
  testid,
  ariaLabel,
  placeholder = "Select…",
  className = "",
  align = "left",
  size = "md",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );
  const rootRef = useRef(null);

  const selected = options.find((o) => o.value === value);

  // Close on outside click. Bound only while open so a closed select costs
  // nothing on a page that has twenty of them.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  const commit = (opt) => {
    if (!opt) return;
    onChange?.(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(options[active]);
    }
  };

  const pad = size === "sm" ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-sm";

  return (
    <div ref={rootRef} className={`relative ${className}`} data-testid={testid}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-left outline-none transition-colors duration-200 hover:border-white/20 focus-visible:border-brand-500/60 focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50 ${pad}`}
      >
        <span className={`truncate ${selected ? "text-zinc-200" : "text-zinc-500"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute z-50 mt-1.5 max-h-64 min-w-full overflow-y-auto rounded-xl border border-white/10 bg-[#0b0b0d]/98 p-1 shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => commit(o)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-xs transition-colors duration-100 ${
                    i === active ? "bg-brand-500/20 text-brand-100" : "text-zinc-300 hover:bg-white/[0.06]"
                  }`}
                >
                  {o.icon}
                  <span className="truncate">{o.label}</span>
                  {isSelected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-brand-300" />}
                </button>
              </li>
            );
          })}
          {options.length === 0 && (
            <li className="px-2.5 py-2 text-xs text-zinc-500">No options</li>
          )}
        </ul>
      )}
    </div>
  );
}

export default SmartSelect;
