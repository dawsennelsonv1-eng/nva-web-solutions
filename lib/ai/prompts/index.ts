import type { AdminJobId } from '../schemas';
import {
  buildComponentRestylePrompt,
  componentRestyleInputSchema,
} from './component-restyle.v1';
import { buildQuoteParamsPrompt, quoteParamsInputSchema } from './quote-params.v1';
import { buildSiteCopyPrompt, siteCopyInputSchema } from './site-copy.v1';
import type { BuiltPrompt } from './types';

/**
 * lib/ai/prompts/index.ts — the one place a job id becomes a prompt.
 *
 * Input is validated HERE, before anything is sent anywhere. A job whose
 * input does not parse never reaches a provider, so a malformed admin request
 * costs zero cents rather than one failed call.
 */

export type PromptBuildResult =
  | { ok: true; prompt: BuiltPrompt; input: unknown }
  | { ok: false; issues: string[] };

export function buildPrompt(job: AdminJobId, rawInput: unknown): PromptBuildResult {
  switch (job) {
    case 'site_copy': {
      const parsed = siteCopyInputSchema.safeParse(rawInput);
      if (!parsed.success) return { ok: false, issues: issuesOf(parsed.error.issues) };
      return { ok: true, prompt: buildSiteCopyPrompt(parsed.data), input: parsed.data };
    }
    case 'component_restyle': {
      const parsed = componentRestyleInputSchema.safeParse(rawInput);
      if (!parsed.success) return { ok: false, issues: issuesOf(parsed.error.issues) };
      return {
        ok: true,
        prompt: buildComponentRestylePrompt(parsed.data),
        input: parsed.data,
      };
    }
    case 'quote_params': {
      const parsed = quoteParamsInputSchema.safeParse(rawInput);
      if (!parsed.success) return { ok: false, issues: issuesOf(parsed.error.issues) };
      return { ok: true, prompt: buildQuoteParamsPrompt(parsed.data), input: parsed.data };
    }
    default: {
      // Exhaustiveness: adding a JobId without a prompt fails the build here.
      const never: never = job;
      return { ok: false, issues: [`unknown job ${String(never)}`] };
    }
  }
}

function issuesOf(issues: Array<{ path: (string | number)[]; message: string }>): string[] {
  return issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`);
}

export type { BuiltPrompt } from './types';
export { SITE_COPY_PROMPT_VERSION } from './site-copy.v1';
export { COMPONENT_RESTYLE_PROMPT_VERSION } from './component-restyle.v1';
export { QUOTE_PARAMS_PROMPT_VERSION } from './quote-params.v1';
export { siteCopyInputSchema } from './site-copy.v1';
export { componentRestyleInputSchema } from './component-restyle.v1';
export { quoteParamsInputSchema } from './quote-params.v1';
