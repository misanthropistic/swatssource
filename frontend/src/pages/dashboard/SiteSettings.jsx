import { useState, useEffect } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "@/lib/notify";
import {
  SlidersHorizontal, ShieldAlert, ShieldCheck, UserPlus, Save, Loader2, LogIn,
  Trophy, Plus, Trash2, Eye, Shield, Lock, FileUp, Sparkles, Globe, Laptop,
} from "lucide-react";
import AnnouncementManager from "@/components/AnnouncementManager";

export default function SiteSettings() {
  const [settings, setSettings] = useState({
    registration_open: true,
    maintenance_mode: false,
    invite_only: false,
    announcement: "",
    auth_required_to_edit: false,
    discord_required: false,
    // Advanced platform security & customization controls
    force_2fa_staff: false,
    rate_limiting_enabled: true,
    session_duration_days: 30,
    allow_custom_cursors: true,
    allow_embeds: true,
    max_upload_mb: 25,
    max_links: 30,
    default_meta_title: "swats.bio — personal links & bio pages",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rewards, setRewards] = useState({ enabled: false, milestones: [] });
  const [rewardsSaving, setRewardsSaving] = useState(false);

  useEffect(() => {
    api.get("/admin/site")
      .then(({ data }) => setSettings((prev) => ({ ...prev, ...(data || {}) })))
      .catch(() => {})
      .finally(() => setLoading(false));
    api.get("/admin/rewards-settings")
      .then(({ data }) => setRewards({ enabled: !!data.enabled, milestones: data.milestones || [] }))
      .catch(() => {});
  }, []);

  const rewardProblems = rewards.milestones
    .map((m, i) => {
      const views = parseInt(m.views, 10);
      const days = parseInt(m.premium_days, 10);
      if (!Number.isFinite(views) || views < 1) return `Milestone ${i + 1}: enter a view count of 1 or more`;
      if (!Number.isFinite(days) || days < 1) return `Milestone ${i + 1}: enter 1 day or more`;
      if (days > 365) return `Milestone ${i + 1}: at most 365 days`;
      return null;
    })
    .filter(Boolean);

  const saveRewards = async () => {
    if (rewardProblems.length) {
      toast.error(rewardProblems[0]);
      return;
    }
    setRewardsSaving(true);
    try {
      const { data } = await api.put("/admin/rewards-settings", rewards);
      setRewards({ enabled: !!data.enabled, milestones: data.milestones || [] });
      toast.success("View rewards saved");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail) || "Failed to save view rewards");
    }
    setRewardsSaving(false);
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/admin/site", settings);
      toast.success("Site settings saved successfully");
    } catch {
      toast.error("Failed to update site settings");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="site-settings-page">
      <div>
        <h1 className="font-display text-2xl font-black text-zinc-50 flex items-center gap-2.5">
          <SlidersHorizontal className="w-6 h-6 text-brand-400" /> Platform Site Settings
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Configure registration availability, access gates, security policies, media limits, and global broadcasts.
        </p>
      </div>

      <form onSubmit={saveSettings} className="space-y-6">
        {/* Core Access & Security Gates */}
        <div className="glass rounded-3xl p-6 space-y-5 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-2 text-zinc-100 font-bold text-sm uppercase tracking-wider font-mono2">
            <Shield className="w-4 h-4 text-brand-400" /> Access & Authentication Gates
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-brand-400" /> Public Registration
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">Allow new visitors to register freely without invitation restrictions</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={!!settings.registration_open}
                onChange={(e) => setSettings({ ...settings, registration_open: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" /> Require Invite Code for Registration
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">Only users who hold an active, valid invite code will be permitted to register</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={!!settings.invite_only}
                onChange={(e) => setSettings({ ...settings, invite_only: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" /> Emergency Maintenance Mode
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">Temporarily show maintenance lock screen to all non-admin visitors across the website</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={!!settings.maintenance_mode}
                onChange={(e) => setSettings({ ...settings, maintenance_mode: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-400" /> Auth check — require Discord to edit profiles
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Accounts without Discord linked can sign in and keep their page, but cannot save profile
                edits until they connect Discord once. Admins and the owner are never blocked.
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                data-testid="site-auth-required-to-edit"
                checked={!!settings.auth_required_to_edit}
                onChange={(e) => setSettings({ ...settings, auth_required_to_edit: e.target.checked })}
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <LogIn className="w-4 h-4 text-brand-300" /> Require Discord to sign in or sign up
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                New accounts can only be created with Discord, and password sign-in is refused for accounts with no
                Discord link — they sign in with Discord instead. Admins and the owner are exempt.
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                data-testid="site-discord-required"
                checked={!!settings.discord_required}
                onChange={(e) => setSettings({ ...settings, discord_required: e.target.checked })}
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
            </label>
          </div>
        </div>

        {/* Security & Threat Protection Policies */}
        <div className="glass rounded-3xl p-6 space-y-5 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-2 text-zinc-100 font-bold text-sm uppercase tracking-wider font-mono2">
            <Lock className="w-4 h-4 text-emerald-400" /> Security Policies & Hardening
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Mandatory 2FA for Staff & Admins
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">Enforce TOTP authenticator setup for all administrator and team accounts</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={!!settings.force_2fa_staff}
                onChange={(e) => setSettings({ ...settings, force_2fa_staff: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Laptop className="w-4 h-4 text-emerald-400" /> Global API Rate Limiter
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">Protect backend endpoints from credential stuffing, rapid bot crawling, and DDoS spikes</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={settings.rate_limiting_enabled !== false}
                onChange={(e) => setSettings({ ...settings, rate_limiting_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="h-px bg-white/5" />

          <div className="grid sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1.5">Max Session Lifespan</label>
              <select
                value={settings.session_duration_days || 30}
                onChange={(e) => setSettings({ ...settings, session_duration_days: Number(e.target.value) })}
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 outline-none focus:border-brand-500/50 transition cursor-pointer"
              >
                <option value={7} className="bg-zinc-900 text-zinc-100">7 Days (High Security)</option>
                <option value={14} className="bg-zinc-900 text-zinc-100">14 Days</option>
                <option value={30} className="bg-zinc-900 text-zinc-100">30 Days (Standard)</option>
                <option value={90} className="bg-zinc-900 text-zinc-100">90 Days (Extended)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1.5">Max Media Upload Limit</label>
              <select
                value={settings.max_upload_mb || 25}
                onChange={(e) => setSettings({ ...settings, max_upload_mb: Number(e.target.value) })}
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 outline-none focus:border-brand-500/50 transition cursor-pointer"
              >
                <option value={10} className="bg-zinc-900 text-zinc-100">10 MB</option>
                <option value={25} className="bg-zinc-900 text-zinc-100">25 MB (Recommended)</option>
                <option value={50} className="bg-zinc-900 text-zinc-100">50 MB</option>
                <option value={100} className="bg-zinc-900 text-zinc-100">100 MB (Enterprise)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Profile Customization Governance */}
        <div className="glass rounded-3xl p-6 space-y-5 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-2 text-zinc-100 font-bold text-sm uppercase tracking-wider font-mono2">
            <Sparkles className="w-4 h-4 text-purple-400" /> Profile Customization Rules
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-100">Allow Custom Animated Cursors</div>
              <div className="text-xs text-zinc-400 mt-0.5">Permit members to upload custom animated GIF / PNG cursors on public bios</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={settings.allow_custom_cursors !== false}
                onChange={(e) => setSettings({ ...settings, allow_custom_cursors: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-100">Allow Third-Party Music & Widget Embeds</div>
              <div className="text-xs text-zinc-400 mt-0.5">Permit members to embed Spotify, SoundCloud, YouTube and Discord live cards</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={settings.allow_embeds !== false}
                onChange={(e) => setSettings({ ...settings, allow_embeds: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          <div className="h-px bg-white/5" />

          <div>
            <label className="text-xs font-semibold text-zinc-300 block mb-1.5">Default SEO Title Template</label>
            <input
              type="text"
              placeholder="swats.bio — personal links & bio pages"
              value={settings.default_meta_title || ""}
              onChange={(e) => setSettings({ ...settings, default_meta_title: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50 transition font-mono2 text-xs"
            />
          </div>
        </div>

        {/* Real announcement system */}
        <AnnouncementManager />

        <div className="glass rounded-2xl p-5">
          <div className="text-sm font-semibold text-zinc-100 mb-2">Fallback banner text</div>
          <p className="text-xs text-zinc-500 mb-3">
            Shown only while no announcement above is live. Kept so an announcement written before the new system
            existed does not disappear.
          </p>
          <input
            type="text"
            data-testid="site-fallback-announcement"
            placeholder="e.g. Welcome to swats.bio v2! Join our official Discord for giveaways."
            value={settings.announcement || ""}
            onChange={(e) => setSettings({ ...settings, announcement: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50 transition"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold hover:brightness-110 transition flex items-center gap-2 shadow-[0_0_20px_rgba(255,127,188,0.3)]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Site Settings
          </button>
        </div>
      </form>

      {/* The view-milestone reward system */}
      <div className="glass rounded-2xl p-5" data-testid="rewards-settings">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-300" /> View Rewards
            </div>
            <div className="text-xs text-zinc-500">
              At each lifetime-views milestone, the account receives a free Premium trial for the days you set — automatically.
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              data-testid="rewards-enabled"
              checked={rewards.enabled}
              onChange={(e) => setRewards({ ...rewards, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
          </label>
        </div>

        {rewards.enabled && (
          <div className="mt-4 space-y-2">
            {rewards.milestones.length === 0 && (
              <p className="text-xs text-zinc-600">No milestones yet — add the first crossover.</p>
            )}
            {rewards.milestones.map((m, i) => (
              <div key={i} className="flex items-center gap-2" data-testid={`reward-row-${i}`}>
                <Eye className="h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="number"
                  min="1"
                  placeholder="Views"
                  value={m.views}
                  onChange={(e) =>
                    setRewards({
                      ...rewards,
                      milestones: rewards.milestones.map((x, j) => (j === i ? { ...x, views: e.target.value } : x)),
                    })
                  }
                  className="w-32 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50"
                />
                <span className="text-xs text-zinc-500">views →</span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  placeholder="Days"
                  value={m.premium_days}
                  onChange={(e) =>
                    setRewards({
                      ...rewards,
                      milestones: rewards.milestones.map((x, j) => (j === i ? { ...x, premium_days: e.target.value } : x)),
                    })
                  }
                  className="w-24 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50"
                />
                <span className="text-xs text-zinc-500">days of Premium</span>
                <button
                  type="button"
                  onClick={() => setRewards({ ...rewards, milestones: rewards.milestones.filter((_, j) => j !== i) })}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition"
                  title="Remove milestone"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              data-testid="rewards-add-milestone"
              onClick={() => setRewards({ ...rewards, milestones: [...rewards.milestones, { views: 1000, premium_days: 3 }] })}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-500/40 bg-brand-500/12 px-3 py-2 text-xs font-semibold text-brand-200 transition hover:bg-brand-500/25"
            >
              <Plus className="h-3.5 w-3.5" /> Add milestone
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[11px] text-amber-300/80" data-testid="rewards-problems">
            {rewardProblems[0] || ""}
          </p>
          <button
            type="button"
            data-testid="rewards-save"
            onClick={saveRewards}
            disabled={rewardsSaving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold hover:brightness-110 transition flex items-center gap-2"
          >
            {rewardsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save View Rewards
          </button>
        </div>
      </div>
    </div>
  );
}
