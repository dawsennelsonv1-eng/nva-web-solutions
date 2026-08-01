import type { ZodType } from 'zod';
import { applyProposal } from '@/lib/ai/apply';
import { AI_ROUTES } from '@/lib/ai/config';
import { explain } from '@/lib/ai/errors';
import { getAiJob, markJobApplied, markJobDiscarded } from '@/lib/ai/jobs';
import { buildPrompt } from '@/lib/ai/prompts';
import { checkAdminRate } from '@/lib/ai/ratelimit';
import { runJob } from '@/lib/ai/router';
import { JOB_SCHEMAS } from '@/lib/ai/schemas';
import { tokenFromRequest, verifyAdminToken } from '@/lib/ai/authz';
import { isAdminJobId, type AdminJobId, type AiStreamEvent } from '@/lib/ai/types';

/**
 * app/api/ai/[job]/route.ts — the only way into the AI layer from outside.
 *
 * runtime = 'nodejs' is REQUIRED, not defensive: lib/ai/authz.ts uses
 * node:crypto and lib/ai/jobs.ts uses the service-role Supabase client. On the
 * Edge runtime this route would fail at import time, which on Vercel means a
 * build that succeeds and an endpoint that 500s.
 *
 * POST   run a job, streaming Server-Sent Events
 * PATCH  apply or discard a proposal that already ran
 *
 * Both are admin-only, checked here rather than inherited from middleware:
 * /api is not /admin, and this endpoint spends money.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

interface RouteContext {
  params: { job: string };
}

export async function POST(req: Request, ctx: RouteContext): Promise<Response> {
  const auth = verifyAdminToken(tokenFromRequest(req));
  if (!auth.ok) return json(401, { error: auth.message, action: auth.action });

  if (!isAdminJobId(ctx.params.job)) {
    return json(404, {
      error: `There is no AI job called "${ctx.params.job}".`,
      action: 'Pick a job from the workspace.',
    });
  }
  const job: AdminJobId = ctx.params.job;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, {
      error: 'The request body was not JSON.',
      action: 'Reload the workspace and run it again.',
    });
  }

  const built = buildPrompt(job, (body as { input?: unknown } | null)?.input);
  if (!built.ok) {
    return json(422, {
      error: 'This job needs a few fields filled in first.',
      action: 'Fix the fields listed below and run it again.',
      issues: built.issues,
    });
  }

  const rate = await checkAdminRate(auth.adminId);
  if (!rate.allowed) {
    return json(429, {
      error: rate.message,
      action: 'Wait, then run it again.',
      retry_after_seconds: rate.retryAfterSeconds,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: AiStreamEvent): void => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The client hung up mid-stream. The run continues to completion so
          // the ledger row is still written — we paid for it either way.
          open = false;
        }
      };

      const firstHop = AI_ROUTES[job].chain[0];
      send({
        type: 'start',
        job,
        provider: firstHop.provider,
        model: firstHop.model,
      });

      // The union of three payload types is not worth threading through the
      // router's generic: this route only re-serializes whatever validated.
      const schema = JOB_SCHEMAS[job] as unknown as ZodType<unknown>;

      const result = await runJob<unknown>({
        job,
        system: built.prompt.system,
        messages: [{ role: 'user', content: built.prompt.user }],
        schema,
        promptVersion: built.prompt.version,
        createdBy: auth.adminId,
        request: built.input,
        signal: req.signal,
        onDelta: (text) => send({ type: 'delta', text }),
        onRepair: (reason, detail) => send({ type: 'repair', reason, detail }),
        onFallback: (from, to, reason) => send({ type: 'fallback', from, to, reason }),
      });

      if (result.ok) {
        send({
          type: 'done',
          jobId: result.jobId,
          data: result.data,
          attempts: result.attempts,
          cost: {
            costCents: result.costCents,
            usage: result.usage,
            provider: result.provider,
            model: result.model,
            estimated: result.usage.estimated,
          },
        });
      } else {
        const explained = explain(result.error);
        send({
          type: 'error',
          code: result.error.code,
          message: explained.message,
          action: explained.action,
        });
      }

      open = false;
      try {
        controller.close();
      } catch {
        /* already closed by a client disconnect */
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      // Without this some proxies buffer the whole stream and the panel sits
      // blank until the job finishes, which looks exactly like a hang.
      'x-accel-buffering': 'no',
    },
  });
}

export async function PATCH(req: Request, ctx: RouteContext): Promise<Response> {
  const auth = verifyAdminToken(tokenFromRequest(req));
  if (!auth.ok) return json(401, { error: auth.message, action: auth.action });

  if (!isAdminJobId(ctx.params.job)) {
    return json(404, {
      error: `There is no AI job called "${ctx.params.job}".`,
      action: 'Pick a job from the workspace.',
    });
  }
  const job: AdminJobId = ctx.params.job;

  let body: { job_id?: unknown; decision?: unknown; note?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, {
      error: 'The request body was not JSON.',
      action: 'Reload the workspace and try again.',
    });
  }

  const jobId = typeof body.job_id === 'string' ? body.job_id : null;
  const decision = body.decision === 'apply' || body.decision === 'discard' ? body.decision : null;
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;

  if (!jobId || !decision) {
    return json(400, {
      error: 'This needs a job id and a decision of apply or discard.',
      action: 'Run a job first, then decide on its result.',
    });
  }

  const stored = await getAiJob(jobId);
  if (!stored) {
    return json(404, {
      error: 'That run is not in the ledger.',
      action: 'Run the job again — results are only decidable once recorded.',
    });
  }
  if (stored.jobType !== job) {
    return json(409, {
      error: 'That run belongs to a different job type.',
      action: 'Open the run under its own job and decide there.',
    });
  }
  if (stored.appliedAt || stored.discardedAt) {
    return json(409, {
      error: 'That run was already decided.',
      action: 'Run the job again to produce a fresh proposal.',
    });
  }
  if (stored.status !== 'succeeded' || stored.output === null) {
    return json(409, {
      error: 'That run did not produce a usable result.',
      action: 'Run the job again.',
    });
  }

  if (decision === 'discard') {
    const ok = await markJobDiscarded(jobId, auth.adminId);
    if (!ok) {
      return json(409, {
        error: 'The run could not be marked discarded.',
        action: 'Reload the workspace — someone may have decided it already.',
      });
    }
    return json(200, { decision: 'discard', changed: false, message: 'Discarded.' });
  }

  // Validate the STORED payload again before acting on it. The row has been
  // sitting in a database since the run; re-checking costs nothing and means
  // an edited row cannot become a change.
  const schema = JOB_SCHEMAS[job] as unknown as ZodType<unknown>;
  const revalidated = schema.safeParse(stored.output);
  if (!revalidated.success) {
    return json(409, {
      error: 'The stored result no longer passes validation, so it was not applied.',
      action: 'Run the job again to produce a fresh proposal.',
    });
  }

  const marked = await markJobApplied(jobId, auth.adminId, note);
  if (!marked) {
    return json(409, {
      error: 'The run could not be marked applied.',
      action: 'Reload the workspace — someone may have decided it already.',
    });
  }

  const outcome = await applyProposal(job, revalidated.data, jobId);
  return json(200, {
    decision: 'apply',
    changed: outcome.changed,
    message: outcome.message,
    action: outcome.action,
  });
}
