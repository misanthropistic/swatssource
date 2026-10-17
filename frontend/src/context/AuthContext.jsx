import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, setToken, clearToken, apiError } from "@/lib/api";
import { startDiscordAuth } from "@/lib/discord";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // null = checking, false = anon, object = user
  // The accounts this session can swap to: [{ id, username, display_name,
  // avatar_url, tier }], current first. Populated by the account-menu load.
  const [switchable, setSwitchable] = useState([]);

  /* Always ask the server who we are, rather than trusting the presence of a
     stored token. With cookie sessions the token is not readable from here at
     all, and the session cookie is what identifies us; without them, the Bearer
     header carries it. Either way the answer is the same request. */
  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch {
      clearToken();
      setUser(false);
      return false;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /* The paired-account list. A failure is quiet on purpose: the menu just
     renders as if no other account was linked. */
  const loadSwitchable = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/switchable");
      setSwitchable(data.accounts || []);
    } catch {
      setSwitchable([]);
    }
  }, []);

  /* Swap the session to another paired account. The server answers exactly
     like a sign-in — new user, cookie/bearer as the session mode dictates — so
     the only client job is to adopt it and refresh the pairing list. */
  const switchAccount = useCallback(async (targetId) => {
    try {
      const { data } = await api.post(`/auth/switch/${targetId}`);
      if (data.token) setToken(data.token);
      setUser(data.user);
      await loadSwitchable();
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, error: apiError(e.response?.data?.detail) };
    }
  }, [loadSwitchable]);

  /* Pair another account with this one by signing into it once. */
  const linkAccount = useCallback(async (identifier, password, code) => {
    try {
      const { data } = await api.post("/auth/link-account", {
        identifier, password, ...(code ? { code } : {}),
      });
      setSwitchable(data.accounts || []);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        code: e.response?.data?.code,
        error: apiError(e.response?.data?.detail),
      };
    }
  }, []);

  /* Add another account the way this site makes accounts: with Discord. The
     server stages a `pair` intent against the current session, the visitor signs
     into the SECOND Discord account, and the callback links the two swats
     accounts mutually. Nothing here asks for a password — an account created
     through Discord has none to ask for. */
  const startPair = useCallback(async () => {
    try {
      // One implementation of "start Discord OAuth" for every mode (lib/discord).
      await startDiscordAuth("pair");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: apiError(e.response?.data?.detail) || e.message };
    }
  }, []);

  const unlinkAccount = useCallback(async (targetId) => {
    try {
      const { data } = await api.delete(`/auth/link-account/${targetId}`);
      setSwitchable(data.accounts || []);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: apiError(e.response?.data?.detail) };
    }
  }, []);

  /* `code` is the 2FA code, sent on the second attempt. The backend answers 401
     with `code: 'totp_required'` when the account has a second factor and none
     was sent, which is the signal the sign-in page uses to ask for it — that is
     why the failure is returned whole rather than flattened into a message. */
  const login = async (email, password, code) => {
    try {
      const { data } = await api.post("/auth/login", { email, password, ...(code ? { code } : {}) });
      if (data.token) setToken(data.token);
      setUser(data.user);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        code: e.response?.data?.code,
        error: apiError(e.response?.data?.detail),
      };
    }
  };

  const register = async (payload) => {
    try {
      const { data } = await api.post("/auth/register", payload);
      // Absent under cookie sessions, where the token is HttpOnly instead.
      if (data.token) setToken(data.token);
      setUser(data.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: apiError(e.response?.data?.detail) };
    }
  };

  const logout = async () => {
    // The browser copy goes first (so the UI is signed out even if the network
    // is down), then the server is told — under cookie sessions the cookie is
    // the session, and only the server can expire it.
    clearToken();
    setUser(false);
    try {
      await api.post("/auth/logout", {}, { silent: true });
    } catch {
      // A failed logout is not worth an error surface; the token is gone here.
    }
  };

  return (
    <AuthCtx.Provider value={{
      user, setUser, login, register, logout, refresh,
      switchable, loadSwitchable, switchAccount, linkAccount, startPair, unlinkAccount,
    }}>
      {children}
    </AuthCtx.Provider>
  );
};
