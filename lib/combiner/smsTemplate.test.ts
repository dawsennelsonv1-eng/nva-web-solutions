import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeploymentSms, containsAgencyLanguage, SMS_CHAR_BUDGET, smsLength } from './smsTemplate';

/**
 * "Must survive being read on a truck dashboard in three seconds" — tested
 * here as a hard character budget and a banned-vocabulary check, not left
 * as a subjective judgment call at review time.
 */

const SHORT_SLUG_URL = 'https://girder.app/s/abc123xyz45678';

test('a typical message fits comfortably under the character budget', () => {
  const sms = buildDeploymentSms({ contactFirstName: 'Mike', businessName: 'Ramirez Epoxy Coatings', url: SHORT_SLUG_URL });
  assert.ok(smsLength(sms) <= SMS_CHAR_BUDGET, 'length was ' + smsLength(sms) + ', budget is ' + SMS_CHAR_BUDGET);
});

test('a long business name still fits, or the test catches it before a real send would', () => {
  const sms = buildDeploymentSms({
    contactFirstName: 'Christopher',
    businessName: 'Christopher\u2019s Premium Decorative Concrete & Epoxy Flooring Solutions LLC',
    url: SHORT_SLUG_URL,
  });
  // This is intentionally the adversarial case: if it fails, the fix is a
  // shorter template or a business-name truncation rule — decided with the
  // real number in front of us, not guessed at.
  assert.ok(smsLength(sms) <= 200, 'even the worst case must stay one or two segments, got ' + smsLength(sms));
});

test('no contact name falls back to a name-free greeting, not a broken one', () => {
  const sms = buildDeploymentSms({ contactFirstName: null, businessName: 'Ramirez Epoxy Coatings', url: SHORT_SLUG_URL });
  assert.ok(!sms.startsWith(' —'), 'must not leave a dangling separator with no name');
  assert.ok(sms.includes('Ramirez Epoxy Coatings'));
});

test('only the first name is used, never the full name', () => {
  const sms = buildDeploymentSms({ contactFirstName: 'Mike Ramirez', businessName: 'X', url: SHORT_SLUG_URL });
  assert.ok(sms.startsWith('Mike'));
  assert.ok(!sms.includes('Mike Ramirez'), 'should not repeat the surname in the greeting');
});

test('the URL appears verbatim and un-shortened by this function', () => {
  const sms = buildDeploymentSms({ contactFirstName: 'Mike', businessName: 'X', url: SHORT_SLUG_URL });
  assert.ok(sms.includes(SHORT_SLUG_URL));
});

test('contains no agency language', () => {
  const sms = buildDeploymentSms({ contactFirstName: 'Mike', businessName: 'Ramirez Epoxy Coatings', url: SHORT_SLUG_URL });
  assert.equal(containsAgencyLanguage(sms), null);
});

test('the banned-word checker actually catches agency language when present', () => {
  // Proves the checker itself works, rather than trusting an empty result.
  assert.equal(containsAgencyLanguage('This seamless solution will empower your business'), 'solution');
  assert.equal(containsAgencyLanguage('A cutting-edge approach'), 'cutting-edge');
});

test('the message is deterministic — same input, same output, every time', () => {
  const ctx = { contactFirstName: 'Mike', businessName: 'Ramirez Epoxy Coatings', url: SHORT_SLUG_URL };
  assert.equal(buildDeploymentSms(ctx), buildDeploymentSms(ctx));
});

test('no exclamation points or emoji — reads as Dawsen, not a marketing bot', () => {
  const sms = buildDeploymentSms({ contactFirstName: 'Mike', businessName: 'Ramirez Epoxy Coatings', url: SHORT_SLUG_URL });
  assert.ok(!sms.includes('!'));
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(sms), 'no emoji');
});
