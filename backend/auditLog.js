// The audit trail.
//
// The owner's rule: an admin has to be able to answer "who did what, to whom,
// and when" for EVERYTHING that happens on the site — not just the handful of
// mutations that happened to leave a trace in a user row. So every admin
// mutation, every sign-in, every account pairing and every automatic reward
// writes one row here through a single helper.
//
// Three rules keep it trustworthy:
//
//   1. NEVER THROW. An audit write must not be able to break the thing it is
//      recording — an admin whose notification send succeeded must not get a
//      500 because the log insert failed. Failures warn once and carry on.
//   2. NEVER STORE SECRETS. Callers hand over raw request bodies (that is how
//      you get an honest record of what was submitted); `redactDetail` blanks
//      any password, token, API key, TOTP code or cookie before it is written.
//   3. NEVER TRUST SHAPE. Detail is JSONB; buffers, functions, cycles and
//      megabyte strings are normalised here so one odd payload cannot fail the
//      insert.
import { query } from './db.js';

/* Keys whose value is a credential. Matched on the key name, case-insensitive,
 * anywhere in the object — `password`, `newPassword`, `discord_token`,
 * `apiKey`, `Authorization`, `totp_code`, `session` … */
const SECRET_KEY = /(pass(word|code|phrase)?|secret|token|authorization|api[_-]?key|private[_-]?key|totp|cookie|session)/i;

const MAX_STRING = 2000;
const MAX_ARRAY = 100;

/* A JSON-safe, secret-free copy of whatever the caller recorded.
 *
 * Depth is capped rather than trusted: request bodies are user input, and a
 * deeply nested (or cyclic) object must not be able to throw out of here or
 * store a multi-megabyte row. */
export function redactDetail(value, depth = 0) {
  if (depth > 5) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'function' || typeof value === 'symbol') return '[function]';
  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY).map((v) => redactDetail(v, depth + 1));
    return value.length > MAX_ARRAY ? [...head, `…${value.length - MAX_ARRAY} more`] : head;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : redactDetail(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/* The person a row belongs to. Admin routes always have req.user (requireAdmin
 * put it there); the auth routes have the account they just signed in; system
 * events (a reward, a Stripe webhook) have nobody and record as `system`. */
export function actorOf(req) {
  if (req?.user) {
    return {
      id: req.user.id || null,
      username: req.user.username || null,
      role: req.user.is_owner ? 'owner' : req.user.role || null,
    };
  }
  return { id: null, username: null, role: 'system' };
}

export function clientIpOf(req) {
  const headers = req?.headers || {};
  const cf = headers['cf-connecting-ip'];
  if (cf) return String(cf).split(',')[0].trim();
  const xff = headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req?.ip || req?.socket?.remoteAddress || null;
}

/* One audit row. `action` is dotted and namespaced (`user.update`,
 * `rewards.update`, `auth.signin`) so the UI can filter by its first segment. */
export function auditRow({ actor, action, targetType, targetId, detail, req }) {
  const who = actor || actorOf(req);
  return {
    actor_id: who.id || null,
    actor_username: who.username || null,
    actor_role: who.role || null,
    action: String(action || 'unknown'),
    target_type: targetType ? String(targetType) : null,
    target_id: targetId === undefined || targetId === null ? null : String(targetId),
    detail: redactDetail(detail || {}),
    ip: clientIpOf(req),
    user_agent: req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 400) : null,
  };
}

/* Write one event. Resolves to the stored row, or null when the write failed —
 * callers are free to ignore both. */
export async function logAudit({ req, actor, action, targetType, targetId, detail }) {
  try {
    const row = auditRow({ actor, action, targetType, targetId, detail, req });
    const { rows } = await query(
      `INSERT INTO audit_events
         (actor_id, actor_username, actor_role, action, target_type, target_id, detail, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       RETURNING id, created_at`,
      [
        row.actor_id, row.actor_username, row.actor_role, row.action,
        row.target_type, row.target_id, JSON.stringify(row.detail), row.ip, row.user_agent,
      ],
    );
    return { ...row, id: rows[0]?.id, created_at: rows[0]?.created_at };
  } catch (err) {
    // One line, no stack: a broken audit table must not fill the log with noise
    // every time someone changes a setting.
    console.warn('[audit] could not record event:', err.message);
    return null;
  }
}

/* An event with a named actor and no request — the reward engine, the Stripe
 * webhook and the bot have the account but not the HTTP request. */
export async function logSystemEvent({ actor, action, targetType, targetId, detail }) {
  return logAudit({ actor: { id: actor?.id || null, username: actor?.username || null, role: 'system' }, action, targetType, targetId, detail });
}

/* A row as the admin UI wants it. Kept here so the API and any other reader
 * cannot disagree about the field names. */
export function formatAuditEvent(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    actor_id: row.actor_id,
    actor_username: row.actor_username,
    actor_role: row.actor_role,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    detail: row.detail || {},
    ip: row.ip,
    user_agent: row.user_agent,
  };
}

/* The filters GET /admin/audit understands, sanitised in one place so the count
 * query and the page query can never filter differently.
 *
 * `q` searches the action, actor, target and the detail text; `action` is a
 * prefix (`user.` finds every user change); `actor` matches the username.
 * Pagination is a plain offset — an admin scrolling a log wants page numbers,
 * and a stable id cursor is available through `before` for live tailing. */
export function auditFilters(query_) {
  const q = String(query_?.q || '').trim();
  const action = String(query_?.action || '').trim();
  const actor = String(query_?.actor || '').trim();
  const before = parseInt(query_?.before, 10);
  const limitRaw = parseInt(query_?.limit, 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  const offsetRaw = parseInt(query_?.offset, 10);
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
  return {
    q: q || null,
    action: action || null,
    actor: actor || null,
    before: Number.isFinite(before) && before > 0 ? before : null,
    limit,
    offset,
  };
}

/* Builds the WHERE clause + params both queries share. */
export function auditWhere(filters) {
  const clauses = [];
  const params = [];
  if (filters.action) {
    params.push(`${filters.action}%`);
    clauses.push(`action LIKE $${params.length}`);
  }
  if (filters.actor) {
    params.push(`%${filters.actor}%`);
    clauses.push(`actor_username ILIKE $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const p = `$${params.length}`;
    clauses.push(`(action ILIKE ${p} OR actor_username ILIKE ${p} OR target_id ILIKE ${p} OR detail::text ILIKE ${p})`);
  }
  if (filters.before) {
    params.push(filters.before);
    clauses.push(`id < $${params.length}`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}
