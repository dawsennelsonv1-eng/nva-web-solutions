import { z } from 'zod';
import type { VerticalModule, ResultRendererProps } from '@/lib/verticals/registry';

/**
 * EPOXY — the launch vertical, registered FULLY (Phase 1 requirement).
 * Concrete & epoxy floor coating, Dallas market.
 *
 * Note the boundary: everything here is CONTENT and SCHEMA. Rates themselves
 * live in quote_configs.rules per prototype (CONVENTIONS.md 9) — this module
 * defines the SHAPE those rules must satisfy, never the numbers.
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
// photo-analysis prompt — returns the structured JSON Phase 3 Zod-validates
// ---------------------------------------------------------------------------

const photoAnalysisPrompt = `You are classifying a photo of a floor for a concrete coating estimate. Respond with ONLY a JSON object, no prose, matching exactly:
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

export const epoxyVertical: VerticalModule = {
  id: 'epoxy',
  displayName: 'Concrete & Epoxy Floor Coating',
  copy: {
    tradeNoun: 'epoxy floor coating',
    widgetTitle: 'Price your floor',
    step1Question: 'What are we coating?',
  },
  surfaceTypes: [
    {
      id: 'garage',
      label: 'Garage',
      typicalSqft: [
        { label: '1-car garage', sqft: 250 },
        { label: '2-car garage', sqft: 480 },
        { label: '3-car garage', sqft: 700 },
      ],
    },
    {
      id: 'patio',
      label: 'Patio',
      typicalSqft: [
        { label: 'Small patio', sqft: 150 },
        { label: 'Standard patio', sqft: 300 },
        { label: 'Large patio', sqft: 500 },
      ],
    },
    {
      id: 'commercial',
      label: 'Commercial',
      typicalSqft: [
        { label: 'Small shop bay', sqft: 1000 },
        { label: 'Warehouse section', sqft: 2500 },
        { label: 'Full floor', sqft: 5000 },
      ],
    },
  ],
  finishCatalogue: [
    {
      id: 'decorative_flakes',
      label: 'Decorative Flakes',
      tierKey: 'flake',
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
      id: 'metallic_epoxy',
      label: 'Metallic Epoxy',
      tierKey: 'metallic',
      colours: [
        { id: 'titanium', label: 'Titanium', hex: '#9BA1A6' },
        { id: 'copper_burl', label: 'Copper Burl', hex: '#9C5B33' },
        { id: 'midnight_pearl', label: 'Midnight Pearl', hex: '#1E2733' },
        { id: 'slate_storm', label: 'Slate Storm', hex: '#55606B' },
        { id: 'desert_bronze', label: 'Desert Bronze', hex: '#7D6242' },
      ],
    },
    {
      id: 'solid_polyaspartic',
      label: 'Solid Polyaspartic',
      tierKey: 'solid_polyaspartic',
      colours: [
        { id: 'light_gray', label: 'Light Gray', hex: '#C6C9C7' },
        { id: 'dove', label: 'Dove', hex: '#AFAFA9' },
        { id: 'beige', label: 'Beige', hex: '#C9B99A' },
        { id: 'charcoal', label: 'Charcoal', hex: '#4A4D50' },
        { id: 'safety_red_zone', label: 'Safety Red Zone', hex: '#A33327' },
      ],
    },
  ],
  pricingRuleSchema: epoxyPricingRuleSchema,
  photoAnalysisPrompt,
  ResultRenderer: EpoxyResultRenderer,
};
