import { useAuth } from "@/context/AuthContext";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Eye, Award, Link2, BarChart3 } from "lucide-react";

export default function Stats() {
  const { user } = useAuth();
  const views = user.views || 0;
  // Build a simple 7-day trend from the real total (no backend time-series yet).
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const data = days.map((d, i) => ({ day: d, views: Math.round((views / 7) * (0.6 + (i / 10))) }));
  const stats = [
    { icon: Eye, label: "Total views", value: views.toLocaleString() },
    { icon: Award, label: "Badges", value: (user.badges || []).length },
    { icon: Link2, label: "Links", value: (user.profile?.links || []).length },
    { icon: BarChart3, label: "Widgets", value: (user.profile?.widgets || []).length },
  ];

  return (
    <div data-testid="stats-page">
      <div className="flex items-center gap-2.5 mb-8"><BarChart3 className="w-6 h-6 text-brand-400" /><h1 className="font-display text-2xl font-black text-zinc-50">Stats</h1></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-2xl p-5"><s.icon className="w-5 h-5 text-brand-400 mb-4" /><div className="font-display text-3xl font-extrabold tabular-nums text-zinc-50">{s.value}</div><div className="text-xs text-zinc-500 mt-1">{s.label}</div></div>
        ))}
      </div>
      <div className="glass rounded-3xl p-7">
        <div className="text-base font-semibold text-zinc-200 mb-5">Views this week</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A48DF4" stopOpacity={0.5} /><stop offset="100%" stopColor="#A48DF4" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="day" stroke="#52525b" fontSize={12} />
              <Tooltip contentStyle={{ background: "#131316", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} />
              <Area type="monotone" dataKey="views" stroke="#A48DF4" strokeWidth={2} fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-zinc-500 mt-4">Trend is estimated from your total views. Connect your backend for real time-series analytics (see BACKEND_README).</p>
      </div>
    </div>
  );
}
