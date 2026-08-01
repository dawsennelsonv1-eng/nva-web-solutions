'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { generateSlug } from '@/lib/slug';
import { deriveTokens, type TokenSet } from '@/lib/brand/tokens';
import { saveBrandKitAction } from '@/app/actions/brand';
import { uploadLogo } from '@/lib/storage/logos';
import { DEFAULT_TEMPLATE_SELECTION } from '@/lib/combiner/designOptions';
import { buildDeploymentSms } from '@/lib/combiner/smsTemplate';
import { trackServer } from '@/lib/analytics.server';
import { getVertical } from '@/lib/verticals/registry';
import { ensureVerticalsRegistered } from '@/lib/verticals/manifest';
import type { StyleVariant } from '@/types';
import type { StagedBrand, StagedTemplate } from '@/lib/combiner/resolvePreview';

/**
 * app/actions/combiner.ts — every write path the combiner UI needs.
 * Admin-gated throughout via requireAdmin(), the same pattern every
 * mutating action in this codebase has used since Phase 6's retrofit.
 *
 * A DEFAULT QUOTE_CONFIG NEEDS JUSTIFYING: Phase 6 never built "create a
 * prototype for this prospect" — prospect management stopped at the
 * prospect record. Rather than block this phase on building full
 * rate-entry UI (which the brief's own item list never asks for — it is
 * Templates/Colours/Typography/Buttons, not pricing), a fresh draft
 * prototype is seeded with the SAME proven numbers pricing.test.ts asserts
 * against — the literal fixture that suite hand-verifies. That is disclosed
 * here plainly rather than silently: customising a contractor's actual
 * rates is future admin work, not something this phase claims to do.
 */

const DEFAULT_EPOXY_RULES = {
  baseRateCentsPerSqft: { flake: 550, metallic: 850, solid_polyaspartic: 650 },
  prepRateCentsPerSqft: 150,
  conditionModifiers: [
    { id: 'oil_heavy', label: 'Heavy oil contamination', pctAdjust: 0.18 },
    { id: 'cracking_moderate', label: 'Moderate cracking repair', pctAdjust: 0.12 },
    { id: 'previous_coating', label: 'Previous coating removal', pctAdjust: 0.25 },
  ],
  minimumJobCents: 150_000,
  mobilizationFeeCents: 25_000,
  rangeSpreadPct: 0.15,
};

export interface CombinerBootstrap {
  prototypeId: string;
  slug: string;
  status: string;
  expiresAt: string | null;
  vertical: string;
  stagedBrand: StagedBrand;
  stagedTemplate: StagedTemplate;
}

/**
 * Loads the prospect's existing prototype, or creates one as a fresh draft
 * with a real (but not yet shared) slug. Idempotent: calling this twice for
 * the same prospect returns the SAME prototype, never a second one.
 */
