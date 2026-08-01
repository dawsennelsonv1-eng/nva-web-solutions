import 'server-only';
import { cache } from 'react';
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
 * 0008_prototype_view.sql's resolve_prototype_full() joins prototype,
 * prospect, brand kit, template config, quote config, subscription, plan and
 * usage_counter into one row, and THIS function feeds that row into
 * decideEntitlement() — the exact same pure function check.ts's can() calls
 * on the live request path. One query, one source of truth for what it
 * means to be entitled.
 *
 * === PHASE 8 CORRECTION: MODE IS DERIVED, NOT DEFAULTED ===
 * Through Phase 6/7 this defaulted to `mode: 'live'` — harmless while
 * nothing mounted a real widget against it, wrong the moment Phase 8 needs
 * to. A puppy-dog prototype is, by definition, shown to a contractor BEFORE
 * he has paid anything: no subscription row exists for it yet.
 * decideEntitlement's own 'prototype' branch already never checks
 * subscriptionEntitling at all (verified: it goes straight to
 * session-limit-only gating) — that design was correct from Phase 3
 * onward, it just was never actually WIRED to fire for an unpurchased
 * prototype, because nothing computed which mode a given prototype should
 * resolve in.
 *
 * The rule: if NO subscription row has ever existed for this prototype,
 * it is being shown pre-purchase — mode 'prototype', unmetered sales tool.
 * The MOMENT a subscription is created (active, past_due, even a later
 * cancellation), the prototype has graduated to being a real site — mode
 * 'live', where the normal cap/suspension rules apply correctly (a churned
 * customer's page degrades via subscription_suspended, exactly as it
 * should — it does not silently reopen as a free demo). 'preview' remains
 * an explicit caller override for the admin looking at his own staged
 * work, exactly as before.
 *
 * === PHASE 8 CORRECTION: EXPIRED IS NOW DISTINGUISHABLE FROM NOT-FOUND ===
 * Through Phase 7 both collapsed to `null` — correct for draft/revoked/
 * nonexistent, which the Phase 1 routing contract deliberately keeps
 * indistinguishable for security (a revoked link should look exactly like
 * one that never existed). But an EXPIRED prototype is a different case:
 * lib/analytics.ts has carried a `prototype_expired_viewed` event since
 * Phase 1, which only makes sense if an expired link renders its OWN page
 * rather than a generic 404 — and Phase 8 explicitly asks for "a clean
 * expired state that still sells." The return type is now a discriminated
 * union so the route can tell the two apart while keeping every other
 * non-live status exactly as opaque as before.
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
  contractorEmail: string | null;
  contractorCity: string | null;
  contractorState: string | null;
  /** The prospects.id FK — needed by createCheckoutAction, distinct from prototype.id. */
  prospectId: string;
  /** Derived, not caller-supplied (see header). What the widget must mount as. */
  mode: WidgetMode;
  entitlement: {
    degraded: boolean;
    degradedReason: DbDegradedReason | null;
    remainingSession: number;
  };
}

export type PrototypeResolution =
  | { status: 'ok'; data: ResolvedPrototype }
  | { status: 'expired'; contractorName: string; slug: string }
  | { status: 'not_found' };

interface FullRow {
  prototype: { id: string; slug: string; vertical: string; status: string; expires_at: string | null };
  prospect: {
    id: string; business_name: string; contact_name: string | null;
    phone: string | null; email: string | null; city: string | null; state: string | null;
  };
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
 * Resolves a prototype by slug for a public route.
 *
 * `opts.mode: 'preview'` is the only mode a caller may force — used by the
 * admin's own preview surface. Otherwise mode is derived from whether a
 * subscription has ever existed (see header). `sessionId` shapes the
 * per-session count the same way check.ts's can() does; a missing one reads
 * as zero for this bootstrap render, and the widget threads a real one for
 * the actions that follow.
 */
export const resolvePrototypeBySlug = cache(async function resolvePrototypeBySlug(
  slug: string,
  opts: { mode?: 'preview'; sessionId?: string } = {}
): Promise<PrototypeResolution> {
  const db = getSupabaseAdminClient();
  const { data, error } = await db.rpc('resolve_prototype_full', { p_slug: slug });
  if (error || !data) return { status: 'not_found' };

  const row = data as unknown as FullRow;
  if (!row.prototype || row.prototype.status !== 'live') return { status: 'not_found' };

  const isExpired = Boolean(row.prototype.expires_at && new Date(row.prototype.expires_at) <= new Date());
  if (isExpired) {
    return { status: 'expired', contractorName: row.prospect.business_name, slug: row.prototype.slug };
  }

  const mode: WidgetMode = opts.mode === 'preview' ? 'preview' : row.subscription ? 'live' : 'prototype';

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

    const decision = decideEntitlement(resolved, 'quote.ai_analysis', mode === 'prototype' ? 'prototype' : 'live');
    degraded = decision.degradedMode;
    degradedReason = decision.degradedMode ? toDegradedReason(decision.reason) : null;
    remainingSession = decision.remainingSession;
  }

  return {
    status: 'ok',
    data: {
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
      contractorEmail: row.prospect.email,
      contractorCity: row.prospect.city,
      contractorState: row.prospect.state,
      prospectId: row.prospect.id,
      mode,
      entitlement: { degraded, degradedReason, remainingSession },
    },
  };
});
