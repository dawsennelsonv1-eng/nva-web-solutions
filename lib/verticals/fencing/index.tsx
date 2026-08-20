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
 * FENCING — residential. Dallas market.
 *
 * ============================================================================
 * THE FIRST VERTICAL MEASURED IN LINEAR FEET
 * ============================================================================
 *
 * Epoxy and landscaping price area. Cabinets price pieces. A fence prices a
 * LINE — cost tracks the run, and height is a multiplier on it rather than a
 * second dimension. That is why `linearFt` is the measured quantity here and
 * why height is a modifier: an 8ft fence is not 33% more fence than a 6ft one,
 * it is taller posts, deeper holes, more concrete and an extra rail, which is
 * roughly a quarter more money.
 *
 * GATES ARE PIECES, NOT FEET. A walk gate is a fabricated item with hardware
 * and a post either side; a drive gate is that again with a frame that has to
 * not sag over twelve feet. Charging them by the foot would price the most
 * expensive parts of the job as though they were the cheapest.
 *
 * ============================================================================
 * WHY THIS IS A VISUAL TOOL AND NOT A CALCULATOR
 * ============================================================================
 *
 * lib/tools/ideas.ts originally ranked fencing as a satellite quoter — tap your
 * property corners, get a number — and ruled it out of the viral shortlist for a
 * good reason: nobody shares a number.
 *
 * That verdict was about the OUTPUT, not the trade. A photograph of a
 * homeowner's own house with the fence they picked standing in it IS shareable,
 * and it is the same before-and-after that makes the epoxy tool work. So this
 * module is built on the photo-and-render path like every other vertical here,
 * and the satellite perimeter becomes an accuracy upgrade to the MEASUREMENT
 * later rather than a prerequisite for the tool.
 *
 * That ordering is deliberate and worth keeping: the render needs nothing that
 * does not already exist, while satellite measurement needs a billing account,
 * a live key and an integration nobody can test from a sandbox. Blocking the
 * viral half on the untestable half would have shipped neither.
 *
 * WHEN SATELLITE ARRIVES it writes to `linearFt` and nothing else in this file
 * changes. See UNBUILT_CAPABILITIES in lib/tools/ideas.ts.
 *
 * Rates live in quote_configs.rules via supabase/migrations/0027 (R-113).
 */

// ---------------------------------------------------------------------------
// pricing rule schema
// ---------------------------------------------------------------------------

export const fencingPricingRuleSchema = z
  .object({
    /** Cents per linear foot, installed, by style. */
    styleRateCentsPerLinearFt: z.object({
      chain_link: z.number().int().positive(),
      wood_privacy: z.number().int().positive(),
      wood_premium: z.number().int().positive(),
      horizontal_modern: z.number().int().positive(),
      vinyl: z.number().int().positive(),
      ornamental_metal: z.number().int().positive(),
      masonry_column: z.number().int().positive(),
    }),
    /**
     * Gates, per unit. Flat rather than proportional to the style rate: a walk
     * gate in cedar and a walk gate in vinyl cost far more similar amounts than
     * their per-foot rates suggest, because most of it is hardware, hinges and
     * two properly set posts.
     */
    walkGateCents: z.number().int().nonnegative(),
    driveGateCents: z.number().int().nonnegative(),
    /** Cents per linear foot to take the existing fence out and haul it. */
    removalRateCentsPerLinearFt: z.number().int().nonnegative(),
    conditionModifiers: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        pctAdjust: z.number().min(-0.5).max(1),
      })
    ),
    minimumJobCents: z.number().int().nonnegative(),
    mobilizationFeeCents: z.number().int().nonnegative(),
    rangeSpreadPct: z.number().min(0.05).max(0.5),
  })
  .strict();

export type FencingPricingRules = z.infer<typeof fencingPricingRuleSchema>;
export type FenceTier = keyof FencingPricingRules['styleRateCentsPerLinearFt'];

// ---------------------------------------------------------------------------
// inputs
// ---------------------------------------------------------------------------

