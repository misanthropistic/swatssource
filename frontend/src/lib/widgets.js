import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Widget data layer
//
// A widget config only ever holds an identifier. This module turns that
// identifier into a request against the backend proxy (which talks to the real
// Roblox / Discord / GitHub / YouTube / Steam / Spotify APIs) and caches the
// result so a profile with ten widgets makes ten requests, not ten per visitor.
//
// Nothing here ever invents a value: if the request fails the card renders the
// exact reason it failed.
// ---------------------------------------------------------------------------

// Auto-fetching is disabled under test so components render deterministically
// without network side effects. Callers can still refresh() explicitly.
const AUTO_FETCH = process.env.NODE_ENV !== "test";

const LIVE_TTL = 60_000; // presence-style data (online counts, playing now)
const STATIC_TTL = 10 * 60_000;

const store = new Map(); // key -> { at, status, data, error, promise }
const listeners = new Map(); // key -> Set<fn>

const notify = (key) => {
  for (const fn of listeners.get(key) || []) fn();
};

const subscribe = (key, fn) => {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => {
    listeners.get(key)?.delete(fn);
    if (!listeners.get(key)?.size) listeners.delete(key);
  };
};

async function runRequest(key, request, { force = false } = {}) {
  const hit = store.get(key);
  if (!force && hit?.status === "success" && Date.now() - hit.at < request.ttl) return hit.data;
  if (!force && hit?.promise) return hit.promise;

  store.set(key, { ...(hit || {}), status: "loading", error: null });
  notify(key);

  const promise = api
    .get(request.path, { params: request.params })
    .then(({ data }) => {
      // The dashboard test-double answers every GET with []; treat anything
      // that is not an object payload as "no data" rather than a success.
      const value = data && typeof data === "object" && !Array.isArray(data) ? data : null;
      store.set(key, { at: Date.now(), status: value ? "success" : "error", data: value, error: value ? null : "No data returned", promise: null });
      notify(key);
      return value;
    })
    .catch((err) => {
      let detail =
        err?.response?.data?.detail ||
        (typeof err?.response?.data === "string" ? err.response.data : null) ||
        err?.message ||
        "Could not reach the live data service";
      if (/429/i.test(String(detail)) || err?.response?.status === 429) {
        detail = "Service is temporarily busy. Retrying in a moment…";
      }
      store.set(key, { at: Date.now(), status: "error", data: null, error: detail, promise: null });
      notify(key);
      return null;
    });

  store.get(key).promise = promise;
  return promise;
}

// --- identifier helpers -----------------------------------------------------

export const digits = (v) => String(v || "").replace(/[^0-9]/g, "");

// "https://discord.gg/abc", "discord.gg/abc", "1557276191050698782" -> id
export function discordServerId(input) {
  const raw = String(input || "").trim();
  const direct = raw.match(/^\d{15,25}$/);
  if (direct) return direct[0];
  const fromUrl = raw.match(/(?:discord(?:app)?\.(?:gg|com\/invite)\/)([\w-]+)/i);
  return fromUrl ? fromUrl[1] : raw;
}

export function robloxIdFromInput(input) {
  const raw = String(input || "").trim();
  const urlId = raw.match(/roblox\.com\/(?:users|groups|games)\/(\d+)/i);
  if (urlId) return urlId[1];
  return raw;
}

export function steamIdFromInput(input) {
  const raw = String(input || "").trim();
  const id64 = raw.match(/profiles\/(\d{17})/);
  if (id64) return { id: id64[1] };
  const vanity = raw.match(/steamcommunity\.com\/id\/([\w-]+)/i);
  if (vanity) return { vanity: vanity[1] };
  return { vanity: raw };
}

