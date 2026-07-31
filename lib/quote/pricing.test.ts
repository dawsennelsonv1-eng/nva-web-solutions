import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateQuote,
  PricingError,
  formatCentsWhole,
  type PricingInput,
} from './pricing';

/**
 * lib/quote/pricing.test.ts — run with `npm test`.
 *
 * These are the EXACT seeded Ramirez rules from supabase/seed.sql, copied as
 * a literal on purpose: if a later phase edits the seed, these tests keep
 * asserting the arithmetic the engine promised, and the divergence shows up
 * as a failing test rather than as a wrong price on a real floor.
 */
const RULES = {
  baseRateCentsPerSqft: { flake: 550, metallic: 850, solid_polyaspartic: 650 },
  prepRateCentsPerSqft: 150,
  conditionModifiers: [
    { id: 'oil_heavy', label: 'Heavy oil contamination', pctAdjust: 0.18 },
    { id: 'cracking_moderate', label: 'Moderate cracking repair', pctAdjust: 0.12 },
    { id: 'previous_coating', label: 'Previous coating removal', pctAdjust: 0.25 },
  ],
  minimumJobCents: 150000,
  mobilizationFeeCents: 25000,
  rangeSpreadPct: 0.15,
};

const base: PricingInput = {
  sqft: 480,
  surfaceTypeId: 'garage',
  finishTierKey: 'flake',
  sqftMin: 100,
  sqftMax: 6000,
};

test('two-car garage in flake prices to the hand-checked figure', () => {
  const q = calculateQuote(base, RULES);
  // 480 x 550 = 264000 coating
  // 480 x 150 =  72000 prep
  //            +25000 mobilisation
  //            =361000 midpoint
  assert.equal(q.midpointCents, 361000);
  assert.equal(q.lowCents, 306850);   // 361000 x 0.85
  assert.equal(q.highCents, 415150);  // 361000 x 1.15
  assert.equal(q.minimumApplied, false);
});

test('the breakdown sums to the midpoint exactly', () => {
  for (const finish of ['flake', 'metallic', 'solid_polyaspartic']) {
    for (const sqft of [100, 137, 480, 2501, 6000]) {
      const q = calculateQuote(
        { ...base, sqft, finishTierKey: finish, conditionModifierIds: ['oil_heavy'] },
        RULES
      );
      const sum = q.lines.reduce((a, l) => a + l.cents, 0);
      assert.equal(sum, q.midpointCents, finish + '@' + sqft);
    }
  }
});

test('every money value is an integer number of cents', () => {
  const q = calculateQuote(
    { ...base, sqft: 337, conditionModifierIds: ['cracking_moderate'] },
    RULES
  );
  assert.ok(Number.isInteger(q.lowCents));
  assert.ok(Number.isInteger(q.midpointCents));
  assert.ok(Number.isInteger(q.highCents));
  for (const l of q.lines) assert.ok(Number.isInteger(l.cents), l.id);
});

test('metallic costs more than flake at identical square footage', () => {
  const flake = calculateQuote(base, RULES);
  const metallic = calculateQuote({ ...base, finishTierKey: 'metallic' }, RULES);
  assert.ok(metallic.midpointCents > flake.midpointCents);
  // difference is exactly the rate delta across the area, nothing else
  assert.equal(metallic.midpointCents - flake.midpointCents, 480 * (850 - 550));
});

test('modifiers are ADDITIVE, not compounding', () => {
  const all = calculateQuote(
    { ...base, conditionModifierIds: ['oil_heavy', 'cracking_moderate', 'previous_coating'] },
    RULES
  );
  const subtotal = 480 * 550 + 480 * 150; // 336000
  const additive = Math.round(subtotal * 0.18) + Math.round(subtotal * 0.12) + Math.round(subtotal * 0.25);
  assert.equal(all.midpointCents, subtotal + additive + 25000);
  // compounding would have produced a strictly larger number
  const compounded = Math.round(subtotal * 1.18 * 1.12 * 1.25) + 25000;
  assert.ok(all.midpointCents < compounded);
  assert.deepEqual(all.modifiersApplied, ['oil_heavy', 'cracking_moderate', 'previous_coating']);
});

test('mobilisation is flat: modifiers never inflate it', () => {
  const none = calculateQuote(base, RULES);
  const withMod = calculateQuote({ ...base, conditionModifierIds: ['oil_heavy'] }, RULES);
  const mobNone = none.lines.find((l) => l.kind === 'mobilization');
  const mobMod = withMod.lines.find((l) => l.kind === 'mobilization');
  assert.equal(mobNone?.cents, 25000);
  assert.equal(mobMod?.cents, 25000);
});