export const fencingInputSchema = z.object({
  surfaceTypeId: z.string().min(1),
  /** The run, as estimated from a photo or typed in by hand. */
  linearFt: z.number().finite().optional(),
  /**
   * The run as MEASURED by tapping the boundary on a satellite view. PHASE 85.
   *
   * ITS OWN KEY, NOT A SECOND WRITER OF `linearFt`. The registry rejects two
   * steps writing one input, and that rule is correct: two controls quietly
   * overwriting each other is exactly the bug it exists to prevent. Phase 82
   * broke it by pointing both the map and the length step at `linearFt`.
   *
   * Keeping them separate is also more honest about what they are. `linearFt`
   * is an ESTIMATE — from a photograph, or from somebody's memory of their own
   * garden. This is a MEASUREMENT, computed from coordinates. Collapsing the
   * two into one field would throw away the distinction that decides which one
   * pricing should believe.
   */
  mapLinearFt: z.number().finite().nonnegative().optional(),

  finishId: z.string().min(1).optional(),
  finishTierKey: z.string().min(1),
  colourId: z.string().min(1).optional(),

  walkGates: z.number().int().nonnegative().optional(),
  driveGates: z.number().int().nonnegative().optional(),
  removeExisting: z.boolean().optional(),

  conditionModifierIds: z.array(z.string().min(1)).optional(),
  photoUrl: z.string().optional(),

  /* Reused as the bounds on the RUN. The widget supplies these from
     quote_configs under the sqft keys, and renaming that plumbing for one
     vertical would be a core change for a cosmetic gain. The unit is linear
     feet everywhere it is shown to a person. */
  sqftMin: z.number().finite(),
  sqftMax: z.number().finite(),
});

export type FencingInputs = z.infer<typeof fencingInputSchema>;

const MAX_GATES = 8;

// ---------------------------------------------------------------------------
// copy
// ---------------------------------------------------------------------------

const copy: VerticalCopy = {
  tradeNoun: 'fencing',
  widgetTitle: 'See the fence on your own house, and what it costs',
  widgetSubtitle:
    'Send one photo. Pick a style. You will see it standing on your property with a price, in about a minute.',
  step1Question: 'What are we fencing?',

  ctaStart: 'Start with a photo',
  ctaNext: 'Next',
  ctaBack: 'Back',
  ctaSeePrice: 'See my price',

  photoStepTitle: 'Send a photo of where the fence goes',
  photoStepHelp:
    'One shot down the line it will run — a side boundary, the back of the yard, or the front of the house. Getting the house or a car in frame helps it judge the distance.',
  photoSkipLabel: 'Or just enter the length yourself',
  analyzingLabel: 'Measuring the run',

  analysisFailedTitle: 'I could not measure that one',
  analysisFailedBody:
    'The photo did not give me enough to judge the distance. Enter the rough length yourself — most suburban back yards run 120 to 200 feet.',
  analysisUnsureBody:
    'I can see the line but I am not confident about the length from this angle. Check the number below and change it if it looks wrong.',
  quotaReachedBody:
    'The photo measurement is unavailable right now. Enter the length yourself and everything else works exactly the same.',

  resultTitle: 'Your fence',
  resultRangeCaption: 'Estimated range for this style, at this length',
  resultDisclaimer:
    'An estimate from one photograph, not a contract. Ground conditions, property lines and any permit or HOA requirements are confirmed on site, and the final quote follows a visit.',

  leadFormTitle: 'Where should the estimate go?',
  leadFormBody:
    'Your render and the full breakdown, sent over. No obligation and no site visit unless you ask for one.',
  leadSuccessTitle: 'On its way',
  leadSuccessBody:
    'Check your email for the render and the breakdown. Someone will follow up when you are ready.',

  genericErrorTitle: 'Something went wrong',
  genericErrorBody:
    'That did not go through. Try again — if it keeps happening, enter the length yourself and the quote will still work.',

  adminVerticalLabel: 'Fencing',
  adminConfigHeading: 'Fencing pricing',
  adminQuoteNoun: 'fence estimate',
};

// ---------------------------------------------------------------------------
// surfaces
// ---------------------------------------------------------------------------

/**
 * Presets are runs a person can recognise rather than measure. Nobody knows
 * their perimeter; everybody knows whether their lot is a normal suburban one.
 */
