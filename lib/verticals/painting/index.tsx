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
 * PAINTING — interior/exterior residential repaint. Dallas market.
 *
 * WHY THIS FILE EXISTS AND WHAT IT PROVES. Painting is the second vertical,
 * and its job is to break anything epoxy quietly assumed. It does, in four
 * places, and each one is handled here rather than in core:
 *
 *   1. THE UNIT IS NOT ONE UNIT. Walls and ceilings are square feet, trim is
 *      linear feet, cabinets are doors and drawers. Three quantity steps with
 *      showIf predicates, chosen by the surface — not one sqft slider bent
 *      three ways.
 *   2. COATS ARE A SECOND DIMENSION. Two coats is not two jobs: the masking,
 *      the cut-in and the mobilisation are already paid for, so additional
 *      coats bill at a configured fraction of the first. That fraction is the
 *      contractor's number, in rules, not ours.
 *   3. PREP IS A FIRST-CLASS LINE, NOT A MODIFIER. On a repaint, prep is
 *      routinely a third of the job — patching, sanding, caulking, masking,
 *      priming. Epoxy carries one prepRateCentsPerSqft; painting carries a
 *      prep LEVEL with its own rate per level, because "light scuff" and
 *      "restoration" are different trades, not the same trade with a percentage
 *      on it.
 *   4. SHEEN IS NOT COLOUR. Five sheens share one colour deck. v1 nested
 *      colours inside finishes, which would have duplicated the deck five
 *      times; v2's orthogonal catalogue is the reason this file is short.
 *
 * THE BOUNDARY, unchanged and non-negotiable: everything here is CONTENT,
 * SCHEMA and FORMULA. Every rate lives in quote_configs.rules. A number in
 * this file that affects a price is a defect (R-113). The only literals in the
 * arithmetic are 0 and 1.
 */

// ---------------------------------------------------------------------------
// pricing rule schema
// ---------------------------------------------------------------------------

export const paintingPricingRuleSchema = z
  .object({
    /**
     * $/sqft in cents for ONE coat, per sheen tier. Sheen drives material
     * cost and cut-in care: gloss shows every flaw, so it bills higher.
     */
    coatRateCentsPerSqft: z.object({
      flat: z.number().int().positive(),
      eggshell: z.number().int().positive(),
      satin: z.number().int().positive(),
      semi_gloss: z.number().int().positive(),
      gloss: z.number().int().positive(),
    }),
    /**
     * What each coat AFTER the first costs, as a fraction of the first.
     * Bounded below 1 because a second coat that costs the same as the first
     * means the setup was never priced into the first — a config error, not a
     * pricing strategy. Bounded above 0.3 because paint is not free.
     */
    additionalCoatFactor: z.number().min(0.3).max(1),
    /**
     * $/sqft in cents by prep level. Ordered light -> restoration; the schema
     * does not enforce that they ascend, because a contractor who quotes
     * heavy prep cheaply to win rental turnovers is making a business
     * decision, not a typo.
     */
    prepRateCentsPerSqft: z.object({
      light: z.number().int().nonnegative(),
      standard: z.number().int().nonnegative(),
      heavy: z.number().int().nonnegative(),
      restoration: z.number().int().nonnegative(),
    }),
    /** Full primer coat, $/sqft in cents. Applied only when required. */
    primerRateCentsPerSqft: z.number().int().nonnegative(),
    /** Trim, baseboards and millwork, $/linear ft in cents. */
    trimRateCentsPerLinearFt: z.number().int().positive(),
    /** Cabinet doors and drawer fronts, $/unit in cents. */
    cabinetRateCentsPerDoor: z.number().int().positive(),
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
    rangeSpreadPct: z.number().min(0.05).max(0.5),
  })
  .strict();

export type PaintingPricingRules = z.infer<typeof paintingPricingRuleSchema>;

export type SheenTier = keyof PaintingPricingRules['coatRateCentsPerSqft'];
export type PrepLevel = keyof PaintingPricingRules['prepRateCentsPerSqft'];

// ---------------------------------------------------------------------------
// how each surface is measured
// ---------------------------------------------------------------------------

export type PaintingMeasure = 'area' | 'linear' | 'doors';

const SURFACE_MEASURE: Record<string, PaintingMeasure> = {
  interior_walls: 'area',
  ceilings: 'area',
  exterior_siding: 'area',
  trim_and_doors: 'linear',
  cabinets: 'doors',
};

export function measureFor(surfaceTypeId: string): PaintingMeasure {
  return SURFACE_MEASURE[surfaceTypeId] ?? 'area';
}

// ---------------------------------------------------------------------------
// inputs
// ---------------------------------------------------------------------------

