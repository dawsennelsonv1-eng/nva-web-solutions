import { z } from 'zod';
import type { AdminJobId } from './types';

/**
 * lib/ai/schemas.ts — the shape each job MUST return, and the boundaries the
 * model is not allowed to cross.
 *
 * These are not type annotations. They are the last thing standing between a
 * model's confident paragraph and a contractor's live site, so they encode
 * three product rules that no prompt can be trusted to hold on its own:
 *
 *  1. COPY NEVER QUOTES A PRICE. Prices come from the deterministic engine.
 *     A headline saying "$3/sqft" is a number the quoting engine did not
 *     produce and cannot honour.
 *  2. RESTYLE PICKS FROM A MENU. Tokens are enums, never raw CSS or hex. The
 *     brand engine owns colour; a model emitting #hex would silently overrule
 *     the contractor's own palette.
 *  3. PRICING MOVES ARE SMALL AND BOUNDED. A proposal to double the base rate
 *     is not a proposal, it is a mistake with a rationale attached.
 *
 * No 'server-only' here: the admin panel renders previews from these types.
 */

// ---------------------------------------------------------------------------
// shared guards
// ---------------------------------------------------------------------------

/** $1,200 · 3.50/sq ft · 15% off — anything that reads as a committed price. */
const PRICE_PATTERN = /(\$\s?\d)|(\d+\s?(?:usd|dollars))|(\d+(?:\.\d+)?\s?%\s?off)/i;

/** [City], {{trade}}, <NAME> — a template hole that shipped is worse than none. */
const PLACEHOLDER_PATTERN = /(\[[^\]]+\])|(\{\{[^}]+\}\})|(<[A-Z_]{3,}>)/;

const HEX_PATTERN = /#[0-9a-f]{3,8}\b/i;

function copyText(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !PRICE_PATTERN.test(v), {
      message: 'must not state a price — the quoting engine owns every number a customer sees',
    })
    .refine((v) => !PLACEHOLDER_PATTERN.test(v), {
      message: 'must not contain an unfilled placeholder',
    });
}

// ---------------------------------------------------------------------------
// job (a) — site copy
// ---------------------------------------------------------------------------

export const siteCopySchema = z.object({
  headline: copyText(12, 80),
  subheadline: copyText(24, 200),
  primary_cta: copyText(2, 28),
  secondary_cta: copyText(2, 28),
  value_props: z
    .array(z.object({ title: copyText(3, 48), body: copyText(20, 240) }))
    .min(3)
    .max(6),
  process_steps: z
    .array(z.object({ title: copyText(3, 48), body: copyText(20, 240) }))
    .min(3)
    .max(5),
  faq: z
    .array(z.object({ question: copyText(8, 140), answer: copyText(20, 500) }))
    .min(3)
    .max(8),
  /** One line of credibility. No invented certifications — see the prompt. */
  trust_line: copyText(10, 140),
  meta_title: copyText(10, 60),
  meta_description: copyText(50, 160),
});

export type SiteCopy = z.infer<typeof siteCopySchema>;

// ---------------------------------------------------------------------------
// job (b) — component restyle
// ---------------------------------------------------------------------------

export const restyleTokensSchema = z.object({
  density: z.enum(['compact', 'regular', 'roomy']),
  corner_radius: z.enum(['none', 'sm', 'md', 'lg', 'pill']),
  elevation: z.enum(['flat', 'hairline', 'raised']),
  accent_role: z.enum(['brand', 'neutral', 'contrast']),
  emphasis: z.enum(['quiet', 'balanced', 'loud']),
  heading_scale: z.enum(['sm', 'md', 'lg', 'xl']),
  motion: z.enum(['none', 'subtle', 'expressive']),
  alignment: z.enum(['left', 'center']),
});

export type RestyleTokens = z.infer<typeof restyleTokensSchema>;

export const componentRestyleSchema = z.object({
  component_id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/i, 'component_id must be a plain id, not a description'),
  intent_summary: z
    .string()
    .trim()
    .min(10)
    .max(240)
    .refine((v) => !HEX_PATTERN.test(v), { message: 'must not name a colour value' }),
  tokens: restyleTokensSchema,
  changes: z
    .array(
      z.object({
        token: restyleTokensSchema.keyof(),
        from: z.string().trim().min(1).max(32),
        to: z.string().trim().min(1).max(32),
        why: z.string().trim().min(10).max(200),
      })
    )
    .min(1)
    .max(8),
  /** What it deliberately left alone. Forces the model to be surgical. */
  kept: z.array(z.string().trim().min(1).max(64)).max(8),
});

export type ComponentRestyle = z.infer<typeof componentRestyleSchema>;

// ---------------------------------------------------------------------------
// job (c) — quoting parameters
// ---------------------------------------------------------------------------