const surfaceTypes: SurfaceTypeOption[] = [
  {
    id: 'back_yard',
    label: 'Back yard',
    helpText: 'The usual job — three sides behind the house.',
    presets: [
      { label: 'Small lot', value: 110 },
      { label: 'Average suburban back yard', value: 160 },
      { label: 'Large lot', value: 260 },
    ],
    typicalSqft: [],
  },
  {
    id: 'full_perimeter',
    label: 'The whole property',
    helpText: 'All the way around, front included.',
    presets: [
      { label: 'Small lot', value: 200 },
      { label: 'Average lot', value: 320 },
      { label: 'Large or corner lot', value: 500 },
    ],
    typicalSqft: [],
  },
  {
    id: 'one_side',
    label: 'One side only',
    helpText: 'A single boundary — often the one a neighbour is replacing too.',
    presets: [
      { label: 'Short run', value: 40 },
      { label: 'Average side', value: 70 },
      { label: 'Long side', value: 120 },
    ],
    typicalSqft: [],
  },
  {
    id: 'front_yard',
    label: 'Front yard',
    helpText: 'Kerb appeal, and usually the one with HOA rules attached.',
    presets: [
      { label: 'Short frontage', value: 50 },
      { label: 'Average frontage', value: 85 },
      { label: 'Wide or corner frontage', value: 150 },
    ],
    typicalSqft: [],
  },
];

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------

/**
 * SEVEN STYLES, SPANNING TENFOLD. Chain link to masonry columns is the widest
 * spread of any vertical here, which makes the picker genuinely consequential —
 * and makes the range band matter, because a homeowner who has not yet chosen
 * is looking at a very wide field.
 */
const finishes: FinishOption[] = [
  {
    id: 'chain_link',
    label: 'Chain link',
    description:
      'Galvanised mesh on steel posts. The cheapest way to enclose a yard, and the one people choose for dogs and for large runs.',
    tierKey: 'chain_link',
    colourCollectionIds: ['metal_tones'],
  },
  {
    id: 'wood_privacy',
    label: 'Wood privacy',
    description:
      'Cedar pickets, six feet, side by side on a rail frame. The standard Texas back yard fence.',
    tierKey: 'wood_privacy',
    colourCollectionIds: ['wood_tones'],
  },
  {
    id: 'wood_premium',
    label: 'Board on board, steel posts',
    description:
      'Overlapping cedar pickets on galvanised steel posts with a cap and trim. No gaps as the timber dries, and posts that do not rot at the ground line. The upgrade most people regret not buying.',
    tierKey: 'wood_premium',
    colourCollectionIds: ['wood_tones'],
  },
  {
    id: 'horizontal_modern',
    label: 'Horizontal slat',
    description:
      'Wide cedar boards run horizontally with an even reveal. The modern look, and the one that photographs best.',
    tierKey: 'horizontal_modern',
    colourCollectionIds: ['wood_tones'],
  },
  {
    id: 'vinyl',
    label: 'Vinyl',
    description:
      'Moulded PVC panels between posts. Never needs staining and never goes grey; a flatter, more uniform look than timber.',
    tierKey: 'vinyl',
    colourCollectionIds: ['vinyl_tones'],
  },
  {
    id: 'ornamental_metal',
    label: 'Ornamental iron or aluminium',
    description:
      'Powder-coated pickets with a flat or spear top. Sees through rather than screens, which is what makes it the pool and front-yard choice.',
    tierKey: 'ornamental_metal',
    colourCollectionIds: ['metal_tones'],
  },
  {
    id: 'masonry_column',
    label: 'Stone or brick columns with panels',
    description:
      'Masonry piers at intervals with timber or iron panels between them. The most expensive per foot by a distance, and the one that reads as permanent.',
    tierKey: 'masonry_column',
    colourCollectionIds: ['masonry_tones'],
  },
];

