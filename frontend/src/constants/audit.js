// Human labels for the audit trail's action ids.
//
// The backend writes dotted, namespaced actions (`user.update`,
// `rewards.grant`) because that is what makes prefix filtering work. An admin
// reading the log wants a sentence, so every id the server can write has a label
// here; anything unknown (a new event type added later) still renders, tidied up
// rather than raw — a missing label must never hide a row.
export const AUDIT_ACTIONS = {
  "user.update": "Account edited",
  "user.delete": "Account deleted",
  "user.views": "View count changed",
  "invite.create": "Invite code created",
  "invite.delete": "Invite code deleted",
  "rewards.update": "View rewards changed",
  "rewards.grant": "View reward granted",
  "site.update": "Site settings changed",
  "bot.settings": "Bot settings changed",
  "bot.roles.apply": "Discord roles applied",
  "bot.roles.apply_bulk": "Discord roles applied (bulk)",
  "bot.roles.change": "Discord role given/taken",
  "bot.sync_boosters": "Boosters synced",
  "notify.send": "Inbox message sent",
  "notify.recall": "Inbox message recalled",
  "devlog.create": "Devlog published",
  "devlog.update": "Devlog edited",
  "devlog.delete": "Devlog deleted",
  "announcement.create": "Announcement posted",
  "announcement.update": "Announcement edited",
  "announcement.delete": "Announcement deleted",
  "discord.unlink": "Discord disconnected",
  "discord.refresh": "Discord member refreshed",
  "auth.signin": "Signed in",
  "auth.signup": "Account created",
  "discord.connect": "Discord connected",
  "account.pair": "Account paired",
  "account.link": "Account linked",
  "account.unlink": "Account unlinked",
  "account.switch": "Account switched",
  "billing.donation": "Donation received",
  "billing.premium": "Premium purchased",
};

export function actionLabel(action) {
  const id = String(action || "");
  if (AUDIT_ACTIONS[id]) return AUDIT_ACTIONS[id];
  // `user.something_new` → "User something new": still readable, never blank.
  const [group, ...rest] = id.split(".");
  return [group, ...rest].filter(Boolean).join(" ").replace(/[._]/g, " ").replace(/^./, (c) => c.toUpperCase()) || "Event";
}

// The tone of a row's dot. Destructive and security events stand out; routine
// edits read as neutral.
export function actionTone(action) {
  const id = String(action || "");
  if (/delete|unlink|recall|delete$/.test(id)) return "danger";
  if (/^auth\.|^account\.|^discord\.|roles/.test(id)) return "accent";
  if (/^billing\./.test(id)) return "good";
  return "neutral";
}
