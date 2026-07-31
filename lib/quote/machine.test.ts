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
