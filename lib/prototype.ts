import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { decideEntitlement, type ResolvedEntitlement } from '@/lib/entitlements/decideEntitlement';
import type { DbDegradedReason, StyleVariant, WidgetMode } from '@/types';
import type { Json } from '@/types/database';

/**
 * lib/prototype.ts — resolvePrototypeBySlug(): brand kit + template config +
 * quote config + entitlements, in ONE query, safe to call from a public
 * route (Phase 6 deliverable 5).
 *
 * "ONE QUERY" MEANS ONE ROUND TRIP TO POSTGRES, not one call to
 * resolveEntitlement(). Those are different things, and conflating them
 * would have meant either reimplementing the entitlement precedence rules a
 * second time in SQL (a second source of truth for the single most
 * consequential decision in the product) or eating resolveEntitlement's own
 * three separate queries on top of whatever this needed. Instead:
 * 0007_admin.sql's resolve_prototype_full() joins prototype, prospect, brand
 * kit, template config, quote config, subscription, plan and usage_counter
 * into one row, and THIS function feeds that row into
 * decideEntitlement() — the exact same pure function check.ts's can() calls
 * on the live request path (Phase 6 extracted it for precisely this reuse).
 * One query, one source of truth for what it means to be entitled.
 *
 * "SAFE TO CALL FROM A PUBLIC ROUTE" despite reading subscription and plan
 * data internally: the SQL function is service-role only (never anon-
 * callable — unlike 0003's resolve_prototype_by_slug), and this function's
 * OWN return type is the actual safety boundary. Nothing billing-shaped
 * leaves it. Compare the two return shapes: quote_config carries pricing
 * *rules* (needed client-side so the datum rule can price a slider drag
 * without a round trip — Phase 3's isomorphic pricing.ts is what makes that
 * safe to expose), while contractorName/contractorPhone/degraded/
 * degradedReason are the only entitlement-adjacent fields, and they are
 * exactly what the Phase 4 widget already needs to choose its happy path or
 * its degraded one. No tier name, no subscription status, no analysis count
 * ever appears in this type.
 */

export interface ResolvedPrototype {
  prototype: { id: string; slug: string; vertical: string };
  brandKit: {
    logoPath: string | null;
    primaryHex: string | null;
    secondaryHex: string | null;
    accentHex: string | null;
    derivedTokens: Json | null;
  } | null;
  templateConfig: {
    templateId: string;
    typographyId: string;
    buttonStyleId: string;
    styleVariant: StyleVariant;
    copyOverrides: Json;
  } | null;
  quoteConfig: {
    vertical: string;
    rules: Json;
    finishCatalogue: Json;
    sqftMin: number;
    sqftMax: number;
    rangeSpreadPct: number;
  } | null;
  contractorName: string;
  contractorPhone: string | null;
  entitlement: {
    degraded: boolean;
    degradedReason: DbDegradedReason | null;
    remainingSession: number;
  };
}

interface FullRow {
  prototype: { id: string; slug: string; vertical: string; status: string; expires_at: string | null };
  prospect: { id: string; business_name: string; contact_name: string | null; phone: string | null; email: string | null };
  brand_kit: {
    logo_path: string | null; primary_hex: string | null; secondary_hex: string | null;
    accent_hex: string | null; derived_tokens: Json | null;
  } | null;
  template_config: {
    template_id: string; typography_id: string; button_style_id: string;
    style_variant: string; copy_overrides: Json;
  } | null;
  quote_config: {
    vertical: string; rules: Json; finish_catalogue: Json;
    sqft_min: number; sqft_max: number; range_spread_pct: number;
  } | null;
  subscription: { status: string; plan_code: string; current_period_start: string; current_period_end: string } | null;
  plan: { analysis_limit_per_month: number | null; analysis_limit_per_session: number; features: Json } | null;
  usage: { analyses_used: number; leads_captured: number } | null;
}

const ENTITLING = new Set(['trialing', 'active', 'past_due', 'grace']);

