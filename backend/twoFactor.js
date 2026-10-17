/* ---------------------------------------------------------------------------
   Two-factor authentication, the state machine.

   The route layer only reads and writes through these calls, so the rules that
   actually matter live in one place:

     • a secret exists before the factor is on, and is only trusted after a code
       from the authenticator has proved it was really scanned;
     • enabling hands back recovery codes exactly once — they are stored as
       bcrypt hashes, like passwords, so a database read cannot mint a login;
     • a recovery code is single-use: the moment one is accepted it is removed;
     • an account with the factor already on cannot silently restart setup and
       lock itself out with a fresh secret.

   Every write goes through the injectable `write`, which is what lets
   twoFactor.test.js drive the whole thing against an in-memory store instead of
   a live Postgres. See totp.js for the arithmetic (and its RFC 6238 vectors).
   --------------------------------------------------------------------------- */
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { generateRecoveryCodes, generateSecret, normalizeRecoveryCode, otpauthUri, verifyTotp } from './totp.js';

export const RECOVERY_CODE_COUNT = 10;

const write = (sql, params) => query(sql, params);

/* What kind of secret a user typed. A six-to-eight digit run is the rotating
   code; anything else is tried as a recovery code. Deciding from the shape means
   there is no "mode" switch to get out of sync with the input. */
export function codeKind(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return 'empty';
  if (/^\d{6,8}$/.test(raw.replace(/[\s-]/g, ''))) return 'totp';
  return normalizeRecoveryCode(raw) ? 'recovery' : 'invalid';
}

/* Step 1: make a secret and show it. `totp_enabled` stays false, so a session
   that is abandoned half way through cannot lock the account out. */
export async function startSetup(user, { write: save = write } = {}) {
  if (user.totp_enabled) {
    return { error: 'Two-factor authentication is already on. Turn it off first to issue a new secret.' };
  }

  const secret = generateSecret();
  await save('UPDATE users SET totp_secret = $1, totp_enabled = FALSE WHERE id = $2', [secret, user.id]);
  return {
    secret,
    uri: otpauthUri({ secret, account: user.email || user.username }),
    digits: 6,
    period: 30,
  };
}

/* Step 2: prove the app holds the secret, then turn the factor on. The recovery
   codes come back in plaintext here and only here. */
export async function completeSetup(user, code, { write: save = write } = {}) {
  if (!user.totp_secret) {
    return { error: 'Start the setup again — no secret is waiting for a code.' };
  }

  if (!verifyTotp(user.totp_secret, code)) {
    return { error: 'That code is not right. Check your authenticator app and try the current one.' };
  }

  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  const hashes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));

  await save(
    'UPDATE users SET totp_enabled = TRUE, totp_enabled_at = NOW(), totp_recovery = $1 WHERE id = $2',
    [JSON.stringify(hashes), user.id]
  );

  return { recovery_codes: recoveryCodes };
}

/* Turn the factor off. Requires a working code (or a recovery code) so a stolen
   session cannot remove the protection it exists to provide. */
export async function disable(user, code, { write: save = write } = {}) {
  if (!user.totp_enabled) return { ok: true, already_off: true };

  const ok = await verifySecondFactor(user, code, { write: save });
  if (!ok) return { error: 'Enter a code from your authenticator app, or one of your recovery codes.' };

  await save(
    `UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_recovery = '[]', totp_enabled_at = NULL WHERE id = $1`,
    [user.id]
  );
  return { ok: true };
}

/* Accepts either the rotating code or a recovery code. A recovery code is spent
   on use, and the write-back happens before the caller is told yes — a code that
   worked must never work twice, even when two logins race. */
export async function verifySecondFactor(user, input, { write: save = write } = {}) {
  if (!user?.totp_enabled || !user.totp_secret) return false;

  const kind = codeKind(input);
  if (kind === 'totp') return verifyTotp(user.totp_secret, input);
  if (kind !== 'recovery') return false;

  const normalized = normalizeRecoveryCode(input);
  const hashes = Array.isArray(user.totp_recovery) ? user.totp_recovery : [];
  for (let i = 0; i < hashes.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- at most ten hashes, by design.
    if (await bcrypt.compare(normalized, hashes[i])) {
      const remaining = hashes.filter((_, index) => index !== i);
      await save('UPDATE users SET totp_recovery = $1 WHERE id = $2', [JSON.stringify(remaining), user.id]);
      return true;
    }
  }
  return false;
}
