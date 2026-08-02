import type { ComponentType } from 'react';
import type { ZodType, ZodTypeAny } from 'zod';
import type { QuoteComputationOf } from '@/lib/quote/kit';

/**
 * THE VERTICAL MODULE CONTRACT — v2 (Phase 11). Adding a vertical is a new
 * module registration, never a core rewrite (SPEC R-801/R-803).
 *
 * WHAT CHANGED FROM v1, AND WHY. The v1 contract let a vertical describe
 * itself but not price itself: it supplied a pricingRuleSchema and core owned
 * the arithmetic. That works for exactly one trade. Painting is driven by wall
 * area x coat count with prep as a major line, not floor area x finish tier —
 * so under v1 the engine would have needed `if (vertical === 'painting')`,
 * which is the core edit this contract exists to prevent. v2 moves five things
 * from core into the module:
 *
 *   1. price()      — the module owns its own deterministic maths.
 *   2. steps[]      — the module declares its questions; the widget renders
 *                     them generically. v1 hard-wired two choice steps.
 *   3. inputSchema  — the module owns the shape of its own answers.
 *   4. vision       — prompt, response schema, mapping and FALLBACK, together.
 *   5. copy         — a full pack, every key required, so a missing string is
 *                     a compile error and never a blank on a contractor's page.
 *
 * WHAT DELIBERATELY DID NOT MOVE. There is no quota hook, no cost hook and no
 * AI client on this interface, and there must never be one. A module supplies
 * a prompt and a schema; CORE makes the vision call and CORE counts it. That
 * is what keeps one quota path across every vertical.
 *
 * Architecture:
 *  - registry.ts (THIS FILE) is core. Phase 11's success test is that it never
 *    needs editing again.
 *  - manifest.ts is the ONE designated registration point.
 *  - Each vertical lives in lib/verticals/<id>/.
 *
 * DEPRECATION IN FLIGHT: fields marked @deprecated below are the v1 surface,
 * kept so the Phase 4 widget and Phase 8 admin compile unchanged against this
 * push. They are removed in the Batch 2 turn, once those files are in front of
 * me. Nothing new should read them.
 */

// ---------------------------------------------------------------------------
// measurement & catalogue
// ---------------------------------------------------------------------------

/** For analytics and unit arithmetic. The human label lives on the step. */
export type MeasureUnit = 'sqft' | 'linear_ft' | 'squares' | 'count';

export interface QuantityPreset {
  label: string;
  value: number;
}

export interface SurfaceTypeOption {
  id: string;
  /** Homeowner-facing label for the surface step. */
  label: string;
  helpText?: string;
  /**
   * The "not sure?" affordance (R-107), now unit-agnostic: presets for this
   * surface's primary quantity step, whatever that step measures.
   */
  presets: QuantityPreset[];
  /** Restrict the finish step for this surface. Omit = every finish. */
  finishIds?: string[];
  /** @deprecated v1 shape — floor sqft only. Widget migration removes this. */
  typicalSqft: { label: string; sqft: number }[];
}

export interface ColourSwatch {
  id: string;
  label: string;
  /** Swatch hexes are DATA, not theme tokens. Verticals add no theme colours. */
  hex: string;
}

export interface ColourCollection {
  id: string;
  label: string;
  colours: ColourSwatch[];
}

/**
 * Finish and colour are ORTHOGONAL in v2. In epoxy a finish system carries its
 * own colours, so each finish points at its own one-collection list. In
 * painting, sheen and colour are independent — five sheens share one deck —
 * and nesting colours inside finishes would duplicate the deck five times.
 */
export interface FinishOption {
  id: string;
  label: string;
  description?: string;
  /** Pricing tier key this finish resolves to inside quote_configs.rules. */
  tierKey: string;
  /** Collections offered with this finish. Omit = every collection. */
  colourCollectionIds?: string[];
}

