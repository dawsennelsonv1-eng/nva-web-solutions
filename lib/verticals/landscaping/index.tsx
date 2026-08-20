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
import {
  additiveModifierLines,
  assertWithinBounds,
  finaliseQuote,
  PricingError,
  type BreakdownLine,
  type QuoteComputationOf,
} from '@/lib/quote/kit';

/**
 * LANDSCAPING & HARDSCAPING — residential yard transformation. Dallas market.
 *
 * ============================================================================
 * WHY THIS IS THE THIRD VERTICAL AND WHAT IT BREAKS
 * ============================================================================
 *
 * Epoxy proved the pipeline. Painting proved the contract by breaking epoxy's
 * assumptions about units and prep. Landscaping breaks a different one, and it
 * is the one that decides whether the quote is worth anything:
 *
 *   WHAT IS ALREADY THERE COSTS AS MUCH AS WHAT GOES IN.
 *
 * A painter arrives at a wall. A landscaper arrives at a yard that already
 * contains something — sod, a cracked slab, gravel, a dead lawn — and removing
 * it is not a modifier on the job, it IS a substantial part of the job. Tearing
 * out and hauling a concrete patio runs to a meaningful fraction of what
 * replacing it costs. So `clearance` is a first-class line here, exactly as
 * prep is in painting, and for the same reason: a percentage cannot express the
 * difference between "mow it first" and "break up a slab and haul it away".
 *
 * THE SECOND DIFFERENCE IS THE SPREAD. Painting rates vary maybe threefold
 * across sheens. Landscaping styles vary more than sixfold: gravel with drought
 * planting against a raised deck with a pergola are not the same trade wearing
 * different colours. This is why STYLE is the finish dimension and why the
 * range band matters more here — an early estimate that pretends to be precise
 * across that spread is worse than one that admits its width.
 *
 * ============================================================================
 * THE SHAPE THIS TOOL FOLLOWS
 * ============================================================================
 *
 * See the tool shape recorded in lib/tools/ideas.ts. Four beats: a big picture
 * of the visitor's own yard, then the choices, then one gate, then the after —
 * larger than anything else on the page, with the price and the measured size
 * beneath it. This module supplies the CONTENT for that flow; the flow itself
 * is ToolCard's.
 *
 * One photograph is enough. Nothing in this module may require more.
 *
 * ============================================================================
 * THE BOUNDARY
 * ============================================================================
 *
 * Everything here is CONTENT, SCHEMA and FORMULA. Every rate lives in
 * quote_configs.rules and arrives via supabase/migrations/0025. A number in
 * this file that affects a price is a defect (R-113). The only literals in the
 * arithmetic are 0 and 1.
 */

// ---------------------------------------------------------------------------
// pricing rule schema
// ---------------------------------------------------------------------------

export const landscapingPricingRuleSchema = z
  .object({
    /**
     * $/sqft in cents, installed, per style tier. These are the rates that
     * carry the sixfold spread described above, which is why each is its own
     * key rather than a base rate with multipliers: a multiplier implies the
     * styles are variations of one job, and they are not.
     */
    styleRateCentsPerSqft: z.object({
      paver_patio: z.number().int().positive(),
      natural_stone: z.number().int().positive(),
      artificial_turf: z.number().int().positive(),
      gravel_xeriscape: z.number().int().positive(),
      soft_landscape: z.number().int().positive(),
      deck_pergola: z.number().int().positive(),
    }),
    /**
     * $/sqft in cents to clear what is already there, by level. NOT a
     * percentage of the install: breaking out a slab takes the same machine
     * hours and the same dump fees whether what replaces it is gravel or
     * flagstone, so clearance must not scale with style.
     *
     * `none` exists and is nonnegative rather than positive because bare
     * prepared dirt is a real starting condition on new construction, and
     * billing it anyway would be inventing work.
     */
    clearanceRateCentsPerSqft: z.object({
      none: z.number().int().nonnegative(),
      light: z.number().int().nonnegative(),
      standard: z.number().int().nonnegative(),
      heavy: z.number().int().nonnegative(),
    }),
    /**
     * $/sqft in cents for grading and drainage, applied only when the job
     * needs it. Its own line because it is invisible in the finished
     * photograph and is the single most common reason a cheap yard fails in
     * its second year — a homeowner reading the breakdown should see that he
     * is paying for it, or that he is not.
     */
    drainageRateCentsPerSqft: z.number().int().nonnegative(),
    /** Multiplicative condition modifiers, additive on the subtotal. */
    conditionModifiers: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        pctAdjust: z.number().min(-0.5).max(1),
      })
    ),
    minimumJobCents: z.number().int().nonnegative(),
    mobilizationFeeCents: z.number().int().nonnegative(),
    /**
     * Wider than painting's default in the migration, deliberately. See the
     * note on spread at the top of this file: a yard estimate from one
     * photograph genuinely is less certain than a wall, and a band that says so
     * is more honest than a point estimate that does not.
     */
    rangeSpreadPct: z.number().min(0.05).max(0.5),
  })
  .strict();