export const paintingInputSchema = z.object({
  surfaceTypeId: z.string().min(1),
  /** Wall/ceiling/siding area. Required when the surface is area-measured. */
  areaSqft: z.number().finite().optional(),
  /** Trim run. Required when the surface is linear-measured. */
  linearFt: z.number().finite().optional(),
  /** Cabinet doors + drawer fronts. Required for cabinets. */
  doorCount: z.number().int().finite().optional(),

  /**
   * Optional because the price never depends on it: finishTierKey is what
   * resolves a rate. Phase 3 callers pass a PricingInput that carries the
   * tier and no finish id, and they must keep validating.
   */
  finishId: z.string().min(1).optional(),
  finishTierKey: z.string().min(1),
  colourId: z.string().min(1).optional(),

  /** 1-3. A fourth coat is a different conversation, held by a human. */
  coats: z.number().int().min(1).max(3),
  prepLevelId: z.enum(['light', 'standard', 'heavy', 'restoration']),
  primerRequired: z.boolean().optional(),

  conditionModifierIds: z.array(z.string().min(1)).optional(),
  photoUrl: z.string().optional(),

  /** Bounds from quote_configs, carried so pricing enforces them itself. */
  sqftMin: z.number().finite(),
  sqftMax: z.number().finite(),
});

export type PaintingInputs = z.infer<typeof paintingInputSchema>;

// ---------------------------------------------------------------------------
// copy
// ---------------------------------------------------------------------------

const copy: VerticalCopy = {
  tradeNoun: 'interior and exterior painting',
  widgetTitle: 'Price your repaint',
  widgetSubtitle: 'A real range in about a minute. No walkthrough booked, no sales visit.',
  step1Question: 'What are we painting?',

  ctaStart: 'Get my price range',
  ctaNext: 'Continue',
  ctaBack: 'Back',
  ctaSeePrice: 'See my range',

  photoStepTitle: 'Add a photo of what needs painting',
  photoStepHelp:
    'One wide shot of the wall or elevation. Turn the room lights on — we are looking at the surface, not the decor.',
  photoSkipLabel: 'Skip — price it from my answers',
  analyzingLabel: 'Reading the surface…',

  analysisFailedTitle: "Couldn't read that photo",
  analysisFailedBody:
    'Your range below is priced from your own answers, so it still stands. Add a clearer shot if you want the prep estimate tightened up.',
  analysisUnsureBody:
    "The photo wasn't clear enough to judge the surface, so we priced it from your answers. Your painter will confirm the prep on site.",
  quotaReachedBody:
    "Photo analysis is paused for today. Your range is priced from your answers and we've still got your details — nothing is lost.",

  resultTitle: 'Your estimated range',
  resultRangeCaption: 'Based on the area, sheen, coat count and prep level you chose.',
  resultDisclaimer:
    'An estimate, not a contract. Prep is the line that moves most once a painter sees the walls in person.',

  leadFormTitle: 'Where should we send this?',
  leadFormBody: "We'll text the range and a few recent jobs. No obligation.",
  leadSuccessTitle: "You're on the list",
  leadSuccessBody: 'Expect a text shortly with your range and the next open week on the schedule.',

  genericErrorTitle: 'Something went wrong on our end',
  genericErrorBody:
    'Tap the button again. If it keeps failing, leave your number below and we will price it by hand.',

  adminVerticalLabel: 'Interior & Exterior Painting',
  adminConfigHeading: 'Coat rates, prep levels & trim',
  adminQuoteNoun: 'painting quote',
};

// ---------------------------------------------------------------------------
// catalogue
// ---------------------------------------------------------------------------

