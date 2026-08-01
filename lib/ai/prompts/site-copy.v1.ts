import { z } from 'zod';
import type { BuiltPrompt } from './types';

/**
 * lib/ai/prompts/site-copy.v1.ts
 *
 * VERSIONED, and the version is written to ai_jobs.prompt_version on every
 * run. When copy quality changes you need to know whether the model changed
 * or the prompt did, and "v1 wrote the good ones" is only answerable if the
 * row says which prompt produced it. Never edit a shipped version in place —
 * copy the file to v2 and point the registry at it.
 *
 * The SYSTEM half is constant per version, which is exactly what makes it
 * cacheable. Everything that varies per prospect lives in the user half.
 */

export const SITE_COPY_PROMPT_VERSION = 'site_copy.v1';

export const siteCopyInputSchema = z.object({
  /** What the admin typed. The whole reason this is not a template. */
  intent: z.string().trim().min(10).max(1200),
  vertical: z.string().trim().min(2).max(60),
  market: z.string().trim().min(2).max(60),
  business_name: z.string().trim().min(1).max(80).optional(),
  tone: z.enum(['plain', 'warm', 'premium', 'no-nonsense']).default('plain'),
  /** Real differentiators, one per line. Not marketing adjectives. */
  differentiators: z.string().trim().max(600).optional(),
});

export type SiteCopyInput = z.infer<typeof siteCopyInputSchema>;

const SYSTEM = `You write website copy for home-service contractors. You are given one trade and one metro area, and you return copy for that contractor's lead-capture page.

HOW TO WRITE
- Write to the homeowner, not about the contractor. They have a problem in their garage and thirty seconds.
- Plain verbs, sentence case, no filler. Specific always beats clever.
- Name what the customer controls and recognises. Never name how the system works.
- A label labels, an example demonstrates. Nothing does double duty.
- CTAs say what happens next: "Get my quote", not "Submit".

HARD RULES — output that breaks any of these is rejected by a validator, not by a person
1. NEVER state, imply or bracket a price, a rate, a discount or a dollar figure. The quoting engine owns every number the customer sees. Copy that names a price is copy the quote cannot honour.
2. NEVER invent a credential, a licence number, a warranty length, an award, a year founded, or a review count. If you were not told it, it does not exist. Write around it.
3. NEVER leave a placeholder of any kind: no [City], no {{trade}}, no <NAME>. Use the values you were given.
4. Write about THIS trade in THIS market. Copy that would work for any contractor anywhere is a failure of the assignment.

OUTPUT
Return ONLY a JSON object. No prose before it, no code fences, no commentary after it. Exactly these keys:

{
  "headline": string (12-80 chars),
  "subheadline": string (24-200 chars),
  "primary_cta": string (2-28 chars),
  "secondary_cta": string (2-28 chars),
  "value_props": [ { "title": string (3-48), "body": string (20-240) } ]  (3 to 6 items),
  "process_steps": [ { "title": string (3-48), "body": string (20-240) } ]  (3 to 5 items, in the order they happen),
  "faq": [ { "question": string (8-140), "answer": string (20-500) } ]  (3 to 8 items),
  "trust_line": string (10-140),
  "meta_title": string (10-60),
  "meta_description": string (50-160)
}`;

export function buildSiteCopyPrompt(input: SiteCopyInput): BuiltPrompt {
  const lines = [
    `Trade: ${input.vertical}`,
    `Market: ${input.market}`,
    input.business_name ? `Business name: ${input.business_name}` : null,
    `Tone: ${input.tone}`,
    input.differentiators
      ? `True differentiators (use only these as factual claims):\n${input.differentiators}`
      : 'True differentiators: none supplied. Make no factual claims about the business.',
    '',
    'What this page needs to do:',
    input.intent,
  ].filter((l): l is string => l !== null);

  return {
    version: SITE_COPY_PROMPT_VERSION,
    system: SYSTEM,
    user: lines.join('\n'),
  };
}