/** @deprecated v1 shape. Built by legacyFinishCatalogue(); never hand-written. */
export type LegacyFinishOption = FinishOption & { colours: ColourSwatch[] };

// ---------------------------------------------------------------------------
// steps — the vertical declares its questions
// ---------------------------------------------------------------------------

export interface SelectOption {
  id: string;
  label: string;
  helpText?: string;
}

/**
 * `configMinKey` / `configMaxKey` name quote_configs COLUMNS rather than
 * carrying numbers, so no bound that shapes a price is ever written in
 * TypeScript (R-113).
 */
export type StepControl =
  | { kind: 'surface_select' }
  | { kind: 'finish_select' }
  | { kind: 'colour_select' }
  | {
      kind: 'quantity';
      unit: MeasureUnit;
      unitLabel: string;
      configMinKey: string;
      configMaxKey: string;
      /** Pull the "not sure?" presets from the chosen surface type. */
      presetsFrom?: 'surfaceType';
    }
  /** Small integer counts — coats, layers, doors. Bounds are counts, not rates. */
  | { kind: 'stepper'; min: number; max: number; unitLabel: string }
  | { kind: 'single_select'; options: SelectOption[] }
  | {
      kind: 'multi_select';
      /** 'conditionModifiers' reads the live options out of quote_configs.rules. */
      optionsFrom?: 'conditionModifiers';
      options?: SelectOption[];
    }
  | { kind: 'photo' };

export interface StepDescriptor {
  id: string;
  question: string;
  help?: string;
  /** An optional step must be skippable without blocking the quote. */
  optional?: boolean;
  /** Key in this vertical's inputs object that the step writes. */
  writesTo: string;
  control: StepControl;
  /** Pure predicate over answers so far. No I/O, no clock. */
  showIf?: (selections: Record<string, unknown>) => boolean;
}

// ---------------------------------------------------------------------------
// copy — every key required, so a gap fails the build not the homeowner
// ---------------------------------------------------------------------------

export interface VerticalCopy {
  /** e.g. "epoxy floor coating" — slots into market-specific sentences. */
  tradeNoun: string;
  widgetTitle: string;
  widgetSubtitle: string;
  /** @deprecated read steps[0].question instead. */
  step1Question: string;

  ctaStart: string;
  ctaNext: string;
  ctaBack: string;
  ctaSeePrice: string;

  photoStepTitle: string;
  photoStepHelp: string;
  photoSkipLabel: string;
  analyzingLabel: string;

  /**
   * DEGRADED MODE, in the trade's own voice. v1 routed these to OFFER.md,
   * which meant every vertical apologised in garage-floor language. None of
   * these three may imply the quote has stopped — because it has not.
   */
  analysisFailedTitle: string;
  analysisFailedBody: string;
  analysisUnsureBody: string;
  quotaReachedBody: string;

  resultTitle: string;
  resultRangeCaption: string;
  resultDisclaimer: string;

  leadFormTitle: string;
  leadFormBody: string;
  leadSuccessTitle: string;
  leadSuccessBody: string;

  genericErrorTitle: string;
  /** Errors say what happened AND what to do. */
  genericErrorBody: string;

  /** Contractor-facing. */
  adminVerticalLabel: string;
  adminConfigHeading: string;
  adminQuoteNoun: string;
}

export type CopyKey = keyof VerticalCopy;

// ---------------------------------------------------------------------------
// vision
// ---------------------------------------------------------------------------

export interface VisionContext {
  /** Chosen before the photo step, when the flow offers it that way. */
  surfaceTypeId?: string;
  /** Every answer collected so far, keyed by StepDescriptor.writesTo. */
  selections: Record<string, unknown>;
}

/**
 * Ids the CONTRACTOR'S config actually defines. AI-derived values are filtered
 * against this before they reach pricing, so a confused vision call can only
 * ever degrade a quote — never throw unknown_modifier at a homeowner.
 */
