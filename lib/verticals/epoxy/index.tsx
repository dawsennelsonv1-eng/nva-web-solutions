import { z } from 'zod';
import {
  legacyFinishCatalogue,
  type ColourCollection,
  type FinishOption,
  type ResultRendererProps,
  type StepDescriptor,
  type SurfaceTypeOption,
  type VerticalCopy,
  type VerticalModule,
  type VisionAllowances,
  type VisionContext,
  type VisionModule,
} from '@/lib/verticals/registry';
import { calculateQuote, type PricingInput } from '@/lib/quote/pricing';
import type { QuoteComputationOf } from '@/lib/quote/kit';

/**
 * EPOXY — the launch vertical, ported to the v2 contract (Phase 11).
 * Concrete & epoxy floor coating, Dallas market.
 *
 * Note the boundary, unchanged from Phase 1: everything here is CONTENT,
 * SCHEMA and FORMULA. Rates themselves live in quote_configs.rules per
 * prototype (CONVENTIONS.md 9) — this module defines the SHAPE those rules
 * must satisfy and the ARITHMETIC that consumes them, never the numbers.
 *
 * Epoxy's formula is quantity x tier rate + per-sqft prep, which is the kernel
 * in lib/quote/pricing.ts. Calling it from here rather than having core call
 * it for us is the entire point of v2: painting will compose a different
 * formula from the same kit without core learning either trade.
 */

// ---------------------------------------------------------------------------
// pricing rule schema — quote_configs.rules must parse through this
// ---------------------------------------------------------------------------

export const epoxyPricingRuleSchema = z
  .object({
    /** Base $/sqft in cents, per finish tier key. */
    baseRateCentsPerSqft: z.object({
      flake: z.number().int().positive(),
      metallic: z.number().int().positive(),
      solid_polyaspartic: z.number().int().positive(),
    }),
    /** Surface prep (grind/patch) $/sqft in cents. */
    prepRateCentsPerSqft: z.number().int().nonnegative(),
    /** Multiplicative condition modifiers the engine may apply. */
    conditionModifiers: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        /** e.g. 0.18 = +18%. Bounded so a config typo can't 100x a quote. */
        pctAdjust: z.number().min(-0.5).max(1),
      })
    ),
    minimumJobCents: z.number().int().nonnegative(),
    mobilizationFeeCents: z.number().int().nonnegative(),
    /** Half-width of the quoted range, e.g. 0.15 → ±15% around midpoint. */
    rangeSpreadPct: z.number().min(0.05).max(0.5),
  })
  .strict();

export type EpoxyPricingRules = z.infer<typeof epoxyPricingRuleSchema>;

// ---------------------------------------------------------------------------
// inputs — the shape of the answers the steps collect
// ---------------------------------------------------------------------------

export const epoxyInputSchema = z.object({
  surfaceTypeId: z.string().min(1),
  sqft: z.number().finite(),
  finishId: z.string().min(1),
  finishTierKey: z.string().min(1),
  colourId: z.string().min(1).optional(),
  conditionModifierIds: z.array(z.string().min(1)).optional(),
  photoUrl: z.string().optional(),
  /** Bounds from quote_configs, carried so pricing can enforce them itself. */
  sqftMin: z.number().finite(),
  sqftMax: z.number().finite(),
});

export type EpoxyInputs = z.infer<typeof epoxyInputSchema>;

// ---------------------------------------------------------------------------
// copy
// ---------------------------------------------------------------------------

const copy: VerticalCopy = {
  tradeNoun: 'epoxy floor coating',
  widgetTitle: 'Price your floor',
  widgetSubtitle: 'A real range in about a minute. No phone call, no salesman.',
  step1Question: 'What are we coating?',

  ctaStart: 'Get my price range',
  ctaNext: 'Continue',
  ctaBack: 'Back',
  ctaSeePrice: 'See my range',

  photoStepTitle: 'Add a photo of the floor',
  photoStepHelp:
    'Stand back far enough to get a whole bay in frame. Daylight through the open door reads best.',
  photoSkipLabel: 'Skip — price it from my answers',
  analyzingLabel: 'Reading your floor…',

  analysisFailedTitle: "Couldn't read that photo",
  analysisFailedBody:
    'Your range below is priced from your own answers, so it still stands. Add a clearer shot of the floor if you want it tightened up.',
  analysisUnsureBody:
    "The photo wasn't clear enough to judge the concrete, so we priced it from your answers. Your installer will confirm the surface on site.",
  quotaReachedBody:
    "Photo analysis is paused for today. Your range is priced from your answers and we've still got your details — nothing is lost.",

  resultTitle: 'Your estimated range',
  resultRangeCaption: 'Based on your floor size, finish and surface condition.',
  resultDisclaimer:
    'An estimate, not a contract. Final pricing is confirmed after the installer sees the concrete.',

  leadFormTitle: 'Where should we send this?',
  leadFormBody: "We'll text the range and a few finish photos. No obligation.",
  leadSuccessTitle: "You're on the list",
  leadSuccessBody: 'Expect a text shortly with your range and next available install dates.',

  genericErrorTitle: 'Something went wrong on our end',
  genericErrorBody:
    'Tap the button again. If it keeps failing, leave your number below and we will price it by hand.',

  adminVerticalLabel: 'Concrete & Epoxy Coating',
  adminConfigHeading: 'Coating rates & floor prep',
  adminQuoteNoun: 'floor quote',
};

