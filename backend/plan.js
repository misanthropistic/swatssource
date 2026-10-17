/* ---------------------------------------------------------------------------
   What an account is entitled to

   One predicate, in its own module with no imports, because three unrelated
   places need to agree on it: the rank curve (a paying account is worth XP), the
   chat gate (talking is what Premium buys — friendships are free), and the
   template limits (paying accounts get ten slots instead of three).

   Three copies of `tier === 'premium' || role === 'admin' || is_owner` is how
   the site ends up disagreeing with itself: a change to what "Premium" means
   applied in two places out of three reads as a bug in whichever one was
   missed. It lives here, with no dependencies, so every caller — and its tests —
   can import it without dragging the database in.
   --------------------------------------------------------------------------- */

export function isPremiumAccount(user) {
  if (!user) return false;
  return (
    user.tier === 'premium' ||
    user.tier === 'admin' ||
    user.role === 'admin' ||
    !!user.is_owner
  );
}

/* Admins and the owner: staff rather than customers. Kept apart from the tier
   test above because they are the accounts that must never be limited by
   something a customer is limited by. */
export function isStaff(user) {
  if (!user) return false;
  return user.role === 'admin' || !!user.is_owner || user.tier === 'admin';
}
