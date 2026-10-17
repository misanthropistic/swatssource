import { useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/lib/notify";

/* Mirrors the server-side "Auth check" gate (see backend/auth.js).
 *
 * When an admin switches it on, an account that has never linked Discord cannot
 * save profile changes. The server refuses those writes with a 403 either way —
 * this hook exists so the dashboard warns *before* someone spends five minutes
 * editing and loses the save, and so a blocked save says why instead of showing
 * a generic failure.
 *
 * Admins and the owner are never gated, matching the server rule exactly.
 */
export function useEditGate() {
  const { user } = useAuth();

  const blocked =
    !!user &&
    user !== false &&
    user.auth_required_to_edit === true &&
    user.role !== "admin" &&
    !user.is_owner &&
    !user.discord?.linked;

  /* Returns true when the caller must abort. Call it as the first line of a save
     handler: `if (gate.guard()) return;` */
  const guard = useCallback(
    (what = "save changes") => {
      if (!blocked) return false;
      toast.error("Connect Discord to continue", {
        description: `You can browse and keep your page, but ${what} needs a linked Discord account.`,
        duration: 8000,
      });
      return true;
    },
    [blocked],
  );

  return { blocked, guard, needsDiscord: blocked };
}