const surfaceTypes: SurfaceTypeOption[] = [
  {
    id: 'interior_walls',
    label: 'Interior walls',
    helpText: 'Bedrooms, living areas, hallways — wall surface, not floor area.',
    presets: [
      { label: 'One bedroom', value: 400 },
      { label: 'Living room', value: 640 },
      { label: 'Main floor', value: 1400 },
      { label: 'Whole 3-bed house', value: 2400 },
    ],
    typicalSqft: [
      { label: 'One bedroom', sqft: 400 },
      { label: 'Living room', sqft: 640 },
      { label: 'Main floor', sqft: 1400 },
      { label: 'Whole 3-bed house', sqft: 2400 },
    ],
  },
  {
    id: 'ceilings',
    label: 'Ceilings',
    helpText: 'Priced on ceiling area, which is close to the floor area of the room.',
    presets: [
      { label: 'One room', value: 180 },
      { label: 'Two or three rooms', value: 520 },
      { label: 'Whole main floor', value: 1100 },
    ],
    typicalSqft: [
      { label: 'One room', sqft: 180 },
      { label: 'Two or three rooms', sqft: 520 },
      { label: 'Whole main floor', sqft: 1100 },
    ],
  },
  {
    id: 'exterior_siding',
    label: 'Exterior siding',
    helpText: 'Wall elevations only. Trim and doors are their own selection.',
    presets: [
      { label: 'Single-storey', value: 1500 },
      { label: 'Two-storey', value: 2600 },
      { label: 'Large two-storey', value: 3800 },
    ],
    typicalSqft: [
      { label: 'Single-storey', sqft: 1500 },
      { label: 'Two-storey', sqft: 2600 },
      { label: 'Large two-storey', sqft: 3800 },
    ],
  },
  {
    id: 'trim_and_doors',
    label: 'Trim, baseboards & doors',
    helpText: 'Measured along the run, not by area.',
    presets: [
      { label: 'One room', value: 60 },
      { label: 'Main floor', value: 220 },
      { label: 'Whole house', value: 420 },
    ],
    typicalSqft: [
      { label: 'One room', sqft: 60 },
      { label: 'Main floor', sqft: 220 },
      { label: 'Whole house', sqft: 420 },
    ],
  },
  {
    id: 'cabinets',
    label: 'Kitchen cabinets',
    helpText: 'Counted by door and drawer front — the fronts are the whole job.',
    presets: [
      { label: 'Small kitchen', value: 18 },
      { label: 'Average kitchen', value: 30 },
      { label: 'Large kitchen', value: 48 },
    ],
    typicalSqft: [
      { label: 'Small kitchen', sqft: 18 },
      { label: 'Average kitchen', sqft: 30 },
      { label: 'Large kitchen', sqft: 48 },
    ],
  },
];

/**
 * ONE deck, shared by every sheen — the thing v1's contract could not express.
 * Real repaint palette rather than a manufacturer's full fan, because a
 * homeowner picking from 2,000 chips on a phone picks nothing at all. The
 * contractor's final colour is confirmed off a real fan deck on site; this is
 * enough to price and enough to feel chosen.
 */