export type LandscapingPricingRules = z.infer<typeof landscapingPricingRuleSchema>;

export type StyleTier = keyof LandscapingPricingRules['styleRateCentsPerSqft'];
export type ClearanceLevel = keyof LandscapingPricingRules['clearanceRateCentsPerSqft'];

// ---------------------------------------------------------------------------
// inputs
// ---------------------------------------------------------------------------

export const landscapingInputSchema = z.object({
  surfaceTypeId: z.string().min(1),
  /** The area being transformed. Every landscaping surface is area-measured. */
  areaSqft: z.number().finite().optional(),

  finishId: z.string().min(1).optional(),
  finishTierKey: z.string().min(1),
  colourId: z.string().min(1).optional(),

  clearanceLevelId: z.enum(['none', 'light', 'standard', 'heavy']),
  drainageRequired: z.boolean().optional(),

  conditionModifierIds: z.array(z.string().min(1)).optional(),
  photoUrl: z.string().optional(),

  /** Bounds from quote_configs, carried so pricing enforces them itself. */
  sqftMin: z.number().finite(),
  sqftMax: z.number().finite(),
});

export type LandscapingInputs = z.infer<typeof landscapingInputSchema>;

// ---------------------------------------------------------------------------
// copy
// ---------------------------------------------------------------------------

const copy: VerticalCopy = {
  tradeNoun: 'landscaping',
  widgetTitle: 'See your yard finished, and what it costs',
  widgetSubtitle:
    'Send one photo. Pick a style. You will see it on your own yard with a price, in about a minute.',
  step1Question: 'Which part of the property are we transforming?',

  ctaStart: 'Start with a photo',
  ctaNext: 'Next',
  ctaBack: 'Back',
  ctaSeePrice: 'See my price',

  photoStepTitle: 'Send a photo of your yard',
  photoStepHelp:
    'One wide shot from a door or a corner is enough. Get a fence, a wall or the house in frame — that is what it measures against. You do not need to tidy up first.',
  photoSkipLabel: 'Or just enter the size yourself',
  analyzingLabel: 'Measuring your yard',

  analysisFailedTitle: 'I could not measure that one',
  analysisFailedBody:
    'The photo did not give me enough to go on. Enter the rough size yourself and the price still works — you can always send another photo after.',
  analysisUnsureBody:
    'I can see the yard but I am not confident about the size from this angle. Check the number below and change it if it looks wrong — you know the space better than a photograph does.',
  quotaReachedBody:
    'The photo measurement is unavailable right now. Enter the size yourself and everything else works exactly the same.',

  resultTitle: 'Your yard, finished',
  resultRangeCaption: 'Estimated range for this style, at this size',
  resultDisclaimer:
    'An estimate from one photograph, not a contract. Ground conditions, drainage and access are only fully known on site, and the final quote comes after a visit.',

  leadFormTitle: 'Where should the estimate go?',
  leadFormBody:
    'Your render and the full breakdown, sent over. No obligation and no site visit unless you ask for one.',
  leadSuccessTitle: 'On its way',
  leadSuccessBody:
    'Check your email for the render and the breakdown. Someone will follow up about a site visit when you are ready.',

  genericErrorTitle: 'Something went wrong',
  genericErrorBody:
    'That did not go through. Try again — if it keeps happening, enter the size yourself and the quote will still work.',

  adminVerticalLabel: 'Landscaping & hardscaping',
  adminConfigHeading: 'Landscaping pricing',
  adminQuoteNoun: 'yard estimate',
};

