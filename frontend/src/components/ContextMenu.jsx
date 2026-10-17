import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { runMenuAction } from "@/lib/menuActions";

/* ---------------------------------------------------------------------------
   The swats right-click menu.

   The browser's own menu is an unstyled grey slab next to a themed black site,
   and it offers nothing about the thing you clicked. This replaces it
   site-wide with one styled menu whose items are what the SURFACE is: a
   profile offers Open / Copy @name / Copy link; a link card offers Open /
   Copy address; a bare background gets the universal set (Back, Forward,
   Reload, Copy, Select all).

   Surfaces declare themselves in JSX with three data attributes rather than
   through callbacks, which is what keeps this attachable everywhere:

     <span data-menu-id="profile" data-menu-name={username}
           data-menu-href={`/${username}`} {...rest}>

   A right-click on anything without a data-menu-id still opens the menu —
   only the universal items — because a click that silently does nothing reads
   as "the site's menu is broken". Programmatic surfaces that own their menus
   (Radix dialogs) win by stopPropagation'ing before it reaches the window.

   The menu closes on any click, any key, a scroll or a blur — the same exits
   the native menu has — and is clamped inside the viewport on both axes, so
   one opened near a screen edge never lands half off-screen.
   --------------------------------------------------------------------------- */

const UNIVERSAL = [
  { label: "Back", action: "back" },
  { label: "Forward", action: "forward" },
  { label: "Reload page", action: "reload" },
  { sep: true },
  { label: "Copy", action: "copy-selection" },
  { label: "Select all", action: "select-all" },
];

