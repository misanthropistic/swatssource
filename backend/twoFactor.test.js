// Run with: node --test backend/twoFactor.test.js
//
// The rules a second factor has to obey, driven against an in-memory store
// through the module's injectable `write` — no database needed, and no route
// layer in the way of the thing being tested.
//
// The two that matter most:
//   • enabling cannot be completed by a code the secret did not produce, so an
//     account can never be locked out by a setup that was never finished;
//   • a recovery code is spent exactly once. A "single-use" code that keeps
//     working is worse than no recovery codes at all, because it is the one
//     credential an attacker only has to see once.
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { codeKind, completeSetup, disable, startSetup, verifySecondFactor } from './twoFactor.js';
import { normalizeRecoveryCode, totp } from './totp.js';

/* A tiny stand-in for the users table. Only the columns these rules read and
   write are modelled. */
function store(user) {
  const state = { ...user };
  const writes = [];
  const write = async (sql, params) => {
    writes.push({ sql, params });
    // Deliberately narrow matches: `SET totp_secret = $1,` (the setup write)
    // also contains `totp_enabled = FALSE`, and a loose match there would wipe
    // the secret the same call had just stored.
    if (sql.includes('SET totp_secret = $1,')) state.totp_secret = params[0];
    if (sql.includes('SET totp_enabled = TRUE')) {
      state.totp_enabled = true;
      state.totp_recovery = JSON.parse(params[0]);
    }
    if (sql.includes('SET totp_recovery = $1')) state.totp_recovery = JSON.parse(params[0]);
    if (sql.includes('SET totp_enabled = FALSE,')) {
      state.totp_enabled = false;
      state.totp_secret = null;
      state.totp_recovery = [];
    }
    return { rows: [state] };
  };
  return { state, write, writes };
}

const newUser = () => ({ id: 'u1', username: 'ada', email: 'ada@swats.bio' });

test('a code is classified by its shape, not by a mode switch', () => {
  assert.equal(codeKind('123456'), 'totp');
  assert.equal(codeKind('123 456'), 'totp');
  assert.equal(codeKind('12345678'), 'totp');
  assert.equal(codeKind('ABCD-EFGH'), 'recovery');
  assert.equal(codeKind('abcdefgh'), 'recovery');
  assert.equal(codeKind(''), 'empty');
  assert.equal(codeKind(null), 'empty');
  assert.equal(codeKind('12345'), 'invalid');
  assert.equal(codeKind('hello'), 'invalid');
});

