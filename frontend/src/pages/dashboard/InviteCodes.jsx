import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";
import { Ticket, Plus, Trash2, Copy, Check, Crown, Loader2, Award } from "lucide-react";
import { BADGE_CATALOG } from "@/constants/badges";

/* The badges a code may carry. Mirrors STAFF_GRANTABLE_BADGES in
   backend/badges.js: staff-only ids (owner/admin) are not on a code, ever. */
const GRANTABLE_BADGES = BADGE_CATALOG.filter((b) => !["owner", "admin"].includes(b.id));

export default function InviteCodes() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  // A code can hand the account it creates a paid tier — now WITH DURATION:
  // premium_days turns the grant into a self-expiring trial, enforced by the
  // backend on every authenticated request past the deadline. Blank = permanent.
  const [grantsPremium, setGrantsPremium] = useState(false);
  const [premiumDays, setPremiumDays] = useState("");
  // …and badges. Redeeming the code puts these on the account — at sign-up or
  // later from the dashboard's Redeem card.
  const [grantsBadges, setGrantsBadges] = useState([]);
  const toggleBadge = (id) =>
    setGrantsBadges((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  const fetchInvites = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/invites");
      setInvites(data);
    } catch {
      toast.error("Failed to load invite codes");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  const createInvite = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post("/admin/invites", {
        code: code.trim() || undefined,
        max_uses: maxUses,
        grants_tier: grantsPremium ? "premium" : null,
        premium_days: grantsPremium && premiumDays ? Number(premiumDays) : null,
        grants_badges: grantsBadges,
      });
      setInvites([data, ...invites]);
      setCode("");
      const extras = [
        grantsPremium ? `Premium${premiumDays ? ` for ${premiumDays} days` : " permanently"}` : null,
        grantsBadges.length ? `${grantsBadges.length} badge${grantsBadges.length === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      setGrantsBadges([]);
      toast.success(
        extras.length
          ? `Invite code ${data.code} created — it grants ${extras.join(" + ")}!`
          : `Invite code ${data.code} created!`,
      );
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create code");
    }
    setCreating(false);
  };

  const deleteInvite = async (c) => {
    try {
      await api.delete(`/admin/invites/${c}`);
      setInvites(invites.filter((x) => x.code !== c));
      toast.success("Invite code deleted");
    } catch {
      toast.error("Failed to delete invite code");
    }
  };

  const copyToClipboard = (c) => {
    navigator.clipboard.writeText(c);
    setCopiedCode(c);
    toast.success(`Copied ${c} to clipboard`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-5" data-testid="invite-codes-page">
      <div>
        <h1 className="font-display text-2xl font-black text-zinc-50 flex items-center gap-2.5">
          <Ticket className="w-6 h-6 text-brand-400" /> Invite Code Generator
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Create single-use or unlimited registration codes for exclusive or invite-only community onboarding.
          A code can also hand the new account Premium.
        </p>
      </div>

      <div className="glass rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-brand-400" /> Generate New Invite Code
        </h2>
        <form onSubmit={createInvite} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="text"
            placeholder="Custom code (e.g. VIP2026, or leave blank)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50 uppercase font-mono2"
          />
          <input
            type="number"
            min="1"
            max="1000"
            placeholder="Max uses (default 1)"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50"
          />
          <label
            className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Crown className={`h-4 w-4 shrink-0 ${grantsPremium ? "text-brand-400" : "text-zinc-500"}`} />
              Grants Premium
            </span>
            <input
              type="checkbox"
              data-testid="invite-grants-premium"
              checked={grantsPremium}
              onChange={(e) => setGrantsPremium(e.target.checked)}
              className="sr-only peer"
            />
            <span className="relative h-6 w-11 shrink-0 rounded-full bg-zinc-800 transition-colors peer-checked:bg-brand-600 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
          </label>
          {grantsPremium && (
            <input
              type="number"
              min="1"
              max="365"
              data-testid="invite-premium-days"
              placeholder="Duration in days (blank = permanent)"
              value={premiumDays}
              onChange={(e) => setPremiumDays(e.target.value)}
              className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50"
            />
          )}
          <button
            type="submit"
            disabled={creating}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold hover:brightness-110 transition flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create Code
          </button>

          {/* Badges the code hands out. Sits on its own row under the form so a
              long catalog never squeezes the code/uses inputs. */}
          <div className="sm:col-span-2 lg:col-span-4" data-testid="invite-badges">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-400">
              <Award className="h-3.5 w-3.5" /> Badges this code grants
              <span className="font-normal text-zinc-600">(optional)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {GRANTABLE_BADGES.map((badge) => {
                const on = grantsBadges.includes(badge.id);
                return (
                  <button
                    key={badge.id}
                    type="button"
                    onClick={() => toggleBadge(badge.id)}
                    aria-pressed={on}
                    data-testid={`invite-badge-${badge.id}`}
                    title={badge.desc}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                      on
                        ? "border-brand-400/50 bg-brand-500/20 text-brand-100"
                        : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                    }`}
                  >
                    {badge.name}
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </div>

      {/* Six columns do not fit a phone, and the card clips what overflows —
          which quietly put the revoke button out of reach. The table scrolls
          sideways inside the card instead, as the users roster already does. */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm text-zinc-300">
            <thead className="bg-white/[0.02] text-xs font-mono2 uppercase tracking-wider text-zinc-500 border-b border-white/5">
              <tr>
                <th className="px-5 py-3">Invite Code</th>
                <th className="px-5 py-3">Grants</th>
                <th className="px-5 py-3">Uses</th>
                <th className="px-5 py-3">Max Allowed</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-zinc-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-400" /> Loading codes...
                  </td>
                </tr>
              ) : invites.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-zinc-500">No invite codes generated yet.</td>
                </tr>
              ) : (
                invites.map((inv) => (
                  <tr
                  key={inv.code}
                  /* Right-click a code to copy it, which is the only thing anyone
                     wants from this row. */
                  data-menu-id="invite"
                  data-menu-invite={inv.code}
                  className="hover:bg-white/[0.02] transition"
                >
                    <td className="px-5 py-3.5 font-mono2 font-bold text-brand-300 flex items-center gap-2">
                      {inv.code}
                      <button
                        onClick={() => copyToClipboard(inv.code)}
                        className="text-zinc-500 hover:text-zinc-300 p-1"
                        title="Copy"
                      >
                        {copiedCode === inv.code ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {inv.grants_tier === "premium" && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-300">
                            <Crown className="h-3 w-3" />
                            {inv.premium_days ? `Premium trial · ${inv.premium_days}d` : "Premium permanent"}
                          </span>
                        )}
                        {(inv.grants_badges || []).map((id) => (
                          <span
                            key={id}
                            className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-200"
                          >
                            {BADGE_CATALOG.find((b) => b.id === id)?.name || id}
                          </span>
                        ))}
                        {inv.grants_tier !== "premium" && !(inv.grants_badges || []).length && (
                          <span className="text-xs text-zinc-500">Standard</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono2 text-xs text-zinc-300">{inv.uses || 0}</td>
                    <td className="px-5 py-3.5 font-mono2 text-xs text-zinc-400">{inv.max_uses || "Unlimited"}</td>
                    <td className="px-5 py-3.5 text-xs text-zinc-500">
                      {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : "Active"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => deleteInvite(inv.code)}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-200 transition"
                        title="Revoke Code"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
