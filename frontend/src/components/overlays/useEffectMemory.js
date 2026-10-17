import { useCallback, useState } from "react";

/* ---------------------------------------------------------------------------
   Per-picker memory: favourites and a short "recently used" list.

   Keyed by the picker's testid so the text effects and the overlay effects keep
   separate lists (an id is only unique inside its own catalog). Stored in
   localStorage and read lazily on mount, so a bad value can never break the
   editor — anything that is not an array of strings is treated as empty.
   --------------------------------------------------------------------------- */

const RECENT_MAX = 8;

const read = (key) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string" && v) : [];
  } catch {
    return [];
  }
};

const write = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota — memory is a convenience, never a requirement.
  }
};

export function useEffectMemory(testid = "fx") {
  const favKey = `swats_fx_favorites:${testid}`;
  const recentKey = `swats_fx_recent:${testid}`;

  const [favorites, setFavorites] = useState(() => read(favKey));
  const [recent, setRecent] = useState(() => read(recentKey));

  const toggleFavorite = useCallback((id) => {
    if (!id) return;
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      write(favKey, next);
      return next;
    });
  }, [favKey]);

  const pushRecent = useCallback((id) => {
    if (!id) return;
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_MAX);
      write(recentKey, next);
      return next;
    });
  }, [recentKey]);

  return { favorites, recent, toggleFavorite, pushRecent };
}

export default useEffectMemory;
