import 'server-only';
import { PROVIDER_ENDPOINTS } from '../config';
import { OpenAiCompatibleProvider } from './openai-compatible';

/**
 * lib/ai/providers/compatible.ts — the escape hatch: Together, Groq, OpenRouter,
 * DeepSeek, a self-hosted vLLM, anything that speaks /chat/completions.
 *
 * NO DEFAULT BASE URL, deliberately. An adapter that guesses where to send
 * your prompts is an adapter that can send them somewhere you did not choose.
 * With AI_COMPATIBLE_BASE_URL unset this provider reports itself unconfigured
 * and the router skips it.
 *
 * Conservative defaults: old-style max_tokens, no stream_options, no caching
 * claim. Vision is declared supported because the field format is standard,
 * but whether the model behind the URL can see is your call, not ours.
 */
export const compatibleProvider = new OpenAiCompatibleProvider({
  id: 'compatible',
  label: 'OpenAI-compatible',
  apiKeyEnv: PROVIDER_ENDPOINTS.compatible.apiKeyEnv,
  baseUrlEnv: PROVIDER_ENDPOINTS.compatible.baseUrlEnv,
  defaultBaseUrl: PROVIDER_ENDPOINTS.compatible.defaultBaseUrl,
  maxTokensField: 'max_tokens',
  sendStreamOptions: false,
  supportsVision: true,
  supportsJsonMode: true,
  supportsPromptCaching: false,
});
