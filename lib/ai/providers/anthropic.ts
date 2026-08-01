import 'server-only';
import { PROVIDER_ENDPOINTS } from '../config';
import { AiError, classifyStatus } from '../errors';
import {
  EMPTY_USAGE,
  estimateTokens,
  type ChatMessage,
  type CompletionRequest,
  type CompletionResult,
  type ContentPart,
  type ProviderId,
  type TokenUsage,
} from '../types';
import {
  abortToAiError,
  BaseProvider,
  DEFAULT_TIMEOUT_MS,
  parseJsonOrNull,
  readErrorBody,
  readSseEvents,
  RequestDeadline,
} from './base';

/**
 * lib/ai/providers/anthropic.ts — /v1/messages.
 *
 * PARITY REQUIREMENT: when called with no system prompt, no temperature and
 * cache off, the body this adapter sends is byte-identical to the one Phase 3
 * sent by hand — { model, max_tokens, messages } and nothing else. That is
 * what lets lib/quote/vision.ts move onto this layer without its behaviour,
 * its cost or its failure modes changing.
 *
 * VERIFY — prompt caching is sent as cache_control on the system block with no
 * beta header, which is the GA form. If your account is pinned to an older
 * API version this will be ignored (a silent cost increase, not an error).
 */

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface AnthropicResponse {
  content?: AnthropicTextBlock[];
  usage?: AnthropicUsage;
  stop_reason?: string | null;
  model?: string;
}

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

function toAnthropicContent(content: ChatMessage['content']): string | AnthropicBlock[] {
  if (typeof content === 'string') return content;
  return content.map((part: ContentPart): AnthropicBlock => {
    if (part.type === 'image') {
      return {
        type: 'image',
        source: { type: 'base64', media_type: part.mediaType, data: part.base64 },
      };
    }
    return { type: 'text', text: part.text };
  });
}

function toUsage(u: AnthropicUsage | undefined): TokenUsage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cachedInputTokens: u?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
    estimated: false,
  };
}

export class AnthropicProvider extends BaseProvider {
  readonly id: ProviderId = 'anthropic';
  readonly label = 'Anthropic';
  readonly supportsVision = true;
  /** No response_format on this API. JSON is asked for in the prompt. */
  readonly supportsJsonMode = false;
  readonly supportsPromptCaching = true;

  isConfigured(): boolean {
    return Boolean(process.env[PROVIDER_ENDPOINTS.anthropic.apiKeyEnv]);
  }

  configHint(): string {
    return PROVIDER_ENDPOINTS.anthropic.apiKeyEnv;
  }

  private baseUrl(): string {
    const cfg = PROVIDER_ENDPOINTS.anthropic;
    const raw = process.env[cfg.baseUrlEnv] ?? cfg.defaultBaseUrl ?? '';
    return raw.replace(/\/+$/, '');
  }

  private headers(apiKey: string): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  private body(req: CompletionRequest, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: req.model,
      // HARD CAP per call. Bounds the worst case if a model ever decides to
      // narrate instead of answer.
      max_tokens: req.maxOutputTokens,
      messages: req.messages.map((m) => ({
        role: m.role,
        content: toAnthropicContent(m.content),
      })),
    };
    if (req.system !== undefined) {
      body.system = req.cache
        ? [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }]
        : req.system;
    }
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (stream) body.stream = true;
    return body;
  }

  private key(): string {
    const apiKey = process.env[PROVIDER_ENDPOINTS.anthropic.apiKeyEnv];
    if (!apiKey) {
      throw new AiError({
        code: 'not_configured',
        message: `${PROVIDER_ENDPOINTS.anthropic.apiKeyEnv} is not set`,
        provider: this.id,
      });
    }
    return apiKey;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const apiKey = this.key();
    const deadline = new RequestDeadline(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, req.signal);
    try {
      const res = await fetch(`${this.baseUrl()}/messages`, {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify(this.body(req, false)),
        signal: deadline.signal,
      });

      if (!res.ok) {
        throw new AiError({
          code: classifyStatus(res.status),
          message: `anthropic ${res.status}`,
          provider: this.id,
          status: res.status,
          detail: await readErrorBody(res),
        });
      }

      const json = (await res.json()) as AnthropicResponse;
      const text = (json.content ?? [])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('');

      return {
        text,
        usage: toUsage(json.usage),
        provider: this.id,
        model: json.model ?? req.model,
        stopReason: json.stop_reason ?? null,
      };
    } catch (e) {
      throw abortToAiError(e, deadline, this.id);
    } finally {
      deadline.dispose();
    }
  }

  async streamComplete(
    req: CompletionRequest,
    onDelta: (delta: string) => void
  ): Promise<CompletionResult> {
    const apiKey = this.key();
    const deadline = new RequestDeadline(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, req.signal);
    try {
      const res = await fetch(`${this.baseUrl()}/messages`, {
        method: 'POST',
        headers: { ...this.headers(apiKey), accept: 'text/event-stream' },
        body: JSON.stringify(this.body(req, true)),
        signal: deadline.signal,
      });

      if (!res.ok) {
        throw new AiError({
          code: classifyStatus(res.status),
          message: `anthropic ${res.status}`,
          provider: this.id,
          status: res.status,
          detail: await readErrorBody(res),
        });
      }

      let text = '';
      let usage: TokenUsage = { ...EMPTY_USAGE };
      let stopReason: string | null = null;
      let model = req.model;

      for await (const evt of readSseEvents(res)) {
        const payload = parseJsonOrNull(evt.data) as Record<string, unknown> | null;
        if (!payload) continue;
        const type = typeof payload.type === 'string' ? payload.type : evt.event;

        if (type === 'message_start') {
          const message = payload.message as
            | { usage?: AnthropicUsage; model?: string }
            | undefined;
          usage = toUsage(message?.usage);
          if (typeof message?.model === 'string') model = message.model;
        } else if (type === 'content_block_delta') {
          const delta = payload.delta as { type?: string; text?: string } | undefined;
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            text += delta.text;
            onDelta(delta.text);
          }
        } else if (type === 'message_delta') {
          const u = payload.usage as AnthropicUsage | undefined;
          if (u?.output_tokens !== undefined) usage.outputTokens = u.output_tokens;
          const delta = payload.delta as { stop_reason?: string | null } | undefined;
          if (delta?.stop_reason !== undefined) stopReason = delta.stop_reason;
        } else if (type === 'error') {
          const err = payload.error as { message?: string } | undefined;
          throw new AiError({
            code: 'provider_error',
            message: err?.message ?? 'anthropic stream error',
            provider: this.id,
          });
        }
      }

      // A stream that ends before message_start leaves us with no usage. We
      // still spent money, so we estimate rather than report zero.
      if (usage.inputTokens === 0 && usage.outputTokens === 0 && text.length > 0) {
        usage = { ...usage, outputTokens: estimateTokens(text), estimated: true };
      }

      return { text, usage, provider: this.id, model, stopReason };
    } catch (e) {
      throw abortToAiError(e, deadline, this.id);
    } finally {
      deadline.dispose();
    }
  }
}

export const anthropicProvider = new AnthropicProvider();
