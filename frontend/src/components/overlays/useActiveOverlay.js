import { useEffect, useSyncExternalStore } from "react";

/* ---------------------------------------------------------------------------
   The currently open overlay (drawer/picker), as a module-level store.

   The editor needs this OUTSIDE the component that renders the drawers: it
   shifts the profile preview to the left while a picker is open so the card
   stays visible beside the panel. A React context would not do — the provider
   is rendered *inside* the editor, below the component that reads the value —
   so this is a tiny external store instead, the same shape as lib/notify.
   --------------------------------------------------------------------------- */

let active = null;
const listeners = new Set();

const emit = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => active;

export function setActiveOverlay(id) {
  if (active === id) return;
  active = id;
  emit();
}

export function useActiveOverlay() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/* Registers `id` as the open overlay for as long as `open` is true. Clearing on
   close only happens if this id is still the registered one: two pickers can be
   open at the same time, and the first one to close must not blank the second. */
export function useRegisterOverlay(id, open) {
  useEffect(() => {
    if (!open || !id) return undefined;
    setActiveOverlay(id);
    return () => {
      if (snapshot() === id) setActiveOverlay(null);
    };
  }, [id, open]);
}

// Only for tests: forget the registration so each case starts clean.
export function resetActiveOverlay() {
  setActiveOverlay(null);
}