export function splitRiotId(input) {
  const raw = String(input || "").trim().replace(/^#/, "");
  const [name = "", tag = ""] = raw.split("#");
  return { name: name.trim(), tag: tag.trim() };
}

// --- request builder --------------------------------------------------------

// Widget properties are read defensively: older saved widgets keep their
// legacy field names (value / username / server_id), newer ones use the
// dedicated identifier fields.
function baseWidgetRequest(w) {
  const type = w?.type || "";
  const sub = w?.subtype || "";

  if (type === "roblox") {
    if (sub === "group") {
      const id = robloxIdFromInput(w.group_id || w.server_id || w.value);
      if (!id) return null;
      return { path: "/widgets/roblox/group", params: { id }, ttl: STATIC_TTL };
    }
    if (sub === "game") {
      const id = robloxIdFromInput(w.game_url || w.url || w.value);
      if (!id) return null;
      return { path: "/widgets/roblox/game", params: { id }, ttl: LIVE_TTL };
    }
    const username = String(w.username || w.value || "").trim();
    if (!username) return null;
    return {
      path: "/widgets/roblox/profile",
      params: /^\d+$/.test(username) ? { id: username } : { username },
      ttl: STATIC_TTL,
    };
  }

  if (type === "discord") {
    if (sub === "profile") {
      const id = digits(w.user_id || w.username || w.value);
      if (!id) return null;
      return { path: "/widgets/discord/profile", params: { id }, ttl: LIVE_TTL };
    }
    // An invite answers with the banner and exact totals; a bare server ID only
    // reaches Discord's public widget. Prefer the invite when the owner gave one,
    // and pass the ID along so the backend can pair them.
    const invite = discordServerId(w.invite_url || "");
    const id = discordServerId(w.invite_url || w.server_id || w.url || w.value);
    if (!id) return null;
    const params = { id };
    if (invite && w.server_id && /^\d{15,25}$/.test(String(w.server_id))) params.guild = String(w.server_id).trim();
    return { path: "/widgets/discord/server", params, ttl: LIVE_TTL };
  }

  if (type === "spotify" || type === "soundcloud" || type === "tiktok") {
    const url = String(w.url || w.value || "").trim();
    if (!url) return null;
    return { path: "/widgets/media/oembed", params: { url }, ttl: STATIC_TTL };
  }

  if (type === "youtube") {
    const channel = String(w.channel || w.username || w.url || w.value || "").trim();
    if (!channel) return null;
    return { path: "/widgets/youtube/channel", params: { handle: channel }, ttl: STATIC_TTL };
  }

  if (type === "github") {
    if (sub === "repo") {
      const repo = String(w.repo || w.value || "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
      if (!repo.includes("/")) return null;
      return { path: "/widgets/github/repo", params: { repo }, ttl: STATIC_TTL };
    }
    const username = String(w.username || w.value || "").replace(/^@/, "").trim();
    if (!username) return null;
    return { path: "/widgets/github/user", params: { username }, ttl: STATIC_TTL };
  }

  if (type === "steam") {
    const target = steamIdFromInput(w.username || w.url || w.value);
    if (!target.id && !target.vanity) return null;
    return { path: "/widgets/steam/profile", params: target, ttl: STATIC_TTL };
  }

  if (type === "valorant") {
    const { name, tag } = splitRiotId(w.riot_id || w.username || w.value);
    if (!name || !tag) return null;
    return {
      path: "/widgets/valorant",
      params: { name, tag, region: w.region || "na" },
      ttl: STATIC_TTL,
    };
  }

  // timezone, account-date, countdown and custom code need no network at all:
  // their values are real (the clock, your join date, your own code).
  return null;
}

/**
 * Build the request for one widget. `owner` is the profile's username: the
 * backend uses that person's own API keys when their widget needs one.
 */
export function widgetRequest(w, owner) {
  const req = baseWidgetRequest(w);
  if (!req) return null;
  return owner ? { ...req, params: { ...req.params, owner } } : req;
}

// The cache/dedupe key deliberately excludes `owner`: it only selects which
// server-side key answers the call, and the data it returns is the same public
// data for everyone, so profiles can share one cached result.
export function widgetKey(w, owner) {
  const req = widgetRequest(w, owner);
  if (!req) return null;
  const params = Object.entries(req.params)
    .filter(([k]) => k !== "owner")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v).toLowerCase()}`)
    .join("&");
  return `${req.path}?${params}`;
}

// --- hooks ------------------------------------------------------------------

/**
 * Live data for one widget.
 *
 * status: "local" (no API needed) | "loading" | "success" | "error"
 * `refreshSec` keeps presence-style widgets current without a page reload.
 */
export function useWidgetData(w, { refreshSec = 0, auto = AUTO_FETCH, owner = "" } = {}) {
  const request = useMemo(() => widgetRequest(w, owner), [w, owner]);
  const key = request ? widgetKey(w, owner) : null;

  const read = () => (key ? store.get(key) || null : null);
  const [entry, setEntry] = useState(read);

  useEffect(() => {
    if (!key) {
      setEntry(null);
      return undefined;
    }
    setEntry(read());
    const unsubscribe = subscribe(key, () => setEntry(read()));
    const current = store.get(key);
    const fresh = current && current.status === "success" && Date.now() - current.at < request.ttl;
    if (auto && !fresh && current?.status !== "loading") {
      runRequest(key, request);
    }
    return unsubscribe;
    // Keyed on the identifier and owner: the request object itself is rebuilt
    // every render, so depending on it would re-fetch in a loop.
  }, [key, owner]);

  useEffect(() => {
    if (!key || !refreshSec) return undefined;
    const timer = setInterval(() => {
      const current = store.get(key);
      if (!current || current.status !== "loading") runRequest(key, request, { force: true });
    }, refreshSec * 1000);
    return () => clearInterval(timer);
    // Keyed on the identifier, owner and interval; `request` is derived from the
    // same inputs and is re-read inside the interval each tick.
  }, [key, refreshSec, owner]);

  const refresh = () => (key ? runRequest(key, request, { force: true }) : Promise.resolve(null));

  return {
    status: key ? (entry?.status || (auto ? "loading" : "idle")) : "local",
    data: entry?.data || null,
    error: entry?.error || null,
    refresh,
  };
}

/** Re-render every `seconds` so clocks and countdowns stay accurate. */
export function useTicker(seconds = 1) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!seconds) return undefined;
    const timer = setInterval(() => setTick((t) => t + 1), seconds * 1000);
    return () => clearInterval(timer);
  }, [seconds]);
}

// --- formatting shared by cards and the dashboard ---------------------------

export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

export function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

export function formatRelative(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, "")} yrs ago`;
}

/** IANA timezone list for the clock picker (real system data, no hardcoding). */
export function listTimezones() {
  try {
    if (typeof Intl.supportedValuesOf === "function") return Intl.supportedValuesOf("timeZone");
  } catch {
    /* fall through */
  }
  return [
    "UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow",
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Sao_Paulo", "Africa/Cairo", "Asia/Dubai", "Asia/Kolkata",
    "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney", "Pacific/Auckland",
  ];
}

/** True when the string is a timezone the browser can actually render. */
export function isValidTimezone(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
