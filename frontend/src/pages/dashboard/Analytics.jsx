import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { LineChart, Users, Eye, Crown, TrendingUp } from "lucide-react";

// Renders "—" rather than a made-up number when the API has not answered.
const num = (n) => (typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "—");

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/admin/analytics")
      .then(({ data: d }) => setData(d && typeof d === "object" ? d : {}))
      .catch(() => setError("Could not load analytics."));
  }, []);

  const total = data?.total_users;
  const premium = data?.premium_users;
  const conversion =
    typeof total === "number" && total > 0 && typeof premium === "number"
      ? `${((premium / total) * 100).toFixed(1)}%`
      : "—";

  // The API returns [{ day, signups }]; nothing here is synthesised.
  const signups = Array.isArray(data?.recent_signups) ? data.recent_signups : [];
  const peak = Math.max(1, ...signups.map((s) => Number(s.signups) || 0));

  const cards = [
    { label: "Total Accounts", value: num(total), Icon: Users, tone: "text-brand-400" },
    { label: "Total Impressions", value: num(data?.total_views), Icon: Eye, tone: "text-brand-400" },
    { label: "Premium Subscribers", value: num(premium), Icon: Crown, tone: "text-amber-400" },
    { label: "Premium Conversion", value: conversion, Icon: TrendingUp, tone: "text-emerald-400" },
  ];

  return (
    <div className="space-y-10" data-testid="analytics-page">
      <div>
        <h1 className="font-display text-2xl font-black text-zinc-50 flex items-center gap-2.5">
          <LineChart className="w-6 h-6 text-brand-400" /> Platform Analytics
        </h1>
        <p className="text-sm text-zinc-500 mt-1.5">
          Every figure below is read from the database.
        </p>
      </div>

      {error && (
        <div className="glass rounded-2xl border border-amber-500/25 p-5 text-sm text-amber-300">{error}</div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((c) => (
          <div key={c.label} className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between text-zinc-500 mb-4">
              <span className="text-xs font-mono2 uppercase tracking-wider">{c.label}</span>
              <c.Icon className={`w-4 h-4 ${c.tone}`} />
            </div>
            <div className="font-display text-3xl font-black tabular-nums text-zinc-100">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="glass rounded-3xl p-7">
        <h3 className="font-display text-lg font-bold text-zinc-100">Signups</h3>
        <p className="text-xs text-zinc-500 mt-1.5 mb-6">New accounts per day over the last 30 days.</p>

        {signups.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-zinc-500">
            No signups recorded in the last 30 days yet.
          </div>
        ) : (
          <div className="flex h-56 w-full items-end gap-1.5">
            {signups.map((s) => {
              const v = Number(s.signups) || 0;
              return (
                <div
                  key={String(s.day)}
                  className="group flex h-full flex-1 flex-col items-center gap-2"
                  title={`${v} signups on ${s.day}`}
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-brand-600/40 to-brand-500 transition-colors duration-200 group-hover:brightness-125"
                      style={{ height: `${Math.max(4, (v / peak) * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono2 text-[10px] text-zinc-600">
                    {new Date(s.day).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
