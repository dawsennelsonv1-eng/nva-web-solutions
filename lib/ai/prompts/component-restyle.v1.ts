import { z } from 'zod';
import { restyleTokensSchema } from '../schemas';
import type { BuiltPrompt } from './types';

/**
 * lib/ai/prompts/component-restyle.v1.ts
 *
 * This job proposes a CONFIG, not CSS. The model picks from a fixed menu of
 * tokens and the app maps tokens to classes. That boundary is the whole
 * safety story: a model that could emit CSS could emit `display:none` on a
 * lead form, and lead capture never stops.
 */

export const COMPONENT_RESTYLE_PROMPT_VERSION = 'component_restyle.v1';

export const componentRestyleInputSchema = z.object({
  intent: z.string().trim().min(10).max(1200),
  component_id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/i, 'component id must be a plain id'),
  /** Where it sits, so the model can reason about neighbours. */
  surface: z.enum(['hub', 'demo', 'prototype', 'admin']).default('prototype'),
  current_tokens: restyleTokensSchema,
});

export type ComponentRestyleInput = z.infer<typeof componentRestyleInputSchema>;

const SYSTEM = `You restyle one component in a contractor's lead-capture site by choosing style tokens from a fixed menu. You do not write CSS, you do not name colours, and you do not change what the component says or does.

THE MENU — every token must be one of these exact values
- density: compact | regular | roomy
- corner_radius: none | sm | md | lg | pill
- elevation: flat | hairline | raised
- accent_role: brand | neutral | contrast
- emphasis: quiet | balanced | loud
- heading_scale: sm | md | lg | xl
- motion: none | subtle | expressive
- alignment: left | center

HARD RULES
1. NEVER output a hex code, an rgb() value, a colour name, a pixel size, a class name or any CSS. The brand engine owns colour; naming one overrules the contractor's own palette.
2. Change only what the intent asks for. Every token you move must earn its place in "changes" with a reason. Tokens you deliberately left alone go in "kept".
3. Spend boldness in one place. If you move emphasis to loud, keep the rest quiet. A component where everything shouts reads as broken, not confident.
4. motion: expressive is only ever justified on a component the user is waiting on. Never on a form.

OUTPUT
Return ONLY a JSON object. No prose, no code fences. Exactly these keys:

{
  "component_id": string (echo the id you were given),
  "intent_summary": string (10-240, what you changed and why, in one breath),
  "tokens": { "density":…, "corner_radius":…, "elevation":…, "accent_role":…, "emphasis":…, "heading_scale":…, "motion":…, "alignment":… }  (ALL eight, menu values only — this is the complete new state, not a patch),
  "changes": [ { "token": one of the eight names, "from": string, "to": string, "why": string (10-200) } ]  (1 to 8, only tokens that actually differ),
  "kept": [ string ]  (0 to 8, tokens or qualities you deliberately did not touch)
}`;

export function buildComponentRestylePrompt(input: ComponentRestyleInput): BuiltPrompt {
  const current = Object.entries(input.current_tokens)
    .map(([k, v]) => `  ${k}: ${String(v)}`)
    .join('\n');

  const user = [
    `Component: ${input.component_id}`,
    `Surface: ${input.surface}`,
    'Current tokens:',
    current,
    '',
    'What to change:',
    input.intent,
  ].join('\n');

  return { version: COMPONENT_RESTYLE_PROMPT_VERSION, system: SYSTEM, user };
}
