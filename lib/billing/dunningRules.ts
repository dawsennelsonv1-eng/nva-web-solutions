/**
 * lib/billing/dunningRules.ts — THE DUNNING STATE MACHINE, pure half.
 *
 * NOT marked server-only, deliberately: everything here is a pure function of
 * its arguments — no database, no email, no clock of its own (`now` is always
 * passed in). That is what lets lib/billing/dunningRules.test.ts walk the
 * entire ten-day timeline as a unit test, which the phase brief explicitly
 * asks to be provable. The impure half — reading subscriptions, sending, and
 * logging to dunning_events — lives in ./dunning.ts behind server-only.
 *
 *   active → past_due (day 0, payment failed)
 *          → emails on days 1, 3, 5, 7 (day 7 also SMS)
 *          → grace until day 10
 *          → suspended (day 10, email + SMS)
 *   Any successful payment at any point → active, immediately.
 *
 * WHAT SUSPENDED MEANS, precisely, because getting this wrong would break
 * the product's core promise: subscription_status='suspended', so
 * lib/entitlements/check.ts returns degradedMode — the instant AI price
 * turns off. THE SITE STAYS UP. The lead form stays live. His phone number
 * stays on it. A homeowner sees the Phase 4 degraded flow, which mentions
 * nothing about billing, because a homeowner learning his contractor hit a
 * payment problem is the single worst thing this product can do (OFFER.md
 * §3.1 forbids the words outright).
 *
 * COPY IS OFFER.md §4 VERBATIM. It was written deliberately: escalate
 * urgency, never insult. A failed card is almost always an expired card, not
 * a deadbeat, and every message says his site is up because that is the fact
 * he most needs to hear.
 *
 * Every send is logged to dunning_events, whose UNIQUE (subscription_id,
 * day_number, channel) constraint means a retried cron run physically cannot
 * send the same message twice.
 */

export type DunningDay = 1 | 3 | 5 | 7 | 10;
const DUNNING_DAYS: DunningDay[] = [1, 3, 5, 7, 10];

export interface DunningContext {
  contractorName: string;
  siteLabel: string;
  updateCardUrl: string;
  dayTenDate: string;
  leadsSinceFailure: number;
  adminPhone: string;
  adminName: string;
}

interface DunningMessage {
  subject: string;
  body: string;
  sms?: string;
}

/** OFFER.md §4, verbatim. Placeholders resolved from context. */
export function dunningMessage(day: DunningDay, ctx: DunningContext): DunningMessage {
  switch (day) {
    case 1:
      return {
        subject: "Your card didn't go through",
        body:
          'The monthly payment for ' + ctx.siteLabel + " didn't clear today. Nine times in ten it's an expired card.\n\n" +
          '[Update card — takes about a minute](' + ctx.updateCardUrl + ')\n\n' +
          'Nothing has changed on your end. Your site is up and your leads are coming through as normal.',
      };
    case 3:
      return {
        subject: "Still can't take the payment for your site",
        body:
          "We've retried the card on file and it's still declining.\n\n" +
          '[Update card](' + ctx.updateCardUrl + ')\n\n' +
          'Your site is up and unaffected. If the payment hasn\u2019t cleared by ' + ctx.dayTenDate +
          ', instant photo pricing pauses — your site stays live and your form keeps working, but homeowners stop getting a price on the spot.\n\n' +
          "If something's changed on your end, reply to this and we'll sort it out.",
      };
    case 5:
      return {
        subject: 'Five days on the card for ' + ctx.contractorName,
        body:
          "The payment still hasn't cleared. Your site is up and you've captured " + ctx.leadsSinceFailure +
          ' leads since it failed.\n\n' +
          '[Update card](' + ctx.updateCardUrl + ')\n\n' +
          'On ' + ctx.dayTenDate + ', instant photo pricing pauses. Your site does not go down and your form does not stop. ' +
          'Homeowners will still reach you — they just won\u2019t get an instant price.',
      };
    case 7:
      return {
        subject: 'Three days — ' + ctx.dayTenDate,
        body:
          'Instant photo pricing on your site pauses on ' + ctx.dayTenDate + ' unless the payment clears.\n\n' +
          '[Update card — one minute](' + ctx.updateCardUrl + ')\n\n' +
          'To be clear about what does not happen: your site does not go offline, your phone number stays on it, and your form keeps capturing leads. Nothing your customers see will change.\n\n' +
          "If there's a problem with the card or the timing, call or text me directly: " + ctx.adminPhone + '.',
        sms:
          'Girder: the card on your account is declining and instant pricing pauses ' + ctx.dayTenDate +
          '. Your site stays up either way. Fix in a minute: ' + ctx.updateCardUrl + ' — or call me, ' + ctx.adminName + '.',
      };
    case 10:
      return {
        subject: 'Instant pricing is paused — your site is still up',
        body:
          "The payment didn't clear, so instant photo pricing on your site is paused as of today.\n\n" +
          '**What your customers see:** a normal form asking about their floor, your phone number, and a note that you\u2019ll send their quote personally. They see nothing about billing and nothing is broken.\n\n' +
          "**What you'll notice:** leads arrive without an instant price attached. They're marked in your inbox so you know to call sooner.\n\n" +
          '[Update card](' + ctx.updateCardUrl + ') — everything switches back on within a minute of it clearing.\n\n' +
          "If you want to cancel instead, reply and I'll close it out. No hard feelings and no cancellation fee.",
        sms:
          'Girder: instant pricing is paused, but your site is up and your form is still capturing leads. Turn it back on: ' +
          ctx.updateCardUrl,
      };
  }
}

export const RECOVERY_MESSAGE: DunningMessage = {
  subject: "You're back",
  body: 'The payment cleared and instant pricing is back on. Nothing else changed.',
};

/**
 * "Never sent: more than one message per day, any message on a Sunday, or
 * anything after suspended other than a monthly single-line reminder."
 * (OFFER.md §4.) The Sunday rule is a real courtesy — a billing chase
 * landing on a contractor's one day off is how a fixable card problem turns
 * into a cancellation.
 */
export function isSendableDay(now: Date): boolean {
  return now.getUTCDay() !== 0;
}

/** Which dunning day is due, if any. Never skips ahead past a missed day. */
export function dueDunningDay(daysElapsed: number, alreadySent: DunningDay[]): DunningDay | null {
  for (const day of DUNNING_DAYS) {
    if (daysElapsed >= day && !alreadySent.includes(day)) return day;
  }
  return null;
}

