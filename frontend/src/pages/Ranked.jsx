import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Eye, BadgeCheck, Crown, Medal, User, Loader2 } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { api, fileUrl } from "@/lib/api";

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n || 0));
const MEDAL = { 1: "text-amber-300", 2: "text-zinc-300", 3: "text-orange-400" };

const Row = ({ u, onOpen }) => (
  <motion.button
    layout
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    data-testid={`ranked-row-${u.username}`}
    onClick={() => onOpen(u)}
    className={`group w-full flex items-center gap-4 px-4 sm:px-5 py-3.5 rounded-xl glass border transition-all text-left hover:-translate-y-0.5 ${u.rank <= 3 ? "border-brand-500/30 bg-brand-500/[0.04]" : "border-white/5 hover:border-brand-500/30"}`}
  >
    <div className={`w-9 shrink-0 text-center font-display text-lg font-black ${MEDAL[u.rank] || "text-zinc-500"}`}>
      {u.rank <= 3 ? <Medal className={`w-5 h-5 mx-auto ${MEDAL[u.rank]}`} /> : u.rank}
    </div>
    <div className="w-11 h-11 rounded-xl glass-strong border border-white/15 overflow-hidden flex items-center justify-center text-zinc-400 shrink-0">
      {u.avatar ? <img src={fileUrl(u.avatar)} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5" />}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <span className="truncate font-semibold text-zinc-100 group-hover:text-brand-300 transition">{u.display_name}</span>
        {u.verified && <BadgeCheck className="w-4 h-4 text-brand-400 shrink-0" />}
        {u.tier === "premium" && <span className="px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-300 text-[10px] font-mono2">PRO</span>}
      </div>
      <div className="truncate font-mono2 text-xs text-zinc-500">swats.bio/{u.username}</div>
    </div>
    <div className="shrink-0 text-right">
      <div className="inline-flex items-center gap-1.5 font-display font-bold text-zinc-100"><Eye className="w-4 h-4 text-brand-400" /> {fmt(u.views)}</div>
      <div className="text-[11px] text-zinc-500">views</div>
    </div>
  </motion.button>
);

export default function Ranked() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/ranked", { params: { limit: 100 } })
      .then(({ data }) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen sw-page-bg text-zinc-100 grain" data-testid="ranked-page">
      <Navbar />
      <main className="relative z-10 max-w-3xl mx-auto px-4 pt-36 pb-20">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs font-mono2 text-amber-300"><Trophy className="h-3.5 w-3.5" /> Global ranking</div>
          <h1 className="mt-4 font-display text-4xl sm:text-5xl font-black text-zinc-50">Leaderboard</h1>
          <p className="mt-3 text-sm text-zinc-500">Every page ranked by real, validated profile views. Climb by sharing your page and getting seen.</p>
        </div>
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-brand-400 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div data-testid="ranked-empty" className="text-center py-20 text-zinc-500">
            <Crown className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No ranked pages yet — claim a handle and start climbing.</p>
          </div>
        ) : (
          <div data-testid="ranked-list" className="space-y-2">
            {items.map((u) => <Row key={u.id} u={u} onOpen={(x) => navigate(`/${x.username}`)} />)}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