test('the same modifier twice counts once', () => {
  const once = calculateQuote({ ...base, conditionModifierIds: ['oil_heavy'] }, RULES);
  const twice = calculateQuote({ ...base, conditionModifierIds: ['oil_heavy', 'oil_heavy'] }, RULES);
  assert.equal(twice.midpointCents, once.midpointCents);
  assert.deepEqual(twice.modifiersApplied, ['oil_heavy']);
});

test('a small job is lifted to the job minimum and never quoted below it', () => {
  // 100 sqft flake: 55000 + 15000 + 25000 = 95000, under the 150000 minimum
  const q = calculateQuote({ ...base, sqft: 100 }, RULES);
  assert.equal(q.minimumApplied, true);
  assert.equal(q.midpointCents, 150000);
  assert.equal(q.lowCents, 150000); // clamped: never below the stated minimum
  assert.equal(q.highCents, 172500);
  assert.ok(q.lines.some((l) => l.kind === 'minimum_adjustment'));
});

test('the band is symmetric around the midpoint when the minimum is not binding', () => {
  const q = calculateQuote({ ...base, sqft: 1200 }, RULES);
  assert.equal(q.midpointCents - q.lowCents, q.highCents - q.midpointCents);
});

test('sqft outside the configured bounds is rejected', () => {
  assert.throws(
    () => calculateQuote({ ...base, sqft: 99 }, RULES),
    (e: unknown) => e instanceof PricingError && e.code === 'sqft_out_of_bounds'
  );
  assert.throws(
    () => calculateQuote({ ...base, sqft: 6001 }, RULES),
    (e: unknown) => e instanceof PricingError && e.code === 'sqft_out_of_bounds'
  );
  assert.throws(
    () => calculateQuote({ ...base, sqft: Number.NaN }, RULES),
    (e: unknown) => e instanceof PricingError && e.code === 'sqft_out_of_bounds'
  );
});

test('an unknown finish tier is rejected rather than defaulted', () => {
  assert.throws(
    () => calculateQuote({ ...base, finishTierKey: 'terrazzo' }, RULES),
    (e: unknown) => e instanceof PricingError && e.code === 'unknown_finish_tier'
  );
});

test('an unknown condition modifier is rejected rather than ignored', () => {
  assert.throws(
    () => calculateQuote({ ...base, conditionModifierIds: ['asbestos'] }, RULES),
    (e: unknown) => e instanceof PricingError && e.code === 'unknown_modifier'
  );
});

test('malformed rules are rejected at the boundary', () => {
  assert.throws(
    () => calculateQuote(base, { ...RULES, rangeSpreadPct: 0.9 }),
    (e: unknown) => e instanceof PricingError && e.code === 'invalid_rules'
  );
  assert.throws(
    () => calculateQuote(base, { ...RULES, baseRateCentsPerSqft: { flake: -1 } }),
    (e: unknown) => e instanceof PricingError && e.code === 'invalid_rules'
  );
  assert.throws(
    () => calculateQuote(base, {}),
    (e: unknown) => e instanceof PricingError && e.code === 'invalid_rules'
  );
});

test('incoherent sqft bounds are rejected', () => {
  assert.throws(
    () => calculateQuote({ ...base, sqftMin: 500, sqftMax: 100 }, RULES),
    (e: unknown) => e instanceof PricingError && e.code === 'invalid_bounds'
  );
});

test('zero prep and zero mobilisation produce no phantom lines', () => {
  const lean = { ...RULES, prepRateCentsPerSqft: 0, mobilizationFeeCents: 0, minimumJobCents: 0 };
  const q = calculateQuote(base, lean);
  assert.equal(q.lines.length, 1);
  assert.equal(q.midpointCents, 480 * 550);
});

test('a large commercial job stays coherent', () => {
  const q = calculateQuote(
    { ...base, sqft: 5000, surfaceTypeId: 'commercial', finishTierKey: 'solid_polyaspartic' },
    RULES
  );
  assert.equal(q.midpointCents, 5000 * 650 + 5000 * 150 + 25000);
  assert.ok(q.lowCents < q.midpointCents && q.midpointCents < q.highCents);
});

test('pricing is deterministic across repeated calls', () => {
  const a = calculateQuote({ ...base, conditionModifierIds: ['oil_heavy'] }, RULES);
  const b = calculateQuote({ ...base, conditionModifierIds: ['oil_heavy'] }, RULES);
  assert.deepEqual(a, b);
});

test('surface type is recorded but does not change the price', () => {
  const garage = calculateQuote({ ...base, surfaceTypeId: 'garage' }, RULES);
  const patio = calculateQuote({ ...base, surfaceTypeId: 'patio' }, RULES);
  assert.equal(garage.midpointCents, patio.midpointCents);
  assert.equal(patio.inputs.surfaceTypeId, 'patio');
});

test('formatCentsWhole renders whole dollars with separators', () => {
  assert.equal(formatCentsWhole(361000), '$3,610');
  assert.equal(formatCentsWhole(150000), '$1,500');
});