test('setup issues a secret but does not switch the factor on', async () => {
  const user = newUser();
  const db = store(user);

  const started = await startSetup(user, { write: db.write });
  assert.match(started.secret, /^[A-Z2-7]{32}$/);
  assert.match(started.uri, /^otpauth:\/\/totp\//);
  assert.equal(db.state.totp_secret, started.secret, 'stored, waiting for a code');
  assert.ok(!db.state.totp_enabled, 'an abandoned setup must not lock the account out');
  assert.ok(!user.totp_enabled, 'the caller object is not switched on either');
});

test('setup refuses to replace the secret of an account that already has 2FA on', async () => {
  const db = store({ ...newUser(), totp_enabled: true, totp_secret: 'KEEPTHIS' });
  const result = await startSetup({ ...db.state }, { write: db.write });
  assert.match(result.error, /already on/i);
  assert.equal(db.state.totp_secret, 'KEEPTHIS', 'the working secret is untouched');
});

test('enabling needs the code the secret actually produces', async () => {
  const user = newUser();
  const db = store(user);
  const started = await startSetup(user, { write: db.write });

  const wrong = await completeSetup({ ...db.state }, '000000', { write: db.write });
  assert.match(wrong.error, /not right/i);
  assert.ok(!db.state.totp_enabled, 'a wrong code must not switch the factor on');

  const code = totp(started.secret);
  const done = await completeSetup({ ...db.state }, code, { write: db.write });
  assert.equal(done.recovery_codes.length, 10);
  assert.equal(db.state.totp_enabled, true);
});

test('enabling with no secret waiting is refused rather than trusted', async () => {
  const db = store(newUser());
  const result = await completeSetup({ ...db.state }, '123456', { write: db.write });
  assert.match(result.error, /start the setup again/i);
});

test('recovery codes are stored as hashes, never as the codes themselves', async () => {
  const user = newUser();
  const db = store(user);
  const started = await startSetup(user, { write: db.write });
  const { recovery_codes: codes } = await completeSetup({ ...db.state }, totp(started.secret), {
    write: db.write,
  });

  assert.equal(db.state.totp_recovery.length, 10);
  for (const stored of db.state.totp_recovery) {
    assert.match(stored, /^\$2[aby]\$/, 'a bcrypt hash');
    assert.equal(codes.includes(stored), false);
  }
  // ...and each plaintext code really does match one of them.
  for (const code of codes) {
    const matched = await Promise.all(db.state.totp_recovery.map((h) => bcrypt.compare(code, h)));
    assert.equal(matched.filter(Boolean).length, 1);
  }
});

test('a recovery code works once and is gone afterwards', async () => {
  const user = newUser();
  const db = store(user);
  const started = await startSetup(user, { write: db.write });
  const { recovery_codes: codes } = await completeSetup({ ...db.state }, totp(started.secret), {
    write: db.write,
  });

  const first = await verifySecondFactor({ ...db.state }, codes[0], { write: db.write });

  // The live user row is re-read from the store on the next attempt, which is
  // what the server does — so the spent code must not be in it any more.
  const second = await verifySecondFactor({ ...db.state }, codes[0], { write: db.write });

  assert.equal(first, true);
  assert.equal(second, false, 'the same recovery code must never work twice');
  assert.equal(db.state.totp_recovery.length, 9);
  // The other nine still work, typed however a human types them.
  const other = await verifySecondFactor({ ...db.state }, codes[1].toLowerCase().replace('-', ''), {
    write: db.write,
  });
  assert.equal(other, true);
  assert.equal(normalizeRecoveryCode(codes[1]), codes[1]);
});

test('the rotating code is accepted and nothing else is', async () => {
  const user = newUser();
  const db = store(user);
  const started = await startSetup(user, { write: db.write });
  await completeSetup({ ...db.state }, totp(started.secret), { write: db.write });

  const live = () => ({ ...db.state, totp_recovery: db.state.totp_recovery });
  assert.equal(await verifySecondFactor(live(), totp(started.secret), { write: db.write }), true);
  assert.equal(await verifySecondFactor(live(), '000000', { write: db.write }), false);
  assert.equal(await verifySecondFactor(live(), 'NOPE-CODE', { write: db.write }), false);
  assert.equal(await verifySecondFactor(live(), '', { write: db.write }), false);
});

test('a user with the factor off has nothing to verify against', async () => {
  const db = store(newUser());
  assert.equal(await verifySecondFactor({ ...db.state }, '123456', { write: db.write }), false);
});

test('disabling needs a working code and clears the secret when it gets one', async () => {
  const user = newUser();
  const db = store(user);
  const started = await startSetup(user, { write: db.write });
  await completeSetup({ ...db.state }, totp(started.secret), { write: db.write });

  const refused = await disable({ ...db.state }, '000000', { write: db.write });
  assert.match(refused.error, /authenticator app/i);
  assert.equal(db.state.totp_enabled, true, 'a bad code changes nothing');

  const done = await disable({ ...db.state }, totp(started.secret), { write: db.write });
  assert.equal(done.ok, true);
  assert.equal(db.state.totp_enabled, false);
  assert.equal(db.state.totp_secret, null, 'no secret is left behind to be reused');
  assert.deepEqual(db.state.totp_recovery, []);
});

test('disabling something already off is a no-op, not an error', async () => {
  const db = store(newUser());
  const result = await disable({ ...db.state }, '', { write: db.write });
  assert.deepEqual(result, { ok: true, already_off: true });
  assert.equal(db.writes.length, 0);
});
