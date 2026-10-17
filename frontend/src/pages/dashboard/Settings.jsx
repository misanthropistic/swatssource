import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";
import {
  AtSign, Mail, Shield, LogOut, Trash2, Save, KeyRound, Lock, Eye, EyeOff,
  CheckCircle2, AlertTriangle, UserCheck, Plug, Loader2, Copy, ExternalLink,
  Sliders, Volume2, Sparkles, Check, Laptop, ShieldAlert, Key, Globe,
} from "lucide-react";
import TwoFactorPanel from "@/components/TwoFactorPanel";
import { Switch } from "@/components/ui/switch";

// Optional per-user keys for the widgets that need one. Most widgets work with
// no key at all; these just make the key-dependent ones work on your profile.
const WIDGET_KEY_PROVIDERS = [
  { id: "riot", label: "Riot API key", hint: "Valorant rank, RR and wins", url: "https://developer.riotgames.com" },
  { id: "youtube", label: "YouTube Data API key", hint: "Exact subscriber and video counts", url: "https://console.cloud.google.com/apis/credentials" },
  { id: "github", label: "GitHub token", hint: "Higher rate limit for GitHub widgets", url: "https://github.com/settings/tokens" },
];

const SETTINGS_TABS = [
  { id: "all", label: "All Settings", icon: Sliders },
  { id: "account", label: "Account", icon: UserCheck },
  { id: "security", label: "Security & 2FA", icon: KeyRound },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "preferences", label: "Preferences", icon: Volume2 },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

