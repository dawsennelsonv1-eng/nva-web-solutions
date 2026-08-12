import { NextResponse } from 'next/server';
import { AI_ROUTES, PROVIDER_ENDPOINTS } from '@/lib/ai/config';
import { resolveModel } from '@/lib/ai/router';
import { imageModelChain } from '@/lib/ai/images';

/**
 * app/api/health/models/route.ts — DO THE MODELS WE CONFIGURED STILL EXIST?
 *
 * ============================================================================
 * WHY THIS ROUTE EXISTS
 * ============================================================================
 *
 * The same bug has now been found twice in this codebase, in two different
 * subsystems, and both times it took a person reading source code to spot it:
 *
 *   - `google/gemini-3-pro` sat at position two of the vision chain. The slug
 *     had never existed. OpenRouter answered 404, classifyStatus mapped it to
 *     'invalid_request', and the router BROKE OUT of the loop — so candidates
 *     three and four were unreachable and floor measurement was dead for
 *     weeks with nothing on screen to say so.
 *
 *   - The image chain carries `black-forest-labs/flux.2-flex` and
 *     `openai/gpt-image-1`, neither of which appears in OpenRouter's chat
 *     catalogue. They may be perfectly valid in the IMAGES catalogue, which is
 *     a separate list at a separate endpoint. Nobody knows. That is the
 *     problem.
 *
 * A model slug is a string in a config file that silently stops being true.
 * Nothing in a type system can catch it, nothing in a build can catch it, and
 * the runtime failure it produces is indistinguishable from a provider outage.
 * The only thing that catches it is asking the provider, so this route asks.
 *
 * ============================================================================
 * IT ASKS BOTH CATALOGUES, BECAUSE THERE ARE TWO
 * ============================================================================
 *
 * `/api/v1/models` lists chat and vision models. `/api/v1/images/models` lists
 * image-generation models. THEY ARE DIFFERENT LISTS. A grep of the first for
 * an image slug proves nothing about the second — which is exactly the trap
 * that made the flux question unanswerable from the outside.
 *
 * So a slug is reported healthy if it appears in the catalogue APPROPRIATE TO
 * ITS JOB, and the response says which catalogue was consulted.
 *
 * ============================================================================
 * WHAT IT DOES NOT DO
 * ============================================================================
 *
 * It does not spend anything. Both catalogue endpoints are public, take no
 * API key, and return a list. Nothing here runs a completion, so this can be
 * hit as often as you like and will never appear in the ai_jobs ledger.
 *
 * It does not check whether a model can do the JOB — whether it accepts
 * images, how long its context is, what it costs. Those are real questions and
 * this is not the tool for them. It answers one question: does this string
 * name something that exists.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CHAT_CATALOGUE = 'https://openrouter.ai/api/v1/models';
const IMAGE_CATALOGUE = 'https://openrouter.ai/api/v1/images/models';

interface CatalogueEntry {
  id?: unknown;
}

interface Verdict {
  job: string;
  position: number;
  provider: string;
  model: string;
  /** Which env var, if any, is currently overriding the committed default. */
  overriddenBy: string | null;
  status: 'ok' | 'missing' | 'unchecked';
  note?: string;
}

/**
 * Fetch one catalogue into a set of ids.
 *
 * Returns null rather than throwing on any failure. A health check that
 * crashes when the thing it monitors is unreachable is a health check that
 * tells you nothing on the one day you need it — the caller reports
 * 'unchecked' and says why, which is honest and actionable.
 */
