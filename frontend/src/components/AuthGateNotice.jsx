import { FaDiscord } from "react-icons/fa6";
import { ShieldAlert } from "lucide-react";
import { useEditGate } from "@/hooks/useEditGate";
import { connectDiscord } from "@/lib/discord";

/* Shown when "Auth check" is on and this account has no Discord linked.
 *
 * Two variants of the same notice: a one-line strip that sits under the
 * dashboard header (so it is impossible to miss on the way to any page) and the
 * fuller card the Editor puts above its fields, where the block actually bites.
 * Renders nothing when the gate does not apply, so callers can mount it
 * unconditionally.
 */
export default function AuthGateNotice({ variant = "strip" }) {
  const { blocked } = useEditGate();
  if (!blocked) return null;

  const connect = () => connectDiscord("link");

  if (variant === "card") {
    return (
      <div
        data-testid="auth-gate-notice"
        className="relative overflow-hidden rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-5"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15">
            <ShieldAlert className="h-5 w-5 text-amber-300" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-amber-100">Connect Discord to edit your profile</h2>
            <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
              Your page, links and widgets are all still live and unchanged — only saving edits is locked. Sign in
              with Discord once (use the same email and it links to this account) and editing unlocks immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={connect}
            data-testid="auth-gate-connect"
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0A0A0D] transition-colors duration-200 hover:bg-white/90"
          >
            <FaDiscord className="h-4 w-4" /> Connect Discord
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="auth-gate-notice"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-400/20 bg-amber-500/[0.08] px-6 py-2.5"
    >
      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-300" />
      <span className="text-xs text-amber-100">
        <strong className="font-semibold">Auth check:</strong> connect Discord to save profile edits. Everything
        already on your page stays live.
      </span>
      <button
        type="button"
        onClick={connect}
        data-testid="auth-gate-connect"
        className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#0A0A0D] transition-colors duration-200 hover:bg-white/90"
      >
        <FaDiscord className="h-3.5 w-3.5" /> Connect
      </button>
    </div>
  );
}