/* Items for a surface, from what its attributes describe. */
const buildSurfaceItems = (surface) => {
  const id = surface?.getAttribute?.("data-menu-id") || "";
  const name = surface?.getAttribute?.("data-menu-name") || "";
  const href = surface?.getAttribute?.("data-menu-href") || "";

  /* A conversation row. "Open" goes through the inbox's own action rather than a
     navigation: opening a conversation is state inside the page (it fetches the
     thread, unwraps its key and marks it read), and handing someone to
     /bob instead would leave the inbox entirely. */
  if (id === "thread") {
    const threadId = surface?.getAttribute?.("data-menu-thread-id") || "";
    const kind = surface?.getAttribute?.("data-menu-thread-kind") || "direct";
    return [
      ...(threadId
        ? [{ label: kind === "group" ? "Open this group" : "Open this conversation", action: "open-thread", threadId, silent: true }]
        : []),
      ...(name ? [{ label: `Copy @${name}`, action: "copy", text: `@${name}` }] : []),
      // Only a group has settings to open; a direct message has none.
      ...(kind === "group" && threadId
        ? [{ label: "Group settings", action: "thread-settings", threadId, silent: true }]
        : []),
      { sep: true },
      ...UNIVERSAL,
    ];
  }

  /* A message in the public room. A member can do nothing to somebody else's
     message, so the copy item is the whole menu for them; an admin gets the
     three moderation verbs. Whether the viewer moderates arrives as an
     attribute rather than as an auth check here, because this menu lives
     outside the React tree and has no idea who is signed in. */
  if (id === "global-message") {
    const messageId = surface?.getAttribute?.("data-menu-message-id") || "";
    const body = surface?.getAttribute?.("data-menu-message-body") || "";
    const author = surface?.getAttribute?.("data-menu-message-author") || "";
    const authorId = surface?.getAttribute?.("data-menu-message-author-id") || "";
    const moderate = surface?.getAttribute?.("data-menu-moderate") === "1";
    const items = [
      ...(body ? [{ label: "Copy message", action: "copy", text: body }] : []),
      ...(moderate && messageId
        ? [
            { label: "Edit this message", action: "global-message-edit", messageId, silent: true },
            { label: "Delete this message", action: "global-message-delete", messageId, silent: true },
          ]
        : []),
      ...(moderate && authorId
        ? [
            {
              label: `Silence @${author}`,
              action: "global-message-silence",
              userId: authorId,
              username: author,
              silent: true,
            },
          ]
        : []),
    ];
    return [...(items.length ? [...items, { sep: true }] : []), ...UNIVERSAL];
  }

  /* A badge, wherever it is drawn: the shelf on the overview, the badge page, a
     leaderboard row. The name is what is worth copying; the picture is not a
     link to anything. */
  if (id === "badge") {
    const badgeId = surface?.getAttribute?.("data-menu-badge") || "";
    const label = surface?.getAttribute?.("data-menu-badge-label") || badgeId;
    return [
      ...(label ? [{ label: `Copy “${label}”`, action: "copy", text: label }] : []),
      ...(badgeId ? [{ label: "Copy badge id", action: "copy", text: badgeId }] : []),
      { sep: true },
      ...UNIVERSAL,
    ];
  }

  /* A template card in the marketplace. Previewing is the page's own state, so
     it goes through its registered action. */
  if (id === "template") {
    const templateId = surface?.getAttribute?.("data-menu-template-id") || "";
    const title = surface?.getAttribute?.("data-menu-template-title") || name;
    return [
      ...(templateId
        ? [{ label: "Preview this template", action: "template-preview", templateId, silent: true }]
        : []),
      ...(title ? [{ label: `Copy “${title}”`, action: "copy", text: title }] : []),
      { sep: true },
      ...UNIVERSAL,
    ];
  }

  /* An invite code row in the admin panel. */
  if (id === "invite") {
    const code = surface?.getAttribute?.("data-menu-invite") || "";
    return [
      ...(code ? [{ label: "Copy invite code", action: "copy", text: code }] : []),
      { sep: true },
      ...UNIVERSAL,
    ];
  }

  /* An announcement on the board. */
  if (id === "announcement") {
    const text = surface?.getAttribute?.("data-menu-announcement-text") || "";
    return [
      ...(text ? [{ label: "Copy announcement", action: "copy", text }] : []),
      { sep: true },
      ...UNIVERSAL,
    ];
  }

  if (id === "profile") {
    return [
      { label: "Open this profile", action: "open-profile", username: name },
      ...(!name ? [] : [{ label: `Copy @${name}`, action: "copy", text: `@${name}` }]),
      ...(!href ? [] : [{ label: "Copy profile link", action: "copy", text: href }]),
      { sep: true },
      ...UNIVERSAL,
    ];
  }
  if (id === "user") {
    return [
      ...(!name ? [] : [{ label: "Open this profile", action: "open-profile", username: name }]),
      ...(!name ? [] : [{ label: `Copy @${name}`, action: "copy", text: `@${name}` }]),
      { sep: true },
      ...UNIVERSAL,
    ];
  }
  if (id === "link" && href) {
    return [
      { label: "Open link", action: "open-link", href },
      { label: "Copy address", action: "copy", text: href },
      { sep: true },
      ...UNIVERSAL,
    ];
  }
  if (id === "thread" && name) {
    return [
      { label: "Open conversation", action: "open-thread", username: name },
      { label: `Copy @${name}`, action: "copy", text: `@${name}` },
      { sep: true },
      ...UNIVERSAL,
    ];
  }
  return UNIVERSAL;
};

