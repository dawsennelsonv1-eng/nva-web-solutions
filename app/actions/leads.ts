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
 * CSV export data. The actual file streaming/download headers live in the
 * Route Handler (app/api/admin/leads/export/route.ts) — a Server Action
 * returns data, not a Response with Content-Disposition, so a real file
 * download needs a GET route. This function is what that route calls.
 */
export async function getLeadsForExportAction(filters: LeadFilters = {}): Promise<LeadListItem[]> {
  return listLeadsAction(filters);
}