// ---------------------------------------------------------------------------
// surfaces
// ---------------------------------------------------------------------------

/**
 * PRESETS ARE THE "NOT SURE?" AFFORDANCE and they are the most-used control in
 * the whole flow, because almost nobody knows their yard's square footage.
 * These are areas a person can recognise from their own house rather than
 * measure, which is the only reason a preset is useful.
 */
const surfaceTypes: SurfaceTypeOption[] = [
  {
    id: 'back_yard',
    label: 'Back yard',
    helpText: 'The main space behind the house.',
    presets: [
      { label: 'Small — a patio and a strip of grass', value: 400 },
      { label: 'Average suburban back yard', value: 900 },
      { label: 'Large — room for a pool and a lawn', value: 1800 },
    ],
    typicalSqft: [
      { label: 'Small', sqft: 400 },
      { label: 'Average', sqft: 900 },
      { label: 'Large', sqft: 1800 },
    ],
  },
  {
    id: 'front_yard',
    label: 'Front yard',
    helpText: 'Kerb appeal — the part everyone sees.',
    presets: [
      { label: 'Small front — mostly driveway', value: 250 },
      { label: 'Average front yard', value: 600 },
      { label: 'Large corner lot', value: 1200 },
    ],
    typicalSqft: [
      { label: 'Small', sqft: 250 },
      { label: 'Average', sqft: 600 },
      { label: 'Large', sqft: 1200 },
    ],
  },
  {
    id: 'patio_area',
    label: 'Just the patio area',
    helpText: 'A defined seating or entertaining area, not the whole yard.',
    /* No `finishIds` restriction even though soft landscape on a patio footprint
       is unusual — a homeowner who wants a planted courtyard where his slab is
       now is describing a real job, and the module has no business refusing it. */
    presets: [
      { label: 'Small — a table and four chairs', value: 150 },
      { label: 'Average patio', value: 320 },
      { label: 'Large — dining and lounge zones', value: 600 },
    ],
    typicalSqft: [
      { label: 'Small', sqft: 150 },
      { label: 'Average', sqft: 320 },
      { label: 'Large', sqft: 600 },
    ],
  },
  {
    id: 'whole_property',
    label: 'The whole property',
    helpText: 'Front and back together.',
    presets: [
      { label: 'Small lot', value: 900 },
      { label: 'Average lot', value: 2000 },
      { label: 'Large lot', value: 4000 },
    ],
    typicalSqft: [
      { label: 'Small', sqft: 900 },
      { label: 'Average', sqft: 2000 },
      { label: 'Large', sqft: 4000 },
    ],
  },
];

// ---------------------------------------------------------------------------
// styles and materials
// ---------------------------------------------------------------------------

/**
 * STYLE IS THE FINISH DIMENSION. It decides the render, the rate and most of
 * what the yard will look like, which is the same role the coating system plays
 * in epoxy.
 *
 * SIX, AND NOT MORE. Every style has to be a genuinely different job with a
 * genuinely different rate, or it is a colour pretending to be a style. Six
 * covers the residential market; a seventh would be a variation of one of these
 * and would dilute the picker without changing a price.
 *
 * `renderHint` is not on this type — FinishOption has no such field — so the
 * words the image model needs live in `description`, which is also what the
 * homeowner reads. That constraint is a feature: a style whose description does
 * not describe what it looks like is a style nobody can picture either.
 */
