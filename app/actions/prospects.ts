'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { scoreProspect, type ScorecardInput } from '@/lib/prospects/scorecard';
import { trackServer } from '@/lib/analytics.server';
import type { ProspectStatus } from '@/types';

/**
 * app/actions/prospects.ts — prospect CRUD, admin-gated, and the score
 * computed and STORED at save time (not derived at read time). DATA_MODEL.md
 * is explicit about why: "a scoring change must not rewrite history." If
 * the point table in lib/prospects/scorecard.ts is ever tuned, a prospect
 * qualified six months ago must keep showing the number that was actually
 * used to qualify him, not a retroactively recomputed one.
 */

export interface UpsertProspectInput {
  id?: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  websiteUrl: string;
  vertical: string;
  scorecard: ScorecardInput;
  qualificationNotes: string;
  status: ProspectStatus;
}

export async function upsertProspectAction(
  input: UpsertProspectInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Not authorized.' };
  if (!input.businessName.trim()) return { ok: false, error: 'Business name is required.' };

  const result = scoreProspect(input.scorecard);
  const db = getSupabaseAdminClient();

  const row = {
    business_name: input.businessName.trim(),
    contact_name: input.contactName.trim() || null,
    phone: input.phone.trim() || null,
    email: input.email.trim() || null,
    city: input.city.trim() || null,
    state: input.state.trim() || null,
    website_url: input.websiteUrl.trim() || null,
    vertical: input.vertical,
    has_google_ads: input.scorecard.hasGoogleAds,
    google_review_count: input.scorecard.googleReviewCount,
    google_search_rank: input.scorecard.searchRank,
    estimated_monthly_traffic: input.scorecard.estimatedMonthlyTraffic,
    has_quote_or_pricing_tool: input.scorecard.hasQuoteOrPricingTool,
    site_looks_abandoned: input.scorecard.siteLooksAbandoned,
    qualification_score: result.score,
    qualification_notes: input.qualificationNotes.trim() || null,
    status: input.status,
  };

  if (input.id) {
    const { error } = await db.from('prospects').update(row).eq('id', input.id);
    if (error) return { ok: false, error: 'Could not save changes.' };
    return { ok: true, id: input.id };
  }

  const { data, error } = await db.from('prospects').insert(row).select('id').single();
  if (error || !data) return { ok: false, error: 'Could not create the prospect.' };

  trackServer('prospect_created', { vertical: input.vertical }, { surface: 'admin', mode: 'live', prototypeId: null });
  if (result.band === 'strong' || result.band === 'workable') {
    trackServer(
      'prospect_qualified',
      { qualification_score: result.score, band: result.band },
      { surface: 'admin', mode: 'live', prototypeId: null }
    );
  } else {
    trackServer(
      'prospect_declined',
      { qualification_score: result.score, reason: result.band },
      { surface: 'admin', mode: 'live', prototypeId: null }
    );
  }

  return { ok: true, id: data.id };
}

export interface ProspectListItem {
  id: string;
  businessName: string;
  city: string | null;
  state: string | null;
  status: ProspectStatus;
  qualificationScore: number | null;
  createdAt: string;
}

export async function listProspectsAction(): Promise<ProspectListItem[]> {
  if (!(await requireAdmin())) return [];
  const db = getSupabaseAdminClient();
  const { data } = await db
    .from('prospects')
    .select('id, business_name, city, state, status, qualification_score, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []).map((r) => ({
    id: r.id,
    businessName: r.business_name,
    city: r.city,
    state: r.state,
    status: r.status,
    qualificationScore: r.qualification_score,
    createdAt: r.created_at,
  }));
}

export async function getProspectAction(id: string) {
  if (!(await requireAdmin())) return null;
  const db = getSupabaseAdminClient();
  const { data } = await db.from('prospects').select('*').eq('id', id).maybeSingle();
  if (!data) return null;

  const { data: prototypes } = await db
    .from('prototypes')
    .select('id, slug, status')
    .eq('prospect_id', id)
    .order('created_at', { ascending: false });

  return { prospect: data, prototypes: prototypes ?? [] };
}