const colourCollections: ColourCollection[] = [
  {
    id: 'wood_tones',
    label: 'Timber Finishes',
    colours: [
      { id: 'fence_natural_cedar', label: 'Natural cedar', hex: '#B07B4E' },
      { id: 'fence_weathered_grey', label: 'Left to weather grey', hex: '#8E8B84' },
      { id: 'fence_honey_stain', label: 'Honey stain', hex: '#B08A4E' },
      { id: 'fence_walnut_stain', label: 'Walnut stain', hex: '#5C4030' },
      { id: 'fence_black_stain', label: 'Black stain', hex: '#33302C' },
    ],
  },
  {
    id: 'metal_tones',
    label: 'Metal Finishes',
    colours: [
      { id: 'fence_matte_black', label: 'Matte black', hex: '#2B2B2B' },
      { id: 'fence_bronze', label: 'Bronze', hex: '#5A4632' },
      { id: 'fence_galvanised', label: 'Galvanised silver', hex: '#A9ADB0' },
      { id: 'fence_forest_green', label: 'Forest green', hex: '#33463A' },
    ],
  },
  {
    id: 'vinyl_tones',
    label: 'Vinyl Colours',
    colours: [
      { id: 'fence_white_vinyl', label: 'White', hex: '#F2F1ED' },
      { id: 'fence_almond', label: 'Almond', hex: '#E0D6C0' },
      { id: 'fence_clay_vinyl', label: 'Clay', hex: '#B9A88F' },
      { id: 'fence_grey_vinyl', label: 'Grey', hex: '#9A9B98' },
    ],
  },
  {
    id: 'masonry_tones',
    label: 'Masonry Finishes',
    colours: [
      { id: 'fence_austin_stone', label: 'Austin stone', hex: '#C9BCA1' },
      { id: 'fence_red_brick', label: 'Red brick', hex: '#8A4B3C' },
      { id: 'fence_limestone', label: 'Limestone', hex: '#D4CCB8' },
      { id: 'fence_charcoal_brick', label: 'Charcoal brick', hex: '#4C4A47' },
    ],
  },
];

// ---------------------------------------------------------------------------
// steps
// ---------------------------------------------------------------------------

const steps: StepDescriptor[] = [
  {
    id: 'surface',
    question: 'What are we fencing?',
    writesTo: 'surfaceTypeId',
    control: { kind: 'surface_select' },
  },
  {
    id: 'photo',
    question: 'Send a photo of where it goes',
    help: 'One shot down the line. The house or a car in frame helps it judge distance.',
    optional: true,
    writesTo: 'photoUrl',
    control: { kind: 'photo' },
  },
  {
    id: 'length',
    question: 'How long is the run?',
    help: 'Measured from your photo where possible. Change it if it looks wrong.',
    writesTo: 'linearFt',
    control: {
      kind: 'quantity',
      unit: 'linear_ft',
      unitLabel: 'linear ft',
      configMinKey: 'sqft_min',
      configMaxKey: 'sqft_max',
      presetsFrom: 'surfaceType',
    },
  },
  /**
   * THE MAP COMES AFTER THE LENGTH STEP. PHASE 85 corrected phase 82, which put
   * it before and had both steps write `linearFt` — which the registry rejects,
   * rightly.
   *
   * The order that survived is also the better one. The visitor has just been
   * shown an estimate, so this reads as an offer to improve it rather than a
   * chore before anything has happened: here is roughly your run, now make it
   * exact if you like. Asking somebody to find their house on a map before they
   * have seen a single number is work with no visible payoff.
   *
   * OPTIONAL, AND INVISIBLE WITHOUT A MAPS KEY. Skipping it leaves the estimate
   * standing and everything downstream still works.
   *
   * `closed: false` because the usual job is three sides of a back yard with
   * the house closing the fourth. Closing the loop would add a leg across the
   * building and quote fence nobody is buying.
   */
  {
    id: 'map',
    question: 'Want the exact length?',
    help: 'Find your property and tap each corner your fence runs to. This measures the line properly, so the quote is not working from an estimate.',
    optional: true,
    writesTo: 'mapLinearFt',
    control: { kind: 'property_map', closed: false },
  },
  {
    id: 'style',
    question: 'Which fence?',
    help: 'This is the big one. It decides how it looks, how long it lasts, and most of what it costs.',
    writesTo: 'finishId',
    control: { kind: 'finish_select' },
  },
  {
    id: 'colour',
    question: 'Which finish?',
    writesTo: 'colourId',
    control: { kind: 'colour_select' },
  },
  {
    id: 'walk_gates',
    question: 'How many walk gates?',
    help: 'The normal person-sized gate.',
    writesTo: 'walkGates',
    control: { kind: 'stepper', min: 0, max: MAX_GATES, unitLabel: 'gates' },
  },
  {
    id: 'drive_gates',
    question: 'Any drive gates?',
    help: 'Wide enough for a vehicle or a trailer.',
    optional: true,
    writesTo: 'driveGates',
    control: { kind: 'stepper', min: 0, max: MAX_GATES, unitLabel: 'gates' },
  },
  {
    id: 'conditions',
    question: 'Anything else about the site?',
    optional: true,
    writesTo: 'conditionModifierIds',
    control: { kind: 'multi_select', optionsFrom: 'conditionModifiers' },
  },
];