export interface VisionAllowances {
  modifierIds: string[];
  tierKeys: string[];
}

export interface VisionModule<TInputs, TRules> {
  /** Prompt is a FUNCTION of context: cabinets and siding are different tasks. */
  buildPrompt(ctx: VisionContext): string;
  /** Validates the model's JSON at the boundary. Malformed = degraded, not crashed. */
  responseSchema: ZodTypeAny;
  /** Below this, a field is treated as unknown. */
  minConfidence: number;
  allowancesFromRules(rules: TRules): VisionAllowances;
  /** Pure. Must never throw — return fewer fields instead. */
  mapToInputs(
    parsed: unknown,
    ctx: VisionContext,
    allowed: VisionAllowances
  ): Partial<TInputs>;
  /** What the quote uses when vision is off, capped, failed or unsure. */
  fallbackInputs(ctx: VisionContext): Partial<TInputs>;
}

// ---------------------------------------------------------------------------
// the module
// ---------------------------------------------------------------------------

export interface ResultRendererProps {
  lowCents: number;
  highCents: number;
  breakdown: unknown;
  /** v2: the whole typed computation. Prefer this over `breakdown`. */
  quote?: QuoteComputationOf<unknown>;
}

export interface VerticalModule<TInputs = unknown, TRules = unknown> {
  /** Registry id — referenced by prospects.vertical, quote_configs.vertical. */
  id: string;
  displayName: string;
  copy: VerticalCopy;

  surfaceTypes: SurfaceTypeOption[];
  finishes: FinishOption[];
  colourCollections: ColourCollection[];

  /** The widget renders these in order. Core knows no trade's questions. */
  steps: StepDescriptor[];
  /** Validates the collected answers before anything is priced. */
  inputSchema: ZodType<TInputs>;
  /** Validates quote_configs.rules. A malformed config fails at the boundary. */
  pricingRuleSchema: ZodType<TRules>;

  /**
   * THE PRICING RULE, enforced by the type: price() takes inputs and rules and
   * returns cents. It cannot reach a network, a clock or an AI — there is
   * nothing in scope to reach one with. The AI never produces a price.
   */
  price(inputs: TInputs, rules: TRules): QuoteComputationOf<TInputs>;

  vision: VisionModule<TInputs, TRules>;
  ResultRenderer: ComponentType<ResultRendererProps>;

  /** @deprecated v1 surface — derive with legacyFinishCatalogue(). */
  finishCatalogue: LegacyFinishOption[];
  /** @deprecated v1 surface — use vision.buildPrompt(). */
  photoAnalysisPrompt: string;
}

export type AnyVerticalModule = VerticalModule<any, any>;

// ---------------------------------------------------------------------------
// helpers modules use
// ---------------------------------------------------------------------------

/** Flattens v2's orthogonal finishes + collections back into the v1 shape. */
export function legacyFinishCatalogue(
  finishes: FinishOption[],
  collections: ColourCollection[]
): LegacyFinishOption[] {
  return finishes.map((f) => {
    const ids = f.colourCollectionIds;
    const picked = ids
      ? collections.filter((c) => ids.includes(c.id))
      : collections;
    return { ...f, colours: picked.flatMap((c) => c.colours) };
  });
}

/** Finish id -> pricing tier key. Core resolves this; the widget never does. */
export function resolveTierKey(
  mod: AnyVerticalModule,
  finishId: string
): string {
  const finish = mod.finishes.find((f) => f.id === finishId);
  if (!finish) {
    throw new Error(
      `Finish '${finishId}' is not in vertical '${mod.id}'. Known: ` +
        mod.finishes.map((f) => f.id).join(', ')
    );
  }
  return finish.tierKey;
}