const finishes: FinishOption[] = [
  {
    id: 'paver_patio',
    label: 'Paver patio',
    description:
      'Manufactured concrete pavers laid in a running or herringbone pattern, with a soldier-course border. Crisp, rectilinear, low maintenance.',
    tierKey: 'paver_patio',
    colourCollectionIds: ['paver_tones'],
  },
  {
    id: 'natural_stone',
    label: 'Natural flagstone',
    description:
      'Irregular natural stone with planted or gravel joints. Warmer and less uniform than pavers, and the premium option in most yards.',
    tierKey: 'natural_stone',
    colourCollectionIds: ['stone_tones'],
  },
  {
    id: 'artificial_turf',
    label: 'Artificial turf',
    description:
      'Synthetic grass over a compacted base, green year round with no mowing and almost no water. Reads as a perfect lawn.',
    tierKey: 'artificial_turf',
    colourCollectionIds: ['turf_tones'],
  },
  {
    id: 'gravel_xeriscape',
    label: 'Gravel and drought planting',
    description:
      'Decomposed granite or river rock with drought-tolerant planting and boulders. The lowest-water option and the cheapest way to transform a large area.',
    tierKey: 'gravel_xeriscape',
    colourCollectionIds: ['gravel_tones'],
  },
  {
    id: 'soft_landscape',
    label: 'Lawn and planting beds',
    description:
      'Fresh sod with defined, edged planting beds and mulch. The traditional finished yard.',
    tierKey: 'soft_landscape',
    colourCollectionIds: ['mulch_tones'],
  },
  {
    id: 'deck_pergola',
    label: 'Deck and pergola',
    description:
      'A raised timber or composite deck with a pergola over part of it. The most structural option, and the most expensive per square foot.',
    tierKey: 'deck_pergola',
    colourCollectionIds: ['timber_tones'],
  },
];

/**
 * Colour here means MATERIAL TONE, and it is orthogonal to style in exactly the
 * way sheen is orthogonal to colour in painting: every paver style can be had
 * in charcoal or in buff, and nesting the tones inside the styles would
 * duplicate the same six greys six times.
 *
 * Hexes are DATA, not theme tokens. They are the flat colour a picker paints
 * before a photograph loads, and they must be believable as that material in
 * ordinary daylight — a paver charcoal is not #000000.
 */
const colourCollections: ColourCollection[] = [
  {
    id: 'paver_tones',
    label: 'Paver colours',
    colours: [
      { id: 'charcoal', label: 'Charcoal', hex: '#4A4D52' },
      { id: 'slate_grey', label: 'Slate grey', hex: '#7C8085' },
      { id: 'sandstone', label: 'Sandstone', hex: '#C7B295' },
      { id: 'autumn_blend', label: 'Autumn blend', hex: '#A5714A' },
      { id: 'pewter', label: 'Pewter', hex: '#9A9B98' },
    ],
  },
  {
    id: 'stone_tones',
    label: 'Stone colours',
    colours: [
      { id: 'oklahoma_buff', label: 'Oklahoma buff', hex: '#C9A972' },
      { id: 'silvermist', label: 'Silvermist', hex: '#A8ADA6' },
      { id: 'chocolate', label: 'Chocolate', hex: '#6B4A32' },
      { id: 'rustic_gold', label: 'Rustic gold', hex: '#B08D45' },
    ],
  },
  {
    id: 'turf_tones',
    label: 'Turf styles',
    colours: [
      { id: 'fescue_green', label: 'Fescue green', hex: '#4F6B3A' },
      { id: 'bermuda_blend', label: 'Bermuda blend', hex: '#5E7A3E' },
      { id: 'olive_field', label: 'Olive field', hex: '#6B7A4A' },
    ],
  },
  {
    id: 'gravel_tones',
    label: 'Gravel colours',
    colours: [
      { id: 'decomposed_granite', label: 'Decomposed granite', hex: '#A88A63' },
      { id: 'river_rock', label: 'River rock', hex: '#8D8F8C' },
      { id: 'desert_gold', label: 'Desert gold', hex: '#BFA47F' },
      { id: 'black_basalt', label: 'Black basalt', hex: '#3C4045' },
    ],
  },
  {
    id: 'mulch_tones',
    label: 'Bed finishes',
    colours: [
      { id: 'hardwood_brown', label: 'Hardwood brown', hex: '#6B4A32' },
      { id: 'black_mulch', label: 'Black mulch', hex: '#33302C' },
      { id: 'cedar_red', label: 'Cedar red', hex: '#8E4F30' },
    ],
  },
  {
    id: 'timber_tones',
    label: 'Timber finishes',
    colours: [
      { id: 'natural_cedar', label: 'Natural cedar', hex: '#B07B4E' },
      { id: 'weathered_grey', label: 'Weathered grey', hex: '#8E8B84' },
      { id: 'walnut_stain', label: 'Walnut stain', hex: '#5C4030' },
      { id: 'composite_slate', label: 'Composite slate', hex: '#5A5C5E' },
    ],
  },
];

