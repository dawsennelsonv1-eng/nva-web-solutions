import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueDunningDay, dunningMessage, isSendableDay, type DunningDay } from './dunningRules';

const ctx = {
  contractorName: 'Mike Ramirez',
  siteLabel: 'Ramirez Epoxy Coatings',
  updateCardUrl: 'https://example.com/admin/billing',
  dayTenDate: 'August 24',
  leadsSinceFailure: 7,
  adminPhone: '+1 214 555 0142',
  adminName: 'Dawsen',
};

test('the full ten-day timeline fires each day exactly once, in order', () => {
  const sent: DunningDay[] = [];
  // Simulate the cron running once per day for a fortnight.
  for (let elapsed = 0; elapsed <= 14; elapsed += 1) {
    const due = dueDunningDay(elapsed, sent);
    if (due !== null) sent.push(due);
  }
  assert.deepEqual(sent, [1, 3, 5, 7, 10]);
});

test('a cron that misses several days still catches up without skipping any', () => {
  // The machine must not "miss" day 3 just because nothing ran until day 8.
  const sent: DunningDay[] = [];
  let due = dueDunningDay(8, sent);
  while (due !== null) {
    sent.push(due);
    due = dueDunningDay(8, sent);
  }
  assert.deepEqual(sent, [1, 3, 5, 7], 'day 10 is not yet due at elapsed=8');
});

test('nothing is due before day 1', () => {
  assert.equal(dueDunningDay(0, []), null);
});

test('a day already sent is never sent twice', () => {
  assert.equal(dueDunningDay(1, [1]), null);
  assert.equal(dueDunningDay(4, [1, 3]), null);
  assert.equal(dueDunningDay(5, [1, 3]), 5);
});

test('after day 10 nothing further is due', () => {
  assert.equal(dueDunningDay(30, [1, 3, 5, 7, 10]), null);
});

test('Sundays are never a sending day', () => {
  // 2026-08-02 is a Sunday.
  assert.equal(isSendableDay(new Date('2026-08-02T12:00:00Z')), false);
  assert.equal(isSendableDay(new Date('2026-08-03T12:00:00Z')), true);
  assert.equal(isSendableDay(new Date('2026-08-01T12:00:00Z')), true);
});

test('every message states the site is still up, and never insults', () => {
  const forbidden = ['deadbeat', 'failure to pay', 'delinquent', 'suspended account', "can't afford"];
  for (const day of [1, 3, 5, 7, 10] as DunningDay[]) {
    const m = dunningMessage(day, ctx);
    assert.ok(m.subject.length > 0, 'day ' + day + ' has a subject');
    const lower = (m.subject + ' ' + m.body).toLowerCase();
    for (const word of forbidden) {
      assert.ok(!lower.includes(word), 'day ' + day + ' must not contain "' + word + '"');
    }
    // The one fact that must appear in every single message. Subject counts:
    // day 10's reassurance is in its subject line, which is the first thing
    // read and arguably the strongest placement for it.
    assert.ok(
      /site (is up|stays up|is still up)|site does not go|site stays live/i.test(m.subject + ' ' + m.body),
      'day ' + day + ' must reassure that the site is up'
    );
  }
});

test('every message carries the one-tap update link', () => {
  for (const day of [1, 3, 5, 7, 10] as DunningDay[]) {
    assert.ok(dunningMessage(day, ctx).body.includes(ctx.updateCardUrl), 'day ' + day);
  }
});

test('SMS is attached on days 7 and 10 only', () => {
  assert.equal(dunningMessage(1, ctx).sms, undefined);
  assert.equal(dunningMessage(3, ctx).sms, undefined);
  assert.equal(dunningMessage(5, ctx).sms, undefined);
  assert.ok(dunningMessage(7, ctx).sms);
  assert.ok(dunningMessage(10, ctx).sms);
});

test('message placeholders are all resolved — no [brackets] survive into copy', () => {
  for (const day of [1, 3, 5, 7, 10] as DunningDay[]) {
    const m = dunningMessage(day, ctx);
    // Markdown links are [text](url) and legitimate; a bare [placeholder]
    // with no following paren is an unresolved template hole.
    const bare = m.body.match(/\[[^\]]+\](?!\()/g);
    assert.equal(bare, null, 'day ' + day + ' has unresolved placeholder: ' + JSON.stringify(bare));
  }
});

test('the day-5 message includes the real lead count, not a placeholder', () => {
  assert.ok(dunningMessage(5, ctx).body.includes('7 leads'));
});