/** Colours offered for a finish, honouring collection restrictions. */
export function coloursForFinish(
  mod: AnyVerticalModule,
  finishId: string
): ColourSwatch[] {
  const finish = mod.finishes.find((f) => f.id === finishId);
  if (!finish) return [];
  const ids = finish.colourCollectionIds;
  const picked = ids
    ? mod.colourCollections.filter((c) => ids.includes(c.id))
    : mod.colourCollections;
  return picked.flatMap((c) => c.colours);
}

// ---------------------------------------------------------------------------
// store — deliberately boring; boring survives Phase 11
// ---------------------------------------------------------------------------

const registry = new Map<string, AnyVerticalModule>();

/**
 * Registration-time invariants. v1 caught duplicate ids and nothing else, so a
 * finish pointing at a tier the schema never defines surfaced mid-quote, in
 * production, as a missing rate. Now it surfaces at boot, in the build log.
 */
function validateModule(mod: AnyVerticalModule): void {
  const fail = (msg: string): never => {
    throw new Error(`Vertical '${mod.id}' is invalid: ${msg}`);
  };

  const dupes = (ids: string[]): string[] =>
    ids.filter((id, i) => ids.indexOf(id) !== i);

  const surfaceIds = mod.surfaceTypes.map((s) => s.id);
  if (dupes(surfaceIds).length) fail(`duplicate surface ids: ${dupes(surfaceIds).join(', ')}`);

  const finishIds = mod.finishes.map((f) => f.id);
  if (dupes(finishIds).length) fail(`duplicate finish ids: ${dupes(finishIds).join(', ')}`);

  const collectionIds = mod.colourCollections.map((c) => c.id);
  if (dupes(collectionIds).length)
    fail(`duplicate colour collection ids: ${dupes(collectionIds).join(', ')}`);

  for (const c of mod.colourCollections) {
    const swatchIds = c.colours.map((s) => s.id);
    if (dupes(swatchIds).length)
      fail(`collection '${c.id}' has duplicate colour ids: ${dupes(swatchIds).join(', ')}`);
  }

  for (const f of mod.finishes) {
    if (!f.tierKey) fail(`finish '${f.id}' has an empty tierKey`);
    for (const id of f.colourCollectionIds ?? []) {
      if (!collectionIds.includes(id))
        fail(`finish '${f.id}' references unknown colour collection '${id}'`);
    }
  }

  for (const s of mod.surfaceTypes) {
    for (const id of s.finishIds ?? []) {
      if (!finishIds.includes(id))
        fail(`surface '${s.id}' references unknown finish '${id}'`);
    }
  }

  const stepIds = mod.steps.map((s) => s.id);
  if (dupes(stepIds).length) fail(`duplicate step ids: ${dupes(stepIds).join(', ')}`);
  const writeKeys = mod.steps.map((s) => s.writesTo);
  if (dupes(writeKeys).length)
    fail(`two steps write the same input key: ${dupes(writeKeys).join(', ')}`);
  if (mod.steps.length === 0) fail('has no steps');

  for (const [key, value] of Object.entries(mod.copy)) {
    if (typeof value !== 'string' || value.trim() === '')
      fail(`copy.${key} is empty`);
  }

  if (mod.vision.minConfidence < 0 || mod.vision.minConfidence > 1)
    fail(`vision.minConfidence must be between 0 and 1`);
}

export function registerVertical(mod: AnyVerticalModule): void {
  if (registry.has(mod.id)) {
    // Registering twice means two files claim one id — always a bug.
    throw new Error(`Vertical '${mod.id}' is already registered.`);
  }
  validateModule(mod);
  registry.set(mod.id, mod);
}

export function getVertical(id: string): AnyVerticalModule {
  const mod = registry.get(id);
  if (!mod) {
    throw new Error(
      `Unknown vertical '${id}'. Registered: ${[...registry.keys()].join(', ') || '(none — did manifest.ts run?)'}`
    );
  }
  return mod;
}

export function hasVertical(id: string): boolean {
  return registry.has(id);
}

export function listVerticals(): AnyVerticalModule[] {
  return [...registry.values()];
}
