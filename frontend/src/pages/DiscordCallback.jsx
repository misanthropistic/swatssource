import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setToken } from "@/lib/api";
import { toast } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";

/* The landing spot for Discord OAuth. Four outcomes arrive here:
 *
 *   ?token=…&linked=1   Discord was connected to the account already signed in.
 *   ?token=…            A sign-in (existing account matched, or a new one made).
 *   ?session=1          The same, with cookie sessions on: the token is in the
 *                       HttpOnly cookie the callback already set, and never in
 *                       the URL — where it would sit in history, the referrer
 *                       header and every log between here and Discord.
 *   ?link=taken         That Discord account already belongs to someone else.
 *   ?paired=1           Discord was used to ADD a second account to this one
 *                       (no session change — the accounts are now a pair).
 *   ?pair=missing       That Discord identity has no swats account to pair with.
 *   ?pair=same          That is the account already on screen.
 *
 * `linked=1` exists so a connect no longer looks like a fresh sign-in — the
 * session on screen is the same account it always was, now with Discord on it.
 */
export default function DiscordCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    const token = params.get("token");
    const cookieSession = params.get("session");
    const linked = params.get("linked");
    const linkError = params.get("link");
    const paired = params.get("paired");
    const pairError = params.get("pair");

    // HISTORY SCRUB: everything this page was reached with — including a legacy
    // ?token=…, which is a live session credential — is wiped off the visible
    // URL the moment it is read. The address bar and the back button then never
    // carry a token into another tab, a screenshot or a share.
    if (token || cookieSession || linked || linkError || paired || pairError) {
      window.history.replaceState(null, "", "/!/auth/discord");
    }

    // Pairing never signs anyone in: the session is the same account it was
    // before, so there is no token to adopt and nothing to refresh. Only the
    // pairing list moved, and the account menu re-reads that when it opens.
    if (paired) {
      toast.success("Account added — switch between them from the account menu");
      navigate("/!/dashboard");
      return;
    }

    if (pairError === "missing") {
      toast.error("That Discord isn't connected to a swats.bio account yet. Create the account with it first.");
      navigate("/!/dashboard");
      return;
    }

    if (pairError === "same") {
      toast.error("That is the account you're already signed into.");
      navigate("/!/dashboard");
      return;
    }

    if (linkError === "taken") {
      toast.error("That Discord account is already connected to another swats.bio account.");
      navigate("/!/dashboard");
      return;
    }

    if (token) setToken(token);

    if (token || cookieSession) {
      // refresh() asks /auth/me, which is also the check that a cookie session
      // really landed before we navigate into a dashboard that needs one.
      refresh().then((user) => {
        if (!user && cookieSession) {
          navigate("/!/login?discord=error");
          return;
        }
        if (linked) toast.success("Discord connected to your account");
        navigate("/!/dashboard");
      });
    } else {
      navigate("/!/login?discord=error");
    }
  }, [params, navigate, refresh]);

  // This page exists for about two frames — it navigates immediately in every
  // branch. An empty shell is all it ever needs to show.
  return <div className="min-h-screen sw-page-bg" />;
}
