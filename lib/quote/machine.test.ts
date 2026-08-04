import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuoteMachine, AnalysisDegradedSignal } from './machine';
import type { QuoteComputation } from './pricing';

/**
 * lib/quote/machine.test.ts — Phase 5 addition.
 *
 * WHY THIS EXISTS: while wiring the real widget for Phase 5, the ports
 * QuoteWidget.tsx accepted on its props (analyze / persistQuote / submitLead)
 * were never actually threaded into the machine the widget creates — only
 * touchSession was. The widget rendered, the state machine ran, and every
 * step LOOKED correct, because a missing port degrades silently by design
 * (no analyze port -> skip straight to manual entry; no submitLead port ->
 * transition to 'unlocked' without writing anything). Nothing in Phase 4's
 * manual testing could have caught it without a real backend to submit
 * against — no lead was ever actually captured, and Phase 4 shipped anyway
 * with a passing build and a green typecheck.
 *
 * These tests exist so that specific failure mode cannot recur silently: they
 * assert the ports the machine was GIVEN are the ones actually called, with
 * the arguments the contract promises. The machine is vanilla Zustand with
 * every side effect injected, precisely so this is possible without a
 * browser or a database.
 */

const baseComputation: QuoteComputation = {
  lowCents: 100, midpointCents: 120, highCents: 140,
  lines: [], modifiersApplied: [], minimumApplied: false,
  rangeSpreadPct: 0.15,
  inputs: { sqft: 480, surfaceTypeId: 'garage', finishTierKey: 'flake', sqftMin: 100, sqftMax: 6000 },
};

test('attachPhoto calls the injected analyze port with the photo, and applies its hints', async () => {
  const calls: unknown[] = [];
  const store = createQuoteMachine({
    mode: 'live', surface: 'demo',
    ports: {
      analyze: async (args) => {
        calls.push(args);
        return { surfaceTypeId: 'garage', estimatedSqft: 512, conditionModifierIds: ['oil_heavy'], handToUser: [] };
      },
    },
  });

  await store.getState().attachPhoto({ imageBase64: 'ZmFrZQ==', mediaType: 'image/webp' });

  assert.equal(calls.length, 1, 'the port must be called exactly once');
  assert.deepEqual(calls[0], { imageBase64: 'ZmFrZQ==', mediaType: 'image/webp' });
  assert.equal(store.getState().surfaceTypeId, 'garage');
  assert.equal(store.getState().sqft, 512);
  assert.deepEqual(store.getState().conditionModifierIds, ['oil_heavy']);
  assert.equal(store.getState().step, 'finish');
});

test('attachPhoto with no analyze port skips straight to manual entry at finish', async () => {
  const store = createQuoteMachine({ mode: 'live', surface: 'demo' });
  await store.getState().attachPhoto({ imageBase64: 'x', mediaType: 'image/webp' });
  assert.equal(store.getState().step, 'finish');
  assert.equal(store.getState().photoAttached, true);
});

test('a thrown AnalysisDegradedSignal enters degraded mode, not manual entry', async () => {
  const store = createQuoteMachine({
    mode: 'live', surface: 'demo',
    ports: {
      analyze: async () => {
        throw new AnalysisDegradedSignal('cap_reached');
      },
    },
  });
  await store.getState().attachPhoto({ imageBase64: 'x', mediaType: 'image/webp' });
  assert.equal(store.getState().step, 'degraded_capture');
  assert.equal(store.getState().degraded, true);
  assert.equal(store.getState().degradedReason, 'cap_reached');
  assert.equal(store.getState().busy, false, 'busy must be cleared even on the degraded exit');
});

test('an ordinary analyze failure falls through to manual entry, never degraded', async () => {
  const store = createQuoteMachine({
    mode: 'live', surface: 'demo',
    ports: { analyze: async () => { throw new Error('network blip'); } },
  });
  await store.getState().attachPhoto({ imageBase64: 'x', mediaType: 'image/webp' });
  assert.equal(store.getState().step, 'finish');
  assert.equal(store.getState().degraded, false);
});

test('commitQuote calls the injected persistQuote port and stores the returned public id', async () => {
  const calls: QuoteComputation[] = [];
  const store = createQuoteMachine({
    mode: 'live', surface: 'demo',
    ports: { persistQuote: async (c) => { calls.push(c); return 'abc123publicid'; } },
  });
  store.getState().goTo('finish');
  store.getState().goTo('sqft');
  store.getState().goTo('quote');
  store.getState().setComputation(baseComputation);
  await store.getState().commitQuote();
  assert.equal(calls.length, 1);
  assert.equal(calls[0], baseComputation);
  assert.equal(store.getState().quotePublicId, 'abc123publicid');
  assert.equal(store.getState().step, 'capture');
});

