/* Shared fan-out for the in-app inbox.
 *
 * Everything that reaches a user's bell goes through `sendNotifications`, so the
 * audience rules, the batching and the row shape are defined in exactly one
 * place: admin inbox sends, devlog posts and announcements all differ only in
 * the `kind` and `href` they pass in.
 */
import { randomUUID } from 'crypto';
import { query } from './db.js';

// Audiences an admin can pick. `specific` is not a query — it uses the explicit
// id list instead, so it is kept out of this map on purpose.
const AUDIENCE_SQL = {
  all: 'TRUE',
  premium: "tier IN ('premium', 'admin')",
  free: "tier NOT IN ('premium', 'admin')",
  admins: "(role = 'admin' OR is_owner = TRUE)",
  // Compared as text rather than cast to boolean: the column is JSONB that older
  // rows may have written oddly, and one unparseable value would turn the whole
  // audience query into a 500 instead of just excluding that account.
  discord: "discord->>'linked' = 'true'",
  no_discord: "COALESCE(discord->>'linked', 'false') <> 'true'",
};

export const AUDIENCES = [...Object.keys(AUDIENCE_SQL), 'specific'];

/* Resolves an audience name (plus an explicit id list for `specific`) to the
   user ids that should receive the message. Ids are validated against the users
   table, so a stale id from an open admin tab cannot create an orphan row. */
export async function resolveRecipients(audience = 'all', userIds = []) {
  if (audience === 'specific') {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((v) => String(v || '').trim()).filter(Boolean))];
    if (!ids.length) return [];
    const { rows } = await query('SELECT id FROM users WHERE id = ANY($1::uuid[])', [ids]);
    return rows.map((r) => r.id);
  }

  const where = AUDIENCE_SQL[audience] || AUDIENCE_SQL.all;
  const { rows } = await query(`SELECT id FROM users WHERE ${where}`);
  return rows.map((r) => r.id);
}

export async function countAudience(audience = 'all') {
  return (await resolveRecipients(audience === 'specific' ? 'all' : audience)).length;
}

/* Inserts one notification row per recipient in a single statement. Returns the
   number of rows written and the batch id, which is what the admin history
   groups on. A no-op (empty recipient list) is not an error. */
export async function sendNotifications({ userIds, kind = 'inbox', title, body = null, href = null, sourceId = null }) {
  const recipients = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!recipients.length) return { sent: 0, batch_id: null };

  // The batch id is made here rather than by gen_random_uuid() in the SELECT,
  // because that function is volatile and would mint a *different* id per row —
  // which is precisely the grouping this column exists to provide.
  const batchId = randomUUID();
  // The column definition list after the alias (`AS r(recipient)`) is not
  // decoration: without it, `SELECT r` would hand Postgres a single-column
  // composite instead of a uuid to insert.
  const { rows } = await query(
    `INSERT INTO notifications (user_id, batch_id, kind, title, body, href, source_id)
     SELECT r.recipient, $2::uuid, $3, $4, $5, $6, $7
     FROM unnest($1::uuid[]) AS r(recipient)
     RETURNING id`,
    [recipients, batchId, kind, title, body, href, sourceId]
  );

  return { sent: rows.length, batch_id: batchId };
}