const colourCollections: ColourCollection[] = [
  {
    id: 'repaint_deck',
    label: 'Popular Repaint Colours',
    colours: [
      { id: 'chalk_white', label: 'Chalk White', hex: '#F4F2EC' },
      { id: 'warm_linen', label: 'Warm Linen', hex: '#EDE4D6' },
      { id: 'soft_greige', label: 'Soft Greige', hex: '#D6CFC3' },
      { id: 'pale_oat', label: 'Pale Oat', hex: '#E2DAC9' },
      { id: 'morning_fog', label: 'Morning Fog', hex: '#CBCFCC' },
      { id: 'quarry_gray', label: 'Quarry Gray', hex: '#A8ABA6' },
      { id: 'pewter', label: 'Pewter', hex: '#7E827F' },
      { id: 'slate_blue', label: 'Slate Blue', hex: '#61707C' },
      { id: 'deep_navy', label: 'Deep Navy', hex: '#2C3946' },
      { id: 'sage', label: 'Sage', hex: '#9BA68C' },
      { id: 'olive_field', label: 'Olive Field', hex: '#6E7355' },
      { id: 'clay', label: 'Clay', hex: '#B08768' },
      { id: 'terracotta', label: 'Terracotta', hex: '#A65F45' },
      { id: 'espresso', label: 'Espresso', hex: '#4A3A31' },
      { id: 'iron_black', label: 'Iron Black', hex: '#2B2B2B' },
      { id: 'custom_match', label: 'Match my existing colour', hex: '#D9D9D9' },
    ],
  },
  /**
   * ========================================================================
   * EXTERIOR DECKS. PHASE 72.
   * ========================================================================
   *
   * WHY A SECOND AND THIRD DECK RATHER THAN MORE ENTRIES IN THE FIRST.
   * `repaint_deck` is an interior deck — it is built around what looks right on
   * a wall in artificial light, and it holds one colour per job because an
   * interior room is one colour.
   *
   * A HOUSE IS NEVER ONE COLOUR. It is a body, a trim and usually a front door,
   * and the relationship between those three IS the decision a homeowner is
   * making. Offering a single flat list forces them to make that decision three
   * times without ever seeing it as one choice, and it is also the reason the
   * exterior tool is worth building at all: "which colour?" is a question people
   * argue about in comments, and argument travels further than approval.
   *
   * BODY COLOURS ARE NOT INTERIOR COLOURS AT LOWER SATURATION. Exteriors are
   * seen in full sun, where a colour reads two or three shades lighter and
   * washed out, so the deck below runs deliberately deeper than the interior
   * one. The whites are warmer for the same reason — a cold interior white goes
   * blue outdoors under a Texas sky.
   *
   * A KNOWN LIMITATION, RECORDED RATHER THAN WORKED AROUND. `ColourCollection`
   * attaches to FINISHES, not to surfaces, so there is no way in the current
   * contract to say "these decks are for exterior siding only". Every deck
   * therefore shows for every sheen. That is noisy rather than broken, and the
   * honest fix is a `surfaceTypeIds` field on ColourCollection in registry.ts —
   * a core change, which does not belong in a content phase.
   */
  {
    id: 'exterior_body',
    label: 'Exterior Body Colours',
    colours: [
      { id: 'ext_alabaster', label: 'Alabaster', hex: '#EFEADD' },
      { id: 'ext_shell_white', label: 'Shell White', hex: '#E6DFCF' },
      { id: 'ext_agreeable_grey', label: 'Agreeable Grey', hex: '#CFC7B8' },
      { id: 'ext_dovetail', label: 'Dovetail', hex: '#9A958C' },
      { id: 'ext_gauntlet_grey', label: 'Gauntlet Grey', hex: '#6E6B66' },
      { id: 'ext_iron_ore', label: 'Iron Ore', hex: '#3A3937' },
      { id: 'ext_hale_navy', label: 'Hale Navy', hex: '#39434F' },
      { id: 'ext_riverway', label: 'Riverway', hex: '#4A5A63' },
      { id: 'ext_pewter_green', label: 'Pewter Green', hex: '#5A6355' },
      { id: 'ext_rosemary', label: 'Rosemary', hex: '#46503F' },
      { id: 'ext_sagebrush', label: 'Sagebrush', hex: '#8B9080' },
      { id: 'ext_weathered_clay', label: 'Weathered Clay', hex: '#A67A5B' },
      { id: 'ext_brick_red', label: 'Brick Red', hex: '#8A4B3C' },
      { id: 'ext_desert_tan', label: 'Desert Tan', hex: '#C4A882' },
      { id: 'ext_charcoal_slate', label: 'Charcoal Slate', hex: '#4C5257' },
    ],
  },
  {
    id: 'exterior_trim',
    label: 'Trim & Front Door',
    colours: [
      /* Trim is overwhelmingly white or near-black, and a front door is where
         people take the risk. Both live in one deck because they are chosen
         against each other and against the body — three lists would hide the
         relationship that is the whole point. */
      { id: 'trim_pure_white', label: 'Pure White', hex: '#F7F5F0' },
      { id: 'trim_extra_white', label: 'Extra White', hex: '#F2F2EE' },
      { id: 'trim_greek_villa', label: 'Greek Villa', hex: '#EDE6D8' },
      { id: 'trim_iron_black', label: 'Iron Black', hex: '#2B2B2B' },
      { id: 'trim_tricorn', label: 'Tricorn Black', hex: '#333436' },
      { id: 'door_spiced_rum', label: 'Spiced Rum', hex: '#8C4A2F' },
      { id: 'door_teal', label: 'Deep Teal', hex: '#2F5459' },
      { id: 'door_mustard', label: 'Mustard', hex: '#B08A3E' },
      { id: 'door_forest', label: 'Forest Green', hex: '#33463A' },
      { id: 'door_oxblood', label: 'Oxblood', hex: '#6B3238' },
    ],
  },
];

/**
 * Sheen, not finish system. Every sheen offers the whole deck, which is why
 * none of these declare colourCollectionIds — omitting it means "all".
 */
const finishes: FinishOption[] = [
  {
    id: 'flat',
    label: 'Flat / Matte',
    description: 'Hides wall flaws best. Ceilings and low-traffic rooms.',
    tierKey: 'flat',
  },
  {
    id: 'eggshell',
    label: 'Eggshell',
    description: 'The default interior wall sheen. Wipes down, barely shines.',
    tierKey: 'eggshell',
  },
  {
    id: 'satin',
    label: 'Satin',
    description: 'Tougher and washable. Kitchens, baths, hallways, kids.',
    tierKey: 'satin',
  },
  {
    id: 'semi_gloss',
    label: 'Semi-gloss',
    description: 'Trim, doors and cabinets. Takes scrubbing.',
    tierKey: 'semi_gloss',
  },
  {
    id: 'gloss',
    label: 'High gloss',
    description: 'Hardest surface, shows every imperfection underneath.',
    tierKey: 'gloss',
  },
];

