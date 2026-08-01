/**
 * lib/combiner/smsTemplate.ts — THE PRE-WRITTEN SMS.
 *
 * "Draft that SMS copy — short, specific, no agency language, and it must
 * survive being read on a truck dashboard in three seconds."
 *
 * Pure and tested (smsTemplate.test.ts) against the actual constraint: a
 * hard character budget, not a vibe. SMS segments are 160 GSM-7 characters;
 * a message over that splits into multiple segments on many carriers,
 * arriving as a choppier read. The budget below is deliberately tighter
 * than 160 to leave room for the URL, which varies in length per slug.
 *
 * "No agency language" means the words this function is NOT allowed to
 * contain are checked directly in the test: no "solution," "leverage,"
 * "empower," "cutting-edge," "revolutionize," "synergy," "seamless,"
 * "elevate." Every one of those is a word a Dallas concrete contractor has
 * never used describing his own truck, and would read as someone else's
 * voice, not Dawsen's.
 */

const AGENCY_WORDS = [
  'solution', 'leverage', 'empower', 'cutting-edge', 'cutting edge',
  'revolutionize', 'synergy', 'seamless', 'elevate', 'unlock', 'game-changing',
  'game changing', 'best-in-class', 'innovative', 'disrupt',
];

export const SMS_CHAR_BUDGET = 140;

export interface SmsContext {
  contactFirstName: string | null;
  businessName: string;
  url: string;
}

function firstName(fullName: string | null): string | null {
  if (!fullName) return null;
  const first = fullName.trim().split(/\s+/)[0];
  return first || null;
}

/**
 * One template, not several — a fixed, proven line beats a generator with
 * edge cases none of this admin's own tests could catch. The only variables
 * are his first name (if known), his business name, and the URL.
 */
export function buildDeploymentSms(ctx: SmsContext): string {
  const name = firstName(ctx.contactFirstName);
  const greeting = name ? name + ' — ' : '';
  return greeting + 'built this for ' + ctx.businessName + ': ' + ctx.url + '\nTake a look.';
}

/** Used by the test suite and by the combiner's own live character counter. */
export function smsLength(sms: string): number {
  return sms.length;
}

export function containsAgencyLanguage(sms: string): string | null {
  const lower = sms.toLowerCase();
  for (const word of AGENCY_WORDS) {
    if (lower.includes(word)) return word;
  }
  return null;
}
