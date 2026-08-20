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
  finaliseQuote,
  PricingError,
  type BreakdownLine,
  type QuoteComputationOf,
} from '@/lib/quote/kit';

/**
 * CABINET REFINISHING — kitchens, baths and laundries. Dallas market.
 *
 * ============================================================================
 * WHY THIS IS ITS OWN VERTICAL AND NOT A PAINTING SURFACE
 * ============================================================================
 *
 * lib/verticals/painting already declares a `cabinets` surface measured in
 * fronts, and for a painter who does the occasional kitchen that is exactly
 * right. This is a different business. Cabinet refinishers are their own trade
 * with their own shops, and the difference shows up in the arithmetic:
 *
 *   PAINTING PRICES AREA. Every line is sqft x rate x coats.
 *   REFINISHING PRICES PIECES. Doors, drawer fronts and the visible faces of
 *   the boxes, each at its own rate, because a door is a unit of work — off,
 *   sanded, primed, sprayed on both sides, cured, back on — and its cost has
 *   almost nothing to do with its size.
 *
 * Forcing that through an area model would mean inventing a square footage
 * nobody measures and hiding the real driver behind it. So: a separate module,
 * counting things, and the painting vertical keeps its cabinets surface for the
 * painter who wants it.
 *
 * ============================================================================
 * THE ONE THING THAT DECIDES WHETHER THE QUOTE IS ANY GOOD
 * ============================================================================
 *
 * OAK GRAIN. A 1990s oak kitchen painted white without filling the grain looks
 * like an oak kitchen painted white, and the customer is disappointed six weeks
 * later rather than on the day. Filling it is real labour on every front, which
 * is why it is a modifier with the largest adjustment in the file and why the
 * vision call is asked to look for it specifically. A refinishing quote that
 * ignores grain is the one most likely to be walked back on site.
 *
 * ============================================================================
 * THE SHAPE
 * ============================================================================
 *
 * Follows the tool shape in lib/tools/ideas.ts: a big picture of their own
 * kitchen, then the choices, then one gate, then the after. One photograph is
 * enough and nothing here may require more.
 *
 * Rates live in quote_configs.rules via supabase/migrations/0026. A number in
 * this file that affects a price is a defect (R-113).
 */

// ---------------------------------------------------------------------------
// pricing rule schema
// ---------------------------------------------------------------------------

