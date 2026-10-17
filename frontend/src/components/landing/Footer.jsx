import { Link } from "react-router-dom";
import { Logo } from "./Navbar";
import { CONTACT_EMAIL } from "@/lib/api";

const COLS = [
  { title: "Product", links: [["Features", "/!/home"], ["Pricing", "/!/pricing"], ["Explore", "/!/explore"], ["Docs", "/!/docs"]] },
  { title: "Legal", links: [["Terms of Service", "/!/legal"], ["Privacy Policy", "/!/legal"], ["Refund Policy", "/!/legal"], ["DMCA", "/!/legal"]] },
  { title: "Community", links: [["Discord", "https://discord.gg/a9uwptuepD"], ["Twitter / X", "https://twitter.com"], ["Contact", `mailto:${CONTACT_EMAIL}`]] },
];

export const Footer = () => (
  <footer data-testid="site-footer" className="relative mt-10 border-t border-white/5 px-4 pt-14 pb-8 overflow-hidden">
    <div className="pointer-events-none absolute -bottom-24 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-brand-700/6 blur-[130px] rounded-full" />
    <div className="relative max-w-6xl mx-auto">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <Logo />
          <p className="mt-4 text-sm text-zinc-500 max-w-xs">The #1 home for your digital identity. Build a page the whole internet remembers.</p>
          <div className="mt-4 inline-flex items-center gap-2 text-xs text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> All systems operational
          </div>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <div className="text-xs font-mono2 uppercase tracking-wider text-zinc-500 mb-4">{c.title}</div>
            <ul className="space-y-2.5">
              {c.links.map(([label, to]) => (
                <li key={label}>
                  {to.startsWith("http") ? (
                    <a href={to} target="_blank" rel="noreferrer" className="text-sm text-zinc-400 hover:text-zinc-100 transition">{label}</a>
                  ) : (
                    <Link to={to} className="text-sm text-zinc-400 hover:text-zinc-100 transition">{label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-14 relative select-none">
        <div className="font-display font-black text-[18vw] leading-none text-center bg-gradient-to-b from-zinc-800/80 to-transparent bg-clip-text text-transparent">swats.bio</div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
        <span>© {new Date().getFullYear()} swats.bio — All rights reserved.</span>
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-mono2 hover:text-zinc-300 transition">{CONTACT_EMAIL}</a>
      </div>
    </div>
  </footer>
);
