import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "@/lib/notify";
import {
  Bot, ChevronDown, ChevronUp, RefreshCw, Save, Loader2, Plus, Trash2,
  Zap, Power, CircleDot, UserPlus,
} from "lucide-react";
import { FaDiscord as FaDiscordIcon } from "react-icons/fa6";
import { SmartSelect } from "@/components/ui-shared/SmartSelect";

/* The Bot Manager block on the Users tab — the admin's Discord half.
 *
 * Backend: /admin/bot/panel (GET panel state, PUT settings),
 * /admin/bot/apply-roles/:id (apply the mapping to one member now).
 *
 * What lives here:
 *   - Role mapping: which guild role is "Verified", "OG", the member role and
 *     the booster role — dropdowns of every assignable guild role, plus any
 *     number of custom mappings ("give X when they link", "give Y while
 *     boosting", …) the admin can invent on the spot.
 *   - Presence: whether the bot shows online/idle/dnd/invisible and the custom
 *     status text next to its name. Changes push straight to the live gateway
 *     session through the settings save.
 *   - Apply-now: push the saved mapping onto every linked member without
 *     waiting for each of them to re-link.
 */

const PRESENCE_OPTIONS = [
  { value: "online", label: "Online" },
  { value: "idle", label: "Idle" },
  { value: "dnd", label: "Do Not Disturb" },
  { value: "invisible", label: "Invisible" },
].map((o) => ({
  ...o,
  // SmartSelect paints whatever it finds in the row's `icon` slot.
  icon: (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: { online: "#22c55e", idle: "#eab308", dnd: "#ef4444", invisible: "#71717a" }[o.value] }}
    />
  ),
}));

const CONDITIONS = [
  { value: "always", label: "Every sign-in" },
  { value: "member", label: "When in the server" },
  { value: "booster", label: "When boosting" },
  { value: "not_member", label: "When NOT in the server" },
];

// Discord returns role colors as a 24-bit int; 0 means "no color" — render the
// zinc default rather than #000000, which would read as an error.
const roleDot = (colorInt) => {
  if (!colorInt) return "bg-zinc-500";
  const hex = colorInt.toString(16).padStart(6, "0");
  return `bg-[#${hex}]`;
};

// One dropdown of guild roles with an "off" state. The row dot is painted from
// the role's own color so the admin can match what they see in Discord.
function RolePicker({ label, hint, value, onChange, roles, disabled, testid }) {
  const options = [
    { value: "", label: "— none —" },
    ...roles.map((r) => ({ value: r.id, label: r.name, color: r.color })),
  ];
  const selected = roles.find((r) => r.id === value);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-zinc-200">{label}</span>
        {hint && <span className="font-mono2 text-[10px] text-zinc-500">{hint}</span>}
      </div>
      <SmartSelect
        testid={testid}
        ariaLabel={label}
        value={value || ""}
        onChange={(v) => onChange(v || null)}
        options={options}
        disabled={disabled}
      />
      {selected && (
        <div className="mt-2 flex items-center gap-1.5 font-mono2 text-[10px] text-zinc-500">
          <span className={`h-2 w-2 rounded-full ${roleDot(selected.color)}`} />
          {selected.member_count ?? "?"} member(s) hold this role
        </div>
      )}
    </div>
  );
}