// ---------------------------------------------------------------------------
// catalogue
// ---------------------------------------------------------------------------

const surfaceTypes: SurfaceTypeOption[] = [
  {
    id: 'garage',
    label: 'Garage',
    helpText: 'Residential attached or detached garage bays.',
    presets: [
      { label: '1-car garage', value: 250 },
      { label: '2-car garage', value: 480 },
      { label: '3-car garage', value: 700 },
    ],
    typicalSqft: [
      { label: '1-car garage', sqft: 250 },
      { label: '2-car garage', sqft: 480 },
      { label: '3-car garage', sqft: 700 },
    ],
  },
  {
    id: 'patio',
    label: 'Patio',
    helpText: 'Covered or open concrete patio slabs.',
    presets: [
      { label: 'Small patio', value: 150 },
      { label: 'Standard patio', value: 300 },
      { label: 'Large patio', value: 500 },
    ],
    typicalSqft: [
      { label: 'Small patio', sqft: 150 },
      { label: 'Standard patio', sqft: 300 },
      { label: 'Large patio', sqft: 500 },
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial',
    helpText: 'Shops, warehouses and showroom floors.',
    presets: [
      { label: 'Small shop bay', value: 1000 },
      { label: 'Warehouse section', value: 2500 },
      { label: 'Full floor', value: 5000 },
    ],
    typicalSqft: [
      { label: 'Small shop bay', sqft: 1000 },
      { label: 'Warehouse section', sqft: 2500 },
      { label: 'Full floor', sqft: 5000 },
    ],
  },
];

/**
 * In epoxy, a finish system carries its own colours — flakes are not available
 * in metallic swirls. So each finish points at exactly one collection. That is
 * epoxy's fact about epoxy, not a shape the contract imposes.
 */
const colourCollections: ColourCollection[] = [
  {
    id: 'flake_blends',
    label: 'Flake Blends',
    colours: [
      { id: 'tuxedo', label: 'Tuxedo', hex: '#3B3B3F' },
      { id: 'gravel', label: 'Gravel', hex: '#8D8D86' },
      { id: 'saddle_tan', label: 'Saddle Tan', hex: '#A9825F' },
      { id: 'cabin_fever', label: 'Cabin Fever', hex: '#6E5B4A' },
      { id: 'nightfall', label: 'Nightfall', hex: '#2E3A4A' },
      { id: 'quicksilver', label: 'Quicksilver', hex: '#B9BDC1' },
    ],
  },
  {
    id: 'metallic_pours',
    label: 'Metallic Pours',
    colours: [
      { id: 'titanium', label: 'Titanium', hex: '#9BA1A6' },
      { id: 'copper_burl', label: 'Copper Burl', hex: '#9C5B33' },
      { id: 'midnight_pearl', label: 'Midnight Pearl', hex: '#1E2733' },
      { id: 'slate_storm', label: 'Slate Storm', hex: '#55606B' },
      { id: 'desert_bronze', label: 'Desert Bronze', hex: '#7D6242' },
    ],
  },
  {
    id: 'solid_colours',
    label: 'Solid Colours',
    colours: [
      { id: 'light_gray', label: 'Light Gray', hex: '#C6C9C7' },
      { id: 'dove', label: 'Dove', hex: '#AFAFA9' },
      { id: 'beige', label: 'Beige', hex: '#C9B99A' },
      { id: 'charcoal', label: 'Charcoal', hex: '#4A4D50' },
      { id: 'safety_red_zone', label: 'Safety Red Zone', hex: '#A33327' },
    ],
  },
];

const finishes: FinishOption[] = [
  {
    id: 'decorative_flakes',
    label: 'Decorative Flakes',
    description: 'Broadcast vinyl chip, the standard garage finish.',
    tierKey: 'flake',
    colourCollectionIds: ['flake_blends'],
  },
  {
    id: 'metallic_epoxy',
    label: 'Metallic Epoxy',
    description: 'Poured metallic pigment with depth and movement.',
    tierKey: 'metallic',
    colourCollectionIds: ['metallic_pours'],
  },
  {
    id: 'solid_polyaspartic',
    label: 'Solid Polyaspartic',
    description: 'Single solid colour, fastest return to service.',
    tierKey: 'solid_polyaspartic',
    colourCollectionIds: ['solid_colours'],
  },
];

// ---------------------------------------------------------------------------
// steps — epoxy's questions, declared not hard-coded
// ---------------------------------------------------------------------------

const steps: StepDescriptor[] = [
  {
    id: 'surface',
    question: copy.step1Question,
    writesTo: 'surfaceTypeId',
    control: { kind: 'surface_select' },
  },
  {
    id: 'size',
    question: 'How big is the floor?',
    help: "Not sure? Pick the closest typical size — you can nudge it after.",
    writesTo: 'sqft',
    control: {
      kind: 'quantity',
      unit: 'sqft',
      unitLabel: 'sq ft',
      configMinKey: 'sqft_min',
      configMaxKey: 'sqft_max',
      presetsFrom: 'surfaceType',
    },
  },
  {
    id: 'finish',
    question: 'Which finish do you want?',
    writesTo: 'finishId',
    control: { kind: 'finish_select' },
  },
  {
    id: 'colour',
    question: 'Pick a colour',
    writesTo: 'colourId',
    optional: true,
    control: { kind: 'colour_select' },
    showIf: (s) => typeof s.finishId === 'string' && s.finishId.length > 0,
  },
  {
    id: 'photo',
    question: copy.photoStepTitle,
    help: copy.photoStepHelp,
    writesTo: 'photoUrl',
    optional: true,
    control: { kind: 'photo' },
  },
  {
    id: 'condition',
    question: "Anything going on with the concrete?",
    help: 'Pick everything you can see. Leave it blank if the slab looks clean.',
    writesTo: 'conditionModifierIds',
    optional: true,
    control: { kind: 'multi_select', optionsFrom: 'conditionModifiers' },
  },
];

// ---------------------------------------------------------------------------
// vision
// ---------------------------------------------------------------------------

const BASE_PROMPT = `You are classifying a photo of a floor for a concrete coating estimate. Respond with ONLY a JSON object, no prose, matching exactly:
{
  "surface_type_guess": "garage" | "patio" | "commercial" | "unknown",
  "condition_grade": "good" | "fair" | "poor" | "unknown",
  "damage_flags": string[],            // from: "cracking","spalling","pitting","previous_coating","moisture_signs"
  "oil_staining": "none" | "light" | "heavy" | "unknown",
  "cracking_severity": "none" | "hairline" | "moderate" | "severe" | "unknown",
  "estimated_area_sqft": number | null, // ONLY if scale cues make it inferable; otherwise null
  "confidence": {                       // 0-1 per field
    "surface_type_guess": number,
    "condition_grade": number,
    "oil_staining": number,
    "cracking_severity": number,
    "estimated_area_sqft": number
  }
}
Rules: never invent an area without visible scale cues (vehicle, door, standard bay). If the image is not a floor, set every field to "unknown"/null with confidence 0. Uncertainty belongs in low confidence values, not in guesses.`;

const epoxyVisionResponseSchema = z.object({
  surface_type_guess: z.enum(['garage', 'patio', 'commercial', 'unknown']),
  condition_grade: z.enum(['good', 'fair', 'poor', 'unknown']),
  damage_flags: z.array(z.string()),
  oil_staining: z.enum(['none', 'light', 'heavy', 'unknown']),
  cracking_severity: z.enum(['none', 'hairline', 'moderate', 'severe', 'unknown']),
  estimated_area_sqft: z.number().positive().nullable(),
  confidence: z.object({
    surface_type_guess: z.number().min(0).max(1),
    condition_grade: z.number().min(0).max(1),
    oil_staining: z.number().min(0).max(1),
    cracking_severity: z.number().min(0).max(1),
    estimated_area_sqft: z.number().min(0).max(1),
  }),
});

type EpoxyVisionResult = z.infer<typeof epoxyVisionResponseSchema>;

/**
 * Canonical modifier ids this vertical knows how to infer. The contractor's
 * config decides which of them actually exist and what they cost; anything not
 * in that config is dropped before pricing sees it.
 */
const INFERRED_MODIFIERS = {
  lightOil: 'light_oil',
  heavyOil: 'heavy_oil',
  cracking: 'cracking',
  spalling: 'spalling',
  previousCoating: 'previous_coating',
  moisture: 'moisture',
} as const;

const vision: VisionModule<EpoxyInputs, EpoxyPricingRules> = {
  buildPrompt(ctx: VisionContext): string {
    const surface = surfaceTypes.find((s) => s.id === ctx.surfaceTypeId);
    if (!surface) return BASE_PROMPT;
    return (
      BASE_PROMPT +
      `\n\nContext: the homeowner has told us this is a ${surface.label.toLowerCase()} floor. Use that to interpret scale cues, but if the photo clearly shows something else, report what you see and lower your confidence.`
    );
  },

  responseSchema: epoxyVisionResponseSchema,

  minConfidence: 0.6,

  allowancesFromRules(rules: EpoxyPricingRules): VisionAllowances {
    return {
      modifierIds: rules.conditionModifiers.map((m) => m.id),
      tierKeys: Object.keys(rules.baseRateCentsPerSqft),
    };
  },

  mapToInputs(parsed, _ctx, allowed): Partial<EpoxyInputs> {
    const v = parsed as EpoxyVisionResult;
    const out: Partial<EpoxyInputs> = {};
    const min = vision.minConfidence;

    // Area is only ever a SUGGESTION — the homeowner's slider still governs,
    // and pricing re-clamps to the config bounds regardless.
    if (v.estimated_area_sqft !== null && v.confidence.estimated_area_sqft >= min) {
      out.sqft = Math.round(v.estimated_area_sqft);
    }

    const candidates: string[] = [];
    if (v.confidence.oil_staining >= min) {
      if (v.oil_staining === 'light') candidates.push(INFERRED_MODIFIERS.lightOil);
      if (v.oil_staining === 'heavy') candidates.push(INFERRED_MODIFIERS.heavyOil);
    }
    if (v.confidence.cracking_severity >= min) {
      if (v.cracking_severity === 'moderate' || v.cracking_severity === 'severe') {
        candidates.push(INFERRED_MODIFIERS.cracking);
      }
    }
    if (v.confidence.condition_grade >= min) {
      if (v.damage_flags.includes('spalling')) candidates.push(INFERRED_MODIFIERS.spalling);
      if (v.damage_flags.includes('previous_coating'))
        candidates.push(INFERRED_MODIFIERS.previousCoating);
      if (v.damage_flags.includes('moisture_signs'))
        candidates.push(INFERRED_MODIFIERS.moisture);
    }

    // Filter against what the contractor actually configured. An id this
    // config has never heard of gets dropped here, quietly, rather than
    // throwing unknown_modifier at a homeowner mid-quote.
    const kept = candidates.filter((id) => allowed.modifierIds.includes(id));
    if (kept.length > 0) out.conditionModifierIds = kept;

    return out;
  },

  fallbackInputs(): Partial<EpoxyInputs> {
    // Nothing. The homeowner's own answers price the job on their own; adding
    // a guessed modifier here would put a price adjustment in TypeScript.
    return {};
  },
};

// ---------------------------------------------------------------------------
// pricing — epoxy owns its formula
// ---------------------------------------------------------------------------

function priceEpoxy(
  inputs: EpoxyInputs,
  rules: EpoxyPricingRules
): QuoteComputationOf<EpoxyInputs> {
  const kernelInput: PricingInput = {
    sqft: inputs.sqft,
    surfaceTypeId: inputs.surfaceTypeId,
    finishTierKey: inputs.finishTierKey,
    conditionModifierIds: inputs.conditionModifierIds,
    sqftMin: inputs.sqftMin,
    sqftMax: inputs.sqftMax,
  };
  const computed = calculateQuote(kernelInput, rules);
  return {
    ...computed,
    // Echo the vertical's own inputs, not the kernel's narrowed view, so
    // quotes.inputs keeps the colour and photo the homeowner actually chose.
    inputs: { ...inputs, sqft: computed.inputs.sqft },
  };
}

// ---------------------------------------------------------------------------
// result renderer — Phase 1 placeholder discipline: name + props as JSON
// ---------------------------------------------------------------------------

function EpoxyResultRenderer(props: ResultRendererProps) {
  return (
    <div className="rounded-milled border bg-sheet p-4 font-data text-sm">
      <p className="text-rule">EpoxyResultRenderer</p>
      <pre className="overflow-x-auto">{JSON.stringify(props, null, 2)}</pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// the module
// ---------------------------------------------------------------------------

export const epoxyVertical: VerticalModule<EpoxyInputs, EpoxyPricingRules> = {
  id: 'epoxy',
  displayName: 'Concrete & Epoxy Floor Coating',
  copy,
  surfaceTypes,
  finishes,
  colourCollections,
  steps,
  inputSchema: epoxyInputSchema,
  pricingRuleSchema: epoxyPricingRuleSchema,
  price: priceEpoxy,
  vision,
  ResultRenderer: EpoxyResultRenderer,

  // v1 surface, generated not duplicated. Removed once the widget migrates.
  finishCatalogue: legacyFinishCatalogue(finishes, colourCollections),
  photoAnalysisPrompt: BASE_PROMPT,
};
