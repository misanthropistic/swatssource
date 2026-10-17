import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Copy, KeyRound, Loader2, Lock, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";

/* Two-factor authentication, on the account page.
 *
 * The shape of the flow is the security: the secret is shown until a code from
 * the authenticator confirms it was really stored, and only then is the factor
 * switched on — an abandoned setup can never lock someone out of their own
 * account. Recovery codes appear exactly once, with a warning that says so,
 * because the server keeps hashes and genuinely cannot show them again.
 *
 * "Sign out everywhere" lives here too: it bumps the session version, which
 * invalidates every token the account has ever been issued, including the one in
 * this browser.
 */

const Copyable = ({ value, label, testid }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — select the text instead");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      data-testid={testid}
      aria-label={`Copy ${label}`}
      className="shrink-0 rounded-lg border border-white/10 bg-white/[0.03] p-2 text-zinc-400 transition hover:text-zinc-100"
    >
      {copied ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

export default function TwoFactorPanel() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | setup | codes
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [disableCode, setDisableCode] = useState("");
  const [busy, setBusy] = useState("");
  const [signingOutAll, setSigningOutAll] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/me/2fa", { silent: true })
      .then(({ data }) => {
        if (alive) setStatus(data || { enabled: false });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const beginSetup = async () => {
    setBusy("setup");
    try {
      const { data } = await api.post("/me/2fa/setup", {});
      setSecret(data.secret);
      setUri(data.uri);
      setCode("");
      setPhase("setup");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not start two-factor setup");
    }
    setBusy("");
  };

  const confirmSetup = async () => {
    setBusy("enable");
    try {
      const { data } = await api.post("/me/2fa/enable", { code });
      setRecoveryCodes(data.recovery_codes || []);
      setPhase("codes");
      setStatus((s) => ({ ...(s || {}), enabled: true, recovery_codes_remaining: data.recovery_codes?.length || 0 }));
      toast.success("Two-factor authentication is on");
    } catch (e) {
      toast.error(e.response?.data?.detail || "That code was not accepted");
    }
    setBusy("");
  };

  const cancelSetup = () => {
    setPhase("idle");
    setSecret("");
    setUri("");
    setCode("");
  };

  const disable = async () => {
    setBusy("disable");
    try {
      await api.post("/me/2fa/disable", { code: disableCode });
      setStatus({ enabled: false, recovery_codes_remaining: 0 });
      setDisableCode("");
      cancelSetup();
      toast.success("Two-factor authentication is off");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not turn two-factor off");
    }
    setBusy("");
  };

  const signOutEverywhere = async () => {
    setSigningOutAll(true);
    try {
      await api.post("/me/logout-all", {});
      toast.success("Signed out on every device");
      await logout();
      navigate("/!/login");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not sign out your other sessions");
    }
    setSigningOutAll(false);
  };

  const enabled = !!status?.enabled;

  return (
    <div className="glass rounded-2xl p-5 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.4)]" data-testid="settings-2fa">
      <div className="flex items-center gap-2">
        {enabled ? (
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
        ) : (
          <ShieldOff className="h-5 w-5 text-zinc-400" />
        )}
        <h2 className="text-base font-bold text-zinc-100">Two-Factor Authentication</h2>
        <span
          data-testid="settings-2fa-status"
          className={`ml-auto rounded-full border px-2.5 py-0.5 font-mono2 text-[10px] font-bold uppercase tracking-wider ${
            enabled
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-white/10 bg-white/5 text-zinc-500"
          }`}
        >
          {enabled ? "On" : status === null ? "Checking…" : "Off"}
        </span>
      </div>

      {!enabled && phase === "idle" && (
        <>
          <p className="text-xs leading-relaxed text-zinc-400">
            An authenticator app (Google Authenticator, 1Password, Authy) shows a fresh six-digit code every
            30 seconds. With this on, a password alone — even a leaked one — is not enough to sign in.
          </p>
          <button
            type="button"
            onClick={beginSetup}
            disabled={busy === "setup"}
            data-testid="settings-2fa-start"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy === "setup" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
            Set up authenticator
          </button>
        </>
      )}

      {!enabled && phase === "setup" && (
        <>
          <p className="text-xs leading-relaxed text-zinc-400">
            Scan this with your authenticator app, then type the code it shows. Nothing is switched on until
            that code is accepted.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="rounded-2xl bg-white p-3" data-testid="settings-2fa-qr">
              {uri ? <QRCodeSVG value={uri} size={148} level="M" /> : null}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Can’t scan? Type this key
              </div>
              <div className="flex items-center gap-2">
                <code
                  data-testid="settings-2fa-secret"
                  className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono2 text-xs text-zinc-200"
                >
                  {secret}
                </code>
                <Copyable value={secret} label="setup key" testid="settings-2fa-copy-secret" />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123 456"
                    data-testid="settings-2fa-code"
                    className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={confirmSetup}
                  disabled={!code.trim() || busy === "enable"}
                  data-testid="settings-2fa-enable"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500/90 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy === "enable" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  Turn on
                </button>
              </div>
              <button
                type="button"
                onClick={cancelSetup}
                className="text-[11px] text-zinc-500 underline transition hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {phase === "codes" && (
        <>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-100">
            <strong>Save these now.</strong> They are shown once — we only keep hashes, so nobody (including
            us) can show them again. Each code works one time if you lose your phone.
          </div>
          <ul className="grid grid-cols-2 gap-2" data-testid="settings-2fa-recovery-codes">
            {recoveryCodes.map((c) => (
              <li
                key={c}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-center font-mono2 text-sm tracking-wider text-zinc-100"
              >
                {c}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Copyable value={recoveryCodes.join("\n")} label="recovery codes" testid="settings-2fa-copy-codes" />
            <button
              type="button"
              onClick={() => setPhase("idle")}
              data-testid="settings-2fa-saved-codes"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.07]"
            >
              I’ve saved them
            </button>
          </div>
        </>
      )}

      {enabled && (
        <>
          <p className="text-xs leading-relaxed text-zinc-400">
            Codes are required at sign-in.{" "}
            {typeof status?.recovery_codes_remaining === "number" && (
              <span data-testid="settings-2fa-remaining">
                {status.recovery_codes_remaining} recovery code
                {status.recovery_codes_remaining === 1 ? "" : "s"} left.
              </span>
            )}{" "}
            Your authenticator secret is stored only on the server and is never shown again.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                autoComplete="one-time-code"
                placeholder="Code or recovery code"
                data-testid="settings-2fa-disable-code"
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
              />
            </div>
            <button
              type="button"
              onClick={disable}
              disabled={!disableCode.trim() || busy === "disable"}
              data-testid="settings-2fa-disable"
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              {busy === "disable" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
              Turn off
            </button>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        <div>
          <div className="text-xs font-semibold text-zinc-300">Sign out of every device</div>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Invalidates every session on this account, including this one. Use it if a device is lost.
          </p>
        </div>
        <button
          type="button"
          onClick={signOutEverywhere}
          disabled={signingOutAll}
          data-testid="settings-signout-all"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.07] disabled:opacity-50"
        >
          {signingOutAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
          Sign out everywhere
        </button>
      </div>
    </div>
  );
}
