import axios from "axios";

const getApiUrl = () => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_API_URL || process.env.VITE_BACKEND_URL;
  if (!envUrl) return "/api";
  const trimmed = envUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/api")) return trimmed;
  return `${trimmed}/api`;
};

export const API = getApiUrl();

/* The API target is only worth printing when it is something the developer has
   to know (an env-configured backend) or in a development build. It used to be
   an unconditional console.log, so every visitor's console opened with a styled
   banner — noise in bug reports and a free hint about the backend to anyone
   poking at the site. */
const API_OVERRIDDEN = !!(process.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_API_URL);
if (API_OVERRIDDEN || process.env.NODE_ENV === "development") {
  console.log(
    `%c[swats.bio]%c Backend API Target: %c${API}%c ${
      API_OVERRIDDEN ? "(from REACT_APP_BACKEND_URL)" : "(default relative /api)"
    }`,
    "color: #FF7FBC; font-weight: bold;",
    "color: #a1a1aa;",
    "color: #38bdf8; font-weight: bold;",
    "color: #71717a; font-style: italic;"
  );
}

const TOKEN_KEY = "swats_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/* The public web origin a profile page lives on. Anything that links a visitor to
 * somebody's page (the landing showcase, a widget caption) has to build the URL
 * from this rather than writing https://swats.bio out by hand — otherwise every
 * staging or self-hosted deploy sends its traffic to production. Override with
 * REACT_APP_PUBLIC_URL. */
export const PUBLIC_ORIGIN = (process.env.REACT_APP_PUBLIC_URL || "https://swats.bio")
  .trim()
  .replace(/\/+$/, "");

export const CONTACT_EMAIL = "riotsoffical@proton.me";

export const profileUrl = (username) =>
  `${PUBLIC_ORIGIN}/${encodeURIComponent(String(username || "").trim())}`;

/* `withCredentials` sends and stores the session cookie. It is what makes cookie
   sessions possible (SESSION_COOKIE=1 on the backend, see SECURITY.md) and is
   harmless when the token travels in localStorage instead — the server only
   ever reads the cookie it set itself. */
export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Treat HTML responses for API routes as misrouted backend errors
const rejectHtml = (res) => {
  const ct = String(res.headers?.["content-type"] || "");
  if (ct.includes("text/html") || (typeof res.data === "string" && res.data.trimStart().startsWith("<"))) {
    return Promise.reject(Object.assign(new Error("API route returned HTML page instead of JSON backend response. Is backend server running and routed correctly?"), { response: res }));
  }
  return res;
};

// Response interceptor with rich console debug reporting
api.interceptors.response.use(
  (res) => rejectHtml(res),
  (err) => {
    // A best-effort request (the profile view counter) is allowed to fail
    // quietly. A visitor reading somebody's page never asked for that request,
    // and a red API error in their console is both alarming and noise — the
    // tracker already reports its outcome behind localStorage.swats_view_debug.
    if (err.config?.silent) return Promise.reject(err);

    /* "Who am I?" answers 401 for every signed-out visitor, which is the normal
       state of the site, not a fault: the app asks on every page load and the
       old behaviour printed a red API error into every anonymous visitor's
       console. A 500 on the same URL still gets reported. */
    const probe = /^\/(auth\/me|auth\/switchable)(\?|$)/;
    if (err.response?.status === 401 && probe.test(String(err.config?.url || ""))) {
      return Promise.reject(err);
    }

    const status = err.response?.status;
    const url = err.config?.url;
    const fullUrl = err.config?.baseURL ? `${err.config.baseURL}${url}` : url;
    const detail = err.response?.data?.detail || err.response?.data || err.message;

    console.error(
      `%c[swats.bio API Error]%c Request to %c${fullUrl}%c failed ${status ? `(Status ${status})` : "(Network Error)"}:`,
      "color: #ef4444; font-weight: bold;",
      "color: #a1a1aa;",
      "color: #f43f5e; font-weight: bold;",
      "color: #a1a1aa;",
      detail
    );
    return Promise.reject(err);
  }
);

export const fileUrl = (path) => {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("blob:") || path.startsWith("data:")) return path;
  // Convert legacy /uploads/ to /api/uploads/ so Vercel proxies it
  if (path.startsWith("/uploads/")) {
    path = `/api${path}`;
  }

  if (path.startsWith("/api/")) {
    const envUrl = process.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_API_URL || process.env.VITE_BACKEND_URL;
    if (envUrl) {
      const base = envUrl.trim().replace(/\/+$/, "").replace(/\/api$/, "");
      return `${base}${path}`;
    }
  }
  return path;
};

export function apiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => (e && e.msg) || JSON.stringify(e)).join(" ");
  if (detail && detail.msg) return detail.msg;
  return String(detail);
}
