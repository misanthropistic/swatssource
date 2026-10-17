// Run with: node --test backend/views.test.js
//
// These lock down the pieces that decide whether a view counts. A regression in
// any of them either lets bots inflate views or silently stops real visits from
// ever being counted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEW_RULES,
  sha256Hex,
  leadingZeroBits,
  proofHash,
  verifyProof,
  clientIp,
  visitorKey,
  visitorHash,
  looseVisitorKey,
  looseVisitorHash,
  viewBucket,
} from './views.js';

test('sha256Hex matches the standard vectors', () => {
  assert.equal(
    sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  assert.equal(
    sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('leadingZeroBits counts nibbles and partial nibbles', () => {
  assert.equal(leadingZeroBits('ffffffff'), 0);
  assert.equal(leadingZeroBits('7fffffff'), 1);
  assert.equal(leadingZeroBits('3fffffff'), 2);
  assert.equal(leadingZeroBits('1fffffff'), 3);
  assert.equal(leadingZeroBits('0fffffff'), 4);
  assert.equal(leadingZeroBits('00ffffff'), 8);
  assert.equal(leadingZeroBits('0000000f'), 28);
  assert.equal(leadingZeroBits('00000000'), 32);
});

test('verifyProof accepts a solved nonce and rejects a wrong one', () => {
  const seed = 'seed-123';
  const difficulty = 8;
  let nonce = 0;
  while (leadingZeroBits(proofHash(seed, nonce)) < difficulty) nonce += 1;

  assert.ok(verifyProof(seed, nonce, difficulty));
  // A different nonce that does not meet the target must fail.
  let other = 0;
  while (leadingZeroBits(proofHash(seed, other)) >= difficulty) other += 1;
  assert.equal(verifyProof(seed, other, difficulty), false);
  // Even a valid nonce fails against a higher difficulty.
  assert.equal(verifyProof(seed, nonce, difficulty + 4), false);
});

test('verifyProof tolerates string nonces and missing input', () => {
  const seed = 's';
  const difficulty = 6;
  let nonce = 0;
  while (leadingZeroBits(proofHash(seed, nonce)) < difficulty) nonce += 1;
  assert.ok(verifyProof(seed, String(nonce), difficulty));
  assert.equal(verifyProof(null, '1', difficulty), false);
  assert.equal(verifyProof(seed, null, difficulty), false);
});

test('clientIp prefers Cloudflare, then X-Forwarded-For, then req.ip', () => {
  assert.equal(
    clientIp({ headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }, ip: '10.0.0.1' }),
    '1.2.3.4'
  );
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '5.6.7.8, 9.9.9.9' }, ip: '10.0.0.1' }), '5.6.7.8');
  assert.equal(clientIp({ headers: {}, ip: '10.0.0.1' }), '10.0.0.1');
  assert.equal(clientIp({ headers: {} }), 'unknown');
});

test('visitorHash is stable for the same visitor and differs by IP/UA', () => {
  const secret = 'test-secret';
  const req = { headers: { 'user-agent': 'Mozilla', 'accept-language': 'en' }, ip: '1.1.1.1' };
  assert.equal(visitorHash(req, secret), visitorHash(req, secret));
  assert.notEqual(visitorHash(req, secret), visitorHash(req, 'other-secret'));
  assert.notEqual(visitorHash(req, secret), visitorHash({ ...req, ip: '2.2.2.2' }, secret));
  // The raw IP must not appear in the stored hash.
  assert.ok(!visitorHash(req, secret).includes('1.1.1.1'));
  assert.equal(visitorKey(req), '1.1.1.1|Mozilla|en');
});

test('viewBucket separates visitors across the uniqueness window', () => {
  const now = 1_000_000_000_000;
  assert.equal(viewBucket(now), viewBucket(now + 60_000)); // same window
  assert.equal(viewBucket(now + VIEW_RULES.windowMs), viewBucket(now) + 1); // next window
});

// A visitor whose address changed between the challenge and the register is
// still the same visit: the loose key is what lets that view land instead of
// being thrown away with "does not belong to this visitor".
test('the loose visitor key ignores the address but keeps UA and language', () => {
  const secret = 'test-secret';
  const wifi = { headers: { 'user-agent': 'Mozilla', 'accept-language': 'en' }, ip: '1.1.1.1' };
  const cellular = { headers: { 'user-agent': 'Mozilla', 'accept-language': 'en' }, ip: '9.9.9.9' };

  // The strict key separates the two, the loose key does not.
  assert.notEqual(visitorHash(wifi, secret), visitorHash(cellular, secret));
  assert.equal(looseVisitorHash(wifi, secret), looseVisitorHash(cellular, secret));
  assert.equal(looseVisitorKey(wifi), 'Mozilla|en');

  // The loose key is still a secret-keyed HMAC, so it reveals neither.
  assert.ok(!looseVisitorKey(wifi).includes('1.1.1.1'));
  assert.notEqual(looseVisitorHash(wifi, secret), looseVisitorHash(wifi, 'other-secret'));
  // Different browsers are still different visitors.
  assert.notEqual(
    looseVisitorHash(wifi, secret),
    looseVisitorHash({ ...wifi, headers: { 'user-agent': 'Firefox', 'accept-language': 'en' } }, secret)
  );
});

// These assertions were updated deliberately: the counting gates were loosened
// (dwell 2000→1200ms, window 12h→1h, proof-of-work 15→12 bits) because honest
// visits were being missed. The window and the proof are still enforced — they
// are just no longer so strict that a real reader loses the count.
test('view rules keep the relaxed defaults', () => {
  assert.equal(VIEW_RULES.dwellMs, 1200);
  assert.equal(VIEW_RULES.windowMs, 60 * 60 * 1000);
  assert.equal(VIEW_RULES.difficulty, 12);
});
