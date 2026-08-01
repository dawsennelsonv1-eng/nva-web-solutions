import 'server-only';
import { AiError, toAiError } from '../errors';
import {
  addUsage,
  EMPTY_USAGE,
  type ChatMessage,
  type CompletionRequest,
  type CompletionResult,
  type ProviderId,
  type RepairOptions,
  type StructuredRequest,
  type StructuredResult,
} from '../types';

/**
 * lib/ai/providers/base.ts — the contract, plus everything that would
 * otherwise be copied four times.
 *
 * completeStructured() lives HERE, not in each adapter, because "parse, then
 * validate, then repair exactly once, then fail loudly" is a policy decision
 * about our money and our data, not a property of any vendor's HTTP API. If
 * each adapter owned it, four adapters would drift into four different numbers
 * of retries and we would find out from a bill.
 */

export interface AiProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly supportsVision: boolean;
  readonly supportsJsonMode: boolean;
  readonly supportsPromptCaching: boolean;
  /** True when a key (and, for the generic adapter, a base URL) is present. */
  isConfigured(): boolean;
  /** Human-readable name of the env var this adapter needs. For error copy. */
  configHint(): string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  streamComplete(
    req: CompletionRequest,
    onDelta: (delta: string) => void
  ): Promise<CompletionResult>;
}

/**
 * The default repair wording. lib/quote/vision.ts passes its own so the exact
 * sentences Phase 3 sent to the model are still the sentences it sends.
 */
export const DEFAULT_REPAIR: RepairOptions = {
  enabled: true,
  invalidJsonMessage:
    'That was not valid JSON. Reply with ONLY the JSON object described above, no prose and no code fences.',
  schemaMessagePrefix: 'That JSON did not match the required shape. Problems: ',
  schemaMessageSuffix: '. Reply with ONLY a corrected JSON object.',
};

export const DEFAULT_TIMEOUT_MS = 60_000;

export abstract class BaseProvider implements AiProvider {
  abstract readonly id: ProviderId;
  abstract readonly label: string;
  abstract readonly supportsVision: boolean;
  abstract readonly supportsJsonMode: boolean;
  abstract readonly supportsPromptCaching: boolean;

  abstract isConfigured(): boolean;
  abstract configHint(): string;
  abstract complete(req: CompletionRequest): Promise<CompletionResult>;
  abstract streamComplete(
    req: CompletionRequest,
    onDelta: (delta: string) => void
  ): Promise<CompletionResult>;

  /**
   * ONE call, ONE repair retry, then fail loudly.
   *
   * The repair attempt sends the model its own malformed output plus the
   * validator's complaint. It is worth exactly one try: the failure it fixes
   * (a stray sentence before the JSON, a missing field) is common and cheap,
   * while a second repair on a model that has already failed twice is money
   * spent on a coin flip.
   *
   * Only the FIRST attempt streams. Streaming the repair too would splice a
   * second half-formed JSON object into the pane the admin is reading.
   */
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const repair = req.repair ?? DEFAULT_REPAIR;
    const messages: ChatMessage[] = [...req.messages];
    const maxAttempts = repair.enabled ? 2 : 1;
    let usage = EMPTY_USAGE;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const call: CompletionRequest = {
        model: req.model,
        messages,
        maxOutputTokens: req.maxOutputTokens,
        system: req.system,
        temperature: req.temperature,
        jsonMode: req.jsonMode,
        cache: req.cache,
        timeoutMs: req.timeoutMs,
        signal: req.signal,
      };

      let result: CompletionResult;
      try {
        result =
          attempt === 0 && req.onDelta
            ? await this.streamComplete(call, req.onDelta)
            : await this.complete(call);
      } catch (e) {
        // Tokens burned on earlier attempts were still billed. They travel
        // with the error so the caller can record what the failure cost.
        throw toAiError(e, this.id).withUsage(usage);
      }

