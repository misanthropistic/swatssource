import { useEffect, useSyncExternalStore } from "react";

/* ---------------------------------------------------------------------------
   The hover preview of the effect store, as a module-level store.

   The store's tiles preview the effect you are pointing at on the real profile
   card. That override travels through a store rather than editor state because
   of what re-rendering costs: the editor is one large component (the profile
   form, five pickers, the drawers) and every hover used to re-render all of it,
   twice per tile swept over, before the card even painted. The card subscribes
   here instead, so a hover re-renders the card and nothing else.

   Same shape as lib/notify and overlays/useActiveOverlay: tiny, no provider, so
   it works no matter where in the tree the reader sits.
   --------------------------------------------------------------------------- */

let current = null; // { slot: "name" | "bio", id } | null
const listeners = new Set();

const emit = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const snapshot = () => current;

export function setFxPreview(slot, id) {
  const next = slot && id ? { slot, id } : null;
  const same =
    (next === null && current === null) ||
    (next && current && next.slot === current.slot && next.id === current.id);
  if (same) return;
  current = next;
  emit();
}

/* Subscribes to the override. Returns null when no tile is being pointed at. */
export function useFxPreview() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/* Leaving the editor must not leave a hover override behind: the next mount
   would start with someone else's preview applied to the card. */
export function useClearFxPreviewOnUnmount() {
  useEffect(() => () => { setFxPreview(null, null); }, []);
}

// Only for tests: forget the override so each case starts clean.
export function resetFxPreview() {
  setFxPreview(null, null);
}