test('preview mode never calls persistQuote, even when the port exists', async () => {
  let called = false;
  const store = createQuoteMachine({
    mode: 'preview', surface: 'admin',
    ports: { persistQuote: async () => { called = true; return 'x'; } },
  });
  store.getState().setComputation(baseComputation);
  await store.getState().commitQuote();
  assert.equal(called, false);
  assert.equal(store.getState().quotePublicId, null);
});

test('submitCapture calls submitLead with the exact draft shape, including degraded flags', async () => {
  const calls: unknown[] = [];
  const store = createQuoteMachine({
    mode: 'live', surface: 'demo',
    ports: { submitLead: async (draft) => { calls.push(draft); } },
  });
  store.getState().enterDegraded('subscription_suspended');
  await store.getState().submitCapture({ name: 'Karen M.', phone: '2145551234', email: 'k@example.com', timeline: 'Within a month' });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    name: 'Karen M.', phone: '2145551234', email: 'k@example.com', timeline: 'Within a month',
    wasDegraded: true, degradedReason: 'subscription_suspended', quotePublicId: null,
  });
  assert.equal(store.getState().step, 'degraded_acknowledged');
});

test('submitCapture surfaces a retry-friendly error and does not advance on failure', async () => {
  const store = createQuoteMachine({
    mode: 'live', surface: 'demo',
    ports: { submitLead: async () => { throw new Error('network'); } },
  });
  const stepBefore = store.getState().step;
  await store.getState().submitCapture({ name: 'A', phone: '2145551234', email: 'a@example.com', timeline: 'Now' });
  assert.equal(store.getState().step, stepBefore, 'must not advance past capture on a failed submit');
  assert.ok(store.getState().error);
});

test('preview mode never calls submitLead', async () => {
  let called = false;
  const store = createQuoteMachine({
    mode: 'preview', surface: 'admin',
    ports: { submitLead: async () => { called = true; } },
  });
  await store.getState().submitCapture({ name: 'A', phone: '2145551234', email: 'a@example.com', timeline: 'Now' });
  assert.equal(called, false);
  assert.equal(store.getState().step, 'unlocked');
});

/**
 * === PHASE 11 ADDITIONS: DYNAMIC STEP PLANS ===
 *
 * Every test above runs the LEGACY plan and is unmodified, which is the point:
 * supplying no `steps` must reproduce Phase 4 exactly. These add the other
 * path — a plan declared by a vertical module, walked by next().
 *
 * The failure mode these guard against is the same one that produced this file:
 * something that LOOKS like it works. A dynamic plan that silently drops a step,
 * writes an answer to the wrong key, or fails to reach 'quote' would render
 * perfectly and quote wrongly.
 */

import type { StepDescriptor } from '@/lib/verticals/registry';

/** A three-question plan with one conditional step. Deliberately not epoxy. */
const testPlan: StepDescriptor[] = [
  { id: 'surface', question: 'What?', writesTo: 'surfaceTypeId', control: { kind: 'surface_select' } },
  {
    id: 'area', question: 'How much?', writesTo: 'areaSqft',
    showIf: (s) => s.surfaceTypeId === 'walls',
    control: { kind: 'quantity', unit: 'sqft', unitLabel: 'sq ft', configMinKey: 'sqft_min', configMaxKey: 'sqft_max' },
  },
  {
    id: 'doors', question: 'How many?', writesTo: 'doorCount',
    showIf: (s) => s.surfaceTypeId === 'cabinets',
    control: { kind: 'stepper', min: 1, max: 80, unitLabel: 'fronts' },
  },
  { id: 'coats', question: 'Coats?', writesTo: 'coats', control: { kind: 'stepper', min: 1, max: 3, unitLabel: 'coats' } },
];

test('a declared plan replaces the legacy transition table and ends at quote', () => {
  const store = createQuoteMachine({ mode: 'live', surface: 'demo', steps: testPlan });
  const s = () => store.getState();

  assert.equal(s().step, 'surface', 'starts on the first visible declared step');
  s().setAnswer('surfaceTypeId', 'walls');
  s().next();
  assert.equal(s().step, 'area');
  s().next();
  assert.equal(s().step, 'coats', 'the invisible doors step is skipped, not stepped through');
  s().next();
  assert.equal(s().step, 'quote', 'past the last question every vertical ends the same way');
});

