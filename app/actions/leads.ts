'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { getSignedPhotoUrl } from '@/lib/storage/photos';
import { trackServer } from '@/lib/analytics.server';
import type { DbDegradedReason, DbLeadSource, DbLeadStatus } from '@/types/database';

/**
 * app/actions/leads.ts — the leads inbox's data layer. Every export here is
 * admin-gated via requireAdmin(); nothing in this file is reachable by a
 * homeowner or a demo visitor — their write path is app/actions/lead.ts
 * (Phase 5), a deliberately different file.
 */

export interface LeadListItem {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: DbLeadSource;
  status: DbLeadStatus;
  wasDegraded: boolean;
  degradedReason: DbDegradedReason | null;
  hasQuote: boolean;
  createdAt: string;
}

export interface LeadFilters {
  source?: DbLeadSource | 'all';
  status?: DbLeadStatus | 'all';
}

export async function listLeadsAction(filters: LeadFilters = {}): Promise<LeadListItem[]> {
  if (!(await requireAdmin())) return [];
  const db = getSupabaseAdminClient();
  let query = db
    .from('leads')
    .select('id, name, phone, email, source, status, was_degraded, degraded_reason, quote_id, created_at')
    .order('created_at', { ascending: false })
    .limit(300);

  if (filters.source && filters.source !== 'all') query = query.eq('source', filters.source);
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);

  const { data } = await query;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    source: r.source,
    status: r.status,
    wasDegraded: r.was_degraded,
    degradedReason: r.degraded_reason,
    hasQuote: r.quote_id !== null,
    createdAt: r.created_at,
  }));
}

export interface LeadDetail extends LeadListItem {
  timeline: string | null;
  notes: string | null;
  quote: {
    lowCents: number;
    highCents: number;
    breakdown: unknown;
    inputs: unknown;
    usedAiAnalysis: boolean;
  } | null;
  photoUrl: string | null;
}

export async function getLeadDetailAction(id: string): Promise<LeadDetail | null> {
  if (!(await requireAdmin())) return null;
  const db = getSupabaseAdminClient();

  const { data: lead } = await db
    .from('leads')
    .select('id, name, phone, email, source, status, was_degraded, degraded_reason, timeline, notes, quote_id, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!lead) return null;

  let quote: LeadDetail['quote'] = null;
  let photoUrl: string | null = null;

  if (lead.quote_id) {
    const { data: q } = await db
      .from('quotes')
      .select('low_cents, high_cents, breakdown, inputs, used_ai_analysis, photo_path')
      .eq('id', lead.quote_id)
      .maybeSingle();
    if (q) {
      quote = {
        lowCents: q.low_cents,
        highCents: q.high_cents,
        breakdown: q.breakdown,
        inputs: q.inputs,
        usedAiAnalysis: q.used_ai_analysis,
      };
      if (q.photo_path) photoUrl = await getSignedPhotoUrl(q.photo_path);
    }
  }

  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    status: lead.status,
    wasDegraded: lead.was_degraded,
    degradedReason: lead.degraded_reason,
    hasQuote: lead.quote_id !== null,
    createdAt: lead.created_at,
    timeline: lead.timeline,
    notes: lead.notes,
    quote,
    photoUrl,
  };
}

export async function updateLeadStatusAction(
  id: string,
  status: DbLeadStatus
): Promise<{ ok: boolean }> {
  if (!(await requireAdmin())) return { ok: false };
  const db = getSupabaseAdminClient();
  const { data: before } = await db.from('leads').select('status').eq('id', id).maybeSingle();
  const { error } = await db.from('leads').update({ status }).eq('id', id);
  if (error) return { ok: false };
  if (before) {
    trackServer(
      'lead_status_changed',
      { from_status: before.status, to_status: status },
      { surface: 'admin', mode: 'live', prototypeId: null }
    );
  }
  return { ok: true };
}

export async function updateLeadNotesAction(id: string, notes: string): Promise<{ ok: boolean }> {
  if (!(await requireAdmin())) return { ok: false };
  const db = getSupabaseAdminClient();
  const { error } = await db.from('leads').update({ notes: notes.trim() || null }).eq('id', id);
  return { ok: !error };
}

/**
 * ============================================================================
 * DELETING A LEAD. THE ONLY DESTRUCTIVE ACTION IN THIS FILE.
 * ============================================================================
 *
 * Everything else here changes a status or a note and can be changed back.
 * This cannot, so it is written differently on purpose.
 *
 * IT IS A HARD DELETE, NOT A STATUS. There is already a status column and it
 * already has a value for a lead that came to nothing — using it is what
 * "archive" means, and the inbox filters on it. So a soft delete would be a
 * second, invisible way of expressing something the schema already expresses,
 * and the row would still be in every export and every count. Somebody asking
 * to delete a test lead wants it GONE, and a delete that leaves the row behind
 * is a lie told to make the button feel safer.
 *
 * THE QUOTE ROW IS LEFT ALONE. A lead references a quote, not the other way
 * round: the quote is the record of what was calculated and shown, it is what
 * a contractor would need if a homeowner disputed a price, and it carries no
 * contact details. Cascading into it would destroy the more defensible record
 * to satisfy a request about the less defensible one.
 *
 * IT IS LOGGED BEFORE IT HAPPENS. `trackServer` runs with the lead's own
 * details in hand, because after the delete there is nothing left to describe
 * what was removed. That row in the analytics table is the only remaining
 * evidence a lead ever existed, which is exactly what makes it worth writing.
 */
export async function deleteLeadAction(id: string): Promise<{ ok: boolean; message?: string }> {
  if (!(await requireAdmin())) return { ok: false, message: 'Not signed in as an admin.' };

  const db = getSupabaseAdminClient();

  /**
   * Read first. Two reasons, and the second is the important one:
   *
   *   - The analytics row needs the source and status, and they are gone the
   *     moment the delete succeeds.
   *   - A missing row must report "already gone" rather than success. Supabase
   *     reports a delete matching zero rows as a clean result, so without this
   *     check a double tap would silently claim to have deleted something
   *     twice — and an operator who sees two confirmations reasonably wonders
   *     what the second one removed.
   */
  const { data: before } = await db
    .from('leads')
    .select('id, source, status')
    .eq('id', id)
    .maybeSingle();

  if (!before) return { ok: false, message: 'That lead is already gone.' };

  trackServer(
    'lead_deleted',
    {
      lead_source: (before as { source?: unknown }).source ?? null,
      lead_status: (before as { status?: unknown }).status ?? null,
    },
    { surface: 'admin', mode: 'live', prototypeId: null }
  );

  const { error } = await db.from('leads').delete().eq('id', id);
  if (error) return { ok: false, message: 'The lead could not be deleted: ' + error.message };

  return { ok: true };
}

/**
 * CSV export data. The actual file streaming/download headers live in the
 * Route Handler (app/api/admin/leads/export/route.ts) — a Server Action
 * returns data, not a Response with Content-Disposition, so a real file
 * download needs a GET route. This function is what that route calls.
 */
export async function getLeadsForExportAction(filters: LeadFilters = {}): Promise<LeadListItem[]> {
  return listLeadsAction(filters);
}