export async function getOrCreateDraftPrototypeAction(prospectId: string): Promise<CombinerBootstrap | { error: string }> {
  if (!(await requireAdmin())) return { error: 'Not authorized.' };
  const db = getSupabaseAdminClient();

  const { data: prospect } = await db.from('prospects').select('id, vertical').eq('id', prospectId).maybeSingle();
  if (!prospect) return { error: 'Prospect not found.' };

  const { data: existing } = await db
    .from('prototypes')
    .select('id, slug, status, expires_at, vertical')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(1);

  let prototypeId: string;
  let slug: string;
  let status: string;
  let expiresAt: string | null;
  let vertical: string;

  if (existing && existing.length > 0) {
    const row = existing[0]!;
    prototypeId = row.id;
    slug = row.slug;
    status = row.status;
    expiresAt = row.expires_at;
    vertical = row.vertical;
  } else {
    vertical = prospect.vertical || 'epoxy';
    slug = generateSlug();
    const { data: inserted, error } = await db
      .from('prototypes')
      .insert({ prospect_id: prospectId, slug, status: 'draft', vertical })
      .select('id, status, expires_at')
      .single();
    if (error || !inserted) return { error: 'Could not create a prototype for this prospect.' };
    prototypeId = inserted.id;
    status = inserted.status;
    expiresAt = inserted.expires_at;

    ensureVerticalsRegistered();
    let rules: typeof DEFAULT_EPOXY_RULES | Record<string, unknown> = DEFAULT_EPOXY_RULES;
    let finishCatalogue: Record<string, unknown> = { note: 'derived from the vertical module at render time' };
    try {
      const vMod = getVertical(vertical);
      finishCatalogue = vMod.finishCatalogue as unknown as Record<string, unknown>;
    } catch {
      // Unregistered vertical: fall back to the epoxy defaults above rather
      // than fail prototype creation outright.
    }
    await db.from('quote_configs').insert({
      prototype_id: prototypeId,
      vertical,
      rules: JSON.parse(JSON.stringify(rules)),
      finish_catalogue: JSON.parse(JSON.stringify(finishCatalogue)),
      sqft_min: 100,
      sqft_max: 6000,
      range_spread_pct: 0.15,
    });

    trackServer('prototype_staged', { template_id: DEFAULT_TEMPLATE_SELECTION.templateId, from_preset: false }, {
      surface: 'admin', mode: 'live', prototypeId,
    });
  }

  // Load whatever staged/saved brand+template already exists so reopening
  // the combiner resumes exactly where it left off.
  const [{ data: preview }, { data: brandKit }, { data: templateConfig }] = await Promise.all([
    db.from('prototype_previews').select('staged_brand, staged_template, expires_at').eq('prototype_id', prototypeId).maybeSingle(),
    db.from('brand_kits').select('primary_hex, secondary_hex, accent_hex, logo_path, derived_tokens, pinned_tokens').eq('prototype_id', prototypeId).maybeSingle(),
    db.from('template_configs').select('template_id, typography_id, button_style_id, style_variant').eq('prototype_id', prototypeId).maybeSingle(),
  ]);

  const usePreview = preview && new Date(preview.expires_at) > new Date();

  const stagedBrand: StagedBrand = usePreview
    ? (preview!.staged_brand as unknown as StagedBrand)
    : {
        primaryHex: brandKit?.primary_hex ?? null,
        secondaryHex: brandKit?.secondary_hex ?? null,
        accentHex: brandKit?.accent_hex ?? null,
        logoPath: brandKit?.logo_path ?? null,
        derivedTokens: brandKit?.derived_tokens ?? null,
      };

  const stagedTemplate: StagedTemplate = usePreview
    ? (preview!.staged_template as unknown as StagedTemplate)
    : {
        templateId: templateConfig?.template_id ?? DEFAULT_TEMPLATE_SELECTION.templateId,
        typographyId: templateConfig?.typography_id ?? DEFAULT_TEMPLATE_SELECTION.typographyId,
        buttonStyleId: templateConfig?.button_style_id ?? DEFAULT_TEMPLATE_SELECTION.buttonStyleId,
        styleVariant: (templateConfig?.style_variant as StyleVariant) ?? DEFAULT_TEMPLATE_SELECTION.styleVariant,
      };

  return { prototypeId, slug, status, expiresAt, vertical, stagedBrand, stagedTemplate };
}

/**
 * THE LIVE-UPDATE PATH. Called on every meaningful change in the combiner
 * (debounced client-side), upserting the staged row and returning the
 * DERIVED token set immediately — the same deriveTokens() Phase 7 uses for
 * real saves — so the preview iframe always shows exactly what deployment
 * would later produce, WCAG enforcement included, never a rougher
 * approximation of it.
 */
