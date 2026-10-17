import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";
import { AtSign, Mail, Shield, LogOut, Trash2, Save, KeyRound, Lock, Eye, EyeOff, CheckCircle2, AlertTriangle, UserCheck, Plug, Loader2 } from "lucide-react";
import TwoFactorPanel from "@/components/TwoFactorPanel";

// Optional per-user keys for the widgets that need one. Most widgets work with
// no key at all; these just make the key-dependent ones work on your profile.
const WIDGET_KEY_PROVIDERS = [
  { id: "riot", label: "Riot API key", hint: "Valorant rank, RR and wins", url: "https://developer.riotgames.com" },
  { id: "youtube", label: "YouTube Data API key", hint: "Exact subscriber and video counts", url: "https://console.cloud.google.com/apis/credentials" },
  { id: "github", label: "GitHub token", hint: "Higher rate limit for GitHub widgets", url: "https://github.com/settings/tokens" },
];

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState(user?.username || "");
  const [savingUser, setSavingUser] = useState(false);

  // Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // Delete Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Widget API keys. Only the status (configured / hint) is ever read back —
  // the values themselves never leave the server.
  const [integrations, setIntegrations] = useState(null);
  const [keyDraft, setKeyDraft] = useState({ riot: "", youtube: "", github: "" });
  const [savingKeys, setSavingKeys] = useState(false);

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

  return (
    <div data-testid="settings-page" className="max-w-2xl mx-auto space-y-5 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 justify-center text-center pb-2">
        <img src="/logo.png" alt="swats.bio" className="w-10 h-10 rounded-xl object-contain shadow-[0_0_20px_rgba(255,127,188,0.4)]" />
        <div>
          <h1 className="font-display text-3xl font-black text-zinc-50">Account & Security</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Manage your credentials, public handle, and security preferences</p>
        </div>
      </div>

      {/* Profile & Handle */}
      <div className="glass rounded-2xl p-5 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-brand-400" />
            <h2 className="text-base font-bold text-zinc-100">Public Handle</h2>
          </div>
          <span className="text-xs font-mono2 px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/20">
            swats.bio/{user?.username}
          </span>
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
            <Save className="w-4 h-4" /> Save Handle
          </button>
        </div>
      </div>

      {/* Account Info */}
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

      {/* Widget API Keys */}
      <div className="glass rounded-2xl p-5 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)]" data-testid="settings-api-keys">
        <div className="flex items-center gap-2">
          <Plug className="w-5 h-5 text-brand-400" />
          <h2 className="text-base font-bold text-zinc-100">Widget API Keys</h2>
        </div>
        <p className="text-xs text-zinc-400">
          Optional. Roblox, Discord, Steam, GitHub and music widgets work without any key. Add your own
          only for the ones that need it — keys are stored on the server and are never shown to visitors.
        </p>

        {WIDGET_KEY_PROVIDERS.map(({ id, label, hint, url }) => {
          const status = integrations?.[id];
          const serverDefault = integrations?.server_defaults?.[id];
          const badge = status?.configured
            ? { text: `Saved ${status.hint}`, cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" }
            : serverDefault
            ? { text: "Server key in use", cls: "bg-brand-500/10 text-brand-300 border-brand-500/30" }
            : { text: "Not set", cls: "bg-white/5 text-zinc-500 border-white/10" };
          return (
            <div key={id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-zinc-300">{label}</label>
                <span className={`text-[10px] font-mono2 px-2 py-0.5 rounded-full border ${badge.cls}`}>
                  {badge.text}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  data-testid={`api-key-${id}`}
                  value={keyDraft[id]}
                  onChange={(e) => setKeyDraft({ ...keyDraft, [id]: e.target.value })}
                  placeholder={`Paste your ${label}`}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 focus:border-brand-500/50 outline-none text-sm text-zinc-100 placeholder-zinc-600"
                />
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
              <p className="text-[11px] text-zinc-500">
                {hint} ·{" "}
                <a href={url} target="_blank" rel="noreferrer" className="text-brand-300 hover:underline">
                  Get a key
                </a>
              </p>
            </div>
          );
        })}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={saveKeys}
            disabled={savingKeys}
            data-testid="settings-save-api-keys"
            className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-1.5 transition"
          >
            {savingKeys ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Keys
          </button>
        </div>
      </div>

      {/* Two-factor authentication, then the password it complements. */}
      <TwoFactorPanel />

      {/* Security & Password */}
      <div className="glass rounded-2xl p-5 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-brand-400" />
          <h2 className="text-base font-bold text-zinc-100">Security & Password</h2>
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

          <div className="flex items-center justify-between pt-1">
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
              className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" /> Update Password
            </button>
          </div>
        </form>
      </div>

      {/* Session Logout */}
      <div className="glass rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
        <div>
          <div className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <LogOut className="w-4 h-4 text-zinc-400" /> Active Sessions
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">Securely terminate active login session on this browser</p>
        </div>
        <button
          onClick={() => { logout(); navigate("/"); }}
          data-testid="settings-logout"
          className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-zinc-200 flex items-center gap-2 transition border border-white/10"
        >
          <LogOut className="w-4 h-4 text-zinc-400" /> Log out
        </button>
      </div>

      {/* Danger Zone */}
      <div className="rounded-2xl p-5 border border-red-500/20 bg-red-500/[0.03] space-y-3">
        <div className="flex items-center gap-2 text-red-400 font-bold">
          <AlertTriangle className="w-5 h-5" /> Danger Zone
        </div>
        <p className="text-xs text-zinc-400">Permanently delete your profile, custom bio link, uploaded assets, and account data.</p>
        <button
          data-testid="settings-delete"
          onClick={() => setShowDeleteModal(true)}
          className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 text-sm font-semibold flex items-center gap-2 transition"
        >
          <Trash2 className="w-4 h-4" /> Delete Account
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="w-full max-w-md glass-strong rounded-3xl p-5 space-y-4 border border-red-500/30 fade-up">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-display text-lg font-extrabold text-white">Delete Account Permanently</h3>
            </div>
            <p className="text-xs text-zinc-300">
              This action <span className="text-red-400 font-bold">cannot be undone</span>. Type <code className="text-brand-300 font-mono2">{user?.username}</code> below to confirm deletion.
            </p>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={user?.username}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 outline-none text-sm text-zinc-100 placeholder-zinc-600 font-mono2"
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
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-semibold transition"
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
