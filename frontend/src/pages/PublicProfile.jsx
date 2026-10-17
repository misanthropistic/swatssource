import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { buildCrosshairCursor, crosshairSettings } from "@/lib/crosshair";
import { useProfileViewTracker } from "@/lib/viewTracker";
import { ProfilePreview, viewsInCorner, compactCount } from "@/components/ProfilePreview";
import { CursorEffect } from "@/components/CursorEffect";
import { CustomCursor } from "@/components/CustomCursor";
import { Eye } from "lucide-react";

// Where a moved view counter sits. The four corners are the page's, not the
// card's, so it stays put whatever the card is doing.
const CORNER_CLASS = {
  tl: "left-4 top-4",
  tr: "right-4 top-4",
  bl: "left-4 bottom-4",
  br: "right-4 bottom-4",
};

export default function PublicProfile() {
  const { alias } = useParams();
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [entered, setEntered] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    api.get(`/u/${alias}`).then(({ data }) => setData(data)).catch(() => setNotFound(true));
  }, [alias]);

  useEffect(() => {
    // GET /api/u/:alias returns the profile fields at the top level, not nested
    // under `user` — reading data.user meant this block never ran, so the tab
    // title and Open Graph tags kept the landing-page defaults on every profile.
    if (data && data.username) {
      const name = data.display_name || data.username || alias;
      const mp = data.profile || {};

      // The Metadata editor wins when its fields are filled; empty fields fall
      // back to the built-ins (name, bio, avatar) so blank entries are safe.
      const metaTitle = mp.meta_title || `${name} on swats.bio`;
      const metaDesc =
        mp.meta_description || mp.bio || `Check out ${name}'s bio link on swats.bio`;
      const metaImage = mp.meta_image || mp.avatar_url || "/logo.png";

      document.title = `swats | ${mp.meta_title || name}`;

      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute("content", metaTitle);

      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute("content", metaDesc);

      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) ogImage.setAttribute("content", metaImage);

      const themeColor = document.querySelector('meta[name="theme-color"]');
      if (themeColor && mp.theme_color) themeColor.setAttribute("content", mp.theme_color);
    } else if (notFound) {
      document.title = `swats | User Not Found`;
    }
  }, [data, alias, notFound]);

  const p = data?.profile || {};
  const needsEntry = !!p.entry_enabled;
  const isEntered = !needsEntry || entered;
  const ready = isEntered;

  // The view count the server reported at load time, replaced once this visit
  // is registered (after dwell + proof of work). A view is only counted once the
  // page is genuinely being looked at — entry-gated profiles count after the
  // visitor clicks in, which also supplies the gesture the browser wants.
  const [views, setViews] = useState(null);
  useEffect(() => {
    if (data && typeof data.views === "number") setViews(data.views);
  }, [data]);
  useProfileViewTracker(alias, { enabled: !!data && ready, onCount: setViews });
  const viewData = useMemo(
    () => (data && views != null ? { ...data, views } : data),
    [data, views],
  );

  // Browsers deny audio-with-sound until the visitor has interacted with the
  // page, which is why the track silently never started: the one attempt ran on
  // page load (no gesture yet) and the catch was swallowed. Now: try once in
  // case the browser allows it, fall back to a muted start (always allowed) so
  // the track is at least loaded and positioned, and start the real unmuted
  // playback on the very first click/keypress anywhere on the profile.
  useEffect(() => {
    if (!data || !ready) return;
    const el = document.getElementById("profile-bg-audio");
    if (!el) return;

    const attempt = (withSound) => {
      el.muted = !withSound;
      const res = el.play();
      if (res && typeof res.catch === "function") {
        res.catch(() => {
          if (withSound) attempt(false); // denied with sound → muted start
        });
      }
    };
    attempt(true);

    const kick = () => {
      if (el.muted) {
        el.muted = false;
        el.play().catch(() => {});
      }
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
      window.removeEventListener("touchstart", kick);
    };
    window.addEventListener("pointerdown", kick, { passive: true });
    window.addEventListener("keydown", kick);
    window.addEventListener("touchstart", kick, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
      window.removeEventListener("touchstart", kick);
    };
  }, [data, ready]);

  // The owner's crosshair replaces the arrow on this page only. The image is
  // drawn through a canvas so the saved scale can go beyond the browser's own
  // 128px cursor limit, and the hotspot is the saved click point.
  useEffect(() => {
    const settings = crosshairSettings(data?.profile || {});
    if (!settings.image) return undefined;
    let cancelled = false;
    buildCrosshairCursor(fileUrl(settings.image), settings).then((cursor) => {
      if (cancelled || !cursor) return;
      document.body.style.cursor = cursor.value;
    });
    return () => {
      cancelled = true;
      document.body.style.cursor = "";
    };
  }, [data]);

  // The Code Lock gate. The PIN is the profile's own entry_text; with no PIN
  // saved the gate stays click-to-enter so a page can never lock its owner out.
  const codeLock = (data?.profile?.entry_style || "") === "codelock" && !!needsEntry && !entered;
  const savedPin = String(data?.profile?.entry_text || "").trim();
  const pinActive = codeLock && savedPin.length > 0;

  const handleEnter = () => {
    setEntered(true);
    // Unmute / play background audio directly inside this synchronous user gesture:
    const audio = document.getElementById("profile-bg-audio");
    if (audio) {
      audio.muted = false;
      try {
        const p = audio.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (_) {}
    }
    // Dispatch custom event for immediate unmuted playback:
    window.dispatchEvent(new CustomEvent("swats:user-entered"));

    // Also trigger track audio play:
    const playBtn = document.querySelector('[data-testid="track-play-btn"]');
    if (playBtn) playBtn.click();
    setTimeout(() => {
      const playBtn2 = document.querySelector('[data-testid="track-play-btn"]');
      if (playBtn2) playBtn2.click();
    }, 40);
  };

  useEffect(() => {
    if (!pinActive) return undefined;
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        setPinError(false);
        setPin((prev) => {
          const next = (prev + e.key).slice(0, 4);
          if (next.length === 4) {
            if (next === savedPin.slice(0, 4)) {
              handleEnter();
              return "";
            }
            setPinError(true);
            return "";
          }
          return next;
        });
      } else if (e.key === "Backspace") {
        setPin((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinActive, savedPin]);

  if (notFound) {
    return (
      <div className="min-h-screen sw-page-bg flex flex-col items-center justify-center text-center px-4" data-testid="public-notfound">
        <img src="/logo.png" alt="swats.bio" className="w-16 h-16 rounded-2xl mb-4 object-contain shadow-[0_0_30px_rgba(164, 141, 244,0.4)]" />
        <div className="font-display text-5xl font-black text-zinc-100">404</div>
        <p className="mt-3 text-zinc-400">swats.bio/{alias} isn't claimed yet.</p>
        <Link to={`/!/login?claim=${alias}`} className="mt-6 px-5 py-2.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold hover:brightness-110 transition">Claim this name</Link>
      </div>
    );
  }
  if (!data) return <div className="min-h-screen sw-page-bg" />;

  return (
    <div
      className="min-h-screen sw-page-bg"
      data-testid="public-profile-page"
      data-menu-id="profile"
      data-menu-name={data.username || ""}
      data-menu-href={`/${data.username || ""}`}
    >
      {/* Custom Cursor with smooth 60fps animated GIF support */}
      <CustomCursor profile={p} />

      {needsEntry && !entered && (
        <div
          data-testid="entry-gate"
          className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-500 ${pinActive ? "" : "cursor-pointer"}`}
          style={{
            backgroundColor: `rgba(6, 6, 8, ${(p.entry_dim ?? 95) / 100})`,
            backdropFilter: `blur(${p.entry_blur || "16px"})`,
            WebkitBackdropFilter: `blur(${p.entry_blur || "16px"})`,
          }}
          onClick={pinActive ? undefined : handleEnter}
        >
          {p.entry_style === "text" ? (
            <div className="flex flex-col items-center gap-2 text-center p-4">
              <div className="text-zinc-200 font-mono2 text-sm uppercase tracking-widest hover:text-white transition-colors drop-shadow-[0_0_15px_rgba(164, 141, 244,0.7)]">
                {p.entry_text || "Click to enter"}
              </div>
              {p.entry_subtext && (
                <div className="text-[11px] font-mono2 text-zinc-500 uppercase tracking-wider">{p.entry_subtext}</div>
              )}
            </div>
          ) : p.entry_style === "terminal" ? (
            <div className="flex flex-col items-center gap-3 text-center p-4">
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-5 py-3 font-mono2 text-xs font-bold uppercase tracking-widest text-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.3)] hover:scale-105 transition-transform">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span>{p.entry_text || "> [CLICK_TO_DECRYPT_PROFILE]"}</span>
              </div>
              {p.entry_subtext && (
                <div className="font-mono2 text-[10px] text-zinc-500 tracking-wider">{p.entry_subtext}</div>
              )}
            </div>
          ) : p.entry_style === "glitch" ? (
            <div className="flex flex-col items-center gap-3 text-center p-4">
              <div className="relative rounded-2xl border border-cyan-400/40 bg-black/70 px-7 py-3.5 font-mono2 text-xs font-bold uppercase tracking-widest text-cyan-200 shadow-[0_0_30px_rgba(0,240,255,0.3)] hover:scale-105 transition-all">
                <span className="relative z-10">{p.entry_text || "ACCESS // SYSTEM"}</span>
                <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/20 to-pink-500/20 opacity-60 blur-sm" />
              </div>
              {p.entry_subtext && (
                <div className="font-mono2 text-[10px] text-zinc-400 tracking-wider">{p.entry_subtext}</div>
              )}
            </div>
          ) : p.entry_style === "pulse" ? (
            <div className="flex flex-col items-center gap-4 text-center p-4">
              <div className="relative flex items-center justify-center">
                <span className="pointer-events-none absolute h-20 w-20 rounded-full border border-brand-400/40 animate-ping" />
                <span className="pointer-events-none absolute h-28 w-28 rounded-full border border-brand-400/20 animate-pulse" />
                <div className="relative rounded-full border border-brand-400/60 bg-brand-500/25 px-7 py-3.5 text-sm font-semibold text-brand-100 shadow-[0_0_35px_rgba(164, 141, 244,0.5)] backdrop-blur hover:scale-105 transition-transform">
                  {p.entry_text || "Click to Listen & Enter"}
                </div>
              </div>
              {p.entry_subtext && (
                <div className="text-xs text-zinc-400 font-medium">{p.entry_subtext}</div>
              )}
            </div>
          ) : p.entry_style === "codelock" ? (
            <div className="text-center space-y-4" data-testid="codelock-gate">
              <div className="text-zinc-500 font-mono2 text-xs uppercase tracking-widest mb-6">Enter PIN</div>
              <div className={`flex items-center justify-center gap-3 ${pinError ? "pin-shake" : ""}`}>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-4 w-4 rounded-full border-2 transition-colors ${pin.length > i ? "border-brand-400 bg-brand-400" : pinError ? "border-red-500" : "border-zinc-700 bg-transparent"}`}
                  />
                ))}
              </div>
              {pinError ? (
                <div className="font-mono2 text-[10px] uppercase tracking-widest text-red-400" data-testid="codelock-error">Incorrect PIN</div>
              ) : pinActive ? (
                <div className="mt-8 font-mono2 text-[10px] uppercase text-zinc-400">Type the 4-digit PIN</div>
              ) : (
                <div className="mt-8 font-mono2 text-[10px] uppercase text-zinc-400">Click anywhere to unlock</div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5 text-center p-4">
              <div className={`px-6 py-3 rounded-full border border-white/15 bg-white/5 text-zinc-200 text-sm font-semibold shadow-[0_0_30px_rgba(255,255,255,0.06)] hover:bg-white/10 transition-all hover:scale-105 ${p.entry_anim !== false ? "animate-pulse" : ""}`}>
                {p.entry_text || "Click to enter"}
              </div>
              {p.entry_subtext && (
                <div className="text-xs text-zinc-400">{p.entry_subtext}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Background Audio */}
      {p.audio_url && (
        <audio id="profile-bg-audio" src={fileUrl(p.audio_url)} loop autoPlay={ready} />
      )}

      {/* The cursor effect and the pet wait behind the entry gate */}
      {ready && <CursorEffect effect={p.cursor_effect} accent={p.accent_color} />}
      <ProfilePreview data={viewData} backgroundAudio={!!p.audio_url && p.audio_controls !== false} autoPlayAudio={ready} />

      {/* A moved view counter: the four corners are the page's, and "hidden"
          draws it nowhere at all (the card drops it from its meta line too). */}
      {viewsInCorner(p.views_position) && views != null && (
        <div
          data-testid="views-corner"
          className={`fixed z-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 font-mono2 text-[11px] text-zinc-300 backdrop-blur ${CORNER_CLASS[p.views_position]}`}
        >
          <Eye className="h-3.5 w-3.5" />
          {compactCount(views)}
        </div>
      )}

      {p.hide_footer !== true && (
        // A small pill, not a bar: logo and logotype only, hugging their own
        // content instead of stretching a glass bar across the bottom of the
        // page.
        <Link to="/!/home" className="fixed bottom-3 left-1/2 -translate-x-1/2 z-20 inline-flex w-auto items-center gap-1 rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[10px] font-medium leading-none text-zinc-400 backdrop-blur transition-colors hover:text-zinc-100" data-testid="profile-footer-pill" title="made in swats">
          <img src="/logo.png" alt="swats.bio" className="h-3 w-3 rounded-sm object-contain" /> swats
        </Link>
      )}
    </div>
  );
}