async function loadCatalogue(url: string): Promise<Set<string> | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      // Never cached. A stale catalogue is precisely the failure being hunted.
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const data = (body as { data?: unknown })?.data;
    if (!Array.isArray(data)) return null;
    const ids = new Set<string>();
    for (const row of data as CatalogueEntry[]) {
      if (typeof row?.id === 'string') {
        /**
         * `:batch` and the leading `~` are OpenRouter's own decorations on
         * variants of the same underlying model. A configured slug is compared
         * against the bare id, so `anthropic/claude-opus-4.6` matches whether
         * or not the catalogue also lists `anthropic/claude-opus-4.6:batch`.
         */
        ids.add(row.id);
        const bare = row.id.replace(/^~/, '').replace(/:batch$/, '');
        ids.add(bare);
      }
    }
    return ids;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  /**
   * OPTIONAL TOKEN GATE.
   *
   * Nothing secret is returned — model ids are already visible to any operator
   * running the card with `?debug=1`, and the catalogues themselves are public.
   * But a competitor reading which models a contractor's quoting tool runs on
   * is free intelligence, so the route can be locked by setting
   * AI_HEALTH_TOKEN in Vercel and calling it with `?token=`.
   *
   * UNSET MEANS OPEN, deliberately. A diagnostic nobody can reach because it
   * needs a secret nobody has configured is a diagnostic that does not exist,
   * and the whole point of this route is to be reachable from a phone at the
   * moment something breaks. Set the token once the fire is out.
   */
  const required = process.env.AI_HEALTH_TOKEN?.trim();
  if (required) {
    const supplied = new URL(request.url).searchParams.get('token');
    if (supplied !== required) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
  }

  const [chat, images] = await Promise.all([
    loadCatalogue(CHAT_CATALOGUE),
    loadCatalogue(IMAGE_CATALOGUE),
  ]);

  const verdicts: Verdict[] = [];

  // ---- every candidate of every routed job --------------------------------
  for (const [job, route] of Object.entries(AI_ROUTES)) {
    route.chain.forEach((candidate, i) => {
      const model = resolveModel(candidate);
      const override =
        candidate.modelEnv && process.env[candidate.modelEnv]?.trim()
          ? candidate.modelEnv
          : null;

      /**
       * ONLY OPENROUTER SLUGS ARE CHECKABLE HERE.
       *
       * A direct-Anthropic or direct-OpenAI candidate names a model in that
       * vendor's own namespace, which this catalogue does not list. Reporting
       * those as 'missing' would fill the response with false alarms and train
       * whoever reads it to ignore the whole thing.
       */
      if (candidate.provider !== 'openrouter') {
        verdicts.push({
          job,
          position: i + 1,
          provider: candidate.provider,
          model,
          overriddenBy: override,
          status: 'unchecked',
          note: `${candidate.provider} is a direct vendor; its catalogue is not checked here`,
        });
        return;
      }

      if (chat === null) {
        verdicts.push({
          job,
          position: i + 1,
          provider: candidate.provider,
          model,
          overriddenBy: override,
          status: 'unchecked',
          note: 'the chat catalogue could not be reached',
        });
        return;
      }

      verdicts.push({
        job,
        position: i + 1,
        provider: candidate.provider,
        model,
        overriddenBy: override,
        status: chat.has(model) ? 'ok' : 'missing',
        ...(chat.has(model)
          ? {}
          : { note: 'not in the OpenRouter chat catalogue — this candidate will 404' }),
      });
    });
  }

  // ---- the image chain, against the OTHER catalogue ------------------------
  imageModelChain().forEach((model, i) => {
    if (images === null) {
      verdicts.push({
        job: 'finish_render',
        position: i + 1,
        provider: 'openrouter',
        model,
        overriddenBy: process.env.AI_IMAGE_MODELS ? 'AI_IMAGE_MODELS' : null,
        status: 'unchecked',
        note: 'the image catalogue could not be reached',
      });
      return;
    }
    /**
     * Checked against the image catalogue FIRST, then the chat one. Some
     * multimodal slugs appear in both, and a model that can generate an image
     * is fine wherever it is listed — the point is whether the string names
     * something real, not which list it lives in.
     */
    const found = images.has(model) || (chat?.has(model) ?? false);
    verdicts.push({
      job: 'finish_render',
      position: i + 1,
      provider: 'openrouter',
      model,
      overriddenBy: process.env.AI_IMAGE_MODELS ? 'AI_IMAGE_MODELS' : null,
      status: found ? 'ok' : 'missing',
      ...(found
        ? {}
        : { note: 'in neither the image nor the chat catalogue — this candidate will 404' }),
    });
  });

  const missing = verdicts.filter((v) => v.status === 'missing');

  /**
   * A JOB WITH NO SURVIVING CANDIDATE IS THE HEADLINE.
   *
   * One dead slug in a chain of four is a warning. Every slug dead is a
   * feature that cannot work, and it should not have to be inferred by reading
   * a list — the vision chain spent weeks in a state a summary line would have
   * exposed in seconds.
   */
  const jobs = [...new Set(verdicts.map((v) => v.job))];
  const dead = jobs.filter((job) => {
    const own = verdicts.filter((v) => v.job === job);
    return own.length > 0 && own.every((v) => v.status === 'missing');
  });

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      catalogues: {
        chat: chat === null ? 'unreachable' : `${chat.size} ids`,
        images: images === null ? 'unreachable' : `${images.size} ids`,
      },
      summary: {
        total: verdicts.length,
        ok: verdicts.filter((v) => v.status === 'ok').length,
        missing: missing.length,
        unchecked: verdicts.filter((v) => v.status === 'unchecked').length,
        jobsWithNoWorkingModel: dead,
      },
      verdicts,
      // Included so the response is self-explanatory to somebody who arrives
      // at it during an incident without having read this file.
      endpoints: {
        chat: CHAT_CATALOGUE,
        images: IMAGE_CATALOGUE,
        providers: Object.keys(PROVIDER_ENDPOINTS),
      },
    },
    {
      // 503 when something is genuinely broken, so this can be pointed at an
      // uptime monitor and page somebody without any custom parsing.
      status: dead.length > 0 ? 503 : 200,
      headers: { 'cache-control': 'no-store' },
    }
  );
}
