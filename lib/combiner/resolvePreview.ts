import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { decideEntitlement, type ResolvedEntitlement } from '@/lib/entitlements/decideEntitlement';
import type { ResolvedPrototype } from '@/lib/prototype';
import type { DbDegradedReason, StyleVariant } from '@/types';
import type { Json } from '@/types/database';

/**
 * lib/combiner/resolvePreview.ts — merges REAL prototype data with STAGED
 * (unsaved) overrides from prototype_previews, into the exact same
 * ResolvedPrototype shape lib/prototype.ts produces — so
 * components/prototype/PrototypeView.tsx cannot tell the difference and
 * needs no preview-specific branch.
 *
 * WHAT'S REAL, WHAT'S STAGED: contractor identity, phone, quote_config
 * (pricing rules, finish catalogue), and vertical all come from the
 * PROTOTYPE'S OWN SAVED ROW — the combiner never edits pricing, so there is
 * nothing unsaved to merge there. Only brand_kit and template_config are
 * ever overridden by the staged row, because those are the only two things
 * items 1-3 of this phase actually let the admin drag around.
 *
 * mode IS ALWAYS 'preview' HERE, unconditionally — never derived the way
 * lib/prototype.ts derives it for the public route. This is an admin
 * staging tool; nothing it renders may write a real lead, consume a real
 * analysis, or trigger a real checkout, regardless of whether the
 * underlying prototype happens to already have a live subscription.
 * PrototypeView's `mode === 'preview'` branch is what suppresses the
 * purchase CTA entirely for this route.
 */

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
}

export interface StagedBrand {
  primaryHex: string | null;
  secondaryHex: string | null;
  accentHex: string | null;
  logoPath: string | null;
  derivedTokens: Json | null;
}

export interface StagedTemplate {
  templateId: string;
  typographyId: string;
  buttonStyleId: string;
  styleVariant: StyleVariant;
}

/**
 * Resolves a prototype for the ADMIN PREVIEW route, applying staged
 * overrides if any exist. Returns null only if the prototype itself does
 * not exist — unlike the public resolver, status (draft included) and
 * expiry are NOT gating here; an admin must be able to preview a prototype
 * at any lifecycle stage.
 */
export async function resolvePrototypeForPreview(prototypeId: string): Promise<ResolvedPrototype | null> {
  const db = getSupabaseAdminClient();

  const [{ data: fullData, error: fullError }, { data: preview }] = await Promise.all([
    db.rpc('resolve_prototype_full_by_id', { p_prototype_id: prototypeId }),
    db.from('prototype_previews').select('staged_brand, staged_template, expires_at').eq('prototype_id', prototypeId).maybeSingle(),
  ]);

  if (fullError || !fullData) return null;
  const row = fullData as unknown as FullRow;
  if (!row.prototype) return null;

  const stagedBrand = preview && new Date(preview.expires_at) > new Date()
    ? (preview.staged_brand as unknown as StagedBrand)
    : null;
  const stagedTemplate = preview && new Date(preview.expires_at) > new Date()
    ? (preview.staged_template as unknown as StagedTemplate)
    : null;

  // Preview mode never consumes quota or checks entitlement (see header) —
  // decideEntitlement is still called so the degraded UI can be previewed
  // faithfully if the admin wants to see what a capped/suspended state
  // looks like, but the widget itself will always run in mode 'preview'.
  const resolvedEntitlement: ResolvedEntitlement = {
    planCode: null, limits: null, features: {}, subscriptionEntitling: true,
    periodStart: null, periodEnd: null, analysesUsed: 0, leadsCaptured: 0, sessionAnalysesUsed: 0,
  };
  const decision = decideEntitlement(resolvedEntitlement, 'quote.ai_analysis', 'prototype');

  return {
    prototype: { id: row.prototype.id, slug: row.prototype.slug, vertical: row.prototype.vertical },
    brandKit: stagedBrand
      ? {
          logoPath: stagedBrand.logoPath,
          primaryHex: stagedBrand.primaryHex,
          secondaryHex: stagedBrand.secondaryHex,
          accentHex: stagedBrand.accentHex,
          derivedTokens: stagedBrand.derivedTokens,
        }
      : row.brand_kit
        ? {
            logoPath: row.brand_kit.logo_path,
            primaryHex: row.brand_kit.primary_hex,
            secondaryHex: row.brand_kit.secondary_hex,
            accentHex: row.brand_kit.accent_hex,
            derivedTokens: row.brand_kit.derived_tokens,
          }
        : null,
    templateConfig: stagedTemplate
      ? {
          templateId: stagedTemplate.templateId,
          typographyId: stagedTemplate.typographyId,
          buttonStyleId: stagedTemplate.buttonStyleId,
          styleVariant: stagedTemplate.styleVariant,
          copyOverrides: row.template_config?.copy_overrides ?? {},
        }
      : row.template_config
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
    mode: 'preview',
    entitlement: {
      degraded: decision.degradedMode,
      degradedReason: decision.degradedMode ? (decision.reason as DbDegradedReason) : null,
      remainingSession: decision.remainingSession,
    },
  };
}
