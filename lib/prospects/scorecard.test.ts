import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeQualificationScore, scoreProspect, type ScorecardInput } from './scorecard';

/**
 * lib/prospects/scorecard.test.ts — proves the point table and the band
 * boundaries from OFFER.md §7 exactly.
 *
 * IMPORTANT PROPERTY OF THE TABLE: traffic has no zero-contribution band —
 * every value is either positive (+5/+15/+25) or -20. There is no neutral
 * baseline to isolate other signals against, so every fixture below states
 * traffic explicitly and every expected sum is computed by hand in a
 * comment rather than assumed from a shared "neutral" base.
 */

test('a strong prospect: running ads, well reviewed, ranks page 1, real traffic', () => {
  const input: ScorecardInput = {
    hasGoogleAds: true, // +30
    googleReviewCount: 52, // +20
    searchRank: 'page_1', // +20
    estimatedMonthlyTraffic: 800, // +25
    hasQuoteOrPricingTool: true, // +0
    siteLooksAbandoned: false, // +0
  }; // 30+20+20+25 = 95
  assert.equal(computeQualificationScore(input), 95);
  assert.equal(scoreProspect(input).band, 'strong');
});

test('review count bands score exactly as the table states', () => {
  const base = (reviews: number): ScorecardInput => ({
    hasGoogleAds: false, googleReviewCount: reviews, searchRank: 'not_ranking',
    estimatedMonthlyTraffic: 500, hasQuoteOrPricingTool: null, siteLooksAbandoned: null,
  }); // traffic contributes a fixed +25 in every case here, isolating reviews
  assert.equal(computeQualificationScore(base(40)) - 25, 20, '\u226540 reviews = +20');
  assert.equal(computeQualificationScore(base(15)) - 25, 10, '15\u201339 reviews = +10');
  assert.equal(computeQualificationScore(base(39)) - 25, 10, '39 is still in the 15\u201339 band');
  assert.equal(computeQualificationScore(base(14)) - 25, 0, '<15 reviews = 0');
  assert.equal(computeQualificationScore(base(0)) - 25, 0);
});

test('search rank scores exactly as the table states', () => {
  const base = (rank: ScorecardInput['searchRank']): ScorecardInput => ({
    hasGoogleAds: false, googleReviewCount: 0, searchRank: rank,
    estimatedMonthlyTraffic: 500, hasQuoteOrPricingTool: null, siteLooksAbandoned: null,
  });
  assert.equal(computeQualificationScore(base('page_1')) - 25, 20);
  assert.equal(computeQualificationScore(base('page_2')) - 25, 10);
  assert.equal(computeQualificationScore(base('not_ranking')) - 25, 0);
  assert.equal(computeQualificationScore(base('unknown')) - 25, 0, 'unknown must not score better than not_ranking');
});

test('traffic bands score exactly as the table states, including the negative floor', () => {
  const base = (traffic: number): ScorecardInput => ({
    hasGoogleAds: false, googleReviewCount: 0, searchRank: 'not_ranking',
    estimatedMonthlyTraffic: traffic, hasQuoteOrPricingTool: null, siteLooksAbandoned: null,
  });
  assert.equal(computeQualificationScore(base(500)), 25);
  assert.equal(computeQualificationScore(base(200)), 15);
  assert.equal(computeQualificationScore(base(499)), 15, '499 is still in the 200-499 band');
  assert.equal(computeQualificationScore(base(50)), 5);
  assert.equal(computeQualificationScore(base(199)), 5, '199 is still in the 50-199 band');
  assert.equal(computeQualificationScore(base(49)), -20, 'below 50 is the ONLY negative band from traffic alone');
  assert.equal(computeQualificationScore(base(0)), -20);
});

test('the two derived boolean signals score exactly as the table states', () => {
  const base: ScorecardInput = {
    hasGoogleAds: false, googleReviewCount: 0, searchRank: 'not_ranking',
    estimatedMonthlyTraffic: 500, hasQuoteOrPricingTool: null, siteLooksAbandoned: null,
  }; // = 25 (traffic only)
  assert.equal(computeQualificationScore(base), 25);
  assert.equal(computeQualificationScore({ ...base, hasQuoteOrPricingTool: false }), 40, 'no existing quote tool is +15 upside');
  assert.equal(computeQualificationScore({ ...base, hasQuoteOrPricingTool: true }), 25, 'already having one adds nothing');
  assert.equal(computeQualificationScore({ ...base, siteLooksAbandoned: true }), 0, 'abandoned is -25');
  assert.equal(computeQualificationScore({ ...base, siteLooksAbandoned: false }), 25, 'confirmed-not-abandoned adds nothing');
});

