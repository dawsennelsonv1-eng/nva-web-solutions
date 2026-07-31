/**
 * lib/prospects/scorecard.ts — THE QUALIFICATION SCORECARD, OFFER.md §7,
 * as a pure function.
 *
 * "This product multiplies existing traffic. It does not create traffic."
 * A contractor with a dead site who buys this converts 4% of nothing,
 * concludes the product doesn't work, and asks for the refund. The
 * scorecard exists to decline him before he becomes that.
 *
 * Not marked server-only, deliberately, matching lib/quote/pricing.ts and
 * every other scoring/decision function in this codebase: a pure function
 * of its inputs is what makes scorecard.test.ts able to prove the point
 * table and the bands without a database, and lets /admin/prospects/new
 * show a LIVE score preview as the admin fills the form, client-side,
 * before ever saving.
 */

export interface ScorecardInput {
  hasGoogleAds: boolean;
  googleReviewCount: number;
  searchRank: 'page_1' | 'page_2' | 'not_ranking' | 'unknown';
  estimatedMonthlyTraffic: number;
  hasQuoteOrPricingTool: boolean | null;
  siteLooksAbandoned: boolean | null;
}

export type QualificationBand = 'strong' | 'workable' | 'weak' | 'decline';

export interface ScorecardResult {
  score: number;
  band: QualificationBand;
  /** Plain language, never a bare number — OFFER.md §7: "a number I can
   * rationalise past is not a guardrail." Shown in the admin UI verbatim. */
  warning: string;
  action: string;
}

/** OFFER.md §7's point table, exactly. */
export function computeQualificationScore(input: ScorecardInput): number {
  let score = 0;

  if (input.hasGoogleAds) score += 30;

  if (input.googleReviewCount >= 40) score += 20;
  else if (input.googleReviewCount >= 15) score += 10;
  // < 15 -> 0

  if (input.searchRank === 'page_1') score += 20;
  else if (input.searchRank === 'page_2') score += 10;
  // not_ranking / unknown -> 0

  if (input.estimatedMonthlyTraffic >= 500) score += 25;
  else if (input.estimatedMonthlyTraffic >= 200) score += 15;
  else if (input.estimatedMonthlyTraffic >= 50) score += 5;
  else score -= 20;

  // Upside signal: a site with NO quote form or pricing already has more
  // room for this product to move the needle. null = not yet assessed,
  // scores 0 either way rather than guessing.
  if (input.hasQuoteOrPricingTool === false) score += 15;

  if (input.siteLooksAbandoned === true) score -= 25;

  return score;
}

function bandFor(score: number): QualificationBand {
  if (score >= 70) return 'strong';
  if (score >= 45) return 'workable';
  if (score >= 25) return 'weak';
  return 'decline';
}

const WARNINGS: Record<QualificationBand, { warning: string; action: string }> = {
  strong: {
    warning: 'This site gets enough traffic for the product to have something to convert.',
    action: 'Pitch. Stage the prototype before calling.',
  },
  workable: {
    warning: 'This can work, but set expectations on the call — it converts what he already has, and that isn\u2019t a lot yet.',
    action: 'Pitch, but be upfront that results depend on his existing traffic.',
  },
  weak: {
    warning: 'This site probably doesn\u2019t get enough visitors for this to work well. Selling Foundation here risks a refund.',
    action: 'Do not pitch Foundation. Offer nothing, or refer him to someone who does traffic.',
  },
  decline: {
    warning: 'This site likely doesn\u2019t get enough visitors for this to work at all. Selling here usually ends in a refund.',
    action: 'Do not sell. Note why below.',
  },
};

export function scoreProspect(input: ScorecardInput): ScorecardResult {
  const score = computeQualificationScore(input);
  const band = bandFor(score);
  return { score, band, ...WARNINGS[band] };
}
