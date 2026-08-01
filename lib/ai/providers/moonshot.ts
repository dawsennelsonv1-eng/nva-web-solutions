import 'server-only';
import { PROVIDER_ENDPOINTS } from '../config';
import { OpenAiCompatibleProvider } from './openai-compatible';

/**
 * lib/ai/providers/moonshot.ts — Moonshot AI (Kimi), OpenAI-compatible.
 *
 * VERIFY — three things about this vendor differ from OpenAI and all three
 * will bite silently rather than loudly:
 *  1. Base URL is regional. api.moonshot.ai is the international endpoint;
 *     mainland accounts use api.moonshot.cn and the keys are not
 *     interchangeable — the wrong pairing returns 401, which this layer will
 *     read as 'auth' and fall through to the next provider.
 *  2. stream_options.include_usage is not honoured, so streamed calls report
 *     ESTIMATED tokens. Non-streamed calls report real ones. Cost shown for a
 *     streamed Kimi job is an approximation and the panel says so.
 *  3. Context caching is explicit and per-account rather than automatic, so it
 *     is declared unsupported here. Nothing is sent, nothing is billed for it.
 */
export const moonshotProvider = new OpenAiCompatibleProvider({
  id: 'moonshot',
  label: 'Moonshot (Kimi)',
  apiKeyEnv: PROVIDER_ENDPOINTS.moonshot.apiKeyEnv,
  baseUrlEnv: PROVIDER_ENDPOINTS.moonshot.baseUrlEnv,
  defaultBaseUrl: PROVIDER_ENDPOINTS.moonshot.defaultBaseUrl,
  maxTokensField: 'max_tokens',
  sendStreamOptions: false,
  supportsVision: true,
  supportsJsonMode: true,
  supportsPromptCaching: false,
});
