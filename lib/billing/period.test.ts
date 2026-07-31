import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonthsUtc, daysRemainingInPeriod, resolveBillingPeriod } from './period';

const START = '2026-07-14T00:00:00.000Z';
const END = '2026-08-14T00:00:00.000Z';

test('a period containing now is returned untouched', () => {
  const p = resolveBillingPeriod(START, END, new Date('2026-07-30T12:00:00Z'));
  assert.equal(p.periodStart, START);
  assert.equal(p.periodEnd, END);
  assert.equal(p.rolledForward, 0);
});

test('the boundary instant belongs to the NEXT period, not the old one', () => {
  // Exactly at period_end the old window is over. Counting one more analysis
  // into it would give a 26th quote on a 25-quote plan.
  const p = resolveBillingPeriod(START, END, new Date(END));
  assert.equal(p.periodStart, END);
  assert.equal(p.rolledForward, 1);
});

test('a late webhook rolls forward as many whole months as needed', () => {
  const p = resolveBillingPeriod(START, END, new Date('2026-11-20T00:00:00Z'));
  assert.equal(p.rolledForward, 4);
  assert.equal(p.periodStart, '2026-11-14T00:00:00.000Z');
  assert.equal(p.periodEnd, '2026-12-14T00:00:00.000Z');
  assert.ok(new Date(p.periodStart) <= new Date('2026-11-20T00:00:00Z'));
  assert.ok(new Date(p.periodEnd) > new Date('2026-11-20T00:00:00Z'));
});

test('rollover always yields a window that actually contains now', () => {
  for (const iso of ['2026-08-14T00:00:01Z', '2027-02-28T23:59:59Z', '2028-01-01T00:00:00Z']) {
    const now = new Date(iso);
    const p = resolveBillingPeriod(START, END, now);
    assert.ok(new Date(p.periodStart).getTime() <= now.getTime(), iso);
    assert.ok(new Date(p.periodEnd).getTime() > now.getTime(), iso);
  }
});

test('a period anchored on the 31st clamps through short months', () => {
  assert.equal(addMonthsUtc('2026-01-31T00:00:00.000Z', 1), '2026-02-28T00:00:00.000Z');
  assert.equal(addMonthsUtc('2028-01-31T00:00:00.000Z', 1), '2028-02-29T00:00:00.000Z'); // leap
  assert.equal(addMonthsUtc('2026-03-31T00:00:00.000Z', 1), '2026-04-30T00:00:00.000Z');
});

test('rollover is deterministic: two callers at the same instant agree on the key', () => {
  const now = new Date('2026-10-02T08:31:17Z');
  const a = resolveBillingPeriod(START, END, now);
  const b = resolveBillingPeriod(START, END, now);
  assert.equal(a.periodStart, b.periodStart);
  assert.equal(a.periodEnd, b.periodEnd);
});

test('a corrupt far-past anchor terminates instead of hanging', () => {
  const p = resolveBillingPeriod('1990-01-01T00:00:00.000Z', '1990-02-01T00:00:00.000Z', new Date('2026-07-30T00:00:00Z'));
  assert.equal(p.rolledForward, 240); // guard hit, loop bounded
});

test('daysRemainingInPeriod floors at zero and rounds up partial days', () => {
  assert.equal(daysRemainingInPeriod(END, new Date('2026-08-12T00:00:00Z')), 2);
  assert.equal(daysRemainingInPeriod(END, new Date('2026-08-13T12:00:00Z')), 1);
  assert.equal(daysRemainingInPeriod(END, new Date('2026-09-01T00:00:00Z')), 0);
});
