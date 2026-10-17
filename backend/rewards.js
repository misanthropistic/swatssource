// The view-reward engine.
//
// The owner's rule: the more views a profile earns, the more the account gets
// — Premium TRIALS, in days, at milestones the admin configures. One place
// decides every answer: what the settings look like, which milestone is next,
// and how an award is written. The views route calls in after a count is
// incremented; the admin settings route calls in to read and save.
//
// All of the settings live in ONE site_settings row under the 'view_rewards'
// key, so admins configure it from the admin Settings page and nothing about
// a reward is ever hardcoded in a profile or a role.
import { query } from './db.js';
import { logSystemEvent } from './auditLog.js';

const SETTINGS_KEY = 'view_rewards';

export const DEFAULT_REWARD_SETTINGS = {
  enabled: false,
  // [{ views: lifetime milestone, premium_days: trial length }, …]
  milestones: [],
};

export async function loadRewardSettings() {
  const { rows } = await query("SELECT value FROM site_settings WHERE key = 'view_rewards'");
  const value = rows[0]?.value || {};
  return {
    ...DEFAULT_REWARD_SETTINGS,
    ...value,
    milestones: sanitizeMilestones(value.milestones),
  };
}

// Whatever a row might hold, the engine only ever acts on a clean list:
// positive ints, de-duplicated by milestone, smallest first.
export function sanitizeMilestones(list) {
  const seen = new Set();
  const clean = [];
  for (const m of Array.isArray(list) ? list : []) {
    const views = parseInt(m?.views, 10);
    const days = parseInt(m?.premium_days, 10);
    if (Number.isFinite(views) && views >= 1 && Number.isFinite(days) && days >= 1 && !seen.has(views)) {
      seen.add(views);
      clean.push({ views, premium_days: Math.min(days, 365) });
    }
  }
  return clean.sort((a, b) => a.views - b.views);
}

/* Which one milestone (at most) fires for these lifetime views, given the
   milestones the account has already been paid. Returns the reward or null —
   ONE hit per crossing keeps the math honest, and the next call picks up the
   next crossed milestone if several land at once. */
export function milestoneToAward(settings, lifetimeViews, awarded = []) {
  if (!settings?.enabled || !settings.milestones?.length) return null;
  const claimed = new Set((awarded || []).map(Number));
  const crossed = settings.milestones.filter((m) => lifetimeViews >= m.views && !claimed.has(m.views));
  if (!crossed.length) return null;
  // The highest crossed, unclaimed milestone: the greedy step for someone
  // importing an old profile straight past several at once.
  const hit = crossed[crossed.length - 1];
  // Report ALL crossed milestones so the caller can mark them; only the
  // longest trial is granted once.
  return { ...hit, alsoReached: crossed.slice(0, -1).map((m) => m.views) };
}

/* Watershed moment: award a trial for views the account has crossed.
   Non-throwing — a reward is a celebration, not a dependency: a failed write
   never breaks the view registration that earned it. Returns what (if
   anything) was granted, for the caller to log. */
export async function grantViewRewards(userId) {
  try {
    const { rows } = await query(
      'SELECT views, tier, premium_until, rewarded_milestones FROM users WHERE id = $1',
      [userId],
    );
    const user = rows[0];
    if (!user) return null;
    const settings = await loadRewardSettings();
    const lifetimeViews = Number(user.views) || 0;
    const awarded = (user.rewarded_milestones || []).map(Number);
    const hit = milestoneToAward(settings, lifetimeViews, awarded);
    if (!hit) return null;

    // The trial EXTENDS a currently running one instead of restarting it, so
    // milestone after milestone stacks rather than each cutting the last short.
    const stillRunning = user.premium_until && new Date(user.premium_until) > new Date()
      ? new Date(user.premium_until).getTime()
      : (user.tier === 'premium' ? null : Date.now()); // permanent premium isn't extended or reset
    if (user.tier === 'premium' && !user.premium_until) {
      // Already holding an untimed Premium: views keep earning nothing to add.
      await markMilestones(userId, [...awarded, hit.views, ...(hit.alsoReached || [])]);
      return { views: hit.views, skipped: 'already_permanent' };
    }
    const base = stillRunning || Date.now();
    const until = base + hit.premium_days * 86_400_000;

    await query(
      `UPDATE users SET tier = 'premium', premium_until = $2, rewarded_milestones = $3 WHERE id = $1`,
      [userId, new Date(until), storedMilestones(awarded, hit)],
    );
    // Every automatic grant is visible to admins: a trial that appeared out of
    // nowhere is the first thing anyone asks about.
    await logSystemEvent({
      actor: { id: userId },
      action: 'rewards.grant',
      targetType: 'user',
      targetId: userId,
      detail: {
        milestone_views: hit.views,
        premium_days: hit.premium_days,
        premium_until: new Date(until).toISOString(),
        also_reached: hit.alsoReached || [],
        lifetime_views: lifetimeViews,
      },
    });
    return { views: hit.views, premium_days: hit.premium_days, reached: [hit.views, ...(hit.alsoReached || [])] };
  } catch (err) {
    console.warn('[rewards] view reward failed:', err.message);
    return null;
  }
}

function storedMilestones(awarded, hit) {
  const all = [...new Set([
    ...(awarded || []).map(Number),
    Number(hit.views),
    ...(hit.alsoReached || []).map(Number),
  ])].sort((a, b) => a - b);
  return all;
}

async function markMilestones(userId, milestones) {
  const all = [...new Set((milestones || []).map(Number))].sort((a, b) => a - b);
  await query('UPDATE users SET rewarded_milestones = $2 WHERE id = $1', [userId, all]);
}