export const cabinetPricingRuleSchema = z
  .object({
    /**
     * Cents per DOOR front, by finish tier. The door is the unit the whole
     * trade quotes in, and the tier carries the difference between a brushed
     * repaint and a sprayed conversion varnish — which is a difference in
     * product, booth time and cure time, not in coverage.
     */
    doorRateCentsPerFront: z.object({
      brushed: z.number().int().positive(),
      sprayed_lacquer: z.number().int().positive(),
      conversion_varnish: z.number().int().positive(),
      stain_refinish: z.number().int().positive(),
      glazed: z.number().int().positive(),
    }),
    /**
     * Cents per DRAWER front. A separate key rather than a fraction of the door
     * rate: a drawer front is quicker to handle but takes the same number of
     * coats and the same cure, so the saving is in labour only and does not
     * track the door rate as tiers get more expensive.
     */
    drawerRateCentsPerFront: z.object({
      brushed: z.number().int().positive(),
      sprayed_lacquer: z.number().int().positive(),
      conversion_varnish: z.number().int().positive(),
      stain_refinish: z.number().int().positive(),
      glazed: z.number().int().positive(),
    }),
    /**
     * Cents per linear foot of cabinet BOX. The frames and end panels stay in
     * the room and are finished in place — masked, brushed and rolled, with the
     * kitchen out of use. Different work from the doors, so its own line.
     */
    boxRateCentsPerLinearFt: z.number().int().positive(),
    /** Cents per front for preparation, by how bad the existing finish is. */
    prepRateCentsPerFront: z.object({
      light: z.number().int().nonnegative(),
      standard: z.number().int().nonnegative(),
      heavy: z.number().int().nonnegative(),
    }),
    /** Cents per piece to fit hardware the customer supplies. */
    hardwareRateCentsPerPiece: z.number().int().nonnegative(),
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

export type CabinetPricingRules = z.infer<typeof cabinetPricingRuleSchema>;
export type CabinetTier = keyof CabinetPricingRules['doorRateCentsPerFront'];
export type PrepLevel = keyof CabinetPricingRules['prepRateCentsPerFront'];

// ---------------------------------------------------------------------------
// inputs
// ---------------------------------------------------------------------------

export const cabinetInputSchema = z.object({
  surfaceTypeId: z.string().min(1),

  doorCount: z.number().int().nonnegative(),
  drawerCount: z.number().int().nonnegative(),
  /** Visible run of cabinet boxes. Optional: doors-only jobs are common. */
  boxLinearFt: z.number().finite().nonnegative().optional(),

  finishId: z.string().min(1).optional(),
  finishTierKey: z.string().min(1),
  colourId: z.string().min(1).optional(),

  prepLevelId: z.enum(['light', 'standard', 'heavy']),
  fitHardware: z.boolean().optional(),

  conditionModifierIds: z.array(z.string().min(1)).optional(),
  photoUrl: z.string().optional(),

  /* Carried because the widget supplies them for every vertical. Unused here:
     nothing in this quote is measured in square feet, and pretending otherwise
     would put an invented number in front of a contractor. */
  sqftMin: z.number().finite().optional(),
  sqftMax: z.number().finite().optional(),
});

export type CabinetInputs = z.infer<typeof cabinetInputSchema>;

/**
 * Bounds on the counts. NOT prices, so they belong in code: they are the range
 * over which the arithmetic is meaningful, and a kitchen with three hundred
 * doors is a data-entry error rather than a large job.
 */
const MAX_DOORS = 80;
const MAX_DRAWERS = 60;
const MAX_BOX_LINEAR_FT = 120;

// ---------------------------------------------------------------------------
// copy
// ---------------------------------------------------------------------------

const copy: VerticalCopy = {
  tradeNoun: 'cabinet refinishing',
  widgetTitle: 'See your kitchen refinished, and what it costs',
  widgetSubtitle:
    'Send one photo. Pick a colour. You will see your own cabinets in it, with a price, in about a minute.',
  step1Question: 'Which cabinets are we refinishing?',

  ctaStart: 'Start with a photo',
  ctaNext: 'Next',
  ctaBack: 'Back',
  ctaSeePrice: 'See my price',

  photoStepTitle: 'Send a photo of your kitchen',
  photoStepHelp:
    'One wide shot showing as many cabinet doors as you can get in frame. It counts the doors and drawers for you. Do not tidy up — it helps to see them as they are.',
  photoSkipLabel: 'Or just count them yourself',
  analyzingLabel: 'Counting your doors and drawers',

  analysisFailedTitle: 'I could not read that one',
  analysisFailedBody:
    'The photo did not show enough of the cabinets to count them. Enter the numbers yourself and the price still works — most kitchens are between 15 and 30 doors.',
  analysisUnsureBody:
    'I can see the cabinets but I am not confident I counted them all — some are probably out of frame. Check the numbers below and correct them.',
  quotaReachedBody:
    'The photo counting is unavailable right now. Enter the numbers yourself and everything else works exactly the same.',

  resultTitle: 'Your kitchen, refinished',
  resultRangeCaption: 'Estimated range for this finish, at this door count',
  resultDisclaimer:
    'An estimate from one photograph, not a contract. The condition of the existing finish and whether the doors are solid wood or laminate are confirmed on site, and the final quote follows a visit.',

  leadFormTitle: 'Where should the estimate go?',
  leadFormBody:
    'Your render and the full breakdown, sent over. No obligation and no site visit unless you ask for one.',
  leadSuccessTitle: 'On its way',
  leadSuccessBody:
    'Check your email for the render and the breakdown. Someone will follow up when you are ready.',

  genericErrorTitle: 'Something went wrong',
  genericErrorBody:
    'That did not go through. Try again — if it keeps happening, enter the counts yourself and the quote will still work.',

  adminVerticalLabel: 'Cabinet refinishing',
  adminConfigHeading: 'Cabinet refinishing pricing',
  adminQuoteNoun: 'cabinet estimate',
};

// ---------------------------------------------------------------------------
// surfaces
// ---------------------------------------------------------------------------

/**
 * Presets are door counts, because that is the number nobody knows and everyone
 * can recognise a description of. "Galley kitchen" is answerable; "22 fronts"
 * is not, until the tool has counted them.
 */
const surfaceTypes: SurfaceTypeOption[] = [
  {
    id: 'kitchen',
    label: 'Kitchen',
    helpText: 'The main run of cabinets, uppers and lowers.',
    presets: [
      { label: 'Small galley kitchen', value: 14 },
      { label: 'Average kitchen', value: 24 },
      { label: 'Large kitchen with an island', value: 38 },
    ],
    typicalSqft: [],
  },
  {
    id: 'kitchen_island',
    label: 'Just the island',
    helpText: 'A two-tone island, or an island on its own.',
    presets: [
      { label: 'Small island', value: 4 },
      { label: 'Average island', value: 7 },
      { label: 'Large island with seating', value: 11 },
    ],
    typicalSqft: [],
  },
  {
    id: 'bathroom_vanity',
    label: 'Bathroom vanity',
    helpText: 'One or more vanities.',
    presets: [
      { label: 'Single vanity', value: 3 },
      { label: 'Double vanity', value: 6 },
      { label: 'Two bathrooms', value: 10 },
    ],
    typicalSqft: [],
  },
  {
    id: 'laundry_utility',
    label: 'Laundry or utility room',
    helpText: 'Utility cabinets and tall storage.',
    presets: [
      { label: 'A few cabinets', value: 6 },
      { label: 'Full utility run', value: 12 },
    ],
    typicalSqft: [],
  },
];

// ---------------------------------------------------------------------------
// finishes
// ---------------------------------------------------------------------------

/**
 * THE TIERS ARE PRODUCTS AND PROCESSES, NOT SHEENS. What separates them is what
 * is sprayed and where it cures, which is also what separates a finish that
 * survives a family kitchen from one that chips off the drawer fronts by the
 * second year. Describing them honestly is worth more than describing them
 * attractively — a customer who chose brushed knowing what it is will not be
 * disappointed by it.
 */
const finishes: FinishOption[] = [
  {
    id: 'brushed',
    label: 'Brushed and rolled',
    description:
      'Cabinet enamel applied by hand, on site. The most affordable option and the only one where a fine brush texture is visible up close. Best on already-smooth painted cabinets.',
    tierKey: 'brushed',
    colourCollectionIds: ['cabinet_paint'],
  },
  {
    id: 'sprayed_lacquer',
    label: 'Sprayed lacquer',
    description:
      'Doors removed, sprayed off site and rehung. A smooth, even film with no brush marks. The standard choice for a kitchen refinish.',
    tierKey: 'sprayed_lacquer',
    colourCollectionIds: ['cabinet_paint'],
  },
  {
    id: 'conversion_varnish',
    label: 'Conversion varnish',
    description:
      'A two-part catalysed finish, sprayed and cured off site. Considerably harder than lacquer and the one that holds up around a sink and a family. The premium option.',
    tierKey: 'conversion_varnish',
    colourCollectionIds: ['cabinet_paint'],
  },
  {
    id: 'stain_refinish',
    label: 'Stripped and restained',
    description:
      'Existing finish stripped back to bare wood, restained and clear-coated. Keeps the grain visible. Only possible on solid wood, not on laminate or thermofoil.',
    tierKey: 'stain_refinish',
    colourCollectionIds: ['cabinet_stain'],
  },
  {
    id: 'glazed',
    label: 'Painted with glaze',
    description:
      'A painted base with a hand-applied glaze worked into the profiles and detail. Adds depth to shaker and raised-panel doors. The most labour per door of anything here.',
    tierKey: 'glazed',
    colourCollectionIds: ['cabinet_paint'],
  },
];

const colourCollections: ColourCollection[] = [
  {
    id: 'cabinet_paint',
    label: 'Cabinet Colours',
    colours: [
      /* Whites and off-whites lead because they are most of this market, and
         the warm/cool split is the decision people actually agonise over. */
      { id: 'cab_pure_white', label: 'Pure White', hex: '#F4F3EF' },
      { id: 'cab_alabaster', label: 'Alabaster', hex: '#EFEADD' },
      { id: 'cab_dover_white', label: 'Dover White', hex: '#E9E2D2' },
      { id: 'cab_accessible_beige', label: 'Accessible Beige', hex: '#CFC3AE' },
      { id: 'cab_repose_grey', label: 'Repose Grey', hex: '#C4BFB6' },
      { id: 'cab_dorian_grey', label: 'Dorian Grey', hex: '#A9A399' },
      { id: 'cab_amherst_grey', label: 'Amherst Grey', hex: '#5E6265' },
      { id: 'cab_iron_ore', label: 'Iron Ore', hex: '#3A3937' },
      { id: 'cab_hale_navy', label: 'Hale Navy', hex: '#39434F' },
      { id: 'cab_pewter_green', label: 'Pewter Green', hex: '#5A6355' },
      { id: 'cab_sage', label: 'Softened Sage', hex: '#8B9080' },
      { id: 'cab_black_forest', label: 'Black Forest', hex: '#2F3A33' },
    ],
  },
  {
    id: 'cabinet_stain',
    label: 'Stain Colours',
    colours: [
      { id: 'stain_natural', label: 'Natural', hex: '#C4A882' },
      { id: 'stain_honey', label: 'Honey', hex: '#B08A4E' },
      { id: 'stain_provincial', label: 'Provincial', hex: '#8A6440' },
      { id: 'stain_walnut', label: 'Walnut', hex: '#5C4030' },
      { id: 'stain_espresso', label: 'Espresso', hex: '#3B2C22' },
    ],
  },
];

const PREP_LEVELS: { id: PrepLevel; label: string; helpText: string }[] = [
  {
    id: 'light',
    label: 'Good condition',
    helpText: 'Already painted and smooth. Clean, degrease and scuff sand.',
  },
  {
    id: 'standard',
    label: 'Normal wear',
    helpText: 'Some chips or worn edges. Sanded, filled and primed.',
  },
  {
    id: 'heavy',
    label: 'Heavily worn or greasy',
    helpText:
      'Peeling finish, or years of cooking grease around the cooker. Stripped back and sealed before anything else.',
  },
];

// ---------------------------------------------------------------------------
// steps
// ---------------------------------------------------------------------------

const steps: StepDescriptor[] = [
  {
    id: 'surface',
    question: 'Which cabinets are we refinishing?',
    writesTo: 'surfaceTypeId',
    control: { kind: 'surface_select' },
  },
  {
    id: 'photo',
    question: 'Send a photo of them',
    help: 'One wide shot with as many doors in frame as you can get.',
    optional: true,
    writesTo: 'photoUrl',
    control: { kind: 'photo' },
  },
  {
    id: 'doors',
    question: 'How many cabinet doors?',
    help: 'Counted from your photo where possible. Correct it if some were out of frame.',
    writesTo: 'doorCount',
    control: { kind: 'stepper', min: 0, max: MAX_DOORS, unitLabel: 'doors' },
  },
  {
    id: 'drawers',
    question: 'How many drawer fronts?',
    help: 'Drawer fronts only — not the boxes behind them.',
    writesTo: 'drawerCount',
    control: { kind: 'stepper', min: 0, max: MAX_DRAWERS, unitLabel: 'drawers' },
  },
  {
    id: 'finish',
    question: 'How should they be finished?',
    help: 'This decides how smooth the result is and how well it survives a family kitchen.',
    writesTo: 'finishId',
    control: { kind: 'finish_select' },
  },
  {
    id: 'colour',
    question: 'Which colour?',
    writesTo: 'colourId',
    control: { kind: 'colour_select' },
  },
  {
    id: 'prep',
    question: 'What condition are they in now?',
    help: 'Be honest here — it is the difference between a finish that lasts and one that peels.',
    writesTo: 'prepLevelId',
    control: {
      kind: 'single_select',
      options: PREP_LEVELS.map((p) => ({
        id: p.id,
        label: p.label,
        helpText: p.helpText,
      })),
    },
  },
  {
    id: 'conditions',
    question: 'Anything else about the job?',
    optional: true,
    writesTo: 'conditionModifierIds',
    control: { kind: 'multi_select', optionsFrom: 'conditionModifiers' },
  },
];

// ---------------------------------------------------------------------------
// vision
// ---------------------------------------------------------------------------

const BASE_PROMPT = `You are counting cabinet fronts in a photograph of a room, for a refinishing quote. Respond with ONLY a JSON object, no prose and no code fences, matching exactly:

{
  "door_count": integer or null,
  "drawer_count": integer or null,
  "count_confidence": number between 0 and 1,
  "door_material": one of "painted_wood" | "stained_wood" | "laminate_or_thermofoil" | "unknown",
  "material_confidence": number between 0 and 1,
  "condition_flags": array of any of "open_grain" | "heavy_grease" | "peeling_finish" | "water_damage" | "glass_fronts",
  "condition_confidence": number between 0 and 1
}

Counting: a DOOR is a hinged front on a cabinet box. A DRAWER FRONT is a front that pulls out. Count only what you can actually see — do NOT estimate what is likely to be off frame or around a corner, because the homeowner will correct a low count and cannot correct a confident wrong one. If a large part of the run is clearly cut off by the edge of the photograph, keep the count to what is visible and lower your confidence.

Material matters more than it looks: "laminate_or_thermofoil" cannot be stripped and restained at all, and a quote offering that finish on those doors is one that has to be withdrawn. If you cannot tell wood from a wood-look laminate, say "unknown" rather than guessing.

Condition flags, and report only what is clearly visible: "open_grain" means a visible open wood grain — most often oak — which has to be filled before painting or it prints through the finish. "heavy_grease" means visible build-up, usually around the cooker. "peeling_finish" means the existing coating is lifting or flaking. "glass_fronts" means doors with glass panels, which are handled separately.

Confidence: state what you actually know. A single photograph of a kitchen rarely shows every cabinet, and an overconfident count becomes a quote the refinisher cannot honour.`;

export const cabinetVisionResponseSchema = z.object({
  door_count: z.number().int().nonnegative().nullable(),
  drawer_count: z.number().int().nonnegative().nullable(),
  count_confidence: z.number().min(0).max(1),
  door_material: z.enum([
    'painted_wood',
    'stained_wood',
    'laminate_or_thermofoil',
    'unknown',
  ]),
  material_confidence: z.number().min(0).max(1),
  condition_flags: z.array(
    z.enum([
      'open_grain',
      'heavy_grease',
      'peeling_finish',
      'water_damage',
      'glass_fronts',
    ])
  ),
  condition_confidence: z.number().min(0).max(1),
});

export type CabinetVisionResult = z.infer<typeof cabinetVisionResponseSchema>;
export type CabinetVisionField = 'counts' | 'door_material' | 'condition_flags';

const CONFIDENCE_FLOOR = 0.6;
/**
 * Counts are held to a lower bar than landscaping's area, and deliberately.
 * Counting doors from a photograph is a far more tractable problem than judging
 * square footage — the things being counted are discrete, rectangular and
 * face the camera — and an undercount is self-correcting, because a homeowner
 * looking at his own kitchen will notice four missing doors immediately.
 */
const COUNT_CONFIDENCE_FLOOR = 0.7;

export function cabinetLowConfidenceFields(a: CabinetVisionResult): CabinetVisionField[] {
  const out: CabinetVisionField[] = [];
  if (a.door_count === null || a.count_confidence < COUNT_CONFIDENCE_FLOOR) out.push('counts');
  if (a.door_material === 'unknown' || a.material_confidence < CONFIDENCE_FLOOR) {
    out.push('door_material');
  }
  if (a.condition_confidence < CONFIDENCE_FLOOR) out.push('condition_flags');
  return out;
}

const INFERRED_MODIFIERS = {
  grainFilling: 'grain_filling',
  grease: 'heavy_grease',
  glass: 'glass_fronts',
  waterDamage: 'water_damage',
} as const;

const vision: VisionModule<CabinetInputs, CabinetPricingRules> = {
  buildPrompt(ctx: VisionContext): string {
    const surface = surfaceTypes.find((s) => s.id === ctx.surfaceTypeId);
    if (!surface) return BASE_PROMPT;
    return (
      BASE_PROMPT +
      `\n\nContext: the homeowner says this is the ${surface.label.toLowerCase()}. Count only those cabinets. If the photograph shows more of the room than that, ignore the rest.`
    );
  },

  responseSchema: cabinetVisionResponseSchema,
  minConfidence: CONFIDENCE_FLOOR,
  lowConfidenceFields: (parsed) => cabinetLowConfidenceFields(parsed as CabinetVisionResult),

  allowancesFromRules(rules: CabinetPricingRules): VisionAllowances {
    return {
      modifierIds: rules.conditionModifiers.map((m) => m.id),
      tierKeys: Object.keys(rules.doorRateCentsPerFront),
    };
  },

  mapToInputs(parsed, _ctx, allowed): Partial<CabinetInputs> {
    const v = parsed as CabinetVisionResult;
    const unsure = cabinetLowConfidenceFields(v);
    const out: Partial<CabinetInputs> = {};

    if (!unsure.includes('counts')) {
      if (v.door_count !== null) out.doorCount = Math.min(v.door_count, MAX_DOORS);
      if (v.drawer_count !== null) out.drawerCount = Math.min(v.drawer_count, MAX_DRAWERS);
    }

    /* Prep is SUGGESTED, never silently set to heavy. It is one of the larger
       lines and a greasy patch by the cooker does not mean the whole kitchen is
       stripped back. The step still renders and the homeowner decides. */
    if (!unsure.includes('condition_flags')) {
      if (v.condition_flags.includes('peeling_finish')) out.prepLevelId = 'heavy';
      else if (v.condition_flags.includes('heavy_grease')) out.prepLevelId = 'standard';
    }

    const candidates: string[] = [];
    if (!unsure.includes('condition_flags')) {
      if (v.condition_flags.includes('open_grain')) candidates.push(INFERRED_MODIFIERS.grainFilling);
      if (v.condition_flags.includes('heavy_grease')) candidates.push(INFERRED_MODIFIERS.grease);
      if (v.condition_flags.includes('glass_fronts')) candidates.push(INFERRED_MODIFIERS.glass);
      if (v.condition_flags.includes('water_damage')) candidates.push(INFERRED_MODIFIERS.waterDamage);
    }

    const kept = candidates.filter((id) => allowed.modifierIds.includes(id));
    if (kept.length > 0) out.conditionModifierIds = kept;

    return out;
  },

  fallbackInputs(): Partial<CabinetInputs> {
    /* Nothing. A default door count would be a price guessed in TypeScript, and
       the copy already tells the homeowner most kitchens run 15 to 30 so he can
       answer it himself. */
    return {};
  },
};

// ---------------------------------------------------------------------------
// pricing
// ---------------------------------------------------------------------------

/**
 * fronts = doors + drawers, and PREP IS CHARGED PER FRONT rather than as a
 * percentage, for the same reason clearance is a line in landscaping: stripping
 * a greasy door costs what it costs whether the finish going on afterwards is
 * lacquer or catalysed varnish. A percentage would make prep cheaper on cheap
 * jobs, which is backwards — the cheap jobs are the worn ones.
 */
function priceCabinets(
  inputs: CabinetInputs,
  rules: CabinetPricingRules
): QuoteComputationOf<CabinetInputs> {
  const tier = inputs.finishTierKey as CabinetTier;
  const doorRate = rules.doorRateCentsPerFront[tier];
  const drawerRate = rules.drawerRateCentsPerFront[tier];

  if (doorRate === undefined || drawerRate === undefined) {
    throw new PricingError(
      'unknown_finish_tier',
      "finish '" +
        inputs.finishTierKey +
        "' has no rate in this quote_config. Configured finishes: " +
        Object.keys(rules.doorRateCentsPerFront).join(', ')
    );
  }

  const doors = Math.round(inputs.doorCount);
  const drawers = Math.round(inputs.drawerCount);

  if (doors + drawers <= 0) {
    throw new PricingError(
      'invalid_inputs',
      'a cabinet quote needs at least one door or drawer front'
    );
  }
  if (doors > MAX_DOORS || drawers > MAX_DRAWERS) {
    throw new PricingError(
      'invalid_inputs',
      'front counts out of range: ' + doors + ' doors, ' + drawers + ' drawers'
    );
  }

  const boxFt = Math.min(Math.round(inputs.boxLinearFt ?? 0), MAX_BOX_LINEAR_FT);
  const lines: BreakdownLine[] = [];
  const finishLabel = finishes.find((f) => f.tierKey === tier)?.label ?? 'Refinishing';

  if (doors > 0) {
    lines.push({
      id: 'coating',
      label: finishLabel + ' — cabinet doors',
      kind: 'coating',
      cents: doors * doorRate,
      detail: { quantity: doors, unitLabel: 'doors', rateCents: doorRate },
    });
  }

  if (drawers > 0) {
    lines.push({
      id: 'drawers',
      label: finishLabel + ' — drawer fronts',
      kind: 'coating',
      cents: drawers * drawerRate,
      detail: { quantity: drawers, unitLabel: 'drawer fronts', rateCents: drawerRate },
    });
  }

  if (boxFt > 0) {
    lines.push({
      id: 'boxes',
      label: 'Cabinet boxes, finished in place',
      kind: 'coating',
      cents: boxFt * rules.boxRateCentsPerLinearFt,
      detail: {
        quantity: boxFt,
        unitLabel: 'linear ft',
        rateCents: rules.boxRateCentsPerLinearFt,
      },
    });
  }

  const fronts = doors + drawers;
  const prepRate = rules.prepRateCentsPerFront[inputs.prepLevelId];
  if (prepRate > 0) {
    const prepLabel =
      PREP_LEVELS.find((p) => p.id === inputs.prepLevelId)?.label ?? inputs.prepLevelId;
    lines.push({
      id: 'prep',
      label: 'Preparation — ' + prepLabel.toLowerCase(),
      kind: 'prep',
      cents: fronts * prepRate,
      detail: { quantity: fronts, unitLabel: 'fronts', rateCents: prepRate },
    });
  }

  if (inputs.fitHardware && rules.hardwareRateCentsPerPiece > 0) {
    lines.push({
      id: 'hardware',
      label: 'Fitting handles and knobs',
      kind: 'prep',
      cents: fronts * rules.hardwareRateCentsPerPiece,
      detail: {
        quantity: fronts,
        unitLabel: 'pieces',
        rateCents: rules.hardwareRateCentsPerPiece,
      },
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
      label: 'Collection and delivery of doors',
      kind: 'mobilization',
      cents: rules.mobilizationFeeCents,
    });
  }

  return finaliseQuote<CabinetInputs>({
    lines,
    minimumJobCents: rules.minimumJobCents,
    rangeSpreadPct: rules.rangeSpreadPct,
    modifiersApplied: mods.applied,
    inputs: { ...inputs, doorCount: doors, drawerCount: drawers },
  });
}

// ---------------------------------------------------------------------------
// result renderer
// ---------------------------------------------------------------------------

/** Placeholder, matching the other three verticals. */
function CabinetResultRenderer(props: ResultRendererProps) {
  return (
    <div className="rounded-milled border bg-sheet p-4 font-data text-sm">
      <p className="text-rule">CabinetResultRenderer</p>
      <pre className="overflow-x-auto">{JSON.stringify(props, null, 2)}</pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// the module
// ---------------------------------------------------------------------------

export const cabinetsVertical: VerticalModule<CabinetInputs, CabinetPricingRules> = {
  id: 'cabinets',
  displayName: 'Cabinet Refinishing',
  copy,
  surfaceTypes,
  finishes,
  colourCollections,
  steps,
  inputSchema: cabinetInputSchema,
  pricingRuleSchema: cabinetPricingRuleSchema,
  price: priceCabinets,
  vision,
  ResultRenderer: CabinetResultRenderer,

  finishCatalogue: legacyFinishCatalogue(finishes, colourCollections),
  photoAnalysisPrompt: BASE_PROMPT,
};
