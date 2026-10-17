import { useState } from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export const Logo = ({ size = "text-lg" }) => (
  <Link to="/" data-testid="nav-logo" className="flex items-center gap-2 group">
    <img src="/logo.png" alt="swats.bio" className="w-8 h-8 rounded-lg object-contain group-hover:scale-105 transition-transform" />
    <span className={`font-display font-extrabold tracking-tight text-zinc-100 ${size}`}>
      swats<span className="text-brand-400">.bio</span>
    </span>
  </Link>
);

// The pill is centred and narrow, so this stays short. Devlog sits second
// because it is the thing people come back for after their first visit.
const NAV = [
  { label: "Home", to: "/!/home" },
  { label: "Explore", to: "/!/explore" },
  { label: "Ranked", to: "/!/ranked" },
  { label: "Legal", to: "/!/legal" },
  { label: "Pricing", to: "/!/pricing" },
];

export const Navbar = () => {
  const [open, setOpen] = useState(false);
  const { user } = useAuth() || {};
  const loggedIn = user && user !== null && user !== false;
  return (
    <header className="fixed top-3 sm:top-5 inset-x-0 z-50 flex justify-center px-3">
      <nav
        data-testid="top-pill-navbar"
        className="glass rounded-full w-full max-w-4xl px-3 sm:px-5 py-2.5 flex items-center justify-between shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
      >
        <Logo />

        <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              data-testid={`nav-link-${n.label.toLowerCase()}`}
              className="px-4 py-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-100 rounded-full hover:bg-white/5 transition-colors"
            >
              {n.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {loggedIn ? (
            <Link
              to="/!/dashboard"
              data-testid="nav-dashboard-btn"
              className="px-4 py-1.5 text-sm font-semibold rounded-full bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:brightness-110 transition shadow-[0_0_20px_rgba(164, 141, 244,0.4)]"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/!/login"
              data-testid="nav-login-btn"
              className="px-4 py-1.5 text-sm font-semibold rounded-full bg-zinc-100 text-zinc-900 hover:bg-white transition"
            >
              Login / Register
            </Link>
          )}
          <button
            data-testid="nav-mobile-toggle"
            className="md:hidden p-2 text-zinc-300"
            onClick={() => setOpen(!open)}
          >
            <span className="block w-5 h-0.5 bg-current mb-1" />
            <span className="block w-5 h-0.5 bg-current" />
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden absolute top-16 glass-strong rounded-2xl p-3 w-[90%] max-w-sm flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              onClick={() => setOpen(false)}
              className="px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/5 rounded-lg"
            >
              {n.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
};
