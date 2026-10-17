/* ---------------------------------------------------------------------------
   Ranks

   A rank is not a stored column. It is computed from the account's own record
   every time it is asked for, which means it can never drift out of sync with
   the thing that earned it: fix your profile, gain views, earn a badge and the
   rank moves on the next read — no migration, no nightly recount, no job to
   forget to run.

   Everything here is pure and takes `now`, so a test can walk a fictional
   account through a year of progress without touching a database.

   The XP curve is deliberately diminishing where the number can grow without
   limit:

     • views  — 6·√views, so the gap between 100 and 1 000 views (worth ~68 XP)
                stays meaningful instead of the top account being unreachable;
     • time   — 3 XP per day, capped at 240 (~80 days). The cap is set below a
                fully built page (275: avatar 40, background 30, bio 40, five
                links 75, three widgets 90), so seniority on its own cannot
                outrank a page somebody actually finished. An account that is
                old AND finished still ranks above both, which is the point;
     • badges — a flat 75 each, because a badge is a real achievement;
     • the rest is one-off work on the page itself.

   Ranks are inclusive at the bottom (`min`) and the top rank has no next one,
   so "top rank" is a state the UI can render rather than a bar that never fills.
   --------------------------------------------------------------------------- */

import { isPremiumAccount } from './plan.js';

export const RANKS = [
  { id: 'rookie', name: 'Rookie', min: 0, color: '#a1a1aa', blurb: 'Just getting started' },
  { id: 'bronze', name: 'Bronze', min: 150, color: '#c2803f', blurb: 'A page taking shape' },
  { id: 'silver', name: 'Silver', min: 500, color: '#cbd5e1', blurb: 'Filled in and visited' },
  { id: 'gold', name: 'Gold', min: 1400, color: '#fbbf24', blurb: 'A page people come back to' },
  { id: 'platinum', name: 'Platinum', min: 3200, color: '#67e8f9', blurb: 'A recognised profile' },
  { id: 'diamond', name: 'Diamond', min: 6500, color: '#a78bfa', blurb: 'One of the big pages' },
  { id: 'legend', name: 'Legend', min: 12000, color: '#A48DF4', blurb: 'The top of the site' },
];

/* What each thing is worth. Kept as one table so the profile page, the docs and
   the tests all read the same numbers. */
export const XP = {
  perView: 6, // multiplied by √views, see xpForUser
  perDay: 3,
  maxDays: 80,
  badge: 75,
  avatar: 40,
  background: 30,
  bio: 40,
  perLink: 15,
  maxLinks: 5,
  perWidget: 30,
  maxWidgets: 3,
  discord: 60,
  premium: 150,
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/* Missing dates count as no time at all. `new Date(null)` is not an error — it
   is the epoch — so a row without `created_at` would otherwise read as "joined
   in 1970" and collect the whole time bonus. Only a real date counts. */
const daysSince = (date, now) => {
  if (date === null || date === undefined || date === '') return 0;
  const then = new Date(date).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86400000));
};

/* The XP an account has earned, from the account itself. Nothing here is
   stored, so there is no counter to get wrong. */
export function xpForUser(user, now = new Date()) {
  const profile = user?.profile && typeof user.profile === 'object' ? user.profile : {};
  const badges = Array.isArray(user?.badges) ? user.badges : [];

  let xp = 0;

  // Views: real reach, on a curve that cannot be bought or spammed flat.
  xp += Math.round(XP.perView * Math.sqrt(num(user?.views)));

  // Time: an account that has been here a while. Capped, because "old" is not
  // on its own an achievement.
  xp += Math.min(XP.maxDays, daysSince(user?.created_at, now)) * XP.perDay;

  // Achievements.
  xp += badges.length * XP.badge;

  // The page itself, the part a person actually controls.
  if (profile.avatar_url) xp += XP.avatar;
  if (profile.background_url || profile.banner_url) xp += XP.background;
  if (profile.bio && String(profile.bio).trim()) xp += XP.bio;

  const links = Array.isArray(profile.links) ? profile.links.length : 0;
  xp += Math.min(XP.maxLinks, links) * XP.perLink;

  const widgets = Array.isArray(profile.widgets) ? profile.widgets.length : 0;
  xp += Math.min(XP.maxWidgets, widgets) * XP.perWidget;

  if (user?.discord?.linked) xp += XP.discord;
  if (isPremiumAccount(user)) xp += XP.premium;

  return Math.max(0, Math.round(xp));
}

/* Premium is the site-wide predicate, not a second copy of it (see plan.js).
   Re-exported so an existing caller of `isPremium` keeps working. */
export { isPremiumAccount as isPremium } from './plan.js';

/* The rank an XP total sits in, what the next one costs, and how far along the
   way there the account is. `progress` is the fill of the bar between the
   current rank's floor and the next rank's floor — judging it against the
   distance still to go, not against `xp / next`, is what makes the bar honest
   at every rank (a bar that jumps backwards when you rank up is the usual bug
   here). The top rank reports progress 1 and next null. */
export function rankFor(xp) {
  const total = Math.max(0, Math.round(Number(xp) || 0));

  let index = 0;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (total >= RANKS[i].min) index = i;
  }

  const current = RANKS[index];
  const next = RANKS[index + 1] || null;

  if (!next) {
    return {
      rank: current,
      next: null,
      xp: total,
      intoRank: total - current.min,
      span: 0,
      toNext: 0,
      progress: 1,
      percent: 100,
    };
  }

  const span = next.min - current.min;
  const intoRank = total - current.min;
  const progress = span > 0 ? Math.min(1, Math.max(0, intoRank / span)) : 1;

  return {
    rank: current,
    next,
    xp: total,
    intoRank,
    span,
    toNext: Math.max(0, next.min - total),
    progress,
    // A whole number for the "63% to Gold" line, so the UI never shows 62.999.
    percent: Math.round(progress * 100),
  };
}

/* One call for the routes: the account's XP and the rank it lands in. */
export function rankForUser(user, now = new Date()) {
  const xp = xpForUser(user, now);
  return { ...rankFor(xp), xp };
}
