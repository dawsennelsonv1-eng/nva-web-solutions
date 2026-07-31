import { z } from 'zod';
import type { VerticalModule, ResultRendererProps } from '@/lib/verticals/registry';

/**
 * PAINTING — Phase 1 STUB. Exists for exactly one reason: to prove the
 * registry contract holds for a second trade WITHOUT touching any core file.
 * Phase 11 replaces this content with the real module (interior/exterior
 * residential repaint) — replacing CONTENT in this directory, still touching
 * zero core files. If Phase 11 cannot do that, the contract failed and gets
 * fixed before NEW_VERTICAL.md is written.
 */

export const paintingPricingRuleSchema = z
  .object({
    baseRateCentsPerSqft: z.object({
      standard: z.number().int().positive(),
      premium: z.number().int().positive(),
    }),
    prepRateCentsPerSqft: z.number().int().nonnegative(),
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

function PaintingResultRenderer(props: ResultRendererProps) {
  return (
    <div className="rounded-milled border bg-sheet p-4 font-data text-sm">
      <p className="text-rule">PaintingResultRenderer (stub)</p>
      <pre className="overflow-x-auto">{JSON.stringify(props, null, 2)}</pre>
    </div>
  );
}

export const paintingVertical: VerticalModule = {
  id: 'painting',
  displayName: 'Residential Painting (stub)',
  copy: {
    tradeNoun: 'painting',
    widgetTitle: 'Price your repaint',
    step1Question: 'What are we painting?',
  },
  surfaceTypes: [
    {
      id: 'interior',
      label: 'Interior',
      typicalSqft: [{ label: 'Standard bedroom', sqft: 400 }],
    },
    {
      id: 'exterior',
      label: 'Exterior',
      typicalSqft: [{ label: 'Single-story home', sqft: 1800 }],
    },
  ],
  finishCatalogue: [
    {
      id: 'standard_finish',
      label: 'Standard',
      tierKey: 'standard',
      colours: [{ id: 'swatch_white', label: 'Builder White', hex: '#EDEBE4' }],
    },
  ],
  pricingRuleSchema: paintingPricingRuleSchema,
  photoAnalysisPrompt:
    'Stub prompt — replaced wholesale in Phase 11. Do not call in production.',
  ResultRenderer: PaintingResultRenderer,
};