// ---------------------------------------------------------------------------
// vision
// ---------------------------------------------------------------------------

const BASE_PROMPT = `You are estimating a fence run from a photograph, for a fencing quote. Respond with ONLY a JSON object, no prose and no code fences, matching exactly:

{
  "estimated_linear_ft": number or null,
  "length_confidence": number between 0 and 1,
  "existing_fence": one of "none" | "wood" | "chain_link" | "metal" | "vinyl" | "unknown",
  "existing_fence_confidence": number between 0 and 1,
  "site_flags": array of any of "sloped_ground" | "rocky_ground" | "trees_on_line" | "restricted_access" | "existing_fence_poor",
  "site_confidence": number between 0 and 1
}

Measuring the run: estimate the length of the boundary line visible in the photograph, in feet, along the ground. Use whatever gives you real scale — a standard fence panel is 8 feet between posts, a car is about 15 feet long, a single garage door is 8 to 9 feet wide, a standard exterior door 3 feet. A photograph taken down a line foreshortens it badly, so be careful not to underestimate a run that recedes from the camera. If you cannot see enough of the boundary to judge it, return null and a low confidence rather than a guess.

Existing fence: report what is standing on that line NOW, because taking it out and hauling it away is a separate cost. "none" means an open boundary.

Site flags, and report only what is clearly visible. "sloped_ground" means a fall the fence has to step down or rake to follow, not a slight grade. "rocky_ground" means visible rock or caliche where posts have to be set — common in this market and expensive. "trees_on_line" means trunks or large roots directly on the boundary. "restricted_access" means no visible route for a machine or a materials drop. "existing_fence_poor" means the current fence is leaning, rotten or falling down.

Confidence: state what you actually know. One photograph down a boundary carries limited depth information, and an overconfident length becomes a quote a contractor cannot honour.`;

export const fencingVisionResponseSchema = z.object({
  estimated_linear_ft: z.number().finite().nonnegative().nullable(),
  length_confidence: z.number().min(0).max(1),
  existing_fence: z.enum(['none', 'wood', 'chain_link', 'metal', 'vinyl', 'unknown']),
  existing_fence_confidence: z.number().min(0).max(1),
  site_flags: z.array(
    z.enum([
      'sloped_ground',
      'rocky_ground',
      'trees_on_line',
      'restricted_access',
      'existing_fence_poor',
    ])
  ),
  site_confidence: z.number().min(0).max(1),
});

export type FencingVisionResult = z.infer<typeof fencingVisionResponseSchema>;
export type FencingVisionField = 'estimated_linear_ft' | 'existing_fence' | 'site_flags';

const CONFIDENCE_FLOOR = 0.6;
/**
 * Held at 0.8, the same as landscaping's area and for the same reason: the run
 * multiplies almost every line in the quote. It is arguably harder still —
 * judging a distance that recedes from the camera is a depth problem, and a
 * foreshortened boundary is the classic way to underestimate a fence.
 */
const LENGTH_CONFIDENCE_FLOOR = 0.8;

