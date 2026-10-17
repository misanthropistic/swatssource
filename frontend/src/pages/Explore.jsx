import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Eye, BadgeCheck, ExternalLink, Link2, User, Loader2 } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { api, fileUrl, profileUrl } from "@/lib/api";
import { toast } from "sonner";

const FILTERS = [
  { key: "views", label: "Most viewed" },
  { key: "new", label: "Newest" },
];
const TIERS = [
  { key: "", label: "All" },
  { key: "premium", label: "Premium" },
  { key: "free", label: "Free" },
];

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

const ProfileCard = ({ u, onOpen }) => {
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(profileUrl(u.username));
    toast.success("Profile link copied");
  };
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      data-testid={`explore-card-${u.username}`}
      onClick={() => onOpen(u)}
      className="group relative rounded-2xl glass border border-white/10 overflow-hidden cursor-pointer hover:border-brand-500/40 hover:-translate-y-1 transition-all duration-300"
    >
      <div className="h-24 w-full bg-gradient-to-br from-brand-600/30 to-brand-900/20 overflow-hidden">
        {u.banner ? (
          <img src={fileUrl(u.banner)} alt="" className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" />
        ) : null}
      </div>
      <div className="px-5 pb-5 -mt-8">
        <div className="w-16 h-16 rounded-2xl glass-strong border border-white/15 overflow-hidden flex items-center justify-center text-zinc-400">
          {u.avatar ? <img src={fileUrl(u.avatar)} alt={u.display_name} className="w-full h-full object-cover" /> : <User className="w-7 h-7" />}
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <h3 className="font-display font-bold text-zinc-100 truncate">{u.display_name}</h3>
          {u.verified && <BadgeCheck className="w-4 h-4 text-brand-400 shrink-0" />}
        </div>
        <p className="text-xs font-mono2 text-zinc-500">swats.bio/{u.username}</p>
        {u.bio && <p className="mt-2 text-sm text-zinc-400 line-clamp-2 leading-relaxed">{u.bio}</p>}
        <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {fmt(u.views)}</span>
          {u.tier === "premium" && <span className="px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 font-mono2">PRO</span>}
        </div>
      </div>

      {/* Contextual hover popup menu */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 translate-y-3 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-300">
        <div className="glass-strong border border-white/10 rounded-xl p-1.5 flex items-center gap-1 shadow-2xl">
          <button data-testid={`explore-view-${u.username}`} onClick={(e) => { e.stopPropagation(); onOpen(u); }} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:brightness-110 transition">
            <ExternalLink className="w-3.5 h-3.5" /> View
          </button>
          <button data-testid={`explore-copy-${u.username}`} onClick={copy} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-200 hover:bg-white/10 transition">
            <Link2 className="w-3.5 h-3.5" /> Copy
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default function Explore() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("views");
  const [tier, setTier] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/explore", { params: { q: q.trim(), sort, tier, limit: 60 } });
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, sort, tier]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const open = (u) => navigate(`/${encodeURIComponent(u.username)}`);

  return (
    <div className="min-h-screen sw-page-bg text-zinc-100 grain" data-testid="explore-page">
      <Navbar />
      <main className="relative z-10 max-w-6xl mx-auto px-4 pt-36 pb-20">
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl sm:text-5xl font-black text-zinc-50">Explore</h1>
          <p className="mt-3 text-sm text-zinc-500">Discover creators across swats.bio. Search, filter and jump straight to a profile.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="flex-1 glass-strong rounded-full flex items-center px-5 py-2.5 border border-white/10 focus-within:border-brand-500/50 transition">
            <Search className="w-4 h-4 text-zinc-500 mr-3" />
            <input
              data-testid="explore-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or username…"
              className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder-zinc-600"
            />
          </div>
          <div className="flex items-center gap-1.5 glass rounded-full p-1.5 border border-white/10">
            {FILTERS.map((f) => (
              <button key={f.key} data-testid={`explore-sort-${f.key}`} onClick={() => setSort(f.key)} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${sort === f.key ? "bg-brand-500 text-white" : "text-zinc-400 hover:text-zinc-100"}`}>{f.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 glass rounded-full p-1.5 border border-white/10">
            {TIERS.map((t) => (
              <button key={t.key || "all"} data-testid={`explore-tier-${t.key || "all"}`} onClick={() => setTier(t.key)} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${tier === t.key ? "bg-brand-500 text-white" : "text-zinc-400 hover:text-zinc-100"}`}>{t.label}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-brand-400 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div data-testid="explore-empty" className="text-center py-20 text-zinc-500">
            <User className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No profiles found. Try a different search.</p>
          </div>
        ) : (
          <div data-testid="explore-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((u) => <ProfileCard key={u.id} u={u} onOpen={open} />)}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