/**
 * CLEARANCE LEVELS. The labels describe what is on the ground now, not what the
 * crew will do about it, because the homeowner knows the first and is guessing
 * at the second.
 */
const CLEARANCE_LEVELS: { id: ClearanceLevel; label: string; helpText: string }[] = [
  {
    id: 'none',
    label: 'Bare dirt already',
    helpText: 'Nothing to remove. New build, or it was cleared previously.',
  },
  {
    id: 'light',
    label: 'Grass or weeds',
    helpText: 'A lawn, or an overgrown patch. Stripped and hauled away.',
  },
  {
    id: 'standard',
    label: 'Gravel, mulch or old beds',
    helpText: 'Loose material and planting to dig out and remove.',
  },
  {
    id: 'heavy',
    label: 'Concrete, pavers or a deck',
    helpText: 'Hard surface to break up, load out and dispose of. The big one.',
  },
];

// ---------------------------------------------------------------------------
// steps
// ---------------------------------------------------------------------------

const steps: StepDescriptor[] = [
  {
    id: 'surface',
    question: 'Which part of the property are we transforming?',
    writesTo: 'surfaceTypeId',
    control: { kind: 'surface_select' },
  },
  {
    id: 'photo',
    question: 'Send a photo of it',
    help: 'One wide shot is enough. A fence, a wall or the house in frame gives it something to measure against.',
    optional: true,
    writesTo: 'photoUrl',
    control: { kind: 'photo' },
  },
  {
    id: 'area',
    question: 'How big is the area?',
    help: 'Measured from your photo where possible. Change it if it looks wrong.',
    writesTo: 'areaSqft',
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
    id: 'style',
    question: 'What should it become?',
    help: 'This is the big one. It decides how the yard looks, how it wears, and most of what it costs.',
    writesTo: 'finishId',
    control: { kind: 'finish_select' },
  },
  {
    id: 'colour',
    question: 'Which material tone?',
    writesTo: 'colourId',
    control: { kind: 'colour_select' },
  },
  {
    id: 'clearance',
    question: 'What is on the ground right now?',
    help: 'Removing what is there is a real part of the job, so this moves the price more than people expect.',
    writesTo: 'clearanceLevelId',
    control: {
      kind: 'single_select',
      options: CLEARANCE_LEVELS.map((c) => ({
        id: c.id,
        label: c.label,
        helpText: c.helpText,
      })),
    },
  },
  {
    id: 'conditions',
    question: 'Anything else about the site?',
    help: 'Optional. These are the things that change how long a crew is on site.',
    optional: true,
    writesTo: 'conditionModifierIds',
    control: { kind: 'multi_select', optionsFrom: 'conditionModifiers' },
  },
];

// ---------------------------------------------------------------------------
// vision
// ---------------------------------------------------------------------------

const BASE_PROMPT = `You are estimating a residential outdoor area from a photograph, for a landscaping quote. Respond with ONLY a JSON object, no prose and no code fences, matching exactly:

{
  "estimated_area_sqft": number or null,
  "area_confidence": number between 0 and 1,
  "existing_surface": one of "bare_dirt" | "grass" | "gravel_or_mulch" | "hard_surface" | "mixed" | "unknown",
  "existing_surface_confidence": number between 0 and 1,
  "site_flags": array of any of "steep_slope" | "poor_access" | "standing_water" | "large_trees" | "retaining_needed",
  "site_confidence": number between 0 and 1
}

Measuring the area: use whatever gives you real scale — a fence panel is typically 6 to 8 feet wide, a standard door is about 3 feet, a paving slab 2 feet, a car about 15 feet long. Estimate only the ground area of the outdoor space in view. Do NOT include the house, the roof, the driveway or a neighbouring property. If the photograph does not show enough of the space to judge its extent, return null for the area and a low confidence rather than a guess.

Existing surface: report what is on the ground NOW, which decides how much has to be removed before anything is built. "hard_surface" means concrete, pavers, a slab or a deck. "mixed" means genuinely more than one across the area, not a lawn with a path through it.

Site flags: report only what is clearly visible. "steep_slope" means a fall a crew would have to terrace or retain, not a gentle grade. "poor_access" means no visible route wide enough for a machine — a narrow side gate, a fully enclosed courtyard. "standing_water" includes obvious pooling or a waterlogged patch. Do not infer these from the general look of the place.

Confidence: state what you actually know. A single photograph of a yard carries less scale information than a set, and an overconfident area becomes a quote a contractor cannot honour. Low confidence is a correct answer; a confident wrong number is not.`;

