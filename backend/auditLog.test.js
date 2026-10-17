// Run with: node --test backend/auditLog.test.js
//
// The audit trail is only worth having if it is safe to write to and honest to
// read back. These pin the three promises auditLog.js makes: secrets never reach
// the row, a row always has an actor and a shape the UI can render, and a failed
// write never breaks the action it was recording.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  redactDetail, actorOf, auditRow, auditFilters, auditWhere, logAudit,
} from './auditLog.js';

test('credentials are blanked wherever they appear', () => {
  const detail = redactDetail({
    email: 'someone@example.com',
    password: 'hunter2',
    newPassword: 'hunter3',
    password_hash: '$2a$10$abcdef',
    totp_code: '123456',
    apiKey: 'sk-live-123',
    api_key: 'sk-live-456',
    discord_token: 'tok',
    Authorization: 'Bearer abc',
    nested: { session_token: 'x', keep: 'this' },
    list: [{ secret: 's', label: 'ok' }],
  });

  assert.equal(detail.password, '[redacted]');
  assert.equal(detail.newPassword, '[redacted]');
  assert.equal(detail.password_hash, '[redacted]');
  assert.equal(detail.totp_code, '[redacted]');
  assert.equal(detail.apiKey, '[redacted]');
  assert.equal(detail.api_key, '[redacted]');
  assert.equal(detail.discord_token, '[redacted]');
  assert.equal(detail.Authorization, '[redacted]');
  assert.equal(detail.nested.session_token, '[redacted]');
  assert.equal(detail.list[0].secret, '[redacted]');
  // …and everything else survives, because a log of `[redacted]` answers nothing.
  assert.equal(detail.email, 'someone@example.com');
  assert.equal(detail.nested.keep, 'this');
  assert.equal(detail.list[0].label, 'ok');
});

test('detail is normalised, not trusted: long strings, deep objects and odd types', () => {
  const long = redactDetail({ note: 'x'.repeat(5000) });
  assert.ok(long.note.length < 2100);
  assert.ok(long.note.endsWith('…'));

  const wide = redactDetail({ list: Array.from({ length: 300 }, (_, i) => i) });
  assert.equal(wide.list.length, 101);
  assert.match(String(wide.list[100]), /200 more/);

  // A cycle cannot be followed forever: the depth cap stops it, and the result
  // is still JSON the database can store.
  const cyclic = { a: 1 };
  cyclic.self = cyclic;
  const safe = redactDetail(cyclic);
  assert.equal(safe.a, 1);
  assert.equal(safe.self.self.self.self.self.self, '[truncated]');
  assert.doesNotThrow(() => JSON.stringify(safe));

  assert.equal(redactDetail(undefined), undefined);
  assert.equal(redactDetail(null), null);
  assert.equal(redactDetail(new Date(0)), '1970-01-01T00:00:00.000Z');
  assert.equal(redactDetail(() => 1), '[function]');
});

test('the actor comes from the session, and the owner is named as such', () => {
  assert.deepEqual(
    actorOf({ user: { id: 'u1', username: 'sam', role: 'admin' } }),
    { id: 'u1', username: 'sam', role: 'admin' },
  );
  // An owner may hold role 'admin' or 'user'; the trail should say owner.
  assert.equal(actorOf({ user: { id: 'u2', username: 'boss', role: 'user', is_owner: true } }).role, 'owner');
  // System events (rewards, webhooks) have no session at all.
  assert.deepEqual(actorOf({}), { id: null, username: null, role: 'system' });
});

test('a row carries who, what, where and when-relevant request context', () => {
  const row = auditRow({
    req: {
      user: { id: 'u1', username: 'sam', role: 'admin' },
      headers: { 'cf-connecting-ip': '203.0.113.9, 10.0.0.1', 'user-agent': 'Mozilla/5.0' },
    },
    action: 'user.update',
    targetType: 'user',
    targetId: 42,
    detail: { password: 'nope', role: 'premium' },
  });

  assert.equal(row.actor_id, 'u1');
  assert.equal(row.actor_username, 'sam');
  assert.equal(row.action, 'user.update');
  assert.equal(row.target_id, '42');
  assert.equal(row.ip, '203.0.113.9');
  assert.equal(row.user_agent, 'Mozilla/5.0');
  assert.equal(row.detail.password, '[redacted]');
  assert.equal(row.detail.role, 'premium');
});

test('filters are clamped and can never widen a query', () => {
  assert.deepEqual(auditFilters({}), {
    q: null, action: null, actor: null, before: null, limit: 50, offset: 0,
  });
  assert.equal(auditFilters({ limit: '9999' }).limit, 200);
  assert.equal(auditFilters({ limit: '-5' }).limit, 1);
  assert.equal(auditFilters({ offset: '-5' }).offset, 0);
  assert.equal(auditFilters({ before: '999' }).before, 999);
  assert.equal(auditFilters({ before: 'nonsense' }).before, null);
  assert.equal(auditFilters({ q: '  sam  ' }).q, 'sam');
});

test('the where clause and its parameters line up', () => {
  const { where, params } = auditWhere(auditFilters({ action: 'user.', actor: 'sam', q: 'role', before: 10 }));
  assert.match(where, /action LIKE \$1/);
  assert.match(where, /actor_username ILIKE \$2/);
  // The free-text search uses ONE parameter for all four columns.
  assert.match(where, /detail::text ILIKE \$3/);
  assert.match(where, /id < \$4/);
  assert.deepEqual(params, ['user.%', '%sam%', '%role%', 10]);

  assert.deepEqual(auditWhere(auditFilters({})), { where: '', params: [] });
});

test('a failed write is reported, never thrown', async () => {
  // No database is reachable in this process: the insert must fail quietly and
  // resolve to null, because the action it records already succeeded.
  const result = await logAudit({
    actor: { id: null, username: 'system' },
    action: 'test.event',
    detail: { ok: true },
  });
  assert.equal(result, null);
});