function toDegradedReason(reason: string): DbDegradedReason {
  if (reason === 'cap_reached') return 'cap_reached';
  if (reason === 'subscription_suspended') return 'subscription_suspended';
  return 'ai_unavailable';
}

/**
 * Resolves a live prototype by slug for a public route. Returns null for
 * anything not live-and-unexpired (draft, revoked, expired, or nonexistent —
 * deliberately indistinguishable, per the Phase 1 routing contract: the
 * route 404s either way).
 *
 * `mode` and `sessionId` shape the entitlement the same way check.ts's can()
 * does: 'prototype' mode never touches the monthly cap; a missing sessionId
 * means the per-session count reads as zero for this bootstrap render (the
 * widget derives and threads a real one for the actions that follow).
 */
export async function resolvePrototypeBySlug(
  slug: string,
  opts: { mode?: WidgetMode; sessionId?: string } = {}
): Promise<ResolvedPrototype | null> {
  const db = getSupabaseAdminClient();
  const { data, error } = await db.rpc('resolve_prototype_full', { p_slug: slug });
  if (error || !data) return null;

  const row = data as unknown as FullRow;
  if (!row.prototype || row.prototype.status !== 'live') return null;
  if (row.prototype.expires_at && new Date(row.prototype.expires_at) <= new Date()) return null;

  const mode = opts.mode ?? 'live';
  let degraded = false;
  let degradedReason: DbDegradedReason | null = null;
  let remainingSession = row.plan?.analysis_limit_per_session ?? 3;

  if (mode !== 'preview') {
    const resolved: ResolvedEntitlement = {
      planCode: row.subscription?.plan_code ?? null,
      limits: row.plan
        ? {
            analysisLimitPerMonth: row.plan.analysis_limit_per_month,
            analysisLimitPerSession: row.plan.analysis_limit_per_session,
          }
        : null,
      features: (row.plan?.features ?? {}) as Record<string, boolean>,
      subscriptionEntitling: row.subscription ? ENTITLING.has(row.subscription.status) : false,
      periodStart: row.subscription?.current_period_start ?? null,
      periodEnd: row.subscription?.current_period_end ?? null,
      analysesUsed: row.usage?.analyses_used ?? 0,
      leadsCaptured: row.usage?.leads_captured ?? 0,
      sessionAnalysesUsed: 0, // this bootstrap has no per-request session count yet
    };

    const decision = decideEntitlement(
      resolved,
      'quote.ai_analysis',
      mode === 'prototype' ? 'prototype' : 'live'
    );
    degraded = decision.degradedMode;
    degradedReason = decision.degradedMode ? toDegradedReason(decision.reason) : null;
    remainingSession = decision.remainingSession;
  }

  return {
    prototype: {
      id: row.prototype.id,
      slug: row.prototype.slug,
      vertical: row.prototype.vertical,
    },
    brandKit: row.brand_kit
      ? {
          logoPath: row.brand_kit.logo_path,
          primaryHex: row.brand_kit.primary_hex,
          secondaryHex: row.brand_kit.secondary_hex,
          accentHex: row.brand_kit.accent_hex,
          derivedTokens: row.brand_kit.derived_tokens,
        }
      : null,
    templateConfig: row.template_config
      ? {
          templateId: row.template_config.template_id,
          typographyId: row.template_config.typography_id,
          buttonStyleId: row.template_config.button_style_id,
          styleVariant: row.template_config.style_variant as StyleVariant,
          copyOverrides: row.template_config.copy_overrides,
        }
      : null,
    quoteConfig: row.quote_config
      ? {
          vertical: row.quote_config.vertical,
          rules: row.quote_config.rules,
          finishCatalogue: row.quote_config.finish_catalogue,
          sqftMin: row.quote_config.sqft_min,
          sqftMax: row.quote_config.sqft_max,
          rangeSpreadPct: row.quote_config.range_spread_pct,
        }
      : null,
    contractorName: row.prospect.business_name,
    contractorPhone: row.prospect.phone,
    entitlement: { degraded, degradedReason, remainingSession },
  };
}
