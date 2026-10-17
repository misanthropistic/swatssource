import { useState, useEffect } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "@/lib/notify";
import {
  SlidersHorizontal, ShieldAlert, ShieldCheck, UserPlus, Save, Loader2, LogIn,
  Trophy, Plus, Trash2, Eye, Shield, Lock, FileUp, Sparkles, Globe, Laptop,
  BellRing, Activity, Server, Database, Check,
} from "lucide-react";
import AnnouncementManager from "@/components/AnnouncementManager";
import { SmartSelect } from "@/components/ui-shared/SmartSelect";

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
  const [rewards, setRewards] = useState({
    enabled: false,
    milestones: [],
    notification_title: "🎉 Milestone Unlocked!",
    notification_body: "Congratulations! You reached {views} lifetime views and unlocked {days} days of free Premium trial!",
  });
  const [hasCustomNotif, setHasCustomNotif] = useState(false);
  const [rewardsSaving, setRewardsSaving] = useState(false);

  useEffect(() => {
    api.get("/admin/site")
      .then(({ data }) => setSettings((prev) => ({ ...prev, ...(data || {}) })))
      .catch(() => {})
      .finally(() => setLoading(false));
    api.get("/admin/rewards-settings")
      .then(({ data }) => {
        if (data && typeof data === "object") {
          setRewards((prev) => ({
            ...prev,
            enabled: !!data.enabled,
            milestones: data.milestones || [],
            notification_title: data.notification_title || prev.notification_title,
            notification_body: data.notification_body || prev.notification_body,
          }));
          if (data.notification_title || data.notification_body) {
            setHasCustomNotif(true);
          }
        }
      })
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
      const sanitized = rewards.milestones.map((m) => ({
        views: parseInt(m.views, 10),
        premium_days: parseInt(m.premium_days, 10),
      }));
      const payload = {
        enabled: !!rewards.enabled,
        milestones: sanitized,
      };
      if (hasCustomNotif) {
        if (rewards.notification_title) payload.notification_title = rewards.notification_title;
        if (rewards.notification_body) payload.notification_body = rewards.notification_body;
      }

      const { data } = await api.put("/admin/rewards-settings", payload);
      setRewards((prev) => ({
        ...prev,
        enabled: !!data.enabled,
        milestones: data.milestones || [],
      }));
      toast.success("View rewards saved");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail) || "Failed to save view rewards");
    }
    setRewardsSaving(false);
  };

  const saveSettings = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await api.put("/admin/site", settings);
      toast.success("Site settings saved successfully");
    } catch {
      toast.error("Failed to update site settings");
    }
    setSaving(false);
  };

  const firstMilestone = rewards.milestones[0] || { views: 1000, premium_days: 3 };
  const previewToastMessage = (rewards.notification_body || "Congratulations! You reached {views} lifetime views and unlocked {days} days of free Premium trial!")
    .replace(/\{views\}/g, Number(firstMilestone.views || 1000).toLocaleString())
    .replace(/\{days\}/g, firstMilestone.premium_days || 3);

  return (
    <div className="space-y-6" data-testid="site-settings-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-black text-zinc-50 flex items-center gap-2.5">
            <SlidersHorizontal className="w-6 h-6 text-brand-400" /> Platform Site Settings
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Global access policies, security gates, automated view rewards, live broadcasts, and platform health.
          </p>
        </div>

        <button
          type="button"
          onClick={saveSettings}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-xs font-semibold hover:brightness-110 transition shadow-[0_0_20px_rgba(164,141,244,0.3)] disabled:opacity-50 shrink-0 self-start sm:self-auto"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Site Settings
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Policies, Governance, Security */}
        <div className="lg:col-span-7 space-y-6">
          {/* Core Access & Security Gates */}
          <div className="glass rounded-3xl p-5 sm:p-6 space-y-5 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
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
                  <LogIn className="w-4 h-4 text-purple-400" /> Require Discord to Edit Profiles
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  Users created before Discord sign-in must link Discord once before modifying their bio
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={!!settings.auth_required_to_edit}
                  onChange={(e) => setSettings({ ...settings, auth_required_to_edit: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>
          </div>

          {/* Platform Security & Session Controls */}
          <div className="glass rounded-3xl p-5 sm:p-6 space-y-5 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-2 text-zinc-100 font-bold text-sm uppercase tracking-wider font-mono2">
              <Lock className="w-4 h-4 text-brand-400" /> Security Policies & Limits
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-zinc-100">Enforce 2FA for Staff Accounts</div>
                <div className="text-xs text-zinc-400 mt-0.5">Require all admins and moderators to set up TOTP two-factor security</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={!!settings.force_2fa_staff}
                  onChange={(e) => setSettings({ ...settings, force_2fa_staff: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>

            <div className="h-px bg-white/5" />

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-zinc-100">Automated Rate Limiting</div>
                <div className="text-xs text-zinc-400 mt-0.5">Protect authentication endpoints and media upload APIs from abuse</div>
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
                <SmartSelect
                  value={settings.session_duration_days || 30}
                  onChange={(val) => setSettings({ ...settings, session_duration_days: Number(val) })}
                  options={[
                    { value: 7, label: "7 Days (High Security)" },
                    { value: 14, label: "14 Days" },
                    { value: 30, label: "30 Days (Standard)" },
                    { value: 90, label: "90 Days (Extended)" },
                  ]}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1.5">Max Media Upload Limit</label>
                <SmartSelect
                  value={settings.max_upload_mb || 25}
                  onChange={(val) => setSettings({ ...settings, max_upload_mb: Number(val) })}
                  options={[
                    { value: 10, label: "10 MB" },
                    { value: 25, label: "25 MB (Recommended)" },
                    { value: 50, label: "50 MB" },
                    { value: 100, label: "100 MB (Enterprise)" },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Profile Customization Governance */}
          <div className="glass rounded-3xl p-5 sm:p-6 space-y-5 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
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
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-mono2 text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50 transition"
              />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: View Rewards, Broadcast Announcements, System Health */}
        <div className="lg:col-span-5 space-y-6">
          {/* The view-milestone reward system */}
          <div className="glass rounded-3xl p-5 sm:p-6 space-y-5 shadow-[0_10px_30px_rgba(0,0,0,0.3)]" data-testid="rewards-settings">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-300" /> View Rewards & Automated Trials
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  At each lifetime-views milestone, accounts automatically receive free Premium trials and customizable notifications.
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
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {rewards.enabled && (
              <div className="space-y-4 pt-1">
                {/* Milestones list */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block font-mono2">
                    Milestone Tiers
                  </label>
                  {rewards.milestones.length === 0 && (
                    <p className="text-xs text-zinc-500">No milestones yet — add the first crossover.</p>
                  )}
                  {rewards.milestones.map((m, i) => (
                    <div key={i} className="flex items-center gap-2" data-testid={`reward-row-${i}`}>
                      <Eye className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
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
                        className="w-28 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-mono2 text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50"
                      />
                      <span className="text-[11px] text-zinc-500 shrink-0">views →</span>
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
                        className="w-20 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-mono2 text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50"
                      />
                      <span className="text-[11px] text-zinc-500 shrink-0">days</span>
                      <button
                        type="button"
                        onClick={() => setRewards({ ...rewards, milestones: rewards.milestones.filter((_, j) => j !== i) })}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition ml-auto"
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
                    className="inline-flex items-center gap-1.5 rounded-xl border border-brand-500/40 bg-brand-500/12 px-3 py-1.5 text-xs font-semibold text-brand-200 transition hover:bg-brand-500/25 mt-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add milestone
                  </button>
                </div>

                {/* Advanced: Notification Customizer */}
                <div className="pt-3 border-t border-white/5 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                    <BellRing className="w-3.5 h-3.5 text-brand-400" /> Milestone Notification Templates
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Alert Title</label>
                    <input
                      type="text"
                      value={rewards.notification_title || ""}
                      onChange={(e) => {
                        setHasCustomNotif(true);
                        setRewards({ ...rewards, notification_title: e.target.value });
                      }}
                      placeholder="🎉 Milestone Unlocked!"
                      className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-zinc-100 outline-none focus:border-brand-500/50"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-zinc-400">Alert Message</label>
                      <span className="text-[10px] text-zinc-500 font-mono2">Tags: {"{views}"}, {"{days}"}</span>
                    </div>
                    <textarea
                      rows={2}
                      value={rewards.notification_body || ""}
                      onChange={(e) => {
                        setHasCustomNotif(true);
                        setRewards({ ...rewards, notification_body: e.target.value });
                      }}
                      placeholder="Congratulations! You reached {views} lifetime views and unlocked {days} days of free Premium trial!"
                      className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-zinc-100 outline-none focus:border-brand-500/50 resize-none"
                    />
                  </div>

                  {/* Live Notification Preview */}
                  <div className="rounded-xl border border-brand-500/20 bg-brand-500/[0.04] p-3 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono2 text-brand-400 uppercase">
                      <span>Live Notification Toast Preview</span>
                      <span className="text-zinc-500">just now</span>
                    </div>
                    <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-amber-300" />
                      <span>{rewards.notification_title || "🎉 Milestone Unlocked!"}</span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-snug">
                      {previewToastMessage}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-3">
              <p className="text-[11px] text-amber-300/80" data-testid="rewards-problems">
                {rewardProblems[0] || ""}
              </p>
              <button
                type="button"
                data-testid="rewards-save"
                onClick={saveRewards}
                disabled={rewardsSaving}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-xs font-semibold hover:brightness-110 transition flex items-center gap-1.5"
              >
                {rewardsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save View Rewards
              </button>
            </div>
          </div>

          {/* Real announcement system & broadcast fallback */}
          <AnnouncementManager />

          <div className="glass rounded-3xl p-5 space-y-3 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
            <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Globe className="w-4 h-4 text-brand-400" /> Fallback Banner Broadcast
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Shown across all pages while no announcement card above is active.
            </p>
            <input
              type="text"
              data-testid="site-fallback-announcement"
              placeholder="e.g. Welcome to swats.bio v2! Join our official Discord for giveaways."
              value={settings.announcement || ""}
              onChange={(e) => setSettings({ ...settings, announcement: e.target.value })}
              className="w-full px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-500/50 transition"
            />
          </div>

          {/* Server Telemetry & Status card - ensures right side is full and purposeful */}
          <div className="glass rounded-3xl p-5 space-y-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-mono2 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" /> System Telemetry & Engine
              </div>
              <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <div className="text-zinc-500 text-[10px] flex items-center gap-1">
                  <Server className="w-3 h-3" /> Core Engine
                </div>
                <div className="font-semibold text-zinc-200 mt-1 font-mono2">v2.6.4 Stable</div>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <div className="text-zinc-500 text-[10px] flex items-center gap-1">
                  <Database className="w-3 h-3" /> Storage Pool
                </div>
                <div className="font-semibold text-emerald-300 mt-1 font-mono2">Connected (Postgres)</div>
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 leading-snug">
              All settings are updated atomically across all worker processes upon saving.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