const PREP_LEVELS: { id: PrepLevel; label: string; helpText: string }[] = [
  {
    id: 'light',
    label: 'Light',
    helpText: 'Walls are sound. Wipe down, caulk a few gaps, mask and go.',
  },
  {
    id: 'standard',
    label: 'Standard',
    helpText: 'Normal repaint: patch nail holes and dings, sand, spot-prime.',
  },
  {
    id: 'heavy',
    label: 'Heavy',
    helpText: 'Peeling or flaking, several patches, or a big colour change.',
  },
  {
    id: 'restoration',
    label: 'Restoration',
    helpText: 'Water damage, failing plaster, or a surface that needs rebuilding first.',
  },
];

// ---------------------------------------------------------------------------
// steps — three quantity steps, one shown, chosen by the surface
// ---------------------------------------------------------------------------

const isMeasure = (m: PaintingMeasure) => (s: Record<string, unknown>) =>
  typeof s.surfaceTypeId === 'string' && measureFor(s.surfaceTypeId) === m;

const steps: StepDescriptor[] = [
  {
    id: 'surface',
    question: copy.step1Question,
    writesTo: 'surfaceTypeId',
    control: { kind: 'surface_select' },
  },
  {
    id: 'area',
    question: 'How much surface are we covering?',
    help: "Not sure? Pick the closest — you can nudge it after.",
    writesTo: 'areaSqft',
    showIf: isMeasure('area'),
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
    id: 'linear',
    question: 'How much trim are we running?',
    help: 'Measured along the baseboard and casing, not by area.',
    writesTo: 'linearFt',
    showIf: isMeasure('linear'),
    control: {
      kind: 'quantity',
      unit: 'linear_ft',
      unitLabel: 'linear ft',
      configMinKey: 'sqft_min',
      configMaxKey: 'sqft_max',
      presetsFrom: 'surfaceType',
    },
  },
  {
    id: 'doors',
    question: 'How many doors and drawer fronts?',
    help: 'Count every door and every drawer front. Boxes are included.',
    writesTo: 'doorCount',
    showIf: isMeasure('doors'),
    control: { kind: 'stepper', min: 1, max: 80, unitLabel: 'fronts' },
  },
  {
    id: 'finish',
    question: 'Which sheen?',
    help: 'Flatter hides flaws; glossier takes cleaning.',
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
    id: 'coats',
    question: 'How many coats?',
    help: 'Two is standard. One works over a similar colour; three for a drastic change.',
    writesTo: 'coats',
    control: { kind: 'stepper', min: 1, max: 3, unitLabel: 'coats' },
  },
  {
    id: 'prep',
    question: 'What shape is the surface in?',
    help: 'This is the line that moves a painting price the most.',
    writesTo: 'prepLevelId',
    control: {
      kind: 'single_select',
      options: PREP_LEVELS.map((p) => ({ id: p.id, label: p.label, helpText: p.helpText })),
    },
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
    question: 'Anything else we should know?',
    help: 'Pick everything that applies. Leave it blank if none do.',
    writesTo: 'conditionModifierIds',
    optional: true,
    control: { kind: 'multi_select', optionsFrom: 'conditionModifiers' },
  },
];

// ---------------------------------------------------------------------------
// vision
// ---------------------------------------------------------------------------

const BASE_PROMPT = `You are classifying a photo of a residential surface for a repainting estimate. Respond with ONLY a JSON object, no prose and no code fences, matching exactly:
{
  "surface_guess": "interior_walls" | "ceilings" | "exterior_siding" | "trim_and_doors" | "cabinets" | "unknown",
  "surface_condition": "sound" | "minor_wear" | "damaged" | "failing" | "unknown",
  "existing_colour_family": "white" | "off_white" | "beige" | "gray" | "blue" | "green" | "warm" | "dark" | "unknown",
  "existing_sheen_guess": "flat" | "eggshell" | "satin" | "semi_gloss" | "gloss" | "unknown",
  "damage_flags": string[],             // from: "peeling","water_stains","cracks","nail_holes","mildew","bare_patches","wallpaper","popcorn_texture"
  "prep_level_guess": "light" | "standard" | "heavy" | "restoration" | "unknown",
  "primer_recommended": boolean | null,
  "estimated_area_sqft": number | null, // ONLY if scale cues make it inferable; otherwise null
  "confidence": {                        // 0-1 per field
    "surface_guess": number,
    "surface_condition": number,
    "existing_colour_family": number,
    "existing_sheen_guess": number,
    "prep_level_guess": number,
    "estimated_area_sqft": number
  }
}
Rules: judge the SURFACE, not the decor or the furniture. Never invent an area without visible scale cues (a standard door, an outlet, a window). Peeling, chalking or exposed substrate means at least "heavy". Water staining or failed plaster means "restoration". If the image is not a paintable surface, set every field to "unknown"/null with confidence 0. Uncertainty belongs in low confidence values, not in guesses.`;

