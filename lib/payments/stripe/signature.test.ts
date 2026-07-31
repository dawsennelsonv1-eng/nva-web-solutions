import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSignature, verifyStripeSignature } from './signature';

/**
 * The attack suite for webhook signature verification. Every test here is a
 * way someone could try to grant themselves a paid subscription by POSTing
 * to our public webhook endpoint.
 */

const SECRET = 'whsec_test_0123456789abcdef';
const BODY = '{"id":"evt_test_1","type":"invoice.paid","data":{"object":{"id":"in_1"}}}';
const NOW = 1_760_000_000;

function header(ts: number, sig: string): string {
  return 't=' + ts + ',v1=' + sig;
}

test('a correctly signed payload verifies', () => {
  const sig = computeSignature(BODY, NOW, SECRET);
  const r = verifyStripeSignature(BODY, header(NOW, sig), SECRET, { nowSeconds: NOW });
  assert.equal(r.ok, true);
});

test('a payload tampered with after signing is rejected', () => {
  const sig = computeSignature(BODY, NOW, SECRET);
  const tampered = BODY.replace('invoice.paid', 'invoice.paid_LIES');
  const r = verifyStripeSignature(tampered, header(NOW, sig), SECRET, { nowSeconds: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, 'no_match');
});

test('a signature made with the wrong secret is rejected', () => {
  const sig = computeSignature(BODY, NOW, 'whsec_attacker_guess');
  const r = verifyStripeSignature(BODY, header(NOW, sig), SECRET, { nowSeconds: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, 'no_match');
});

test('a replayed old request is rejected once outside tolerance', () => {
  const old = NOW - 3600;
  const sig = computeSignature(BODY, old, SECRET);
  const r = verifyStripeSignature(BODY, header(old, sig), SECRET, { nowSeconds: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, 'timestamp_out_of_tolerance');
});

test('a far-future timestamp is rejected as firmly as an old one', () => {
  const future = NOW + 3600;
  const sig = computeSignature(BODY, future, SECRET);
  const r = verifyStripeSignature(BODY, header(future, sig), SECRET, { nowSeconds: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, 'timestamp_out_of_tolerance');
});

test('a request inside tolerance still verifies', () => {
  const recent = NOW - 120;
  const sig = computeSignature(BODY, recent, SECRET);
  const r = verifyStripeSignature(BODY, header(recent, sig), SECRET, { nowSeconds: NOW });
  assert.equal(r.ok, true);
});

test('a missing header is rejected', () => {
  const r = verifyStripeSignature(BODY, null, SECRET, { nowSeconds: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, 'missing_header');
});

test('a header with no timestamp is rejected', () => {
  const r = verifyStripeSignature(BODY, 'v1=deadbeef', SECRET, { nowSeconds: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, 'malformed_header');
});

test('a header with a timestamp but no signature is rejected', () => {
  const r = verifyStripeSignature(BODY, 't=' + NOW, SECRET, { nowSeconds: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, 'no_signatures');
});

test('a non-hex signature of the right length does not crash the comparison', () => {
  const valid = computeSignature(BODY, NOW, SECRET);
  const garbage = 'z'.repeat(valid.length);
  const r = verifyStripeSignature(BODY, header(NOW, garbage), SECRET, { nowSeconds: NOW });
  assert.equal(r.ok, false);
});

test('during a secret rotation, ANY matching v1 signature is accepted', () => {
  const oldSig = computeSignature(BODY, NOW, 'whsec_previous_secret');
  const newSig = computeSignature(BODY, NOW, SECRET);
  const dual = 't=' + NOW + ',v1=' + oldSig + ',v1=' + newSig;
  const r = verifyStripeSignature(BODY, dual, SECRET, { nowSeconds: NOW });
  assert.equal(r.ok, true, 'zero-downtime secret rotation must keep working');
});

test('an empty body signs and verifies consistently', () => {
  const sig = computeSignature('', NOW, SECRET);
  assert.equal(verifyStripeSignature('', header(NOW, sig), SECRET, { nowSeconds: NOW }).ok, true);
});