export async function updatePreviewAction(input: {
  prototypeId: string;
  primaryHex: string | null;
  secondaryHex: string | null;
  accentHex: string | null;
  logoPath: string | null;
  pinnedTokens?: Partial<TokenSet>;
  templateId: string;
  typographyId: string;
  buttonStyleId: string;
  styleVariant: StyleVariant;
}): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Not authorized.' };

  const derived = deriveTokens(
    { primaryHex: input.primaryHex, secondaryHex: input.secondaryHex, accentHex: input.accentHex },
    input.pinnedTokens ?? {}
  );

  const stagedBrand: StagedBrand = {
    primaryHex: input.primaryHex,
    secondaryHex: input.secondaryHex,
    accentHex: input.accentHex,
    logoPath: input.logoPath,
    derivedTokens: JSON.parse(JSON.stringify(derived)),
  };
  const stagedTemplate: StagedTemplate = {
    templateId: input.templateId,
    typographyId: input.typographyId,
    buttonStyleId: input.buttonStyleId,
    styleVariant: input.styleVariant,
  };

  const db = getSupabaseAdminClient();
  const { error } = await db
    .from('prototype_previews')
    .upsert(
      {
        prototype_id: input.prototypeId,
        staged_brand: JSON.parse(JSON.stringify(stagedBrand)),
        staged_template: JSON.parse(JSON.stringify(stagedTemplate)),
        expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'prototype_id' }
    );

  if (error) return { ok: false, error: 'Could not update the preview.' };
  return { ok: true };
}

/**
 * Uploads a logo file for real (it needs a real, fetchable URL for the live
 * preview iframe to show it) WITHOUT writing to brand_kits — that write is
 * deferred to deployPrototypeAction, same as every other staged field.
 * Phase 7's uploadLogo does the actual Storage work unchanged; this is just
 * the narrower entry point the combiner's staging flow needs instead of
 * saveBrandKitAction's combined upload-and-persist behaviour.
 */
export async function uploadLogoForStagingAction(input: {
  prototypeId: string;
  base64: string;
  mediaType: string;
}): Promise<{ ok: boolean; path?: string; publicUrl?: string; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Not authorized.' };
  return uploadLogo(input);
}

export interface DeployResult {
  ok: true;
  url: string;
  slug: string;
  sms: string;
}

/**
 * THE DEPLOYMENT ENGINE. Copies the current staged config into the real
 * brand_kits/template_configs rows via Phase 7's own saveBrandKitAction
 * (unmodified — deployment is just "now actually save it"), flips the
 * prototype live, deletes the staging row (the real tables now match it,
 * so there is nothing left to stage), and returns everything the share
 * card needs in one round trip.
 */
export async function deployPrototypeAction(prototypeId: string): Promise<DeployResult | { ok: false; error: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Not authorized.' };
  const db = getSupabaseAdminClient();

  const { data: preview } = await db
    .from('prototype_previews')
    .select('staged_brand, staged_template')
    .eq('prototype_id', prototypeId)
    .maybeSingle();
  if (!preview) return { ok: false, error: 'Nothing staged yet — make a change before deploying.' };

  const brand = preview.staged_brand as unknown as StagedBrand;
  const template = preview.staged_template as unknown as StagedTemplate;

  const saveResult = await saveBrandKitAction({
    prototypeId,
    primaryHex: brand.primaryHex,
    secondaryHex: brand.secondaryHex,
    accentHex: brand.accentHex,
    source: 'manual',
    logo: null, // already uploaded to Storage by the combiner's logo panel; path only
  });
  if (!saveResult.ok) return { ok: false, error: saveResult.error ?? 'Could not save the brand kit.' };

  // saveBrandKitAction doesn't take logoPath directly (it uploads a fresh
  // file when given one); the combiner uploads ahead of time and only
  // carries a path, so it's written directly here.
  if (brand.logoPath) {
    await db.from('brand_kits').update({ logo_path: brand.logoPath }).eq('prototype_id', prototypeId);
  }

  const { error: templateError } = await db
    .from('template_configs')
    .upsert(
      {
        prototype_id: prototypeId,
        template_id: template.templateId,
        typography_id: template.typographyId,
        button_style_id: template.buttonStyleId,
        style_variant: template.styleVariant,
      },
      { onConflict: 'prototype_id' }
    );
  if (templateError) return { ok: false, error: 'Could not save the template.' };

  const { data: prototype, error: statusError } = await db
    .from('prototypes')
    .update({ status: 'live' })
    .eq('id', prototypeId)
    .select('slug, prospect_id')
    .single();
  if (statusError || !prototype) return { ok: false, error: 'Could not publish the prototype.' };

  await db.from('prototype_previews').delete().eq('prototype_id', prototypeId);

  const { data: prospect } = await db
    .from('prospects')
    .select('business_name, contact_name')
    .eq('id', prototype.prospect_id)
    .maybeSingle();

  const url = (process.env.NEXT_PUBLIC_SITE_URL ?? '') + '/s/' + prototype.slug;
  const sms = buildDeploymentSms({
    contactFirstName: prospect?.contact_name ?? null,
    businessName: prospect?.business_name ?? 'your business',
    url,
  });

  trackServer('prototype_staged', { template_id: template.templateId, from_preset: false }, {
    surface: 'admin', mode: 'live', prototypeId,
  });
  trackServer('share_card_generated', { method: 'copy' }, { surface: 'admin', mode: 'live', prototypeId });

  return { ok: true, url, slug: prototype.slug, sms };
}