// One custom mapping row: role + when it applies + delete. `id` is stable
// across edits so React does not remount the dropdown mid-typing.
function CustomRoleRow({ entry, roles, disabled, onChange, onDelete }) {
  const options = [
    { value: "", label: "— pick a role —" },
    ...roles.map((r) => ({ value: r.id, label: r.name, color: r.color })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2">
      <input
        type="text"
        value={entry.label}
        onChange={(e) => onChange({ ...entry, label: e.target.value })}
        placeholder="Name this rule…"
        disabled={disabled}
        data-testid="custom-role-label"
        className="w-36 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-brand-500/50 disabled:opacity-50"
      />
      <div className="min-w-40 flex-1">
        <SmartSelect
          ariaLabel="Custom role"
          value={entry.role_id || ""}
          onChange={(v) => onChange({ ...entry, role_id: v })}
          options={options}
          disabled={disabled}
        />
      </div>
      <div className="min-w-40">
        <SmartSelect
          ariaLabel="When to apply"
          value={entry.condition}
          onChange={(v) => onChange({ ...entry, condition: v })}
          options={CONDITIONS}
          disabled={disabled}
        />
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        className="rounded-lg bg-white/5 p-1.5 text-zinc-500 transition hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40"
        title="Remove this rule"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function BotManager() {
  const [panel, setPanel] = useState(null);    // the GET /admin/bot/panel payload
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);      // block expanded?
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);    // local edits, saved on Save changes
  const [applying, setApplying] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/bot/panel");
      setPanel(data);
      // Nickname sync, the welcome note and server announcements were removed
      // from this page, so their saved keys are dropped from the draft rather
      // than round-tripped back to the server on every save.
      // The three removed keys are destructured off on purpose (a rest-sibling
      // destructure is how a key is dropped without mutating the payload).
      const { sync_nicknames, welcome, announcements, ...settings } = data.settings || {};
      setDraft(settings);
    } catch {
      toast.error("Failed to load bot panel");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const { data } = await api.put("/admin/bot/panel", draft);
      setPanel((p) => ({ ...p, settings: data.settings, presence: data.presence }));
      setDraft(data.settings);
      toast.success(
        data.presence?.gateway === "connected"
          ? "Saved — presence updated on the live session too"
          : "Bot settings saved",
      );
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save bot settings");
    }
    setSaving(false);
  };

  /* Apply the saved mapping to every linked account in the roster.

     One request instead of a loop of 200: the server walks the list
     sequentially (Discord rate-limits role writes per guild, so parallel
     requests from the browser just collect 429s) and answers with a per-account
     report, which is what the summary counts. The roster caps at 200, so
     clicking again covers accounts that linked since. */
  const applyToAll = async () => {
    if (!window.confirm("Apply the saved roles to every linked account? Users already holding them are unaffected.")) return;
    setApplying(true);
    try {
      const { data: roster } = await api.get("/admin/discord/roster", { params: { filter: "linked", limit: 200 } });
      const ids = (roster.users || []).map((u) => u.id);
      if (!ids.length) {
        toast.info("No linked accounts to apply roles to.");
        setApplying(false);
        return;
      }

      const { data } = await api.post("/admin/bot/apply-roles", { user_ids: ids });
      const failed = (data.results || []).filter((r) => r.error).length;
      toast.success(
        `Applied roles to ${data.touched} of ${ids.length} account(s)${failed ? `, ${failed} failed` : ""}.`,
      );
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to apply roles to all members");
    }
    setApplying(false);
  };

  if (loading) {
    return (
      <div className="glass flex items-center gap-3 rounded-2xl px-4 py-4" data-testid="bot-manager">
        <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
        <span className="text-xs text-zinc-500">Loading bot panel…</span>
      </div>
    );
  }

  if (!panel) return null;

  const configured = panel.configured;
  const presence = panel.presence || {};
  const roles = panel.roles || [];
  const d = draft || {};
  const settings = d.presence || { status: "online", custom_status: "" };

  return (
    <div className="glass rounded-2xl" data-testid="bot-manager">
      {/* Header — always visible, click to collapse the block */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        data-testid="bot-manager-toggle"
      >
        <FaDiscordIcon className="h-4 w-4 text-brand-200" />
        <span className="text-xs font-semibold text-zinc-200">Discord bot</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono2 text-[10px] uppercase tracking-wide ${
          configured
            ? presence.gateway === "connected"
              ? "bg-emerald-500/12 text-emerald-300"
              : "bg-amber-500/12 text-amber-300"
            : "bg-zinc-500/12 text-zinc-400"
        }`}>
          <CircleDot className="h-3 w-3" />
          {configured ? (presence.gateway === "connected" ? "online" : presence.gateway || "offline") : "not configured"}
        </span>
        {configured && presence.custom_status && (
          <span className="hidden font-mono2 text-[10px] text-zinc-500 sm:inline">“{presence.custom_status}”</span>
        )}
        <span className="hidden text-[11px] text-zinc-500 md:inline">
          {configured ? `@${panel.bot_user?.username || "bot"} · ${panel.guild?.name || "your server"}` : "set DISCORD_BOT_TOKEN + DISCORD_GUILD_ID"}
        </span>
        {open ? <ChevronUp className="ml-auto h-4 w-4 text-zinc-500" /> : <ChevronDown className="ml-auto h-4 w-4 text-zinc-500" />}
      </button>

      {open && (
        <div className="space-y-5 border-t border-white/5 px-4 py-4">
          {!configured && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-200">
              The bot is not wired up. Set <code className="font-mono2">DISCORD_BOT_TOKEN</code> and{" "}
              <code className="font-mono2">DISCORD_GUILD_ID</code> on the server, invite the bot with the{" "}
              <b>Manage Roles</b> permission, then reload this page.
            </div>
          )}

          {/* Wired role mapping — the two the request called out first */}
          <div className="grid gap-3 sm:grid-cols-2" data-testid="bot-role-mapping">
            <RolePicker
              label="Verified role"
              hint="granted on every Discord sign-in"
              value={d.verified_role_id}
              onChange={(v) => setDraft({ ...d, verified_role_id: v })}
              roles={roles}
              disabled={!configured || saving}
              testid="verified-role-select"
            />
            <RolePicker
              label="OG role"
              hint="granted when the member was already in the server"
              value={d.og_role_id}
              onChange={(v) => setDraft({ ...d, og_role_id: v })}
              roles={roles}
              disabled={!configured || saving}
              testid="og-role-select"
            />
            <RolePicker
              label="Member role"
              hint="granted when the signer is in the server"
              value={d.member_role_id}
              onChange={(v) => setDraft({ ...d, member_role_id: v })}
              roles={roles}
              disabled={!configured || saving}
              testid="member-role-select"
            />
            <RolePicker
              label="Booster role"
              hint="granted when the signer is boosting"
              value={d.booster_role_id}
              onChange={(v) => setDraft({ ...d, booster_role_id: v })}
              roles={roles}
              disabled={!configured || saving}
              testid="booster-role-select"
            />
          </div>

          {/* Custom roles — the admin invents their own */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                <Zap className="h-3.5 w-3.5 text-brand-400" /> Custom roles
              </div>
              <span className="font-mono2 text-[10px] text-zinc-500">applied automatically at sign-in</span>
            </div>
            {(d.custom_roles || []).length === 0 && (
              <p className="text-xs text-zinc-600">
                No custom rules yet — add one to hand out any guild role on your own terms.
              </p>
            )}
            {(d.custom_roles || []).map((entry, idx) => (
              <CustomRoleRow
                key={entry.id || idx}
                entry={entry}
                roles={roles}
                disabled={!configured || saving}
                onChange={(next) =>
                  setDraft({ ...d, custom_roles: d.custom_roles.map((e, i) => (i === idx ? next : e)) })
                }
                onDelete={() =>
                  setDraft({ ...d, custom_roles: d.custom_roles.filter((_, i) => i !== idx) })
                }
              />
            ))}
            <button
              type="button"
              disabled={!configured || saving}
              onClick={() =>
                setDraft({
                  ...d,
                  custom_roles: [
                    ...(d.custom_roles || []),
                    { id: `c${Date.now()}`, role_id: "", label: "", condition: "always" },
                  ],
                })
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-500/40 bg-brand-500/12 px-3 py-2 text-xs font-semibold text-brand-200 transition hover:bg-brand-500/25 disabled:opacity-40"
              data-testid="add-custom-role"
            >
              <Plus className="h-3.5 w-3.5" /> Add custom role rule
            </button>
          </div>

          {/* Presence — appear online with a status */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3" data-testid="bot-presence">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                <Power className="h-3.5 w-3.5 text-emerald-400" /> Bot status
              </div>
              <span className="font-mono2 text-[10px] text-zinc-500">
                how the bot appears in the member list
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-56">
                <SmartSelect
                  testid="presence-status-select"
                  ariaLabel="Bot status"
                  value={settings.status || "online"}
                  onChange={(v) => setDraft({ ...d, presence: { ...settings, status: v } })}
                  options={PRESENCE_OPTIONS}
                />
              </div>
              <input
                type="text"
                value={settings.custom_status || ""}
                onChange={(e) => setDraft({ ...d, presence: { ...settings, custom_status: e.target.value } })}
                placeholder="Custom status shown next to the bot…"
                disabled={!configured || saving}
                data-testid="presence-custom-status"
                className="min-w-52 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-brand-500/50 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Joining the server grants roles on its own — no sign-in needed. */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3" data-testid="bot-join-roles">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                <UserPlus className="h-3.5 w-3.5 text-brand-300" /> Roles on join
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={d.auto_roles_on_join !== false}
                disabled={!configured || saving}
                onClick={() => setDraft({ ...d, auto_roles_on_join: d.auto_roles_on_join === false })}
                data-testid="bot-join-roles-toggle"
                className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${
                  d.auto_roles_on_join !== false ? "bg-brand-500" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                    d.auto_roles_on_join !== false ? "left-[1.375rem]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Give the member role (and any <b>member</b> or <b>always</b> custom mapping) the moment somebody
              joins the server, instead of waiting for them to sign in here. Verified and OG stay with the
              sign-in flow, because those mean a linked account and a long-standing member.
            </p>

            {/* Which state the gateway is actually in. Auto-roles need Discord's
                privileged Server Members intent, and asking for it without the
                portal toggle gets the whole connection refused — so the bot says
                which of the two it got rather than quietly doing nothing. */}
            {presence.member_events === "refused" && (
              <p
                className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200"
                data-testid="bot-join-roles-refused"
              >
                Discord refused the <b>Server Members</b> intent, so join events are off (the bot stays online).
                Enable “Server Members Intent” for this bot in the Discord developer portal, set{" "}
                <code className="font-mono2">DISCORD_MEMBER_INTENT=1</code>, then restart the server.
              </p>
            )}
            {configured && presence.member_events === "off" && (
              <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-zinc-400" data-testid="bot-join-roles-off">
                Join events are not being listened for yet. Set{" "}
                <code className="font-mono2">DISCORD_MEMBER_INTENT=1</code> on the server (and enable the intent
                in the developer portal) to turn this on.
              </p>
            )}
            {presence.member_events === "ready" && (
              <p className="text-[11px] text-emerald-300" data-testid="bot-join-roles-ready">
                Listening for joins and Nitro changes now.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/5 pt-4">
            <button
              type="button"
              onClick={applyToAll}
              disabled={!configured || saving || applying}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-40"
              data-testid="bot-apply-all"
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Apply roles to all linked members
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!configured || saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              data-testid="bot-save"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