export const paintingVisionResponseSchema = z.object({
  surface_guess: z.enum([
    'interior_walls',
    'ceilings',
    'exterior_siding',
    'trim_and_doors',
    'cabinets',
    'unknown',
  ]),
  surface_condition: z.enum(['sound', 'minor_wear', 'damaged', 'failing', 'unknown']),
  existing_colour_family: z.enum([
    'white',
    'off_white',
    'beige',
    'gray',
    'blue',
    'green',
    'warm',
    'dark',
    'unknown',
  ]),
  existing_sheen_guess: z.enum(['flat', 'eggshell', 'satin', 'semi_gloss', 'gloss', 'unknown']),
  damage_flags: z.array(
    z.enum([
      'peeling',
      'water_stains',
      'cracks',
      'nail_holes',
      'mildew',
      'bare_patches',
      'wallpaper',
      'popcorn_texture',
    ])
  ),
  prep_level_guess: z.enum(['light', 'standard', 'heavy', 'restoration', 'unknown']),
  primer_recommended: z.boolean().nullable(),
  estimated_area_sqft: z.number().positive().nullable(),
  confidence: z.object({
    surface_guess: z.number().min(0).max(1),
    surface_condition: z.number().min(0).max(1),
    existing_colour_family: z.number().min(0).max(1),
    existing_sheen_guess: z.number().min(0).max(1),
    prep_level_guess: z.number().min(0).max(1),
    estimated_area_sqft: z.number().min(0).max(1),
  }),
});

export type PaintingVisionResult = z.infer<typeof paintingVisionResponseSchema>;

/**
 * Area is held to a HIGHER bar than the categorical fields, for the same
 * reason epoxy holds it higher: getting prep wrong shifts the price by a rate,
 * getting area wrong scales the whole quote linearly — and the homeowner is
 * the one person in the transaction who can actually measure their own wall.
 */
const CONFIDENCE_FLOOR = 0.6;
const AREA_CONFIDENCE_FLOOR = 0.8;

export type PaintingVisionField =
  | 'surface_guess'
  | 'surface_condition'
  | 'existing_colour_family'
  | 'existing_sheen_guess'
  | 'prep_level_guess'
  | 'estimated_area_sqft';

/** Fields the model was not sure enough about. Ask the person for these. */
export function paintingLowConfidenceFields(a: PaintingVisionResult): PaintingVisionField[] {
  const out: PaintingVisionField[] = [];
  const c = a.confidence;
  if (a.surface_guess === 'unknown' || c.surface_guess < CONFIDENCE_FLOOR) out.push('surface_guess');
  if (a.surface_condition === 'unknown' || c.surface_condition < CONFIDENCE_FLOOR)
    out.push('surface_condition');
  if (a.existing_colour_family === 'unknown' || c.existing_colour_family < CONFIDENCE_FLOOR)
    out.push('existing_colour_family');
  if (a.existing_sheen_guess === 'unknown' || c.existing_sheen_guess < CONFIDENCE_FLOOR)
    out.push('existing_sheen_guess');
  if (a.prep_level_guess === 'unknown' || c.prep_level_guess < CONFIDENCE_FLOOR)
    out.push('prep_level_guess');
  if (a.estimated_area_sqft === null || c.estimated_area_sqft < AREA_CONFIDENCE_FLOOR)
    out.push('estimated_area_sqft');
  return out;
}

/** Canonical ids this vertical knows how to infer. The config decides which exist. */
const INFERRED_MODIFIERS = {
  waterDamage: 'water_damage_repair',
  mildew: 'mildew_treatment',
  wallpaper: 'wallpaper_removal',
  popcorn: 'popcorn_ceiling',
} as const;

