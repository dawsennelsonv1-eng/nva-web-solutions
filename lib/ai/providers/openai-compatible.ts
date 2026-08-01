import 'server-only';
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
 * lib/ai/providers/openai-compatible.ts — POST {base}/chat/completions.
 *
 * OpenAI, Moonshot and every self-hosted gateway worth using speak this same
 * dialect, so there is ONE implementation and three sets of options rather
 * than three near-identical files that will drift.
 *
 * THE ONE REAL DIFFERENCE FROM ANTHROPIC, and it is a costing trap: OpenAI
 * counts cached tokens INSIDE prompt_tokens, while Anthropic reports them
 * outside input_tokens. If you normalize naively you bill cached tokens twice
 * on one vendor. We subtract here, so TokenUsage means the same thing on all
 * four adapters: inputTokens is tokens charged at the full input rate.
 */

export interface OpenAiCompatibleOptions {
  id: ProviderId;
  label: string;
  apiKeyEnv: string;
  baseUrlEnv: string;
  defaultBaseUrl: string | null;
  /**
   * OpenAI deprecated max_tokens in favour of max_completion_tokens; most
   * compatible servers only understand the old name. Wrong choice here is a
   * 400, which is why it is configuration and not a guess at call time.
   */
  maxTokensField: 'max_tokens' | 'max_completion_tokens';
  /** Only OpenAI reliably honours stream_options.include_usage. */
  sendStreamOptions: boolean;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  supportsPromptCaching: boolean;
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: ChatUsage;
  model?: string;
}

type OpenAiPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function toOpenAiContent(content: ChatMessage['content']): string | OpenAiPart[] {
  if (typeof content === 'string') return content;
  return content.map((part: ContentPart): OpenAiPart => {
    if (part.type === 'image') {
      return {
        type: 'image_url',
        image_url: { url: `data:${part.mediaType};base64,${part.base64}` },
      };
    }
    return { type: 'text', text: part.text };
  });
}

function toUsage(u: ChatUsage | undefined): TokenUsage {
  const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
  const prompt = u?.prompt_tokens ?? 0;
  return {
    inputTokens: Math.max(0, prompt - cached),
    outputTokens: u?.completion_tokens ?? 0,
    cachedInputTokens: cached,
    // These vendors cache automatically; there is no separate write charge.
    cacheWriteTokens: 0,
    estimated: false,
  };
}

export class OpenAiCompatibleProvider extends BaseProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly supportsVision: boolean;
  readonly supportsJsonMode: boolean;
  readonly supportsPromptCaching: boolean;
  private readonly opts: OpenAiCompatibleOptions;

  constructor(opts: OpenAiCompatibleOptions) {
    super();
    this.opts = opts;
    this.id = opts.id;
    this.label = opts.label;
    this.supportsVision = opts.supportsVision;
    this.supportsJsonMode = opts.supportsJsonMode;
    this.supportsPromptCaching = opts.supportsPromptCaching;
  }

  isConfigured(): boolean {
    return Boolean(process.env[this.opts.apiKeyEnv]) && this.resolvedBaseUrl() !== null;
  }

  configHint(): string {
    return this.opts.defaultBaseUrl
      ? this.opts.apiKeyEnv
      : `${this.opts.apiKeyEnv} and ${this.opts.baseUrlEnv}`;
  }

  private resolvedBaseUrl(): string | null {
    const raw = process.env[this.opts.baseUrlEnv] ?? this.opts.defaultBaseUrl;
    if (!raw) return null;
    return raw.replace(/\/+$/, '');
  }

  private requireConfig(): { apiKey: string; baseUrl: string } {
    const apiKey = process.env[this.opts.apiKeyEnv];
    const baseUrl = this.resolvedBaseUrl();
    if (!apiKey || !baseUrl) {
      throw new AiError({
        code: 'not_configured',
        message: `${this.configHint()} is not set`,
        provider: this.id,
      });
    }
    return { apiKey, baseUrl };
  }

  private body(req: CompletionRequest, stream: boolean): Record<string, unknown> {
    const messages: Array<{ role: string; content: string | OpenAiPart[] }> = [];
    if (req.system !== undefined) messages.push({ role: 'system', content: req.system });
    for (const m of req.messages) {
      messages.push({ role: m.role, content: toOpenAiContent(m.content) });
    }

    const body: Record<string, unknown> = { model: req.model, messages };
    body[this.opts.maxTokensField] = req.maxOutputTokens;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.jsonMode && this.supportsJsonMode) {
      body.response_format = { type: 'json_object' };
    }
    if (stream) {
      body.stream = true;
      if (this.opts.sendStreamOptions) body.stream_options = { include_usage: true };
    }
    return body;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const { apiKey, baseUrl } = this.requireConfig();
    const deadline = new RequestDeadline(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, req.signal);
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(this.body(req, false)),
        signal: deadline.signal,
      });

      if (!res.ok) {
        throw new AiError({
          code: classifyStatus(res.status),
          message: `${this.id} ${res.status}`,
          provider: this.id,
          status: res.status,
          detail: await readErrorBody(res),
        });
      }

      const json = (await res.json()) as ChatResponse;
      const choice = json.choices?.[0];
      const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';

      if (choice?.finish_reason === 'content_filter') {
        throw new AiError({
          code: 'content_filter',
          message: `${this.id} refused the prompt`,
          provider: this.id,
        });
      }

      return {
        text,
        usage: toUsage(json.usage),
        provider: this.id,
        model: json.model ?? req.model,
        stopReason: choice?.finish_reason ?? null,
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
    const { apiKey, baseUrl } = this.requireConfig();
    const deadline = new RequestDeadline(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, req.signal);
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          accept: 'text/event-stream',
        },
        body: JSON.stringify(this.body(req, true)),
        signal: deadline.signal,
      });

      if (!res.ok) {
        throw new AiError({
          code: classifyStatus(res.status),
          message: `${this.id} ${res.status}`,
          provider: this.id,
          status: res.status,
          detail: await readErrorBody(res),
        });
      }

      let text = '';
      let usage: TokenUsage = { ...EMPTY_USAGE };
      let stopReason: string | null = null;
      let model = req.model;
      let sawUsage = false;

      for await (const evt of readSseEvents(res)) {
        if (evt.data === '[DONE]') break;
        const payload = parseJsonOrNull(evt.data) as
          | {
              choices?: Array<{
                delta?: { content?: string | null };
                finish_reason?: string | null;
              }>;
              usage?: ChatUsage;
              model?: string;
            }
          | null;
        if (!payload) continue;

        if (typeof payload.model === 'string') model = payload.model;
        const choice = payload.choices?.[0];
        const piece = choice?.delta?.content;
        if (typeof piece === 'string' && piece.length > 0) {
          text += piece;
          onDelta(piece);
        }
        if (choice?.finish_reason) stopReason = choice.finish_reason;
        if (payload.usage) {
          usage = toUsage(payload.usage);
          sawUsage = true;
        }
      }

      // Providers that do not return usage on a stream still charge for it.
      // Estimating and flagging it beats reporting a confident zero.
      if (!sawUsage) {
        usage = {
          ...EMPTY_USAGE,
          inputTokens: estimateTokens(JSON.stringify(this.body(req, false))),
          outputTokens: estimateTokens(text),
          estimated: true,
        };
      }

      return { text, usage, provider: this.id, model, stopReason };
    } catch (e) {
      throw abortToAiError(e, deadline, this.id);
    } finally {
      deadline.dispose();
    }
  }
}