export const landscapingVisionResponseSchema = z.object({
  estimated_area_sqft: z.number().finite().nonnegative().nullable(),
  area_confidence: z.number().min(0).max(1),
  existing_surface: z.enum([
    'bare_dirt',
    'grass',
    'gravel_or_mulch',
    'hard_surface',
    'mixed',
    'unknown',
  ]),
  existing_surface_confidence: z.number().min(0).max(1),
  site_flags: z.array(
    z.enum([
      'steep_slope',
      'poor_access',
      'standing_water',
      'large_trees',
      'retaining_needed',
    ])
  ),
  site_confidence: z.number().min(0).max(1),
});

export type LandscapingVisionResult = z.infer<typeof landscapingVisionResponseSchema>;
export type LandscapingVisionField =
  | 'estimated_area_sqft'
  | 'existing_surface'
  | 'site_flags';

const CONFIDENCE_FLOOR = 0.6;
/**
 * AREA IS HELD HIGHER THAN EVERYTHING ELSE, at the same 0.8 painting uses and
 * for a stronger reason. Every line in this quote is area x rate, so an area
 * that is 40% wrong is a quote that is 40% wrong — while a misread site flag
 * moves the total by a few per cent. The asymmetry in the consequences is why
 * there are two floors rather than one.
 */
const AREA_CONFIDENCE_FLOOR = 0.8;

export function landscapingLowConfidenceFields(
  a: LandscapingVisionResult
): LandscapingVisionField[] {
  const out: LandscapingVisionField[] = [];
  if (a.estimated_area_sqft === null || a.area_confidence < AREA_CONFIDENCE_FLOOR) {
    out.push('estimated_area_sqft');
  }
  if (a.existing_surface === 'unknown' || a.existing_surface_confidence < CONFIDENCE_FLOOR) {
    out.push('existing_surface');
  }
  if (a.site_confidence < CONFIDENCE_FLOOR) out.push('site_flags');
  return out;
}

/**
 * What the model sees on the ground, mapped to what it costs to remove.
 *
 * 'mixed' RESOLVES TO 'standard' AND NOT TO 'heavy' on purpose. A mixed yard
 * usually means lawn plus a path, and pricing the whole area as slab demolition
 * would inflate the quote badly on the commonest real case. Under-reading here
 * is recoverable on a site visit; over-reading loses the lead before anyone
 * visits.
 */
const SURFACE_TO_CLEARANCE: Record<string, ClearanceLevel> = {
  bare_dirt: 'none',
  grass: 'light',
  gravel_or_mulch: 'standard',
  hard_surface: 'heavy',
  mixed: 'standard',
};

/** Ids the migration defines. Kept together so a rename is one edit. */
const INFERRED_MODIFIERS = {
  steepSlope: 'steep_slope',
  poorAccess: 'poor_access',
  drainage: 'drainage_issues',
  treeWork: 'tree_work',
  retaining: 'retaining_wall',
} as const;