      usage = addUsage(usage, result.usage);
      const isLastAttempt = attempt === maxAttempts - 1;

      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJsonObject(result.text));
      } catch {
        if (!isLastAttempt) {
          req.onRepair?.('invalid_json', 'the reply was not JSON');
          messages.push({ role: 'assistant', content: result.text });
          messages.push({ role: 'user', content: repair.invalidJsonMessage });
          continue;
        }
        throw new AiError({
          code: 'invalid_json',
          message: 'model did not return JSON',
          provider: this.id,
          usage,
          detail: result.text.slice(0, 400),
        });
      }

      const validated = req.schema.safeParse(parsed);
      if (!validated.success) {
        const complaint = validated.error.issues
          .map((i) => i.path.join('.') + ': ' + i.message)
          .join('; ');
        if (!isLastAttempt) {
          req.onRepair?.('schema', complaint);
          messages.push({ role: 'assistant', content: result.text });
          messages.push({
            role: 'user',
            content: repair.schemaMessagePrefix + complaint + repair.schemaMessageSuffix,
          });
          continue;
        }
        throw new AiError({
          code: 'schema',
          message: 'model output failed validation',
          provider: this.id,
          usage,
          detail: complaint,
        });
      }

      return {
        data: validated.data,
        usage,
        provider: this.id,
        model: result.model,
        attempts: attempt + 1,
      };
    }

    // Unreachable: the loop either returns or throws. Present so the function
    // has no implicit undefined path if maxAttempts is ever made configurable.
    throw new AiError({ code: 'provider_error', provider: this.id, usage });
  }
}

// ---------------------------------------------------------------------------
// shared plumbing
// ---------------------------------------------------------------------------

/** Models sometimes wrap JSON in fences despite instructions. Strip, do not fail. */
export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced && fenced[1]) return fenced[1].trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

/**
 * A deadline that covers the WHOLE call including reading a streamed body.
 * AbortSignal.timeout would do this in one line, but it cannot be combined
 * with the caller's own signal on every Node version Vercel may run, and a
 * hung stream that ignores the deadline is exactly the failure that would keep
 * a serverless function billing until it is killed.
 */
export class RequestDeadline {
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly external: AbortSignal | undefined;
  private readonly onExternalAbort: () => void;
  private timedOut = false;

  constructor(timeoutMs: number, external?: AbortSignal) {
    this.signal = this.controller.signal;
    this.external = external;
    this.timer = setTimeout(() => {
      this.timedOut = true;
      this.controller.abort();
    }, timeoutMs);
    this.onExternalAbort = () => this.controller.abort();
    if (external) {
      if (external.aborted) this.controller.abort();
      else external.addEventListener('abort', this.onExternalAbort);
    }
  }

  /** Turns an abort into the right code: our deadline, or the caller leaving. */
  reason(): 'timeout' | 'aborted' {
    return this.timedOut ? 'timeout' : 'aborted';
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.external?.removeEventListener('abort', this.onExternalAbort);
  }
}

/** Turns an aborted fetch into the correct AiError before it reaches the router. */
export function abortToAiError(
  e: unknown,
  deadline: RequestDeadline,
  provider: ProviderId
): AiError {
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
    return new AiError({
      code: deadline.reason() === 'timeout' ? 'timeout' : 'aborted',
      message: deadline.reason() === 'timeout' ? 'request timed out' : 'request cancelled',
      provider,
    });
  }
  return toAiError(e, provider);
}

/** Body text of a failed response, bounded — vendor error pages can be huge. */
export async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 400);
  } catch {
    return '';
  }
}

/**
 * Minimal SSE reader. Every provider here speaks the same wire format:
 * `event:` and `data:` lines, blank line terminates. Written by hand rather
 * than pulled from a package — it is thirty lines, and a native-binary
 * dependency in the hot path of a paid call is not worth the saving.
 */
export async function* readSseEvents(
  res: Response
): AsyncGenerator<{ event: string | null; data: string }> {
  const body = res.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseSseBlock(raw);
        if (parsed) yield parsed;
        boundary = buffer.indexOf('\n\n');
      }
    }
    const tail = parseSseBlock(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function parseSseBlock(block: string): { event: string | null; data: string } | null {
  const lines = block.split('\n');
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

/** Safe JSON.parse for stream chunks: a malformed chunk is skipped, not fatal. */
export function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
