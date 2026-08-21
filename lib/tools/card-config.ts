import {
  DEFAULT_TIER,
  REFERENCE_FINISHES,
  REFERENCE_RULES,
  REFERENCE_SQFT_MAX,
  REFERENCE_SQFT_MIN,
} from '@/lib/site/reference-rates';
import type { ToolCardFinish, ToolCardPricer } from '@/components/site/ToolCard';

/**
 * lib/tools/card-config.ts — everything needed to mount a live ToolCard.
 *
 * ============================================================================
 * WHY THIS WAS EXTRACTED
 * ============================================================================
 *
 * The card now appears in two places: the homepage deck, and the top of each
 * tool's own page. Both need the same tint, the same swatches, the same pricer
 * wiring and the same allowlist.
 *
 * Before this file, all of that lived inside ToolDeck. Copying it into the tool
 * page would have created two definitions of what is public and two rate
 * documents — and the first time they disagreed, one surface would price a job
 * differently from the other while both looked correct. This is the kind of
 * duplication that does not announce itself.
 *
 * ============================================================================
 * PUBLIC_TOOLS LIVES HERE NOW, AND IT IS STILL PRESENTATION
 * ============================================================================
 *
 * It was duplicated in ToolDeck and in the tool page route, each with a comment
 * telling the other to stay in step. Three surfaces was the threshold for
 * lifting it, as those comments said.
 *
 * It is deliberately NOT in lib/queue: that is a data layer, and what is shown
 * to the public is a presentation decision. Filtering here never replaces the
 * registry reconciliation in getQueueSections() — a tool still has to genuinely
 * be in service before this list can decide whether to show it.
 *
 * NOTE: the DIRECTORY at /demo intentionally ignores this list. It shows
 * unfinished tools with a tag, which is the whole point of that page.
 */

/**
 * Ordered. Only these appear on the homepage deck.
 *
 * PHASE 87 — the five registered verticals, epoxy first. Every one of them has
 * a queue row, a catalogue page and a module that prices the trade, so each has
 * a page worth linking to.
 *
 * A TOOL IN THIS LIST DOES NOT NECESSARILY HAVE A LIVE DEMO. That is decided
 * separately by PRICERS below, and only epoxy has one. A card without a pricer
 * still renders its copy, its status and its links, and states plainly why
 * there is no demo. Listing it is a claim that the tool exists; the pricer is a
 * claim that its rates are published. Those are different claims and the site
 * makes them separately on purpose.
 */
export const PUBLIC_TOOLS: readonly string[] = [
  'epoxy',
  'landscaping',
  'cabinets',
  'fencing',
  'painting',
];

/**
 * Per-card gradient stops, drawn from the 15A palette. Distinct per tool so
 * cards feel individually alive; durations are deliberately not round numbers
 * so two cards side by side never pulse in lockstep.
 */
export const TINTS: Record<string, { a: string; b: string; durationSeconds: number }> = {
  epoxy: { a: 'rgba(201, 112, 47, 0.34)', b: 'rgba(38, 72, 112, 0.30)', durationSeconds: 34 },
  painting: { a: 'rgba(22, 84, 70, 0.30)', b: 'rgba(38, 72, 112, 0.26)', durationSeconds: 41 },
  /* PHASE 87. Each drawn from the trade rather than at random — green for a
     yard, a warm timber for cabinets, a cool slate for fencing — and every
     duration a different prime-ish number so no two cards in the deck ever
     pulse together. */
  landscaping: { a: 'rgba(79, 107, 58, 0.32)', b: 'rgba(38, 72, 112, 0.24)', durationSeconds: 29 },
  cabinets: { a: 'rgba(176, 123, 78, 0.30)', b: 'rgba(60, 64, 69, 0.26)', durationSeconds: 43 },
  fencing: { a: 'rgba(90, 92, 94, 0.32)', b: 'rgba(22, 84, 70, 0.24)', durationSeconds: 31 },
};

