import 'server-only';
import { PROVIDER_ENDPOINTS } from '../config';
import { OpenAiCompatibleProvider } from './openai-compatible';

/**
 * lib/ai/providers/openai.ts — api.openai.com/v1.
 *
 * VERIFY — max_completion_tokens is the current field name on
 * /chat/completions; max_tokens is deprecated and rejected outright by the
 * reasoning models. If you route this provider at a model old enough to
 * refuse the new name, flip maxTokensField in this file, not in the adapter.
 *
 * Caching is automatic above roughly 1k prompt tokens and needs nothing on the
 * wire, which is why supportsPromptCaching is true while cache-related fields
 * are never sent.
 */
export const openaiProvider = new OpenAiCompatibleProvider({
  id: 'openai',
  label: 'OpenAI',
  apiKeyEnv: PROVIDER_ENDPOINTS.openai.apiKeyEnv,
  baseUrlEnv: PROVIDER_ENDPOINTS.openai.baseUrlEnv,
  defaultBaseUrl: PROVIDER_ENDPOINTS.openai.defaultBaseUrl,
  maxTokensField: 'max_completion_tokens',
  sendStreamOptions: true,
  supportsVision: true,
  supportsJsonMode: true,
  supportsPromptCaching: true,
});
