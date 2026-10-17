/* What each tier includes, in one place.
 *
 * The marketing page and the in-dashboard upgrade popup used to carry their own
 * copies of this list, and they had drifted: the public page still sold "core
 * layouts (floating, stacks, compact, banner)", three of which no longer exist,
 * while the dashboard pitched something else again. A single source means the
 * popup cannot promise a feature the editor does not have.
 */

export const PREMIUM_PRICE = { amount: 5, label: "$5", cadence: "per month" };

export const FREE_PERKS = [
  "Your own swats.bio page",
  "Every free font, colour and card layout",
  "Links, platform icons and standard widgets",
  "Four card layouts: Minimal, Floating, Banner",
  "Badges, analytics and profile views",
  "Friends and messages you have received",
];

export const PREMIUM_PERKS = [
  "Everything in Free, plus:",
  "Every premium font, text effect and cursor effect",
  "Background, overlay and avatar effects",
  "Custom MP4 backgrounds, banners and avatars",
  "Slideshow layout and reveal animations",
  "Custom code widgets",
  "Create your own badges and up to 5 templates",
  "Messages: send in any conversation, and create group chats",
];

/* The short name of each locked feature, keyed by the code the API returns. The
   gate shows one of these rather than "this feature", so being refused tells you
   what you were refused. */
export const PREMIUM_FEATURES = {
  premium_required: "Messages",
  messages: "Messages",
  groups: "Group chats",
  custom_code: "Custom code widgets",
};

export const featureName = (code, fallback) => PREMIUM_FEATURES[code] || fallback || null;