export const DEFAULT_TINT = {
  a: 'rgba(38, 72, 112, 0.28)',
  b: 'rgba(22, 84, 70, 0.24)',
  durationSeconds: 37,
};

export function tintFor(toolId: string) {
  return TINTS[toolId] ?? DEFAULT_TINT;
}

/**
 * Swatch colours for finish chips, used ONLY where the photograph is missing.
 *
 * VERIFY: read off the epoxy module's own colour deck — Tuxedo from Flake
 * Blends, Copper Burl from Metallic Pours, Charcoal from Solid Colours. A
 * representative colour of the family, not a claim that a product matches this
 * hex on screen. The chip is captioned with the finish type either way, so the
 * swatch is never the only thing telling a visitor what he is choosing.
 */
const SWATCH: Record<string, string> = {
  flake: '#3B3B3F',
  metallic: '#9C5B33',
  solid_polyaspartic: '#4A4D50',
};

/** Tools with a published rate document. Absence is meaningful. */
const PRICERS: Record<
  string,
  { verticalId: string; surfaceTypeId: string; surfaceLabel: string; defaultSqft: number }
> = {
  epoxy: {
    verticalId: 'epoxy',
    surfaceTypeId: 'garage',
    surfaceLabel: 'garage',
    // A two-car garage — the middle typical dimension in the epoxy module.
    defaultSqft: 480,
  },
};

/**
 * Why a card has no live demo. One entry per tool in PUBLIC_TOOLS without a
 * pricer — an unexplained missing demo reads as broken rather than as unfinished.
 *
 * PHASE 87 EXTENDED THIS RATHER THAN INVENTING PRICERS. Every reason below is
 * the same reason: lib/site/reference-rates.ts holds ONE rate document and it
 * is epoxy's — its tier keys are flake, metallic and solid polyaspartic, and
 * its bounds are floor areas. There is nothing there for a fence run or a door
 * count to price against.
 *
 * Filling PRICERS by pointing these tools at epoxy's rates would produce a card
 * that quotes confidently in the wrong units. The honest fix is a per-vertical
 * reference rate document, published on the site the way epoxy's is, which is a
 * real piece of work and a positioning decision rather than a wiring one.
 */
export const QUIET_REASON: Record<string, string> = {
  painting:
    'The module prices this trade and the arithmetic is written down. There is no live demo on this page yet, because the published rate document a demo prices against does not exist for painting.',
  landscaping:
    'The module prices this trade and the arithmetic is written down. There is no live demo on this page yet, because the published rate document a demo prices against does not exist for landscaping.',
  cabinets:
    'The module prices this trade by the door front and the arithmetic is written down. There is no live demo on this page yet, because the published rate document a demo prices against does not exist for cabinet refinishing.',
  fencing:
    'The module prices this trade by the linear foot and the arithmetic is written down. There is no live demo on this page yet, because the published rate document a demo prices against does not exist for fencing.',
};

const FINISHES: ToolCardFinish[] = REFERENCE_FINISHES.map((f) => ({
  id: f.id,
  label: f.label,
  tierKey: f.tierKey,
  swatchHex: SWATCH[f.tierKey],
}));

/**
 * Returns null for a tool with no published rate document — which is every
 * tool except epoxy. The card renders with its copy and its links but no
 * controls, and states why. Inventing rates to fill the space is the failure
 * this returning null exists to prevent.
 */
export function pricerFor(toolId: string): ToolCardPricer | null {
  const spec = PRICERS[toolId];
  if (!spec) return null;
  return {
    verticalId: spec.verticalId,
    surfaceTypeId: spec.surfaceTypeId,
    surfaceLabel: spec.surfaceLabel,
    rules: REFERENCE_RULES,
    finishes: FINISHES,
    sqftMin: REFERENCE_SQFT_MIN,
    sqftMax: REFERENCE_SQFT_MAX,
    defaultSqft: spec.defaultSqft,
    defaultTier: DEFAULT_TIER,
  };
}