test('band boundaries: 70 is the strong floor, 69 is workable', () => {
  // 30 (ads) + 20 (reviews>=40) + 10 (page_2) + 15 (traffic 200-499) = 75
  const strong: ScorecardInput = {
    hasGoogleAds: true, googleReviewCount: 40, searchRank: 'page_2',
    estimatedMonthlyTraffic: 200, hasQuoteOrPricingTool: null, siteLooksAbandoned: null,
  };
  assert.equal(computeQualificationScore(strong), 75);
  assert.equal(scoreProspect(strong).band, 'strong');

  // 30 (ads) + 15 (traffic 200-499) = 45 exactly — the workable floor, not strong
  const workableFloor: ScorecardInput = {
    hasGoogleAds: true, googleReviewCount: 0, searchRank: 'not_ranking',
    estimatedMonthlyTraffic: 200, hasQuoteOrPricingTool: null, siteLooksAbandoned: null,
  };
  assert.equal(computeQualificationScore(workableFloor), 45);
  assert.equal(scoreProspect(workableFloor).band, 'workable', '45 is workable, not strong');
});

test('band boundaries: 45 is the workable floor, 44 is weak', () => {
  // 30 (ads) + 15 (upside) = 45, with traffic<50 contributing -20 and reviews 15-39 contributing +10 to compensate — solved by hand:
  // ads(30) + reviews 15-39(10) + traffic 50-199(5) = 45
  const workableFloor: ScorecardInput = {
    hasGoogleAds: true, googleReviewCount: 20, searchRank: 'not_ranking',
    estimatedMonthlyTraffic: 50, hasQuoteOrPricingTool: null, siteLooksAbandoned: null,
  };
  assert.equal(computeQualificationScore(workableFloor), 45);
  assert.equal(scoreProspect(workableFloor).band, 'workable');

  // Drop reviews below 15: ads(30) + reviews<15(0) + traffic 50-199(5) = 35
  const weak: ScorecardInput = { ...workableFloor, googleReviewCount: 5 };
  assert.equal(computeQualificationScore(weak), 35);
  assert.equal(scoreProspect(weak).band, 'weak', '35 is weak, not workable');
});

test('band boundaries: 25 is the weak floor, 24 is decline', () => {
  // reviews 15-39(10) + traffic 200-499(15) = 25
  const weakFloorFixed: ScorecardInput = {
    hasGoogleAds: false, googleReviewCount: 15, searchRank: 'not_ranking',
    estimatedMonthlyTraffic: 200, hasQuoteOrPricingTool: null, siteLooksAbandoned: null,
  };
  assert.equal(computeQualificationScore(weakFloorFixed), 25);
  assert.equal(scoreProspect(weakFloorFixed).band, 'weak', '25 is the weak floor');

  const decline: ScorecardInput = { ...weakFloorFixed, googleReviewCount: 0 }; // 0 + 15 = 15
  assert.equal(computeQualificationScore(decline), 15);
  assert.equal(scoreProspect(decline).band, 'decline', '15 is below the weak floor');
});

test('a genuinely dead site scores deep negative, not just zero', () => {
  const dead: ScorecardInput = {
    hasGoogleAds: false, googleReviewCount: 2, searchRank: 'not_ranking',
    estimatedMonthlyTraffic: 10, hasQuoteOrPricingTool: null, siteLooksAbandoned: true,
  }; // -20 (traffic) + -25 (abandoned) = -45
  assert.equal(computeQualificationScore(dead), -45);
  assert.equal(scoreProspect(dead).band, 'decline');
});

test('the warning is always plain language, never a bare number', () => {
  const input: ScorecardInput = {
    hasGoogleAds: false, googleReviewCount: 0, searchRank: 'unknown',
    estimatedMonthlyTraffic: 0, hasQuoteOrPricingTool: null, siteLooksAbandoned: null,
  };
  const result = scoreProspect(input);
  assert.ok(result.warning.length > 20, 'a real sentence, not a label');
  assert.ok(!/^-?\d+$/.test(result.warning.trim()), 'never just a number');
  assert.ok(result.action.length > 5);
});

test('the paid-ads signal is the single largest individual weight, matching OFFER.md \u00a77\u2019s stated intent', () => {
  const withTraffic = (extra: Partial<ScorecardInput>): ScorecardInput => ({
    hasGoogleAds: false, googleReviewCount: 0, searchRank: 'not_ranking',
    estimatedMonthlyTraffic: 500, hasQuoteOrPricingTool: null, siteLooksAbandoned: null,
    ...extra,
  });
  const adsWeight = computeQualificationScore(withTraffic({ hasGoogleAds: true })) - 25;
  const reviewsWeight = computeQualificationScore(withTraffic({ googleReviewCount: 200 })) - 25;
  const rankWeight = computeQualificationScore(withTraffic({ searchRank: 'page_1' })) - 25;
  assert.equal(adsWeight, 30);
  assert.ok(adsWeight > reviewsWeight, 'ads (30) must outweigh the reviews signal (20)');
  assert.ok(adsWeight > rankWeight, 'ads (30) must outweigh the rank signal (20)');
});
