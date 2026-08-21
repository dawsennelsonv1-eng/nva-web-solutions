import type { StepDescriptor } from '@/lib/verticals/registry';

/**
 * lib/demo/verticals.ts — published rate documents for the tools built after
 * epoxy.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS AND WHY THE NUMBERS ARE IN TYPESCRIPT
 * ============================================================================
 *
 * R-113 says a number that affects a price does not belong in TypeScript, and
 * every vertical module obeys it — rates arrive from quote_configs.rules.
 *
 * A PUBLIC DEMO HAS NO CONTRACTOR AND THEREFORE NO quote_configs ROW. It has to
 * price against something, and lib/demo/config.ts already answers that for
 * epoxy: DEMO_RULES is a TypeScript literal, published on the site as a
 * checkable claim. That is the documented exception, and this file is the same
 * exception applied to the trades built since.
 *
 * SO THESE ARE PUBLISHED CLAIMS, NOT DEFAULTS. Anyone can read them, and a
 * contractor is invited to check the arithmetic against a job he has done. They
 * are Dallas-Fort Worth mid-market numbers and they say so; a contractor in
 * another market will disagree with some of them, which is the correct
 * outcome — his own rates replace these entirely the moment he has a config.
 *
 * ============================================================================
 * THEY MATCH THE MIGRATIONS, DELIBERATELY AND EXACTLY
 * ============================================================================
 *
 * Every number below is the same as the corresponding row in
 * supabase/migrations 0025, 0026 and 0027, where the reasoning for each rate is
 * written out at length. This file does not restate that reasoning — it would
 * be a second copy that drifts. If a rate here disagrees with the migration,
 * the migration is right and this is stale.
 *
 * NOTHING IN THE APP READS vertical_rule_defaults. That was checked, not
 * assumed: no TypeScript in app/, lib/ or components/ references the table. It
 * is a provisioning record. That is precisely why these numbers have to exist
 * here as well for a demo to run at all.
 *
 * ============================================================================
 * PAINTING IS ABSENT ON PURPOSE
 * ============================================================================
 *
 * Its module is registered and prices its trade, but no defaults migration was
 * ever written for it, so there is no verified rate document to copy from.
 * Inventing one to fill the gap is the exact failure that pricerFor() returning
 * null exists to prevent. Painting keeps its QUIET_REASON until real rates
 * exist.
 */

export interface VerticalDemoDoc {
  /** The module's own rules shape. Validated by its pricingRuleSchema at use. */
  rules: unknown;
  /**
   * Bounds for the module's quantity control. The unit is whatever that
   * vertical measures in — square feet for landscaping, LINEAR feet for
   * fencing — and the widget labels it from the step, not from these names.
   */
  sqftMin: number;
  sqftMax: number;
  /** Which surface the demo opens on. Named, never surfaceTypes[0]. */
  defaultSurfaceTypeId: string;
  /** Shown under the widget so the demo never poses as a real company. */
  blurb: string;
}

