// Run with: node --test backend/cloudinaryConfig.test.js
//
// These cover the credential-parsing bugs that make Cloudinary answer
// "Invalid Signature" while still accepting the api_key and cloud_name — the
// exact failure that is otherwise indistinguishable from a stale key.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readCloudinaryCredentials,
  describeCloudinaryCredentials,
} from './cloudinaryConfig.js';

const read = (env) => readCloudinaryCredentials(env);

test('parses a canonical CLOUDINARY_URL', () => {
  const { credentials } = read({
    CLOUDINARY_URL: 'cloudinary://123456789012345:AbCdEfGhIjKlMnOpQrStUv@mycloud',
  });
  assert.deepEqual(
    { ...credentials },
    {
      cloud_name: 'mycloud',
      api_key: '123456789012345',
      api_secret: 'AbCdEfGhIjKlMnOpQrStUv',
      source: 'CLOUDINARY_URL',
    }
  );
});

test('strips angle bracket placeholders from CLOUDINARY_URL', () => {
  const { credentials } = read({
    CLOUDINARY_URL: 'cloudinary://<384566494125373>:<3SAyV3T_-bAF-8XetzcGBBcB_qo>@<cejkcx4x>',
  });
  assert.deepEqual(
    { ...credentials },
    {
      cloud_name: 'cejkcx4x',
      api_key: '384566494125373',
      api_secret: '3SAyV3T_-bAF-8XetzcGBBcB_qo',
      source: 'CLOUDINARY_URL',
    }
  );
});

test('keeps an api_secret containing ":" intact instead of truncating it', () => {
  // `credentials.split(':')` + destructuring used to keep only "AbCd" here.
  const { credentials } = read({
    CLOUDINARY_URL: 'cloudinary://123456789012345:AbCd:EfGhIjKl@mycloud',
  });
  assert.equal(credentials.api_secret, 'AbCd:EfGhIjKl');
  assert.equal(credentials.api_key, '123456789012345');
  assert.equal(credentials.cloud_name, 'mycloud');
});

test('keeps an api_secret containing "@" intact', () => {
  const { credentials } = read({
    CLOUDINARY_URL: 'cloudinary://123456789012345:AbCd@Ef@mycloud',
  });
  assert.equal(credentials.api_secret, 'AbCd@Ef');
  assert.equal(credentials.cloud_name, 'mycloud');
});

test('does not percent-decode the api_secret', () => {
  // decodeURIComponent("Ab%41Cd") is "AbACd" — a different secret, and so a
  // different signature. Cloudinary's own URL parser keeps the escape as written.
  const { credentials } = read({
    CLOUDINARY_URL: 'cloudinary://123456789012345:Ab%41Cd@mycloud',
  });
  assert.equal(credentials.api_secret, 'Ab%41Cd');
  assert.equal(credentials.api_key, '123456789012345');
});

test('accepts a quote-wrapped, NAME= prefixed value', () => {
  const { credentials } = read({
    CLOUDINARY_URL: 'CLOUDINARY_URL="cloudinary://123456789012345:AbCdEf@mycloud"',
  });
  assert.equal(credentials.api_secret, 'AbCdEf');
  assert.equal(credentials.cloud_name, 'mycloud');
});

test('strips a trailing slash after the cloud name', () => {
  const { credentials } = read({
    CLOUDINARY_URL: 'cloudinary://123456789012345:AbCdEf@mycloud/',
  });
  assert.equal(credentials.cloud_name, 'mycloud');
});

test('falls back to the explicit variables when no URL is set', () => {
  const { credentials } = read({
    CLOUDINARY_CLOUD_NAME: 'mycloud',
    CLOUDINARY_API_KEY: '123456789012345',
    CLOUDINARY_API_SECRET: 'AbCdEf',
  });
  assert.equal(credentials.api_secret, 'AbCdEf');
  assert.equal(credentials.source, 'explicit CLOUDINARY_* variables');
});

test('gives CLOUDINARY_URL precedence over the explicit variables', () => {
  // Precedence is preserved from the original implementation on purpose: flipping
  // it would silently switch accounts for anyone whose extra variables are stale.
  const { credentials, conflict } = read({
    CLOUDINARY_URL: 'cloudinary://urlkey:urlsecret@urlcloud',
    CLOUDINARY_CLOUD_NAME: 'othercloud',
    CLOUDINARY_API_KEY: 'otherkey',
    CLOUDINARY_API_SECRET: 'othersecret',
  });
  assert.equal(credentials.source, 'CLOUDINARY_URL');
  assert.equal(credentials.cloud_name, 'urlcloud');
  assert.equal(credentials.api_secret, 'urlsecret');
  assert.equal(conflict, true);
});

test('does not flag a conflict when both sources agree', () => {
  const { conflict } = read({
    CLOUDINARY_URL: 'cloudinary://k:s@c',
    CLOUDINARY_CLOUD_NAME: 'c',
    CLOUDINARY_API_KEY: 'k',
    CLOUDINARY_API_SECRET: 's',
  });
  assert.equal(conflict, false);
});

test('reports a URL with no "@" instead of silently returning nothing', () => {
  const { credentials, urlProblem } = read({
    CLOUDINARY_URL: 'cloudinary://123456789012345:AbCdEf',
  });
  assert.equal(credentials, null);
  assert.match(urlProblem, /not in the form/);
});

test('reports a URL that does not use the cloudinary:// scheme', () => {
  const { credentials, urlProblem } = read({
    CLOUDINARY_URL: 'https://123456789012345:AbCdEf@mycloud',
  });
  assert.equal(credentials, null);
  assert.match(urlProblem, /does not start with cloudinary:\/\//);
});

test('reports the absence of credentials', () => {
  const { credentials, urlPresent } = read({});
  assert.equal(credentials, null);
  assert.equal(urlPresent, false);
});

test('ignores a partially configured explicit variable set', () => {
  const { credentials, explicitComplete } = read({
    CLOUDINARY_CLOUD_NAME: 'mycloud',
    CLOUDINARY_API_KEY: '123456789012345',
  });
  assert.equal(explicitComplete, false);
  assert.equal(credentials, null);
});

test('diagnostics expose the account and key but never the secret', () => {
  const { credentials } = read({
    CLOUDINARY_URL: 'cloudinary://123456789012345:Ab%41Cd@mycloud',
  });
  const described = describeCloudinaryCredentials(credentials);

  assert.equal(described.cloud_name, 'mycloud');
  assert.equal(described.api_key, '123456789012345');
  assert.equal(described.source, 'CLOUDINARY_URL');
  assert.equal(described.api_secret_length, 'Ab%41Cd'.length);
  assert.equal(described.api_secret_special_chars, '%');

  // The secret must not appear anywhere in the serialized diagnostics.
  assert.ok(!JSON.stringify(described).includes('Ab%41Cd'));
});

test('diagnostics describe a missing configuration', () => {
  const described = describeCloudinaryCredentials(null);
  assert.equal(described.source, null);
  assert.match(described.reason, /no Cloudinary credentials/);
});
