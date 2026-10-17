import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FaDiscord } from "react-icons/fa6";
import { Mail, Lock, Ticket, ArrowLeft, Eye, EyeOff, X, Crown, Check, Loader2, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/landing/Navbar";
import { toast } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

const PERKS = [
  "100+ premium fonts + custom upload", "All advanced text & page effects",
  "MP4 backgrounds, banners & avatars", "Advanced Plus+ card editor",
  "Cursor & background effects", "Custom code widgets",
  "Create your own badges", "Showcase / about-me mode",
];

const Field = ({ icon: Icon, ...props }) => (
  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 focus-within:border-brand-500/50 transition">
    <Icon className="w-4 h-4 text-zinc-500 shrink-0" />
    <input {...props} className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder-zinc-600 min-w-0" />
  </div>
);

export default function Login({ initialMode = "login" }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login, register, user } = useAuth();
  const [mode, setMode] = useState(
    params.get("mode") === "register" || params.get("register") === "true" ? "register" : initialMode
  );
  const [showPremium, setShowPremium] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ identifier: "", username: "", email: "", password: "", invite: "" });
  // Two-factor: the code field only appears once the server has said this
  // account needs one (after a correct password), so it never shows up for
  // someone who has no second factor.
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  // What the site currently allows. `discord_required` hides the password forms
  // entirely rather than letting someone fill them in and eat a 403.
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get("/auth/config")
      .then(({ data }) => { if (alive) setConfig(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const discordOnly = !!config?.discord_required;

  const claim = params.get("claim");
  useEffect(() => {
    if (params.get("discord") === "error") toast.error("Discord sign-in failed. Try again.");
    if (claim) { setMode("register"); setForm((f) => ({ ...f, username: claim })); }
    if (params.get("mode") === "register" || params.get("register") === "true") {
      setMode("register");
    }
  }, [claim, params]);

  useEffect(() => {
    const isRegistering = mode === "register" || params.get("mode") === "register" || initialMode === "register";
    if (user && user !== false && !isRegistering) {
      navigate("/!/dashboard");
    }
  }, [user, navigate, mode, params, initialMode]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const discordAuth = async () => {
    try {
      const { data } = await api.get(`/auth/discord/login`, { params: { mode: "login" } });
      if (data && data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Discord login is not available right now");
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not start Discord sign-in";
      toast.error(msg);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!form.identifier.trim() || !form.password) {
      toast.error("Please enter your username/email and password");
      return;
    }
    if (needsTotp && !totpCode.trim()) {
      toast.error("Enter the 6-digit code from your authenticator app");
      return;
    }
    setBusy(true);
    const r = await login(form.identifier.trim(), form.password, needsTotp ? totpCode.trim() : undefined);
    setBusy(false);
    if (r.ok) { toast.success("Welcome back!"); navigate("/!/dashboard"); return; }

    // `totp_required` means the password was right and the second factor is what
    // is missing (or wrong) — so the fix is to show the code field, not to tell
    // someone their password is wrong.
    if (r.code === "totp_required") {
      setNeedsTotp(true);
      toast.error(r.error || "Enter your two-factor code");
      return;
    }
    toast.error(r.error);
  };

  const handleRegisterContinue = (e) => {
    e.preventDefault();
    if (!form.username || !form.email || !form.password) { toast.error("Fill in all fields"); return; }
    if (form.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setShowPremium(true);
  };

  const finishRegister = async (premium) => {
    setShowPremium(false);
    setBusy(true);
    const r = await register({
      email: form.email, password: form.password, username: form.username,
      display_name: form.username, invite_code: form.invite,
    });
    setBusy(false);
    if (r.ok) {
      toast.success(premium ? "Account created! Upgrade to premium anytime." : "Account created!");
      navigate("/!/dashboard");
    } else toast.error(r.error);
  };

  return (
    <div className="min-h-screen sw-page-bg text-zinc-100 grain flex items-center justify-center px-4 py-16 relative" data-testid="auth-page">
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-brand-600/8 blur-[150px] rounded-full" />

      <Link to="/!/home" data-testid="auth-back-home" className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-200 transition z-20">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>

      <div data-testid="auth-box" className="relative z-10 w-full max-w-md glass-strong rounded-3xl p-8 shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
        <div className="flex justify-center mb-6"><Logo size="text-xl" /></div>
        <h1 className="text-center font-display text-2xl font-extrabold text-zinc-50">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="text-center text-sm text-zinc-500 mt-1">{mode === "login" ? "Log in to manage your page" : "Claim your digital identity"}</p>

        {user && mode === "register" && (
          <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 p-3 text-xs text-brand-200">
            <div>
              <span>Currently signed in as <strong className="text-white">@{user.username}</strong>.</span>
              <span className="block text-[10px] text-zinc-400 mt-0.5">Creating an account will register your new username.</span>
            </div>
            <Link to="/!/dashboard" className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-zinc-200 hover:bg-white/10">
              Dashboard
            </Link>
          </div>
        )}

        <button data-testid="discord-login-btn" onClick={discordAuth}
          className="mt-7 w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-semibold bg-white hover:bg-white/90 text-[#0A0A0D] transition">
          <FaDiscord className="w-5 h-5" /> {mode === "login" ? "Login with Discord" : "Sign up with Discord"}
        </button>

        {discordOnly && (
          <p className="mt-4 text-center text-xs leading-relaxed text-zinc-400" data-testid="discord-required-note">
            This site signs in with Discord only. Already have an account from before? Use the same email address —
            your account is linked automatically, nothing on your page is affected.
          </p>
        )}

        {!discordOnly && (
          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-white/10" /><span className="text-xs text-zinc-600 font-mono2">OR</span><div className="h-px flex-1 bg-white/10" />
          </div>
        )}

        {discordOnly ? null : mode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <Field icon={Mail} data-testid="login-identifier" placeholder="Username or email" value={form.identifier} onChange={set("identifier")} />
            <div className="relative">
              <Field icon={Lock} data-testid="login-password" type={showPw ? "text" : "password"} placeholder="Password" value={form.password} onChange={set("password")} />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">{showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>
            {needsTotp && (
              <div data-testid="login-2fa-step" className="space-y-2">
                <Field
                  icon={ShieldCheck}
                  data-testid="login-2fa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code, or a recovery code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                />
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Two-factor is on for this account. Open your authenticator app for the current code — or use
                  one of the recovery codes you saved when you turned it on.
                </p>
              </div>
            )}
            <button data-testid="login-submit" disabled={busy} type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Login
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterContinue} className="space-y-3">
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10">
              <span className="font-mono2 text-xs text-zinc-500">swats.bio/</span>
              <input data-testid="register-username" placeholder="username" value={form.username} onChange={set("username")} className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder-zinc-600 min-w-0" />
            </div>
            <Field icon={Mail} data-testid="register-email" type="email" placeholder="Email" value={form.email} onChange={set("email")} />
            <div className="relative">
              <Field icon={Lock} data-testid="register-password" type={showPw ? "text" : "password"} placeholder="Password (min 6 chars)" value={form.password} onChange={set("password")} />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">{showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>
            <Field icon={Ticket} data-testid="register-invite" placeholder="Invite code (optional)" value={form.invite} onChange={set("invite")} />
            <button data-testid="register-submit" type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold hover:brightness-110 transition">Continue</button>
          </form>
        )}

        {!discordOnly && (
          <button data-testid="toggle-auth-mode" onClick={() => setMode(mode === "login" ? "register" : "login")} className="mt-5 w-full text-center text-sm text-zinc-500 hover:text-zinc-200 transition">
            {mode === "login" ? "No account? Register" : "Already have an account? Login"}
          </button>
        )}
      </div>

      {showPremium && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" data-testid="premium-prompt">
          <div className="w-full max-w-md glass-strong rounded-3xl p-8 relative fade-up">
            <button onClick={() => setShowPremium(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200"><X className="w-5 h-5" /></button>
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 mx-auto shadow-[0_0_30px_rgba(164, 141, 244,0.5)]"><Crown className="w-7 h-7 text-white" /></div>
            <h2 className="text-center font-display text-2xl font-extrabold text-zinc-50 mt-5">Want a Premium account?</h2>
            <p className="text-center text-sm text-zinc-500 mt-1">Unlock everything for $5/month. You can always upgrade later.</p>
            <ul className="mt-6 space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {PERKS.map((p) => <li key={p} className="flex items-start gap-2.5 text-sm text-zinc-300"><Check className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />{p}</li>)}
            </ul>
            <div className="mt-7 space-y-2.5">
              <button data-testid="premium-yes" onClick={() => finishRegister(true)} className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold hover:brightness-110 transition">Yes, I want Premium</button>
              <button data-testid="premium-no" onClick={() => finishRegister(false)} className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm font-medium transition">Continue with Free</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
