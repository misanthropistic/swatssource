import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Check, Crown, ExternalLink, Heart, Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/lib/notify";

/* The donations page.
 *
 * One page, three ways to give:
 *   • a Stripe card donation — presets and a custom amount, one-time, signed in;
 *   • crypto addresses (server-configured, copyable);
 *   • the nudge to buy Premium instead, which supports the site the recurring way.
 *
 * The page records where the money came from in the URL (donated=… /
 * donation=cancelled) so a returning visitor sees the thank-you or the
 * "nothing was taken" state rather than a bare form.
 */
const PRESETS = [3, 5, 10, 25];

export default function Donations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const donated = Number(params.get("donated")) / 100;
  const wasCancelled = params.get("donation") === "cancelled";

  const [amount, setAmount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (Number.isFinite(donated) && donated > 0) {
      toast.success(`Thank you for $${donated.toFixed(2)}! Every cent goes into keeping swats.bio online.`);
    } else if (wasCancelled) {
      toast.info("Checkout closed — nothing was charged.");
    }
    // Runs once on arrival (add the params to the deps intentionally never — the greeting is for the arrival navigation only).
  }, []);

  useEffect(() => {
    api
      .get("/donations/config", { silent: true })
      .then(({ data }) => setConfig(data || null))
      .catch(() => {});
  }, []);

  const donate = async (usd) => {
    if (!user) { navigate("/!/login"); return; }
    const value = Number(usd);
    if (!Number.isFinite(value) || value <= 0) return;
    setBusy(true);
    try {
      const { data } = await api.post("/billing/donate", { amount_usd: value });
      if (data?.url) { window.location.href = data.url; return; }
      toast.info("Card donations arrive once Stripe is connected on the backend.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not open checkout");
    }
    setBusy(false);
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Address copied");
    } catch {
      toast.info(text);
    }
  };

  return (
    <div className="min-h-screen sw-page-bg text-zinc-100 grain" data-testid="donations-page">
      <Navbar />
      <main className="relative z-10 mx-auto max-w-3xl px-4 pb-20 pt-36">
        {donated > 0 ? (
          <div className="glass rounded-3xl p-10 text-center" data-testid="donation-thanks">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-400/25">
              <Heart className="h-6 w-6" />
            </span>
            <h1 className="mt-4 font-display text-3xl font-black text-zinc-50">Thank you{donated ? ` for the $${donated.toFixed(2)}` : ""}.</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
              Your gift pays for servers, domains and the next feature. It means more than the number
              says — this site is kept alive by the people who like it enough to pay for it.
            </p>
            <a
              href="/!/pricing"
              className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.07]"
              data-testid="thanks-to-premium"
            >
              <Crown className="h-3.5 w-3.5 text-brand-300" /> Never donate again — go Premium
            </a>
          </div>
        ) : (
          <>
            <div className="mb-10 text-center">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full glass px-3 py-1 font-mono2 text-xs text-brand-300">
                <Sparkles className="h-3.5 w-3.5" /> SUPPORT THE SITE
              </div>
              <h1 className="font-display text-4xl font-black text-zinc-50 sm:text-5xl">Keep swats.bio alive.</h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-500">
                Hosting, domains, the mail provider, moderation tooling — donations cover the bills so
                the site stays free to use and ad-free. Every amount helps, and every amount is read as
                "keep going".
              </p>
            </div>

            <div className="glass rounded-3xl p-7" data-testid="donation-card">
              <h2 className="flex items-center gap-2 font-display text-base font-bold text-zinc-100">
                <Heart className="h-4 w-4 text-rose-300" /> Card donation
              </h2>
              <p className="mt-1 text-xs text-zinc-500">One-time, processed by Stripe. No account stored, no subscription.</p>

              <div className="mt-5 flex flex-wrap gap-2" data-testid="donation-presets">
                {PRESETS.map((usd) => (
                  <button
                    key={usd}
                    type="button"
                    disabled={busy}
                    onClick={() => setAmount(usd)}
                    data-testid={`donation-preset-${usd}`}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      amount === usd
                        ? "bg-brand-500/20 text-brand-100 ring-1 ring-brand-400/30"
                        : "border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
                    }`}
                  >
                    ${usd}
                  </button>
                ))}
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5">
                  <span className="text-sm text-zinc-500">$</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    onBlur={() => {
                      if (PRESETS.includes(amount)) return;
                      if (!Number.isFinite(amount) || amount < 1 || amount > 500) {
                        setAmount(5);
                      }
                    }}
                    data-testid="donation-custom"
                    aria-label="Custom amount in USD"
                    className="w-16 bg-transparent text-sm text-zinc-100 outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => donate(amount)}
                disabled={busy || !Number.isFinite(amount) || amount < 1 || amount > 500}
                data-testid="donation-submit"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-brand-500 px-5 py-3.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
                Donate ${Number.isFinite(amount) ? amount : "—"} with card
              </button>
              {!user && (
                <p className="mt-2 text-center text-[11px] text-zinc-500" data-testid="donation-signin-hint">
                  You will be asked to sign in first — donations ride on an account so the Donator badge can find you.
                </p>
              )}
            </div>

            {/* Crypto: server-configured, copyable, no middleman. */}
            {config && (config.btc || config.eth || config.ltc) && (
              <div className="glass mt-5 rounded-3xl p-7" data-testid="donation-crypto">
                <h2 className="font-display text-base font-bold text-zinc-100">Crypto</h2>
                <p className="mt-1 text-xs text-zinc-500">Straight to the wallet, no processor in the middle.</p>
                <div className="mt-4 space-y-2.5">
                  {[
                    ["Bitcoin", config.btc],
                    ["Ethereum", config.eth],
                    ["Litecoin", config.ltc],
                  ]
                    .filter(([, addr]) => addr)
                    .map(([coin, addr]) => (
                      <div
                        key={coin}
                        className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5"
                        data-testid={`crypto-${coin.toLowerCase()}`}
                      >
                        <span className="w-20 shrink-0 text-xs font-semibold text-zinc-300">{coin}</span>
                        <code className="min-w-0 flex-1 truncate font-mono2 text-[11px] text-zinc-400">{addr}</code>
                        <button
                          type="button"
                          onClick={() => copy(addr)}
                          className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/[0.08]"
                        >
                          Copy
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="glass mt-5 flex flex-col items-center gap-3 rounded-3xl p-7 text-center sm:flex-row sm:text-left" data-testid="donation-premium-nudge">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-500/12 text-brand-200 ring-1 ring-brand-400/25">
                <Crown className="h-5 w-5 text-brand-400" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-zinc-100">The gift that keeps giving: Premium</h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  $5 a month, recurring — cheaper for you over time, and it funds the boring but vital stuff.
                </p>
              </div>
              <a
                href="/!/pricing"
                data-testid="donate-to-premium"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:brightness-110"
              >
                <ExternalLink className="h-3.5 w-3.5" /> See Premium
              </a>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
