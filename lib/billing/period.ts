/**
 * lib/billing/period.ts — BILLING PERIOD ARITHMETIC. Pure, no I/O, no
 * server-only, no clock of its own (now is always passed in).
 *
 * WHY THIS IS ITS OWN MODULE: usage_counters are keyed by
 * (prototype_id, period_start). check.ts reads that key, usage.ts writes it,
 * and Phase 5.5's dunning and cap logic will both compute it again. If any
 * two of them derive the period differently by even a second, a contractor
 * either gets a second free allowance mid-month or stays capped after his
 * renewal cleared. One function, imported by all of them, is the only way
 * that guarantee holds — and keeping it free of server-only is what makes it
 * directly unit-testable.
 *
 * FILE_TREE.md addition: lib/billing/period.ts [3]
 */

export interface BillingPeriod {
  periodStart: string;
  periodEnd: string;
  /** How many whole periods we rolled past the subscription's stored window. */
  rolledForward: number;
}

/** Calendar-month addition with end-of-month clamping (Jan 31 + 1 -> Feb 28). */
export function addMonthsUtc(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const target = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      1,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds()
    )
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString();
}

/**
 * THE ROLLOVER.
 *
 * The subscription row is the anchor. When a renewal webhook is late and
 * now() has passed current_period_end, we roll the window forward in whole
 * calendar months until it contains now(), rather than keep counting into a
 * period that already ended — which would hold a capped contractor at his cap
 * after he had already paid for the next month. Phase 5.5's webhook normally
 * advances the row before this ever matters; this is the safety net, not the
 * mechanism.
 *
 * The 240-iteration guard bounds a pathological input (a corrupt date twenty
 * years in the past) to a finite loop rather than hanging a request.
 */
export function resolveBillingPeriod(
  currentPeriodStart: string,
  currentPeriodEnd: string,
  now: Date = new Date()
): BillingPeriod {
  let start = currentPeriodStart;
  let end = currentPeriodEnd;
  let rolled = 0;
  while (new Date(end).getTime() <= now.getTime() && rolled < 240) {
    start = end;
    end = addMonthsUtc(end, 1);
    rolled += 1;
  }
  return { periodStart: start, periodEnd: end, rolledForward: rolled };
}

/** Whole days left in the period, floored at zero. For cap upsell copy. */
export function daysRemainingInPeriod(periodEnd: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(periodEnd).getTime() - now.getTime()) / 86_400_000));
}