const vision: VisionModule<LandscapingInputs, LandscapingPricingRules> = {
  buildPrompt(ctx: VisionContext): string {
    const surface = surfaceTypes.find((s) => s.id === ctx.surfaceTypeId);
    if (!surface) return BASE_PROMPT;
    return (
      BASE_PROMPT +
      `\n\nContext: the homeowner has told us this is the ${surface.label.toLowerCase()}. Use that to judge which part of the photograph to measure, but if the photo clearly shows something else, report what you see and lower your confidence.`
    );
  },

  responseSchema: landscapingVisionResponseSchema,

  minConfidence: CONFIDENCE_FLOOR,

  lowConfidenceFields: (parsed) =>
    landscapingLowConfidenceFields(parsed as LandscapingVisionResult),

  allowancesFromRules(rules: LandscapingPricingRules): VisionAllowances {
    return {
      modifierIds: rules.conditionModifiers.map((m) => m.id),
      tierKeys: Object.keys(rules.styleRateCentsPerSqft),
    };
  },

  mapToInputs(parsed, _ctx, allowed): Partial<LandscapingInputs> {
    const v = parsed as LandscapingVisionResult;
    const unsure = landscapingLowConfidenceFields(v);
    const out: Partial<LandscapingInputs> = {};

    if (!unsure.includes('estimated_area_sqft') && v.estimated_area_sqft !== null) {
      out.areaSqft = Math.round(v.estimated_area_sqft);
    }

    /* Clearance is a SUGGESTION that pre-selects the step, never a silent
       override. It is one of the largest lines in the quote, and a photograph
       taken from the one paved corner should not price the whole yard as
       demolition. The step still renders and the homeowner can move it. */
    if (!unsure.includes('existing_surface')) {
      const level = SURFACE_TO_CLEARANCE[v.existing_surface];
      if (level !== undefined) out.clearanceLevelId = level;
    }

    /* Drainage adds a real line, so it is gated on the site read being
       confident AND on the flag being explicit. Standing water in a photograph
       is unambiguous; inferring drainage from a green patch is not. */
    if (!unsure.includes('site_flags') && v.site_flags.includes('standing_water')) {
      out.drainageRequired = true;
    }

    const candidates: string[] = [];
    if (!unsure.includes('site_flags')) {
      if (v.site_flags.includes('steep_slope')) candidates.push(INFERRED_MODIFIERS.steepSlope);
      if (v.site_flags.includes('poor_access')) candidates.push(INFERRED_MODIFIERS.poorAccess);
      if (v.site_flags.includes('standing_water')) candidates.push(INFERRED_MODIFIERS.drainage);
      if (v.site_flags.includes('large_trees')) candidates.push(INFERRED_MODIFIERS.treeWork);
      if (v.site_flags.includes('retaining_needed')) candidates.push(INFERRED_MODIFIERS.retaining);
    }

    // Only ids this contractor's config actually defines survive.
    const kept = candidates.filter((id) => allowed.modifierIds.includes(id));
    if (kept.length > 0) out.conditionModifierIds = kept;

    return out;
  },

  fallbackInputs(): Partial<LandscapingInputs> {
    /* Nothing inferred. Guessing a clearance level here would put a price in
       TypeScript, and guessing 'light' on a yard that is currently a concrete
       slab would understate the job by thousands. */
    return {};
  },
};

// ---------------------------------------------------------------------------
// pricing — landscaping owns its formula
// ---------------------------------------------------------------------------

/**
 * ORDER OF OPERATIONS, and why:
 *
 *   1. install = area x styleRate. The style carries the whole spread; there
 *      is no base rate underneath it.
 *   2. clearance = area x clearanceRate[level]. A separate line, not a
 *      percentage, because demolition does not scale with what replaces it —
 *      breaking a slab costs the same whether gravel or flagstone follows.
 *   3. drainage = area x drainageRate, when required. Separate because it is
 *      invisible in the finished photograph and a homeowner should see whether
 *      he is paying for it.
 *   4. modifiers, additive on the subtotal (kit).
 *   5. + mobilisation, flat, after the percentages (kit ordering).
 *   6. minimum, then the band (kit).
 *
 * ALL THREE LINES ARE AREA x RATE, which is exactly why the area confidence
 * floor is set high. There is no part of this quote that survives a bad
 * measurement.
 */