const vision: VisionModule<PaintingInputs, PaintingPricingRules> = {
  buildPrompt(ctx: VisionContext): string {
    const surface = surfaceTypes.find((s) => s.id === ctx.surfaceTypeId);
    if (!surface) return BASE_PROMPT;
    return (
      BASE_PROMPT +
      `\n\nContext: the homeowner has told us this is ${surface.label.toLowerCase()}. Use that to interpret scale cues and to decide what counts as damage on this kind of surface, but if the photo clearly shows something else, report what you see and lower your confidence.`
    );
  },

  responseSchema: paintingVisionResponseSchema,

  minConfidence: CONFIDENCE_FLOOR,

  lowConfidenceFields: (parsed) =>
    paintingLowConfidenceFields(parsed as PaintingVisionResult),

  allowancesFromRules(rules: PaintingPricingRules): VisionAllowances {
    return {
      modifierIds: rules.conditionModifiers.map((m) => m.id),
      tierKeys: Object.keys(rules.coatRateCentsPerSqft),
    };
  },

  mapToInputs(parsed, _ctx, allowed): Partial<PaintingInputs> {
    const v = parsed as PaintingVisionResult;
    const unsure = paintingLowConfidenceFields(v);
    const out: Partial<PaintingInputs> = {};

    if (!unsure.includes('estimated_area_sqft') && v.estimated_area_sqft !== null) {
      out.areaSqft = Math.round(v.estimated_area_sqft);
    }

    // Prep level is a SUGGESTION that pre-selects the step, never a silent
    // override: the step still renders and the homeowner can move it. A photo
    // taken of the one good wall should not price the whole house as light.
    if (!unsure.includes('prep_level_guess') && v.prep_level_guess !== 'unknown') {
      out.prepLevelId = v.prep_level_guess;
    }

    // Primer adds a real line to the price, so it is gated exactly like every
    // other inferred field. An unreadable photo must not quietly bill a coat
    // of primer the homeowner never agreed to.
    if (
      v.primer_recommended === true &&
      !unsure.includes('surface_condition') &&
      !unsure.includes('prep_level_guess')
    ) {
      out.primerRequired = true;
    }

    const candidates: string[] = [];
    if (!unsure.includes('surface_condition')) {
      if (v.damage_flags.includes('water_stains')) candidates.push(INFERRED_MODIFIERS.waterDamage);
      if (v.damage_flags.includes('mildew')) candidates.push(INFERRED_MODIFIERS.mildew);
      if (v.damage_flags.includes('wallpaper')) candidates.push(INFERRED_MODIFIERS.wallpaper);
      if (v.damage_flags.includes('popcorn_texture')) candidates.push(INFERRED_MODIFIERS.popcorn);
    }

    // Only ids this contractor's config actually defines survive. An id he has
    // never heard of is dropped here rather than thrown at a homeowner.
    const kept = candidates.filter((id) => allowed.modifierIds.includes(id));
    if (kept.length > 0) out.conditionModifierIds = kept;

    return out;
  },

  fallbackInputs(): Partial<PaintingInputs> {
    // Nothing inferred. The homeowner's own answers price the job on their
    // own, and guessing a prep level here would put a price in TypeScript.
    return {};
  },
};

// ---------------------------------------------------------------------------
// pricing — painting owns its formula
// ---------------------------------------------------------------------------

/**
 * ORDER OF OPERATIONS, and why:
 *
 *   1. The quantity is chosen by the SURFACE, not by the widget. Area
 *      surfaces bill per sqft, trim per linear foot, cabinets per front.
 *   2. coating = quantity x sheenRate x coatFactor, where
 *        coatFactor = 1 + (coats - 1) x additionalCoatFactor
 *      Additional coats bill at a fraction because the masking, cut-in and
 *      setup are already paid for by the first. That fraction is the
 *      contractor's number.
 *   3. primer = area x primerRate, when required. A separate line because it
 *      is a separate product going on the wall, and a homeowner reading the
 *      breakdown should see what he is paying for.
 *   4. prep = area x prepRate[level]. NOT a percentage of the coating — a
 *      restoration wall takes the same days whether it is finished in flat or
 *      in gloss, so prep must not scale with sheen.
 *   5. modifiers, additive on the subtotal (kit).
 *   6. + mobilisation, flat, after the percentages (kit ordering).
 *   7. minimum, then the band (kit).
 *
 * Trim and cabinets carry no prep line: their prep is inseparable from the
 * unit rate, and billing a linear foot of baseboard for "prep per square
 * foot" would be inventing an area that was never measured.
 */
