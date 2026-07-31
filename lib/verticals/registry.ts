import type { ComponentType } from 'react';
import type { ZodTypeAny } from 'zod';

/**
 * THE VERTICAL MODULE CONTRACT (Phase 1). Adding a vertical is a new module
 * registration, never a core rewrite (SPEC R-801/R-803).
 *
 * Architecture:
 *  - registry.ts (THIS FILE) is core. It defines the contract and the store.
 *    Phase 11's success test is that it never needs editing again.
 *  - manifest.ts is the ONE designated registration point. It belongs to the
 *    vertical surface, not the core: adding vertical #3 means creating its
 *    module directory and adding one import line there. NEW_VERTICAL.md
 *    (Phase 11) documents exactly that and nothing else.
 *  - Each vertical lives in lib/verticals/<id>/ and supplies everything the
 *    engine, the widget, and the admin need to speak its trade.
 */

// ---------------------------------------------------------------------------
// contract
// ---------------------------------------------------------------------------

export interface SurfaceTypeOption {
  id: string;
  /** Homeowner-facing label — step 1's "What are we coating?" choices. */
  label: string;
  /** The "not sure?" affordance: typical dimensions per surface (R-107). */
  typicalSqft: { label: string; sqft: number }[];
}

export interface FinishOption {
  id: string;
  label: string;
  /** Pricing tier key this finish resolves to inside quote_configs.rules. */
  tierKey: string;
  /** Real colour options — swatch hexes are DATA, not theme tokens. */
  colours: { id: string; label: string; hex: string }[];
}

export interface VerticalCopy {
  /** e.g. "epoxy garage floors" — slots into market-specific sentences. */
  tradeNoun: string;
  widgetTitle: string;
  step1Question: string;
  /** Degraded-flow strings live in OFFER.md and are homeowner-safe there. */
}

export interface ResultRendererProps {
  lowCents: number;
  highCents: number;
  breakdown: unknown; // Phase 3 types this against pricing.ts output
}

export interface VerticalModule {
  /** Registry id — referenced by prospects.vertical, quote_configs.vertical. */
  id: string;
  displayName: string;
  copy: VerticalCopy;
  surfaceTypes: SurfaceTypeOption[];
  finishCatalogue: FinishOption[];
  /**
   * Zod schema validating quote_configs.rules for this vertical. The pricing
   * engine (Phase 3) parses rules through this before computing anything —
   * a malformed config fails loudly at the boundary, never mid-quote.
   */
  pricingRuleSchema: ZodTypeAny;
  /** The photo-analysis prompt handed to the vision call for this trade. */
  photoAnalysisPrompt: string;
  /** Renders a computed quote in the trade's own voice. */
  ResultRenderer: ComponentType<ResultRendererProps>;
}

// ---------------------------------------------------------------------------
// store — deliberately boring; boring survives Phase 11
// ---------------------------------------------------------------------------

const registry = new Map<string, VerticalModule>();

export function registerVertical(mod: VerticalModule): void {
  if (registry.has(mod.id)) {
    // Registering twice means two files claim one id — always a bug.
    throw new Error(`Vertical '${mod.id}' is already registered.`);
  }
  registry.set(mod.id, mod);
}

export function getVertical(id: string): VerticalModule {
  const mod = registry.get(id);
  if (!mod) {
    throw new Error(
      `Unknown vertical '${id}'. Registered: ${[...registry.keys()].join(', ') || '(none — did manifest.ts run?)'}`
    );
  }
  return mod;
}

export function listVerticals(): VerticalModule[] {
  return [...registry.values()];
}