export const VERTICAL_DEMOS: Record<string, VerticalDemoDoc> = {
  landscaping: {
    rules: {
      styleRateCentsPerSqft: {
        paver_patio: 1900,
        natural_stone: 2600,
        artificial_turf: 1200,
        gravel_xeriscape: 750,
        soft_landscape: 850,
        deck_pergola: 4500,
      },
      clearanceRateCentsPerSqft: { none: 0, light: 200, standard: 375, heavy: 800 },
      drainageRateCentsPerSqft: 300,
      conditionModifiers: [
        { id: 'steep_slope', label: 'Steep slope or terracing', pctAdjust: 0.15 },
        { id: 'poor_access', label: 'No machine access', pctAdjust: 0.12 },
        { id: 'drainage_issues', label: 'Drainage problems', pctAdjust: 0.08 },
        { id: 'tree_work', label: 'Large trees or roots', pctAdjust: 0.1 },
        { id: 'retaining_wall', label: 'Retaining wall needed', pctAdjust: 0.2 },
      ],
      minimumJobCents: 250000,
      mobilizationFeeCents: 45000,
      rangeSpreadPct: 0.18,
    },
    sqftMin: 100,
    sqftMax: 20000,
    defaultSurfaceTypeId: 'back_yard',
    blurb:
      'Rates shown are Dallas-Fort Worth mid-market. A contractor running this tool sets his own.',
  },

  cabinets: {
    rules: {
      doorRateCentsPerFront: {
        brushed: 8000,
        sprayed_lacquer: 11500,
        conversion_varnish: 15000,
        stain_refinish: 13500,
        glazed: 17500,
      },
      drawerRateCentsPerFront: {
        brushed: 4500,
        sprayed_lacquer: 6500,
        conversion_varnish: 8800,
        stain_refinish: 8000,
        glazed: 10000,
      },
      boxRateCentsPerLinearFt: 4200,
      prepRateCentsPerFront: { light: 800, standard: 1800, heavy: 3800 },
      hardwareRateCentsPerPiece: 900,
      conditionModifiers: [
        { id: 'grain_filling', label: 'Open grain to fill (oak)', pctAdjust: 0.22 },
        { id: 'heavy_grease', label: 'Heavy grease build-up', pctAdjust: 0.12 },
        { id: 'glass_fronts', label: 'Glass-panel doors', pctAdjust: 0.08 },
        { id: 'water_damage', label: 'Water-damaged fronts', pctAdjust: 0.15 },
        { id: 'two_tone', label: 'Two colours', pctAdjust: 0.06 },
      ],
      minimumJobCents: 120000,
      mobilizationFeeCents: 27500,
      rangeSpreadPct: 0.15,
    },
    /* Inert here, as in the migration: nothing in a cabinet quote is measured in
       area. The module's own step controls carry the real limits. */
    sqftMin: 1,
    sqftMax: 100000,
    defaultSurfaceTypeId: 'kitchen',
    blurb:
      'Rates shown are Dallas-Fort Worth mid-market, per door front. A contractor running this tool sets his own.',
  },

  fencing: {
    rules: {
      styleRateCentsPerLinearFt: {
        chain_link: 1600,
        wood_privacy: 3200,
        wood_premium: 4800,
        horizontal_modern: 5500,
        vinyl: 3600,
        ornamental_metal: 4200,
        masonry_column: 11000,
      },
      walkGateCents: 37500,
      driveGateCents: 110000,
      removalRateCentsPerLinearFt: 600,
      conditionModifiers: [
        { id: 'rocky_ground', label: 'Rock or caliche', pctAdjust: 0.18 },
        { id: 'height_8ft', label: 'Eight foot height', pctAdjust: 0.25 },
        { id: 'sloped_ground', label: 'Sloped ground', pctAdjust: 0.12 },
        { id: 'trees_on_line', label: 'Trees on the line', pctAdjust: 0.1 },
        { id: 'restricted_access', label: 'No machine access', pctAdjust: 0.1 },
      ],
      minimumJobCents: 150000,
      mobilizationFeeCents: 25000,
      rangeSpreadPct: 0.15,
    },
    /* LINEAR feet, not square. 20 is a gate-to-corner run; 2000 covers a large
       rural perimeter. Epoxy's floor-area bounds would reject a 70ft side. */
    sqftMin: 20,
    sqftMax: 2000,
    defaultSurfaceTypeId: 'back_yard',
    blurb:
      'Rates shown are Dallas-Fort Worth mid-market, per linear foot. A contractor running this tool sets his own.',
  },
};

export function hasVerticalDemo(verticalId: string): boolean {
  return verticalId in VERTICAL_DEMOS;
}

export function verticalDemoFor(verticalId: string): VerticalDemoDoc | null {
  return VERTICAL_DEMOS[verticalId] ?? null;
}

/** The modifier list a widget config needs, derived from the published rules. */
export function demoModifiers(verticalId: string): { id: string; label: string }[] {
  const doc = VERTICAL_DEMOS[verticalId];
  if (!doc) return [];
  const rules = doc.rules as { conditionModifiers?: { id: string; label: string }[] };
  return (rules.conditionModifiers ?? []).map((m) => ({ id: m.id, label: m.label }));
}

/**
 * Re-exported so a caller can type the steps it passes through without
 * importing the registry directly.
 */
export type { StepDescriptor };
