/* ---------------------------------------------------------------------------
   Right-click actions owned by a component

   The context menu is one global listener (components/ContextMenu.jsx), which is
   what lets a surface opt in by writing an attribute instead of wiring a handler.
   That works for the items that only need data — "Copy @name", "Open link" — and
   not at all for the ones that need the component: "Open this conversation" is a
   state change inside the inbox, "Preview this template" belongs to the templates
   page, and neither is a navigation the menu could do on its own.

   So the menu's action table falls through to this registry. A surface registers
   what it can do while it is on screen and takes it back when it unmounts, which
   keeps one page's actions from being offered somewhere else — a menu that
   offers "Delete message" on a page with no messages is worse than no menu.

   Deliberately tiny and deliberately not global state: a Map, two functions, and
   no React. The menu is outside the React tree (it portals to document.body), so
   a context would not reach it.
   --------------------------------------------------------------------------- */

const actions = new Map();

/* Register one action. Returns the function that removes it, so a component can
   do `useEffect(() => registerMenuAction(...), [])` and get the cleanup for free. */
export function registerMenuAction(name, handler) {
  actions.set(name, handler);
  return () => {
    // Only remove it if it is still ours: a second mount may have replaced it
    // between registering and cleaning up.
    if (actions.get(name) === handler) actions.delete(name);
  };
}

export function hasMenuAction(name) {
  return actions.has(name);
}

/* Run a registered action. Returns false when nothing is registered, so the
   caller can fall back to its own handling rather than silently doing nothing. */
export function runMenuAction(name, payload) {
  const handler = actions.get(name);
  if (!handler) return false;
  try {
    handler(payload);
  } catch (err) {
    // A menu action must never throw into the page.
    console.error(`[menu] ${name} failed:`, err);
  }
  return true;
}

/* Testing seam: the registry is module state, so a test needs a way back to a
   clean slate between cases. */
export function clearMenuActions() {
  actions.clear();
}
