import { api } from "@/lib/api";
import { toast } from "@/lib/notify";

export const DISCORD_INVITE = "https://discord.gg/a9uwptuepD";

/* Starts Discord OAuth and sends the browser to it.
 *
 * `mode: "link"` connects Discord to the account that is already signed in.
 * The session travels in this request's session cookie, and the backend stages
 * the link under a one-time nonce that goes into the OAuth state — no token is
 * ever placed in a URL, so it cannot leak through Discord's history, referrer
 * or logs. Without a session the backend refuses to link and sends the visitor
 * back to the sign-in page instead of making an account.
 *
 * `mode: "login"` is a plain sign-in: the callback matches an existing account
 * by Discord id, then by email, and only creates one when nothing matches.
 *
 * `mode: "pair"` is "add another account": it signs into a SECOND Discord
 * account and links the two swats accounts so the dashboard can switch between
 * them. The current session is deliberately unchanged.
 */
export async function startDiscordAuth(mode = "link") {
  const params = { mode };
  const { data } = await api.get("/auth/discord/login", { params });
  if (!data?.url) throw new Error("Discord sign-in is not available right now");
  window.location.href = data.url;
}

// Same thing with the error handling every caller would otherwise repeat.
export async function connectDiscord(mode = "link") {
  try {
    await startDiscordAuth(mode);
    return true;
  } catch (err) {
    toast.error(err.response?.data?.detail || err.message || "Could not start Discord sign-in");
    return false;
  }
}