export function fencingLowConfidenceFields(a: FencingVisionResult): FencingVisionField[] {
  const out: FencingVisionField[] = [];
  if (a.estimated_linear_ft === null || a.length_confidence < LENGTH_CONFIDENCE_FLOOR) {
    out.push('estimated_linear_ft');
  }
  if (a.existing_fence === 'unknown' || a.existing_fence_confidence < CONFIDENCE_FLOOR) {
    out.push('existing_fence');
  }
  if (a.site_confidence < CONFIDENCE_FLOOR) out.push('site_flags');
  return out;
}

const INFERRED_MODIFIERS = {
  slope: 'sloped_ground',
  rock: 'rocky_ground',
  trees: 'trees_on_line',
  access: 'restricted_access',
} as const;

const vision: VisionModule<FencingInputs, FencingPricingRules> = {
  buildPrompt(ctx: VisionContext): string {
    const surface = surfaceTypes.find((s) => s.id === ctx.surfaceTypeId);
    if (!surface) return BASE_PROMPT;
    return (
      BASE_PROMPT +
      `\n\nContext: the homeowner says this is the ${surface.label.toLowerCase()}. If the photograph shows only part of that run, estimate what is VISIBLE and lower your confidence rather than extrapolating to a whole perimeter you cannot see.`
    );
  },

  responseSchema: fencingVisionResponseSchema,
  minConfidence: CONFIDENCE_FLOOR,
  lowConfidenceFields: (parsed) => fencingLowConfidenceFields(parsed as FencingVisionResult),

  allowancesFromRules(rules: FencingPricingRules): VisionAllowances {
    return {
      modifierIds: rules.conditionModifiers.map((m) => m.id),
      tierKeys: Object.keys(rules.styleRateCentsPerLinearFt),
    };
  },

  mapToInputs(parsed, _ctx, allowed): Partial<FencingInputs> {
    const v = parsed as FencingVisionResult;
    const unsure = fencingLowConfidenceFields(v);
    const out: Partial<FencingInputs> = {};

    if (!unsure.includes('estimated_linear_ft') && v.estimated_linear_ft !== null) {
      out.linearFt = Math.round(v.estimated_linear_ft);
    }

    /* Removal is suggested only when a fence is genuinely there. It adds a real
       line, and 'unknown' must not become a charge. */
    if (!unsure.includes('existing_fence') && v.existing_fence !== 'none') {
      out.removeExisting = true;
    }

    const candidates: string[] = [];
    if (!unsure.includes('site_flags')) {
      if (v.site_flags.includes('sloped_ground')) candidates.push(INFERRED_MODIFIERS.slope);
      if (v.site_flags.includes('rocky_ground')) candidates.push(INFERRED_MODIFIERS.rock);
      if (v.site_flags.includes('trees_on_line')) candidates.push(INFERRED_MODIFIERS.trees);
      if (v.site_flags.includes('restricted_access')) candidates.push(INFERRED_MODIFIERS.access);
    }

    const kept = candidates.filter((id) => allowed.modifierIds.includes(id));
    if (kept.length > 0) out.conditionModifierIds = kept;

    return out;
  },

  fallbackInputs(): Partial<FencingInputs> {
    /* Nothing. A default gate count would put a fabricated several hundred
       dollars into a quote nobody asked for. */
    return {};
  },
};

// ---------------------------------------------------------------------------
// pricing
// ---------------------------------------------------------------------------

