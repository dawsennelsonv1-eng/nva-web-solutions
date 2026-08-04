'use server';

import { createHash } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getQueueDb } from '@/lib/queue/db';
import { getTool } from '@/lib/queue/tools';

/**
 * app/actions/queue.ts — writes for the build queue.
 *
 * ALL THREE ACTIONS FAIL SOFT AND SAY SO. A vote that silently disappears is
 * worse than a vote that reports it failed, because the rank he came back to
 * check will not have moved and he will conclude the page is theatre.
 */

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Voter fingerprint. sha256 over a server-side salt, the forwarded IP and the
 * user agent. It is one-way, it is never joined to anything, and it exists
 * only to make the unique constraint on (tool_id, voter_hash) mean something.
 *
 * REQUIRED ENV: QUEUE_VOTE_SALT. Without it, hashes would be reproducible by
 * anyone who knows an IP, so the action refuses to run rather than writing a
 * weaker fingerprint — a silent downgrade of a privacy property is not a
 * degradation this code gets to choose on its own.
 */
function voterHash(): string | null {
  const salt = process.env.QUEUE_VOTE_SALT;
  if (!salt) return null;
  const h = headers();
  // split() always returns at least one element, but noUncheckedIndexedAccess
  // types [0] as possibly undefined, so it is optional-chained rather than
  // asserted. The fallback is also the correct behaviour behind a proxy that
  // strips the header.
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';
  const ua = h.get('user-agent') ?? 'unknown';
  return createHash('sha256').update(`${salt}:${ip}:${ua}`).digest('hex');
}

function clean(value: FormDataEntryValue | null, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function castVote(formData: FormData): Promise<ActionResult> {
  const toolId = clean(formData.get('toolId'), 64);
  const trade = clean(formData.get('trade'), 80);
  const city = clean(formData.get('city'), 80);
  const email = clean(formData.get('email'), 160);

  if (!getTool(toolId)) return { ok: false, message: 'Unknown tool.' };
  if (!trade || !city) return { ok: false, message: 'Trade and city are both needed for the vote to count.' };

  const hash = voterHash();
  if (!hash) {
    return {
      ok: false,
      message: 'Voting is not configured on this deployment. Nothing was recorded.',
    };
  }

  try {
    const db = getQueueDb();
    const { error } = await db.from('tool_votes').insert({
      tool_id: toolId,
      voter_hash: hash,
      trade,
      city,
      email: email || null,
    });

    if (error) {
      // 23505 is the unique violation — he has already voted for this tool.
      // That is not a failure and must not be reported as one.
      if (error.code === '23505') {
        cookies().set(`voted_${toolId}`, '1', { maxAge: 60 * 60 * 24 * 365, httpOnly: false });
        return { ok: true, message: 'You have already voted for this one. It counted the first time.' };
      }
      return { ok: false, message: 'That did not save. Nothing was recorded — try again.' };
    }

    cookies().set(`voted_${toolId}`, '1', { maxAge: 60 * 60 * 24 * 365, httpOnly: false });
    revalidatePath('/queue');
    revalidatePath(`/queue/${toolId}`);
    return { ok: true, message: 'Counted.' };
  } catch {
    return { ok: false, message: 'That did not save. Nothing was recorded — try again.' };
  }
}

/**
 * The concierge's last branch: his trade is not in the catalogue at all.
 *
 * ⚠ DEVIATION, FLAGGED. Phase 13C requires this to route into the existing
 * leads table through the existing capture path. app/actions/lead.ts and the
 * leads schema were not available, and guessing at either would either fail the
 * build or drop a real lead on the floor. The row lands in concierge_requests
 * with a null lead_id, which is the seam: wiring the leads path in later fills
 * that column and creates no second capture path.
 */
export async function submitConciergeRequest(formData: FormData): Promise<ActionResult> {
  const trade = clean(formData.get('trade'), 80);
  const city = clean(formData.get('city'), 80);
  const wants = clean(formData.get('wants'), 400);
  const email = clean(formData.get('email'), 160);

  if (!trade || !city) return { ok: false, message: 'Trade and city are both needed.' };

  try {
    const db = getQueueDb();
    const { error } = await db.from('concierge_requests').insert({
      trade,
      city,
      wants: wants || null,
      email: email || null,
    });
    if (error) return { ok: false, message: 'That did not save. Nothing was recorded — try again.' };
    return {
      ok: true,
      message: 'Recorded. Your trade and city are now in the pile that decides what gets built.',
    };
  } catch {
    return { ok: false, message: 'That did not save. Nothing was recorded — try again.' };
  }
}

/**
 * Build log entry, written from the admin queue page.
 *
 * ⚠ GUARD, FLAGGED. This is a server action, and server actions are reachable
 * directly — a route-group layout does not protect them. lib/auth/admin.ts was
 * not available when this was written, so rather than importing a guard whose
 * name I would be guessing at, the action checks a shared secret.
 *
 * REQUIRED ENV: QUEUE_ADMIN_TOKEN. Swap this for the project's existing admin
 * guard as soon as lib/auth/admin.ts is in scope; it is three lines and this
 * comment goes with it.
 */
export async function addBuildLogEntry(formData: FormData): Promise<ActionResult> {
  const token = clean(formData.get('token'), 200);
  const expected = process.env.QUEUE_ADMIN_TOKEN;
  if (!expected || token !== expected) {
    return { ok: false, message: 'Not authorised. Nothing was written.' };
  }

  const occurredOn = clean(formData.get('occurredOn'), 10);
  const entry = clean(formData.get('entry'), 160);
  const toolId = clean(formData.get('toolId'), 64);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return { ok: false, message: 'Date must be YYYY-MM-DD.' };
  }
  if (entry.length < 3) return { ok: false, message: 'Entry is too short.' };
  if (toolId && !getTool(toolId)) return { ok: false, message: 'Unknown tool.' };

  try {
    const db = getQueueDb();
    const { error } = await db.from('build_log').insert({
      occurred_on: occurredOn,
      tool_id: toolId || null,
      entry,
    });
    if (error) return { ok: false, message: 'That did not save.' };
    revalidatePath('/queue');
    return { ok: true, message: 'Logged.' };
  } catch {
    return { ok: false, message: 'That did not save.' };
  }
}
