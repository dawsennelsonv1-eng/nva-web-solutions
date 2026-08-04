import 'server-only';
import { PROVIDER_ENDPOINTS } from '../config';
import { OpenAiCompatibleProvider } from './openai-compatible';

/**
 * lib/ai/providers/openrouter.ts — one account, one balance, one invoice, for
 * Claude, GPT and Kimi.
 *
 * WHY THIS IS NOT JUST `compatible` WITH A URL. It could have been, and it was
 * for one push. It is its own adapter now because the two behave differently
 * in the three places that matter operationally:
 *
 *  1. A DEFAULT BASE URL IS CORRECT HERE and wrong there. `compatible` refuses
 *     to guess where to send your prompts, which is right for an anonymous
 *     escape hatch. OpenRouter is a named vendor with one documented endpoint,
 *     so hardcoding it removes an env var you could get wrong rather than
 *     removing a safeguard.
 *  2. IT CAN RUN OUT. Every other provider fails on a bad key or a rate limit;
 *     this one also fails when a prepaid balance hits zero, which surfaces as
 *     402. That is mapped explicitly below so the router falls through to a
 *     direct key instead of treating an empty wallet as a mystery.
 *  3. ATTRIBUTION HEADERS. OpenRouter reads HTTP-Referer and X-Title to label
 *     traffic in your dashboard. Without them every job in the ledger is
 *     anonymous, which defeats the point of consolidating billing in the first
 *     place: you would have one invoice and no idea what was on it.
 *
 * PRICING, so nobody has to guess later: OpenRouter passes each provider's
 * published per-token rate through with NO markup and takes its cut when you
 * buy credits — 5.5% on card top-ups with a $0.80 minimum, about 5% on crypto.
 * The rate table in config.ts multiplies list price by that fee, because a
 * spend ceiling built on list price under-reports what actually leaves the
 * account.
 *
 * MODEL IDS ARE NAMESPACED: 'anthropic/claude-sonnet-5', not
 * 'claude-sonnet-5'. A bare id is a 400, which classifies as 'invalid_request'
 * — deliberately NOT retryable, because asking a second vendor to run our
 * malformed request just spends twice before failing the same way. Every slug
 * in config.ts is env-overridable so a correction is a Vercel change, not a
 * redeploy.
 *
 * CACHING IS DECLARED UNSUPPORTED and that is a real cost. OpenRouter can pass
 * Anthropic cache_control through, but this adapter does not send it, so a
 * cached system prompt is billed as a fresh one. On the admin routes, which
 * send a large fixed system prompt, the lost cache discount can exceed the
 * 5.5% several times over — which is why config.ts keeps a direct Anthropic
 * candidate second in every chain.
 */
export const openrouterProvider = new OpenAiCompatibleProvider({
  id: 'openrouter',
  label: 'OpenRouter',
  apiKeyEnv: PROVIDER_ENDPOINTS.openrouter.apiKeyEnv,
  baseUrlEnv: PROVIDER_ENDPOINTS.openrouter.baseUrlEnv,
  defaultBaseUrl: PROVIDER_ENDPOINTS.openrouter.defaultBaseUrl,
  // OpenRouter accepts the old field name across its whole catalogue, which
  // max_completion_tokens is not guaranteed to be for non-OpenAI upstreams.
  maxTokensField: 'max_tokens',
  // VERIFY — OpenRouter documents stream_options.include_usage support. If a
  // streamed job starts reporting estimated tokens in the admin panel, this is
  // the flag that is wrong; flipping it to false costs accuracy, not calls.
  sendStreamOptions: true,
  supportsVision: true,
  supportsJsonMode: true,
  supportsPromptCaching: false,
  extraHeaders: () => ({
    // Both are optional to OpenRouter and omitted when unset — an empty header
    // is worse than no header, because it registers as an app named "".
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? '',
    'X-Title': process.env.OPENROUTER_APP_NAME ?? 'NVA Digital Solutions',
  }),
});