function priceFencing(
  inputs: FencingInputs,
  rules: FencingPricingRules
): QuoteComputationOf<FencingInputs> {
  const rate = rules.styleRateCentsPerLinearFt[inputs.finishTierKey as FenceTier];
  if (rate === undefined) {
    throw new PricingError(
      'unknown_finish_tier',
      "fence style '" +
        inputs.finishTierKey +
        "' has no rate in this quote_config. Configured styles: " +
        Object.keys(rules.styleRateCentsPerLinearFt).join(', ')
    );
  }

  /**
   * A TAPPED MEASUREMENT WINS OUTRIGHT. It is not averaged with the estimate and
   * it is not treated as another opinion.
   *
   * `linearFt` comes from a photograph or from memory. A boundary receding from
   * the camera is foreshortened, which is the classic way to underestimate a
   * fence, and a homeowner's guess at their own garden is a guess.
   * `mapLinearFt` is computed from coordinates the person pointed at on an
   * image of their own property. Those are not two measurements of equal
   * standing, and blending them would make the better one worse.
   *
   * Zero is treated as absent: the map emits nothing until at least two corners
   * exist, and a cleared map must not price a fence of no length.
   */
  const measured =
    inputs.mapLinearFt !== undefined && inputs.mapLinearFt > 0 ? inputs.mapLinearFt : null;
  const chosenRun = measured ?? inputs.linearFt;

  if (chosenRun === undefined) {
    throw new PricingError('invalid_inputs', 'linearFt is required for a fencing quote');
  }

  assertWithinBounds(
    chosenRun,
    inputs.sqftMin,
    inputs.sqftMax,
    'sqft_out_of_bounds',
    'linear ft'
  );

  const run = Math.round(chosenRun);
  const walk = Math.min(Math.max(Math.round(inputs.walkGates ?? 0), 0), MAX_GATES);
  const drive = Math.min(Math.max(Math.round(inputs.driveGates ?? 0), 0), MAX_GATES);

  const lines: BreakdownLine[] = [];
  const styleLabel =
    finishes.find((f) => f.tierKey === inputs.finishTierKey)?.label ?? 'Fence';

  lines.push({
    id: 'coating',
    label: styleLabel + ' — supplied and installed',
    kind: 'coating',
    cents: run * rate,
    detail: { quantity: run, unitLabel: 'linear ft', rateCents: rate },
  });

  if (inputs.removeExisting && rules.removalRateCentsPerLinearFt > 0) {
    lines.push({
      id: 'prep',
      label: 'Removing and hauling the existing fence',
      kind: 'prep',
      cents: run * rules.removalRateCentsPerLinearFt,
      detail: {
        quantity: run,
        unitLabel: 'linear ft',
        rateCents: rules.removalRateCentsPerLinearFt,
      },
    });
  }

  if (walk > 0 && rules.walkGateCents > 0) {
    lines.push({
      id: 'walk_gates',
      label: walk === 1 ? 'Walk gate' : 'Walk gates',
      kind: 'coating',
      cents: walk * rules.walkGateCents,
      detail: { quantity: walk, unitLabel: 'gates', rateCents: rules.walkGateCents },
    });
  }

  if (drive > 0 && rules.driveGateCents > 0) {
    lines.push({
      id: 'drive_gates',
      label: drive === 1 ? 'Drive gate' : 'Drive gates',
      kind: 'coating',
      cents: drive * rules.driveGateCents,
      detail: { quantity: drive, unitLabel: 'gates', rateCents: rules.driveGateCents },
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

  return finaliseQuote<FencingInputs>({
    lines,
    minimumJobCents: rules.minimumJobCents,
    rangeSpreadPct: rules.rangeSpreadPct,
    modifiersApplied: mods.applied,
    /* `linearFt` carries the run that was actually priced, whichever source it
       came from, so the stored quote and the breakdown cannot disagree about
       the number the money was computed from. */
    inputs: { ...inputs, linearFt: run, walkGates: walk, driveGates: drive },
  });
}

// ---------------------------------------------------------------------------
// result renderer
// ---------------------------------------------------------------------------

/** Placeholder, matching the other verticals. */
function FencingResultRenderer(props: ResultRendererProps) {
  return (
    <div className="rounded-milled border bg-sheet p-4 font-data text-sm">
      <p className="text-rule">FencingResultRenderer</p>
      <pre className="overflow-x-auto">{JSON.stringify(props, null, 2)}</pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// the module
// ---------------------------------------------------------------------------

export const fencingVertical: VerticalModule<FencingInputs, FencingPricingRules> = {
  id: 'fencing',
  displayName: 'Fencing',
  copy,
  surfaceTypes,
  finishes,
  colourCollections,
  steps,
  inputSchema: fencingInputSchema,
  pricingRuleSchema: fencingPricingRuleSchema,
  price: priceFencing,
  vision,
  ResultRenderer: FencingResultRenderer,

  finishCatalogue: legacyFinishCatalogue(finishes, colourCollections),
  photoAnalysisPrompt: BASE_PROMPT,
};