test('showIf swaps which quantity step is visible, and setSqft writes the right key', () => {
  const store = createQuoteMachine({ mode: 'live', surface: 'demo', steps: testPlan });
  const s = () => store.getState();

  s().setAnswer('surfaceTypeId', 'cabinets');
  assert.deepEqual(s().visiblePlan().map((x) => x.id), ['surface', 'doors', 'coats']);
  s().next();
  assert.equal(s().step, 'doors');
  s().setSqft(30);
  assert.equal(s().answers.doorCount, 30, 'the quantity lands in the visible step\u2019s key');
  assert.equal(s().answers.areaSqft, undefined, 'and never in the hidden one');
  assert.equal(s().sqft, 30, 'the legacy mirror still tracks it for StepArea');
});

test('a showIf predicate that throws shows the step rather than killing the funnel', () => {
  const exploding: StepDescriptor[] = [
    { id: 'a', question: 'A', writesTo: 'a', control: { kind: 'surface_select' } },
    {
      id: 'b', question: 'B', writesTo: 'b',
      showIf: () => { throw new Error('module bug'); },
      control: { kind: 'stepper', min: 1, max: 3, unitLabel: 'x' },
    },
  ];
  const store = createQuoteMachine({ mode: 'live', surface: 'demo', steps: exploding });
  assert.deepEqual(store.getState().visiblePlan().map((x) => x.id), ['a', 'b']);
});

test('back() walks a dynamic plan by history, skipping steps never visited', () => {
  const store = createQuoteMachine({ mode: 'live', surface: 'demo', steps: testPlan });
  const s = () => store.getState();
  s().setAnswer('surfaceTypeId', 'walls');
  s().next();
  s().next();
  assert.equal(s().step, 'coats');
  s().back();
  assert.equal(s().step, 'area');
  s().back();
  assert.equal(s().step, 'surface');
  assert.equal(s().back(), false, 'no history left');
});

test('vertical-shaped analyze hints land in answers, and win over the legacy fields', async () => {
  const store = createQuoteMachine({
    mode: 'live', surface: 'demo', steps: testPlan,
    ports: {
      analyze: async () => ({
        surfaceTypeId: 'walls', estimatedSqft: 100, conditionModifierIds: [], handToUser: [],
        answers: { areaSqft: 1380, coats: 2 },
      }),
    },
  });
  await store.getState().attachPhoto({ imageBase64: 'x', mediaType: 'image/webp' });
  assert.equal(store.getState().answers.areaSqft, 1380);
  assert.equal(store.getState().answers.coats, 2);
  assert.equal(store.getState().sqft, 1380, 'the mirror follows the vertical hint, not estimatedSqft');
});

test('degraded entry from mid-plan still overrides the plan entirely', () => {
  const store = createQuoteMachine({ mode: 'live', surface: 'demo', steps: testPlan });
  store.getState().setAnswer('surfaceTypeId', 'walls');
  store.getState().next();
  store.getState().enterDegraded('cap_reached');
  assert.equal(store.getState().step, 'degraded_capture');
  assert.equal(store.getState().computation, null, 'a degraded session promises no price');
});

test('serialize round-trips answers, and a v1 payload still restores', () => {
  const store = createQuoteMachine({ mode: 'live', surface: 'demo', steps: testPlan });
  store.getState().setAnswer('surfaceTypeId', 'walls');
  store.getState().setAnswer('areaSqft', 900);
  const snap = store.getState().serialize();
  assert.equal(snap.v, 2);
  assert.deepEqual(snap.answers, { surfaceTypeId: 'walls', areaSqft: 900 });

  const restored = createQuoteMachine({ mode: 'live', surface: 'demo', steps: testPlan, restore: snap });
  assert.equal(restored.getState().answers.areaSqft, 900);
  assert.equal(restored.getState().surfaceTypeId, 'walls');

  const v1 = { ...snap, v: 1 as const, answers: undefined };
  const fromV1 = createQuoteMachine({ mode: 'live', surface: 'demo', restore: v1 });
  assert.equal(fromV1.getState().sqft, snap.sqft, 'a Phase 4 payload restores without answers');
  assert.deepEqual(fromV1.getState().answers, {});
});

test('a dynamic session in preview mode still writes nothing', async () => {
  let persisted = false;
  let submitted = false;
  const store = createQuoteMachine({
    mode: 'preview', surface: 'admin', steps: testPlan,
    ports: {
      persistQuote: async () => { persisted = true; return 'x'; },
      submitLead: async () => { submitted = true; },
    },
  });
  store.getState().setComputation(baseComputation);
  await store.getState().commitQuote();
  await store.getState().submitCapture({ name: 'A', phone: '2145551234', email: 'a@example.com', timeline: 'Now' });
  assert.equal(persisted, false, 'preview consumes no quota and writes no quote');
  assert.equal(submitted, false);
});
