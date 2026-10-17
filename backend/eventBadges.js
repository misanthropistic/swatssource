/* ---------------------------------------------------------------------------
   Event badges

   Badges you can only earn while the calendar allows it: wear the site in
   October and you keep the Halloween badge, come back over Christmas and the
   New Year and those are yours too. They are permanent once earned — the
   window decides when a badge can be GRANTED, never when it is taken away, so
   a badge from 2026 is still on the profile in 2030.

   Windows are deliberately wider than the single day they celebrate. A badge
   you can only collect by being online on the 31st is a badge most people miss
   for reasons that have nothing to do with them; a whole month is a fair ask.
   The New Year window straddles the year boundary and is named for the year it
   welcomes, which is why `newyear_2027` is earned from 27 December 2026 —
   the year in the id has to be the one people would call it.

   Everything is computed in UTC from a `now` argument, so the badge the server
   grants and the badge a test expects cannot disagree about what day it is.
   --------------------------------------------------------------------------- */

export const EVENTS = [
  {
    id: 'halloween',
    label: 'Halloween',
    hint: 'Wear the site in October',
    start: [10, 1],
    end: [10, 31],
  },
  {
    id: 'christmas',
    label: 'Christmas',
    hint: 'Wear the site between 1 and 26 December',
    start: [12, 1],
    end: [12, 26],
  },
  {
    id: 'newyear',
    label: 'New Year',
    hint: 'Wear the site between 27 December and 7 January',
    start: [12, 27],
    end: [1, 7],
    // The year in the id is the year being welcomed, not the year it starts in.
    namesNextYear: true,
  },
];

export const EVENT_IDS = EVENTS.map((e) => e.id);

const DAY = 86400000;

const utcStart = (year, month, day) => new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
const utcEnd = (year, month, day) => new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

/* The window an event occupies in one given year, as a half-open-looking range
   that is inclusive at both ends (a badge earned at 23:59 on the last day
   counts). */
export function windowFor(event, year) {
  if (event.namesNextYear) {
    return {
      from: utcStart(year, 12, 27),
      to: utcEnd(year + 1, 1, 7),
      badgeYear: year + 1,
    };
  }
  return {
    from: utcStart(year, event.start[0], event.start[1]),
    to: utcEnd(year, event.end[0], event.end[1]),
    badgeYear: year,
  };
}

/* The id a badge wears: the event, and the year it belongs to. */
export const badgeIdFor = (event, badgeYear) => `${event.id}_${badgeYear}`;

/* The years worth looking at for a date. The previous year is included because
   the New Year window that is live in early January started in December. */
const candidateYears = (now) => {
  const y = now.getUTCFullYear();
  return [y - 1, y, y + 1];
};

/* Every window that contains `now`, with the badge it grants. Normally one. */
export function activeEventWindows(now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  const live = [];
  for (const event of EVENTS) {
    for (const year of candidateYears(at)) {
      const w = windowFor(event, year);
      if (at >= w.from && at <= w.to) {
        live.push({ event, ...w, badgeId: badgeIdFor(event, w.badgeYear) });
      }
    }
  }
  return live;
}

/* The event badges `now` entitles this account to that it does not already
   have. Returns descriptors rather than bare ids so a caller can log or notify
   with something a person can read, and returns nothing for a badge already
   held — that is what keeps the grant idempotent when it runs on every
   sign-in. */
export function earnedEventBadges(now = new Date(), existing = []) {
  const held = new Set(Array.isArray(existing) ? existing : []);
  return activeEventWindows(now)
    .filter((w) => !held.has(w.badgeId))
    .map((w) => ({
      id: w.badgeId,
      event: w.event.id,
      label: w.event.label,
      year: w.badgeYear,
      from: w.from.toISOString(),
      to: w.to.toISOString(),
    }));
}

/* The event calendar as the dashboard shows it: for each event, either the
   window that is live now or the next one coming, so the badge page can say
   "earn it in October" without reimplementing the calendar in JavaScript on
   the client. */
export function upcomingEvents(now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  return EVENTS.map((event) => {
    const windows = candidateYears(at)
      .map((year) => windowFor(event, year))
      .sort((a, b) => a.from - b.from);

    const live = windows.find((w) => at >= w.from && at <= w.to) || null;
    const next = windows.find((w) => at < w.from) || null;
    const w = live || next;

    return {
      id: event.id,
      label: event.label,
      hint: event.hint,
      live: !!live,
      badgeId: w ? badgeIdFor(event, w.badgeYear) : null,
      // Days until the next window opens; null while it is already open.
      opensInDays: !live && w ? Math.max(0, Math.ceil((w.from - at) / DAY)) : null,
      from: w ? w.from.toISOString() : null,
      to: w ? w.to.toISOString() : null,
      year: w ? w.badgeYear : null,
    };
  });
}

/* The catalog entries for the event badges in play this year. The badge page
   lists them next to the grantable ones, tagged so a visitor can tell "you can
   earn this by being here" apart from "staff can give you this". */
export function eventBadgeCatalog(now = new Date()) {
  return upcomingEvents(now).map((e) => ({
    id: e.badgeId,
    name: `${e.label} ${e.year}`,
    desc: e.live ? `${e.hint} — available now` : e.hint,
    type: 'event',
    group: 'events',
    event: e.id,
    live: e.live,
    // What it is worth towards a rank, so the badge and the rank box agree.
    xp: 75,
  }));
}
