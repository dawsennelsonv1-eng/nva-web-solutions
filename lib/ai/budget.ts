import 'server-only';
import { DEFAULT_DAILY_CEILING_CENTS } from './config';
import { spendTodayCents } from './jobs';

/**
 * lib/ai/budget.ts — the ceiling.
 *
 * THIS IS A SERVER-SIDE GUARD AND NOTHING ELSE ENFORCES IT. There is no
 * client-side equivalent, on purpose: a spend limit a browser can decline to
 * apply is not a spend limit.
 *
 * FAIL CLOSED. If the ledger cannot be read, the answer is no. That is the
 * opposite of the rule everywhere else in this codebase, where a database
 * blip degrades gracefully so the funnel keeps running — and the difference is
 * the point. Degrading open on a lead capture costs a lead. Degrading open on
 * a spend ceiling costs an uncapped bill on a day nobody is watching, which is
 * precisely the day the ledger is down.
 *
 * The public photo-analysis path does NOT come through here (see
 * vision_analysis in lib/ai/config.ts) so a failing ledger can never block a
 * homeowner mid-quote.
 */

export function dailyCeilingCents(): number {
  const raw = process.env.AI_DAILY_SPEND_CEILING_CENTS;
  if (!raw) return DEFAULT_DAILY_CEILING_CENTS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_CEILING_CENTS;
}

export interface BudgetSnapshot {
  spentCents: number | null;
  ceilingCents: number;
  remainingCents: number | null;
  /** Resets at 00:00 UTC — stated so the panel does not have to guess. */
  resetsAt: string;
}

export async function budgetSnapshot(): Promise<BudgetSnapshot> {
  const ceilingCents = dailyCeilingCents();
  const spentCents = await spendTodayCents();
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return {
    spentCents,
    ceilingCents,
    remainingCents: spentCents === null ? null : Math.max(0, ceilingCents - spentCents),
    resetsAt: next.toISOString(),
  };
}

export type BudgetDecision =
  | { allowed: true; spentCents: number; ceilingCents: number }
  | { allowed: false; message: string; spentCents: number | null; ceilingCents: number };

/**
 * Called BEFORE a provider is touched, with the worst-case cost of the call
 * about to be made. Checking after the fact would be a report, not a ceiling.
 */
export async function checkBudget(estimateCents: number): Promise<BudgetDecision> {
  const ceilingCents = dailyCeilingCents();

  if (ceilingCents === 0) {
    return {
      allowed: false,
      message: 'AI spending is switched off: the daily ceiling is set to 0 cents.',
      spentCents: null,
      ceilingCents,
    };
  }

  const spentCents = await spendTodayCents();
  if (spentCents === null) {
    return {
      allowed: false,
      message:
        'Spending so far today could not be read, so this run was refused rather than risk running past the ceiling.',
      spentCents: null,
      ceilingCents,
    };
  }

  if (spentCents >= ceilingCents) {
    return {
      allowed: false,
      message: `Today's AI spending ceiling is used up: ${fmt(spentCents)} of ${fmt(
        ceilingCents
      )}.`,
      spentCents,
      ceilingCents,
    };
  }

  if (spentCents + estimateCents > ceilingCents) {
    return {
      allowed: false,
      message: `This run could cost up to ${fmt(estimateCents)} and only ${fmt(
        ceilingCents - spentCents
      )} is left under today's ceiling.`,
      spentCents,
      ceilingCents,
    };
  }

  return { allowed: true, spentCents, ceilingCents };
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
