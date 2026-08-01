import { z } from 'zod';
import { MAX_RELATIVE_STEP, QUOTE_PARAM_PATHS, quoteParamSchema } from '../schemas';
import type { BuiltPrompt } from './types';

/**
 * lib/ai/prompts/quote-params.v1.ts
 *
 * The only job here that touches money, and the one whose output is NEVER
 * applied without a human pressing Apply. The prompt is written to produce a
 * PROPOSAL a contractor can argue with: every line has a current value, a
 * proposed value, and a reason short enough to disagree with.
 *
 * temperature is pinned to 0 for this route in lib/ai/config.ts. Read that as
 * part of this prompt.
 */

export const QUOTE_PARAMS_PROMPT_VERSION = 'quote_params.v1';

export const quoteParamsInputSchema = z.object({
  intent: z.string().trim().min(10).max(1200),
  vertical: z.string().trim().min(2).max(60),
  market: z.string().trim().min(2).max(60),
  /** Current value of each knob. Only listed params may be proposed. */
  current_params: z
    .array(
      z.object({
        param: quoteParamSchema,
        value: z.number().finite(),
      })
    )
    .min(1)
    .max(11),
  /** Real observations: win rate, quote volume, competitor bids. Optional. */
  evidence: z.string().trim().max(2000).optional(),
});

export type QuoteParamsInput = z.infer<typeof quoteParamsInputSchema>;

const SYSTEM = `You propose adjustments to the pricing inputs of a contractor's quoting engine. You are advising a business owner who will read every line and can overrule you. You are not setting prices; you are recommending changes he applies or discards.

WHAT YOU MAY TOUCH — only these parameter ids, nothing else exists:
${QUOTE_PARAM_PATHS.map((p) => `- ${p}`).join('\n')}

UNITS — fixed per parameter, not your choice:
- base_rate_per_sqft: dollars_per_sqft (1 to 50)
- minimum_job_price, mobilization_fee: dollars (0 to 5000)
- every condition_modifier.* and finish_multiplier.*: multiplier (0.5 to 2)
- every area_discount.*: percent (0 to 40)

HARD RULES
1. NEVER output a total, a quote, or a price for a specific job. You adjust inputs. The engine multiplies. If you find yourself computing what a 600 sqft garage would cost, stop.
2. NEVER move a single parameter by more than ${Math.round(MAX_RELATIVE_STEP * 100)}% of its current value in one proposal. Bigger moves are rejected. If you believe a bigger move is right, propose the first ${Math.round(MAX_RELATIVE_STEP * 100)}% and say so in the summary.
3. Every adjustment needs a reason a contractor could disagree with. "Market rates are higher" is not a reason. "Three of the last five quotes over 900 sqft were lost, and the area discount is the only knob that moves those" is.
4. Propose FEW changes. Two well-argued moves beat eight guesses. Everything you considered and rejected goes in left_alone.
5. If the evidence you were given does not support a change, say so in the summary and propose the smallest defensible adjustment. Do not manufacture confidence.
6. risk_level is about the downside if you are wrong: "low" when the change is small and reversible, "high" when it could lose jobs before he notices.

OUTPUT
Return ONLY a JSON object. No prose, no code fences. Exactly these keys:

{
  "summary": string (20-600, what you are recommending overall and what you are unsure about),
  "risk_level": "low" | "medium" | "high",
  "adjustments": [ {
      "param": one of the ids above,
      "current_value": number (echo exactly what you were given),
      "proposed_value": number,
      "unit": the unit fixed for that param,
      "rationale": string (20-320),
      "confidence": number 0..1
  } ]  (1 to 8, each param at most once),
  "left_alone": [ parameter ids you considered and did not change ]
}`;

export function buildQuoteParamsPrompt(input: QuoteParamsInput): BuiltPrompt {
  const params = input.current_params
    .map((p) => `  ${p.param} = ${String(p.value)}`)
    .join('\n');

  const user = [
    `Trade: ${input.vertical}`,
    `Market: ${input.market}`,
    'Current parameters:',
    params,
    '',
    input.evidence ? `Evidence:\n${input.evidence}` : 'Evidence: none supplied.',
    '',
    'What he is asking for:',
    input.intent,
  ].join('\n');

  return { version: QUOTE_PARAMS_PROMPT_VERSION, system: SYSTEM, user };
}