export async function revokePrototypeAction(prototypeId: string): Promise<{ ok: boolean }> {
  if (!(await requireAdmin())) return { ok: false };
  const db = getSupabaseAdminClient();
  const { error } = await db.from('prototypes').update({ status: 'revoked' }).eq('id', prototypeId);
  return { ok: !error };
}

export async function setExpiryAction(prototypeId: string, expiresAt: string | null): Promise<{ ok: boolean }> {
  if (!(await requireAdmin())) return { ok: false };
  const db = getSupabaseAdminClient();
  const { error } = await db.from('prototypes').update({ expires_at: expiresAt }).eq('id', prototypeId);
  return { ok: !error };
}

// ---------------------------------------------------------------------------
// presets — "save a full combination as a named preset, apply in one tap"
// ---------------------------------------------------------------------------

export interface PresetListItem {
  id: string;
  name: string;
  styleVariant: StyleVariant;
  palette: Record<string, unknown>;
  isSystem: boolean;
}

export async function listPresetsAction(): Promise<PresetListItem[]> {
  if (!(await requireAdmin())) return [];
  const db = getSupabaseAdminClient();
  const { data } = await db
    .from('style_presets')
    .select('id, name, style_variant, palette, is_system')
    .order('is_system', { ascending: false })
    .order('created_at', { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id, name: r.name, styleVariant: r.style_variant as StyleVariant,
    palette: r.palette as Record<string, unknown>, isSystem: r.is_system,
  }));
}

export async function saveAsPresetAction(input: {
  name: string;
  templateId: string;
  typographyId: string;
  buttonStyleId: string;
  styleVariant: StyleVariant;
  primaryHex: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Not authorized.' };
  if (!input.name.trim()) return { ok: false, error: 'Give the preset a name.' };

  const db = getSupabaseAdminClient();
  const { error } = await db.from('style_presets').insert({
    name: input.name.trim(),
    template_id: input.templateId,
    typography_id: input.typographyId,
    button_style_id: input.buttonStyleId,
    style_variant: input.styleVariant,
    palette: { hazard: input.primaryHex },
    is_system: false,
  });
  return { ok: !error, error: error ? 'Could not save that preset.' : undefined };
}

/**
 * "Apply to a new prospect in one tap": writes the preset straight into the
 * staged preview row (via the same path updatePreviewAction uses), so the
 * admin sees it instantly and can still adjust before deploying — applying
 * a preset is a starting point, not a lock.
 */
export async function applyPresetAction(prototypeId: string, presetId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Not authorized.' };
  const db = getSupabaseAdminClient();
  const { data: preset } = await db
    .from('style_presets')
    .select('template_id, typography_id, button_style_id, style_variant, palette')
    .eq('id', presetId)
    .maybeSingle();
  if (!preset) return { ok: false, error: 'Preset not found.' };

  const palette = preset.palette as { hazard?: string };
  return updatePreviewAction({
    prototypeId,
    primaryHex: palette.hazard ?? null,
    secondaryHex: null,
    accentHex: null,
    logoPath: null,
    templateId: preset.template_id,
    typographyId: preset.typography_id,
    buttonStyleId: preset.button_style_id,
    styleVariant: preset.style_variant as StyleVariant,
  });
}