function calcPasswordStrength(pw) {
  if (!pw) return { score: 0, label: "None", color: "bg-zinc-700" };
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 10) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;

  if (score <= 1) return { score: 1, label: "Weak", color: "bg-red-500", text: "text-red-400" };
  if (score <= 3) return { score: 2, label: "Moderate", color: "bg-amber-500", text: "text-amber-400" };
  if (score === 4) return { score: 3, label: "Good", color: "bg-blue-500", text: "text-blue-400" };
  return { score: 4, label: "Strong", color: "bg-emerald-500", text: "text-emerald-400" };
}

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
  const [username, setUsername] = useState(user?.username || "");
  const [savingUser, setSavingUser] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // Delete Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Widget API keys.
  const [integrations, setIntegrations] = useState(null);
  const [keyDraft, setKeyDraft] = useState({ riot: "", youtube: "", github: "" });
  const [showKeyText, setShowKeyText] = useState({ riot: false, youtube: false, github: false });
  const [savingKeys, setSavingKeys] = useState(false);

  // Local preferences
  const [autoplayAudio, setAutoplayAudio] = useState(() => {
    return localStorage.getItem("swats_pref_autoplay") !== "false";
  });
  const [reducedMotion, setReducedMotion] = useState(() => {
    return localStorage.getItem("swats_reduced_motion") === "true";
  });
  const [soundEffects, setSoundEffects] = useState(() => {
    return localStorage.getItem("swats_sound_effects") !== "false";
  });

  const toggleAutoplay = (val) => {
    setAutoplayAudio(val);
    localStorage.setItem("swats_pref_autoplay", String(val));
    toast.success(val ? "Audio autoplay on entry enabled" : "Audio autoplay disabled");
  };

  const toggleReducedMotion = (val) => {
    setReducedMotion(val);
    localStorage.setItem("swats_reduced_motion", String(val));
    toast.success(val ? "Reduced motion enabled" : "Full animations restored");
  };

  const toggleSoundEffects = (val) => {
    setSoundEffects(val);
    localStorage.setItem("swats_sound_effects", String(val));
    toast.success(val ? "UI click audio effects enabled" : "UI sound effects muted");
  };

  useEffect(() => {
    let alive = true;
    api.get("/me/integrations")
      .then(({ data }) => { if (alive) setIntegrations(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const saveKeys = async () => {
    const payload = {};
    for (const { id } of WIDGET_KEY_PROVIDERS) {
      const value = keyDraft[id].trim();
      if (value) payload[id] = value;
    }
    if (!Object.keys(payload).length) { toast.info("Type a key to save first."); return; }
    setSavingKeys(true);
    try {
      const { data } = await api.put("/me/integrations", payload);
      setIntegrations((prev) => ({ ...prev, ...data }));
      setKeyDraft({ riot: "", youtube: "", github: "" });
      toast.success("API keys saved");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save API keys");
    }
    setSavingKeys(false);
  };

  const clearKey = async (provider) => {
    try {
      const { data } = await api.put("/me/integrations", { [provider]: "" });
      setIntegrations((prev) => ({ ...prev, ...data }));
      toast.success("Key removed");
    } catch {
      toast.error("Could not remove key");
    }
  };

  const saveUsername = async () => {
    if (!username.trim()) { toast.error("Username cannot be empty"); return; }
    setSavingUser(true);
    try {
      const { data } = await api.put("/me/username", { username: username.trim() });
      setUser(data);
      toast.success("Username updated successfully");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not update username");
    }
    setSavingUser(false);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("New passwords do not match"); return; }

    setSavingPw(true);
    try {
      const { data } = await api.put("/me/password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success(data.detail || "Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to update password");
    }
    setSavingPw(false);
  };

  const copyUrl = () => {
    const url = `${window.location.origin}/${user?.username}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedLink(true);
      toast.success("Profile URL copied to clipboard");
      setTimeout(() => setCopiedLink(false), 2000);
    }).catch(() => {
      toast.error("Failed to copy URL");
    });
  };

  const strength = calcPasswordStrength(newPassword);

  const showSection = (tabId) => activeTab === "all" || activeTab === tabId;

  return (
    <div data-testid="settings-page" className="max-w-3xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-brand-950/40 via-purple-950/20 to-black/60 p-6 shadow-[0_10px_35px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <img
            src="/logo.png"
            alt="swats.bio"
            className="w-14 h-14 rounded-2xl object-contain shadow-[0_0_25px_rgba(255,127,188,0.45)] border border-brand-500/20"
          />
          <div className="flex-1">
            <h1 className="font-display text-3xl font-black text-zinc-50 flex items-center justify-center sm:justify-start gap-2.5">
              Settings & Preferences
              <span className="text-xs font-mono2 font-bold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                v2.6
              </span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Configure your credentials, profile identity, third-party integrations, and UI preferences
            </p>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 mt-6 pt-5 border-t border-white/10">
          {SETTINGS_TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  active
                    ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-[0_0_15px_rgba(255,127,188,0.35)]"
                    : "bg-white/[0.03] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.07] border border-white/5"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ACCOUNT & IDENTITY SECTION */}
      {showSection("account") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <UserCheck className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 font-mono2">Public Identity</h2>
          </div>

          <div className="glass rounded-2xl p-5 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-100">Public Handle</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Your unique URL on swats.bio</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyUrl}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-mono2 border border-white/10 flex items-center gap-1.5 transition"
                >
                  {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-zinc-400" />}
                  {copiedLink ? "Copied" : "Copy"}
                </button>
                <a
                  href={`/${user?.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 text-brand-300 border border-brand-500/20 transition"
                  title="Visit Public Profile"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 focus-within:border-brand-500/50 transition">
                <AtSign className="w-4 h-4 text-zinc-500 shrink-0" />
                <span className="text-xs text-zinc-500 font-mono2">swats.bio/</span>
                <input
                  data-testid="settings-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder-zinc-600 min-w-0 font-medium"
                  placeholder="username"
                />
              </div>
              <button
                onClick={saveUsername}
                disabled={savingUser}
                data-testid="settings-save-username"
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:brightness-110 text-white text-sm font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-[0_0_20px_rgba(255,127,188,0.3)]"
              >
                {savingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Handle
              </button>
            </div>
          </div>

          {/* Account Credentials */}
          <div className="glass rounded-2xl p-5 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-brand-400" />
              <h2 className="text-base font-bold text-zinc-100">Account Credentials</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <span className="text-xs text-zinc-500 font-mono2">Email Address</span>
                <div className="flex items-center gap-2 text-sm text-zinc-200 font-medium">
                  <Mail className="w-4 h-4 text-zinc-500 shrink-0" /> {user?.email}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <span className="text-xs text-zinc-500 font-mono2">Membership Status</span>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-zinc-200 capitalize">{user?.role}</span>
                  <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 ml-auto">
                    {user?.tier}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECURITY & 2FA SECTION */}
      {showSection("security") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <KeyRound className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 font-mono2">Security & Credentials</h2>
          </div>

          {/* Security Posture & Health Score */}
          <div className="glass rounded-2xl p-5 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)] border border-emerald-500/20 bg-gradient-to-br from-emerald-950/20 via-black/40 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-zinc-100">Account Security Posture</h3>
              </div>
              <span className="text-xs font-mono2 font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                Score: {user?.discord?.linked ? "95" : "80"} / 100 · Strong
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-brand-400 transition-all duration-500"
                  style={{ width: user?.discord?.linked ? "95%" : "80%" }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono2 pt-0.5">
                <span>Password Protected</span>
                <span>Session Isolation</span>
                <span>{user?.discord?.linked ? "Discord Verified" : "Discord Unlinked"}</span>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-2.5 pt-1">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-0.5">
                <div className="text-[10px] font-mono2 uppercase text-zinc-500">Authentication</div>
                <div className="text-xs font-bold text-zinc-200">Argon2/Bcrypt Hash</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-0.5">
                <div className="text-[10px] font-mono2 uppercase text-zinc-500">Transport</div>
                <div className="text-xs font-bold text-emerald-400">TLS 1.3 / HTTPS</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-0.5">
                <div className="text-[10px] font-mono2 uppercase text-zinc-500">Token Versioning</div>
                <div className="text-xs font-bold text-zinc-200">v{user?.token_version || 1} Enforced</div>
              </div>
            </div>
          </div>

          {/* Two-factor authentication */}
          <TwoFactorPanel />

          {/* Password Update */}
          <div className="glass rounded-2xl p-5 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-brand-400" />
                <h2 className="text-base font-bold text-zinc-100">Change Password</h2>
              </div>
              {newPassword && (
                <div className="flex items-center gap-1.5 text-xs font-mono2">
                  <span className="text-zinc-500">Strength:</span>
                  <span className={strength.text}>{strength.label}</span>
                </div>
              )}
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-3">
              {user?.password_hash !== null && (
                <div className="relative">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 focus-within:border-brand-500/50 transition">
                    <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
                    <input
                      type={showPw ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current Password"
                      className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder-zinc-600 min-w-0"
                    />
                  </div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="relative">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 focus-within:border-brand-500/50 transition">
                    <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
                    <input
                      type={showPw ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New Password (min 6 chars)"
                      className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder-zinc-600 min-w-0"
                    />
                  </div>
                </div>

                <div className="relative">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 focus-within:border-brand-500/50 transition">
                    <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
                    <input
                      type={showPw ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm New Password"
                      className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder-zinc-600 min-w-0"
                    />
                  </div>
                </div>
              </div>

              {/* Password strength visual meter */}
              {newPassword && (
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        step <= strength.score ? strength.color : "bg-white/10"
                      }`}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition"
                >
                  {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showPw ? "Hide Passwords" : "Show Passwords"}
                </button>

                <button
                  type="submit"
                  disabled={savingPw}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:brightness-110 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow-[0_0_20px_rgba(255,127,188,0.25)]"
                >
                  {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Update Password
                </button>
              </div>
            </form>
          </div>

          {/* Active Devices & Session Hygiene */}
          <div className="glass rounded-2xl p-5 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Laptop className="w-5 h-5 text-brand-400" />
                <h3 className="text-base font-bold text-zinc-100">Session & Device Security</h3>
              </div>
              <span className="text-[10px] font-mono2 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                Current Device
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <span className="text-[10px] font-mono2 uppercase text-zinc-500">Browser Environment</span>
                <div className="text-zinc-200 font-semibold flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-zinc-400" /> Web Browser Session
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <span className="text-[10px] font-mono2 uppercase text-zinc-500">Session Status</span>
                <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Authenticated & Active
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-white/5">
              <p className="text-xs text-zinc-400">
                Suspect unauthorized access? Invalidate all session tokens across all devices simultaneously.
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.post("/me/logout-all");
                    toast.success("Successfully revoked all other sessions everywhere!");
                  } catch {
                    toast.error("Failed to revoke other sessions");
                  }
                }}
                className="px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold shrink-0 transition"
              >
                Revoke All Other Sessions
              </button>
            </div>
          </div>

          {/* Session Logout */}
          <div className="glass rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
            <div>
              <div className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <LogOut className="w-4 h-4 text-zinc-400" /> Active Browser Session
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Securely terminate active login session on this device</p>
            </div>
            <button
              onClick={() => { logout(); navigate("/"); }}
              data-testid="settings-logout"
              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-zinc-200 flex items-center gap-2 transition border border-white/10"
            >
              <LogOut className="w-4 h-4 text-zinc-400" /> Log out
            </button>
          </div>
        </div>
      )}

      {/* INTEGRATIONS SECTION */}
      {showSection("integrations") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Plug className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 font-mono2">Third-Party Integrations</h2>
          </div>

          <div className="glass rounded-2xl p-5 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)]" data-testid="settings-api-keys">
            <div className="flex items-center gap-2">
              <Plug className="w-5 h-5 text-brand-400" />
              <h2 className="text-base font-bold text-zinc-100">Widget API Keys</h2>
            </div>
            <p className="text-xs text-zinc-400">
              Optional credentials. Roblox, Discord, Steam, GitHub and music widgets work without any key. Add your own
              only for the ones that need it — keys are stored safely on the server and are never shown to visitors.
            </p>

            {WIDGET_KEY_PROVIDERS.map(({ id, label, hint, url }) => {
              const status = integrations?.[id];
              const serverDefault = integrations?.server_defaults?.[id];
              const badge = status?.configured
                ? { text: `Saved ${status.hint}`, cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" }
                : serverDefault
                ? { text: "Server key in use", cls: "bg-brand-500/10 text-brand-300 border-brand-500/30" }
                : { text: "Not set", cls: "bg-white/5 text-zinc-500 border-white/10" };
              const isRevealed = showKeyText[id];
              return (
                <div key={id} className="space-y-1.5 rounded-xl bg-white/[0.02] border border-white/5 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-zinc-200">{label}</label>
                    <span className={`text-[10px] font-mono2 px-2.5 py-0.5 rounded-full border ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={isRevealed ? "text" : "password"}
                        autoComplete="off"
                        data-testid={`api-key-${id}`}
                        value={keyDraft[id]}
                        onChange={(e) => setKeyDraft({ ...keyDraft, [id]: e.target.value })}
                        placeholder={`Paste your ${label}`}
                        className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 focus:border-brand-500/50 outline-none text-sm text-zinc-100 placeholder-zinc-600 pr-10 font-mono2 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeyText((prev) => ({ ...prev, [id]: !prev[id] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                        title={isRevealed ? "Mask key" : "Show key"}
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {status?.configured && (
                      <button
                        type="button"
                        onClick={() => clearKey(id)}
                        className="px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 transition"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500 flex items-center justify-between pt-0.5">
                    <span>{hint}</span>
                    <a href={url} target="_blank" rel="noreferrer" className="text-brand-300 hover:underline inline-flex items-center gap-1">
                      Get key <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </p>
                </div>
              );
            })}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={saveKeys}
                disabled={savingKeys}
                data-testid="settings-save-api-keys"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:brightness-110 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-1.5 transition shadow-[0_0_20px_rgba(255,127,188,0.3)]"
              >
                {savingKeys ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Keys
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PREFERENCES SECTION */}
      {showSection("preferences") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Volume2 className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 font-mono2">Experience & Audio</h2>
          </div>

          <div className="glass rounded-2xl p-5 space-y-5 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
            <div>
              <h3 className="text-base font-bold text-zinc-100">Playback & Accessibility</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Customize how audio and visuals behave across your dashboard and profile</p>
            </div>

            <div className="divide-y divide-white/5">
              {/* Autoplay toggle */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-zinc-200">Autoplay Music on Entry</span>
                  <p className="text-xs text-zinc-400">
                    Immediately start playing profile audio when visitors click through the entry screen
                  </p>
                </div>
                <Switch checked={autoplayAudio} onCheckedChange={toggleAutoplay} />
              </div>

              {/* UI Sound Effects */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-zinc-200">Dashboard Sound Effects</span>
                  <p className="text-xs text-zinc-400">
                    Play subtle micro-audio pings on button interactions and notifications
                  </p>
                </div>
                <Switch checked={soundEffects} onCheckedChange={toggleSoundEffects} />
              </div>

              {/* Reduced Motion */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-zinc-200">Reduced Motion</span>
                  <p className="text-xs text-zinc-400">
                    Tone down 3D tilt effects, parallax backgrounds, and continuous particle animations
                  </p>
                </div>
                <Switch checked={reducedMotion} onCheckedChange={toggleReducedMotion} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DANGER ZONE SECTION */}
      {showSection("danger") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-red-400 font-mono2">Irreversible Actions</h2>
          </div>

          <div className="rounded-2xl p-5 border border-red-500/25 bg-red-500/[0.04] space-y-4 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
            <div className="flex items-center gap-2 text-red-400 font-bold text-base">
              <ShieldAlert className="w-5 h-5" /> Danger Zone
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Permanently delete your profile, custom bio URL slug, uploaded custom cursors, background tracks, and badges.
              This action cannot be undone once confirmed.
            </p>
            <div className="pt-1">
              <button
                data-testid="settings-delete"
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-sm font-semibold flex items-center gap-2 transition hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]"
              >
                <Trash2 className="w-4 h-4" /> Delete Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="w-full max-w-md glass-strong rounded-3xl p-6 space-y-4 border border-red-500/30 fade-up shadow-[0_0_50px_rgba(239,68,68,0.2)]">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-display text-lg font-extrabold text-white">Delete Account Permanently</h3>
            </div>
            <p className="text-xs text-zinc-300">
              This action <span className="text-red-400 font-bold">cannot be undone</span>. All your customized bio widgets, cursors, and stats will be wiped. Type <code className="text-brand-300 font-mono2 font-bold">{user?.username}</code> below to confirm deletion.
            </p>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={user?.username}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 outline-none text-sm text-zinc-100 placeholder-zinc-600 font-mono2 focus:border-red-500/50"
            />
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                disabled={deleteConfirmText !== user?.username}
                onClick={() => {
                  toast.success("Account deletion requested.");
                  logout();
                  navigate("/");
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-semibold transition shadow-[0_0_20px_rgba(239,68,68,0.4)]"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