/**
 * The CLOSED list of parameters a model is allowed to have an opinion about.
 * Adding one here is a deliberate act; the model cannot invent a knob.
 *
 * VERIFY — these ids must match the parameter keys the Phase 2 pricing engine
 * actually reads. They are validated as strings here and applied by a handler
 * that has not been wired yet (see lib/ai/apply.ts), so a mismatch surfaces at
 * apply time as a clean rejection rather than a bad price.
 */
export const quoteParamSchema = z.enum([
  'base_rate_per_sqft',
  'minimum_job_price',
  'mobilization_fee',
  'condition_modifier.oil_heavy',
  'condition_modifier.cracking_moderate',
  'condition_modifier.previous_coating',
  'finish_multiplier.solid',
  'finish_multiplier.flake',
  'finish_multiplier.quartz',
  'area_discount.500_1000',
  'area_discount.1000_plus',
]);

export const QUOTE_PARAM_PATHS = quoteParamSchema.options;

export const quoteUnitSchema = z.enum([
  'multiplier',
  'dollars',
  'dollars_per_sqft',
  'percent',
]);

/** Unit is not the model's choice — each knob has exactly one. */
const PARAM_UNITS: Record<string, z.infer<typeof quoteUnitSchema>> = {
  base_rate_per_sqft: 'dollars_per_sqft',
  minimum_job_price: 'dollars',
  mobilization_fee: 'dollars',
  'condition_modifier.oil_heavy': 'multiplier',
  'condition_modifier.cracking_moderate': 'multiplier',
  'condition_modifier.previous_coating': 'multiplier',
  'finish_multiplier.solid': 'multiplier',
  'finish_multiplier.flake': 'multiplier',
  'finish_multiplier.quartz': 'multiplier',
  'area_discount.500_1000': 'percent',
  'area_discount.1000_plus': 'percent',
};

/** Absolute floors and ceilings per unit. Outside these it is not a proposal. */
const UNIT_BOUNDS: Record<z.infer<typeof quoteUnitSchema>, { min: number; max: number }> = {
  multiplier: { min: 0.5, max: 2 },
  dollars: { min: 0, max: 5000 },
  dollars_per_sqft: { min: 1, max: 50 },
  percent: { min: 0, max: 40 },
};

/**
 * The largest single move allowed, as a fraction of the current value. A
 * contractor reviewing eleven knobs cannot sanity-check a 3x swing on each
 * one; capping the step is what keeps human review meaningful instead of
 * ceremonial.
 */
export const MAX_RELATIVE_STEP = 0.4;

const adjustmentSchema = z.object({
  param: quoteParamSchema,
  current_value: z.number().finite(),
  proposed_value: z.number().finite(),
  unit: quoteUnitSchema,
  rationale: z.string().trim().min(20).max(320),
  confidence: z.number().min(0).max(1),
});

export const quoteParamsSchema = z
  .object({
    summary: z.string().trim().min(20).max(600),
    risk_level: z.enum(['low', 'medium', 'high']),
    adjustments: z.array(adjustmentSchema).min(1).max(8),
    /** What it looked at and chose not to touch. */
    left_alone: z.array(quoteParamSchema).max(11),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.adjustments.forEach((adj, i) => {
      if (seen.has(adj.param)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['adjustments', i, 'param'],
          message: `${adj.param} appears more than once`,
        });
      }
      seen.add(adj.param);

      const expectedUnit = PARAM_UNITS[adj.param];
      if (expectedUnit && adj.unit !== expectedUnit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['adjustments', i, 'unit'],
          message: `${adj.param} is measured in ${expectedUnit}, not ${adj.unit}`,
        });
      }

      const bounds = UNIT_BOUNDS[adj.unit];
      if (bounds && (adj.proposed_value < bounds.min || adj.proposed_value > bounds.max)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['adjustments', i, 'proposed_value'],
          message: `must be between ${bounds.min} and ${bounds.max} for ${adj.unit}`,
        });
      }

      if (adj.proposed_value === adj.current_value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['adjustments', i, 'proposed_value'],
          message: 'is identical to current_value — list it in left_alone instead',
        });
      }

      if (adj.current_value !== 0) {
        const step = Math.abs(adj.proposed_value - adj.current_value) / Math.abs(adj.current_value);
        if (step > MAX_RELATIVE_STEP) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['adjustments', i, 'proposed_value'],
            message: `moves ${adj.param} by ${Math.round(step * 100)}%, over the ${Math.round(
              MAX_RELATIVE_STEP * 100
            )}% single-step limit`,
          });
        }
      }
    });
  });

export type QuoteParams = z.infer<typeof quoteParamsSchema>;

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

export type { AdminJobId } from './types';

export const JOB_SCHEMAS = {
  site_copy: siteCopySchema,
  component_restyle: componentRestyleSchema,
  quote_params: quoteParamsSchema,
} as const;

export type JobPayload<J extends AdminJobId> = z.infer<(typeof JOB_SCHEMAS)[J]>;