function priceLandscaping(
  inputs: LandscapingInputs,
  rules: LandscapingPricingRules
): QuoteComputationOf<LandscapingInputs> {
  const styleRate = rules.styleRateCentsPerSqft[inputs.finishTierKey as StyleTier];
  if (styleRate === undefined) {
    throw new PricingError(
      'unknown_finish_tier',
      "style '" +
        inputs.finishTierKey +
        "' has no rate in this quote_config. Configured styles: " +
        Object.keys(rules.styleRateCentsPerSqft).join(', ')
    );
  }

  if (inputs.areaSqft === undefined) {
    throw new PricingError('invalid_inputs', 'areaSqft is required for a landscaping quote');
  }

  assertWithinBounds(inputs.areaSqft, inputs.sqftMin, inputs.sqftMax, 'sqft_out_of_bounds', 'sqft');

  const area = Math.round(inputs.areaSqft);
  const lines: BreakdownLine[] = [];
  const styleLabel = finishes.find((f) => f.tierKey === inputs.finishTierKey)?.label ?? 'Installation';

  lines.push({
    id: 'coating',
    label: styleLabel + ' — supplied and installed',
    kind: 'coating',
    cents: Math.round(area * styleRate),
    detail: { quantity: area, unitLabel: 'sq ft', rateCents: styleRate },
  });

  const clearanceRate = rules.clearanceRateCentsPerSqft[inputs.clearanceLevelId];
  const clearanceCents = Math.round(area * clearanceRate);
  if (clearanceCents > 0) {
    const clearanceLabel =
      CLEARANCE_LEVELS.find((c) => c.id === inputs.clearanceLevelId)?.label ??
      inputs.clearanceLevelId;
    lines.push({
      id: 'prep',
      label: 'Clearing and disposal — ' + clearanceLabel.toLowerCase(),
      kind: 'prep',
      cents: clearanceCents,
      detail: { sqft: area, rateCentsPerSqft: clearanceRate },
    });
  }

  if (inputs.drainageRequired && rules.drainageRateCentsPerSqft > 0) {
    lines.push({
      id: 'drainage',
      label: 'Grading and drainage',
      kind: 'prep',
      cents: Math.round(area * rules.drainageRateCentsPerSqft),
      detail: { sqft: area, rateCentsPerSqft: rules.drainageRateCentsPerSqft },
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.cents, 0);

  const mods = additiveModifierLines(
    subtotalCents,
    inputs.conditionModifierIds,
    rules.conditionModifiers
  );
  lines.push(...mods.lines);

  if (rules.mobilizationFeeCents > 0) {
    lines.push({
      id: 'mobilization',
      label: 'Mobilisation',
      kind: 'mobilization',
      cents: rules.mobilizationFeeCents,
    });
  }

  return finaliseQuote<LandscapingInputs>({
    lines,
    minimumJobCents: rules.minimumJobCents,
    rangeSpreadPct: rules.rangeSpreadPct,
    modifiersApplied: mods.applied,
    inputs: { ...inputs, areaSqft: area },
  });
}

// ---------------------------------------------------------------------------
// result renderer
// ---------------------------------------------------------------------------

/**
 * Placeholder, deliberately matching painting's and epoxy's. The real renderer
 * is written in the turn that mounts it — a bespoke one built now would be a
 * component nothing renders, against a breakdown shape nothing has read yet.
 */
function LandscapingResultRenderer(props: ResultRendererProps) {
  return (
    <div className="rounded-milled border bg-sheet p-4 font-data text-sm">
      <p className="text-rule">LandscapingResultRenderer</p>
      <pre className="overflow-x-auto">{JSON.stringify(props, null, 2)}</pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// the module
// ---------------------------------------------------------------------------

export const landscapingVertical: VerticalModule<
  LandscapingInputs,
  LandscapingPricingRules
> = {
  id: 'landscaping',
  displayName: 'Landscaping & Hardscaping',
  copy,
  surfaceTypes,
  finishes,
  colourCollections,
  steps,
  inputSchema: landscapingInputSchema,
  pricingRuleSchema: landscapingPricingRuleSchema,
  price: priceLandscaping,
  vision,
  ResultRenderer: LandscapingResultRenderer,

  finishCatalogue: legacyFinishCatalogue(finishes, colourCollections),
  photoAnalysisPrompt: BASE_PROMPT,
};