/* One run() switch, so adding a surface never means wiring a new callback. */
const run = (item, close) => {
  close();
  try {
    switch (item.action) {
      case "back":
        history.back();
        break;
      case "forward":
        history.forward();
        break;
      case "reload":
        location.reload();
        break;
      case "copy":
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(item.text || "");
        break;
      case "copy-selection": {
        const text = String(document.getSelection() || "");
        if (text && navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
        break;
      }
      case "select-all": {
        const sel = document.getSelection();
        if (sel?.selectAllChildren) sel.selectAllChildren(document.body);
        break;
      }
      case "open-thread":
        // The surface's own action first: opening a conversation is state inside
        // the inbox. Only if nothing registered (the row is on screen without
        // its page having claimed the action) does this fall back to the
        // profile of the person the row names.
        if (item.threadId && runMenuAction("open-thread", { threadId: item.threadId })) break;
        if (item.username) window.location.assign(`/${item.username}`);
        break;
      case "thread-settings":
        if (item.threadId) runMenuAction("thread-settings", { threadId: item.threadId });
        break;
      case "template-preview":
        if (item.templateId) runMenuAction("template-preview", { templateId: item.templateId });
        break;
      case "global-message-edit":
        if (item.messageId) runMenuAction("global-message-edit", { messageId: item.messageId });
        break;
      case "global-message-delete":
        // Destructive, and the room owns the confirmation: deleting is a change
        // to a conversation, and the person doing it should be asked about it
        // where they can see the message.
        if (item.messageId) runMenuAction("global-message-delete", { messageId: item.messageId });
        break;
      case "global-message-silence":
        if (item.userId) {
          runMenuAction("global-message-silence", { userId: item.userId, username: item.username });
        }
        break;
      case "open-profile":
        // Public profiles live at the plain /:alias route.
        if (item.username) window.location.assign(`/${item.username}`);
        break;
      case "open-link": {
        const href = item.href || "";
        if (href) window.open(href, "_blank", "noopener,noreferrer");
        break;
      }
      default:
        break;
    }
  } catch {
    /* A menu action must never throw into the page: clipboard may deny, and
       history may bounce from a cross-origin page. Silent is correct here. */
  }
};

const MenuCtx = createContext({ present: false });
export const useContextMenuContext = () => useContext(MenuCtx);

export function ContextMenuProvider() {
  // One open menu at a time: { x, y, items }. The surface is read at open
  // time, so a re-render under the cursor can never leave a menu's items
  // pointing at a node that has since been replaced.
  const [state, setState] = useState(null);
  const menuRef = useRef(null);

  const open = useCallback((event) => {
    // The component owner may keep the native menu: library-controlled menus
    // and text inputs with their own spell-check surface stopPropagation, or
    // opt out with data-menu="native".
    const optedOut = event.target?.closest?.('[data-menu="native"]');
    if (optedOut) return;
    // Text entry keeps the native menu, full stop: Paste lives in it. A swats
    // menu with no Paste inside a field deletes that verb from the browser —
    // which is why a right-click inside an input falls through untouched.
    const editable = event.target?.closest?.(
      "input, textarea, select, [contenteditable], [contenteditable] *"
    );
    if (editable) return;
    const surface = event.target?.closest?.("[data-menu-id]");
    setState({
      x: event.clientX,
      y: event.clientY,
      items: buildSurfaceItems(surface),
    });
    event.preventDefault();
  }, []);

  useEffect(() => {
    window.addEventListener("contextmenu", open);
    return () => window.removeEventListener("contextmenu", open);
  }, [open]);

  useEffect(() => {
    if (!state) return undefined;
    // Capture phase on purpose: the menu must close even when the click lands
    // inside a component that calls stopPropagation on its own handler.
    const close = () => setState(null);
    const closeOnKey = (e) => {
      e.preventDefault();
      close();
    };
    window.addEventListener("click", close, true);
    window.addEventListener("keydown", closeOnKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close, true);
      window.removeEventListener("keydown", closeOnKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [state]);

  // Position before the first paint (layout effect), so the menu never
  // flashes at the unpositioned 0,0 corner: measure, clamp both axes, then
  // show.
  useLayoutEffect(() => {
    if (!state || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    menuRef.current.style.left = `${Math.max(8, Math.min(state.x, vw - r.width - 8))}px`;
    menuRef.current.style.top = `${Math.max(8, Math.min(state.y, vh - r.height - 8))}px`;
    menuRef.current.style.visibility = "visible";
  }, [state]);

  if (!state || typeof document === "undefined") return null;

  return createPortal(
    <MenuCtx.Provider value={{ present: true }}>
      <div
        ref={menuRef}
        role="menu"
        data-testid="context-menu"
        onMouseDown={(e) => e.stopPropagation()}
        className="fixed z-[10000] min-w-[190px] overflow-hidden rounded-xl border border-white/10 bg-[#101014]/95 py-1.5 shadow-2xl backdrop-blur-xl"
        style={{ left: state.x, top: state.y, visibility: "hidden" }}
      >
        {state.items.map((item, i) =>
          item.sep ? (
            <div key={i} className="mx-2.5 my-1 h-px bg-white/10" role="separator" />
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={() => run(item, () => setState(null))}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs font-medium text-zinc-200 transition-colors hover:bg-brand-500/15 hover:text-brand-200"
            >
              {item.label}
            </button>
          ),
        )}
      </div>
    </MenuCtx.Provider>,
    document.body,
  );
}

export default ContextMenuProvider;