function pricePainting(
  inputs: PaintingInputs,
  rules: PaintingPricingRules
): QuoteComputationOf<PaintingInputs> {
  const measure = measureFor(inputs.surfaceTypeId);

  const sheenRate = rules.coatRateCentsPerSqft[inputs.finishTierKey as SheenTier];
  if (sheenRate === undefined) {
    throw new PricingError(
      'unknown_finish_tier',
      "sheen '" + inputs.finishTierKey +
        "' has no rate in this quote_config. Configured sheens: " +
        Object.keys(rules.coatRateCentsPerSqft).join(', ')
    );
  }

  const coatFactor = 1 + (inputs.coats - 1) * rules.additionalCoatFactor;
  const lines: BreakdownLine[] = [];
  const coatsLabel = inputs.coats === 1 ? '1 coat' : inputs.coats + ' coats';

  let area = 0;

  if (measure === 'area') {
    if (inputs.areaSqft === undefined) {
      throw new PricingError('invalid_inputs', 'areaSqft is required for this surface');
    }
    assertWithinBounds(
      inputs.areaSqft,
      inputs.sqftMin,
      inputs.sqftMax,
      'sqft_out_of_bounds',
      'sqft'
    );
    area = Math.round(inputs.areaSqft);

    lines.push({
      id: 'coating',
      label: 'Paint and application — ' + coatsLabel,
      kind: 'coating',
      cents: Math.round(area * sheenRate * coatFactor),
      detail: {
        quantity: area,
        unitLabel: 'sq ft',
        rateCents: sheenRate,
        coats: inputs.coats,
      },
    });

    if (inputs.primerRequired && rules.primerRateCentsPerSqft > 0) {
      lines.push({
        id: 'primer',
        label: 'Primer coat',
        kind: 'prep',
        cents: Math.round(area * rules.primerRateCentsPerSqft),
        detail: { sqft: area, rateCentsPerSqft: rules.primerRateCentsPerSqft },
      });
    }

    const prepRate = rules.prepRateCentsPerSqft[inputs.prepLevelId];
    const prepCents = Math.round(area * prepRate);
    if (prepCents > 0) {
      const prepLabel =
        PREP_LEVELS.find((p) => p.id === inputs.prepLevelId)?.label ?? inputs.prepLevelId;
      lines.push({
        id: 'prep',
        label: 'Surface preparation — ' + prepLabel.toLowerCase(),
        kind: 'prep',
        cents: prepCents,
        detail: { sqft: area, rateCentsPerSqft: prepRate },
      });
    }
  } else if (measure === 'linear') {
    if (inputs.linearFt === undefined) {
      throw new PricingError('invalid_inputs', 'linearFt is required for trim');
    }
    assertWithinBounds(
      inputs.linearFt,
      inputs.sqftMin,
      inputs.sqftMax,
      'quantity_out_of_bounds',
      'linear ft'
    );
    const run = Math.round(inputs.linearFt);
    lines.push({
      id: 'coating',
      label: 'Trim, baseboard and door painting — ' + coatsLabel,
      kind: 'coating',
      cents: Math.round(run * rules.trimRateCentsPerLinearFt * coatFactor),
      detail: {
        quantity: run,
        unitLabel: 'linear ft',
        rateCents: rules.trimRateCentsPerLinearFt,
        coats: inputs.coats,
      },
    });
  } else {
    if (inputs.doorCount === undefined) {
      throw new PricingError('invalid_inputs', 'doorCount is required for cabinets');
    }
    if (!Number.isFinite(inputs.doorCount) || inputs.doorCount < 1) {
      throw new PricingError('quantity_out_of_bounds', 'doorCount must be at least 1');
    }
    const doors = Math.round(inputs.doorCount);
    lines.push({
      id: 'coating',
      label: 'Cabinet doors and drawer fronts — ' + coatsLabel,
      kind: 'coating',
      cents: Math.round(doors * rules.cabinetRateCentsPerDoor * coatFactor),
      detail: {
        quantity: doors,
        unitLabel: 'fronts',
        rateCents: rules.cabinetRateCentsPerDoor,
        coats: inputs.coats,
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
      label: 'Mobilisation',
      kind: 'mobilization',
      cents: rules.mobilizationFeeCents,
    });
  }

  return finaliseQuote<PaintingInputs>({
    lines,
    minimumJobCents: rules.minimumJobCents,
    rangeSpreadPct: rules.rangeSpreadPct,
    modifiersApplied: mods.applied,
    inputs: {
      ...inputs,
      ...(measure === 'area' ? { areaSqft: area } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// result renderer
// ---------------------------------------------------------------------------

/**
 * Placeholder, deliberately matching epoxy's. The real renderer is written in
 * the turn that generalises the widget machine, because that is the turn it is
 * first mounted — building a bespoke painting renderer before then would ship
 * a component nothing renders, against a breakdown shape nothing has read yet.
 */
function PaintingResultRenderer(props: ResultRendererProps) {
  return (
    <div className="rounded-milled border bg-sheet p-4 font-data text-sm">
      <p className="text-rule">PaintingResultRenderer</p>
      <pre className="overflow-x-auto">{JSON.stringify(props, null, 2)}</pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// the module
// ---------------------------------------------------------------------------

export const paintingVertical: VerticalModule<PaintingInputs, PaintingPricingRules> = {
  id: 'painting',
  displayName: 'Interior & Exterior Painting',
  copy,
  surfaceTypes,
  finishes,
  colourCollections,
  steps,
  inputSchema: paintingInputSchema,
  pricingRuleSchema: paintingPricingRuleSchema,
  price: pricePainting,
  vision,
  ResultRenderer: PaintingResultRenderer,

  finishCatalogue: legacyFinishCatalogue(finishes, colourCollections),
  photoAnalysisPrompt: BASE_PROMPT,
};

