'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { uploadLogo } from '@/lib/storage/logos';
import { deriveTokens, type TokenSet, type DerivedTokens } from '@/lib/brand/tokens';
import { extractBrandOnServer, isServerExtractionEnabled } from '@/lib/brand/extract.server';
import { hexToRgb } from '@/lib/brand/quantize';
import type { DbExtractionSource } from '@/types/database';

/**
 * app/actions/brand.ts — THE SERVER ACTIONS. "Engine only, not the admin UI"
 * (brief) — this is the clean surface a Phase 9 admin screen will call.
 *
 * TIER ROUTING lives here, and it is the reason all three tiers converge on
 * one action rather than three: whichever tier produced the hexes, the
 * SAVE path is identical — derive the full token set, enforce AA, persist,
 * and record which tier it came from in brand_kits.extraction_source. The
 * caller says where the colours came from; the engine does the rest the
 * same way every time.
 *
 * extraction_source values (0001_init.sql enum, unchanged):
 *   'client_canvas' = Tier 1, the browser  (primary path)
 *   'server'        = Tier 2, sharp behind BRAND_SERVER_EXTRACTION
 *   'manual'        = Tier 3, typed by hand (always available, never hidden)
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeHex(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const trimmed = hex.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : '#' + trimmed;
  return HEX_RE.test(withHash) ? withHash.toLowerCase() : null;
}

export interface SaveBrandInput {
  prototypeId: string;
  primaryHex: string | null;
  secondaryHex: string | null;
  accentHex: string | null;
  source: DbExtractionSource;
  /** Base64 logo to upload alongside, if the caller has one. */
  logo?: { base64: string; mediaType: string } | null;
}

export interface SaveBrandResult {
  ok: boolean;
  error?: string;
  tokens?: DerivedTokens;
  logoPath?: string | null;
}

/**
 * THE ONE WRITE PATH for a brand kit. Derives the full token set, enforces
 * WCAG AA, honours pinned tokens, and persists — all in one call so a
 * half-applied brand (colours saved but tokens stale) is not representable.
 */
export async function saveBrandKitAction(input: SaveBrandInput): Promise<SaveBrandResult> {
  if (!(await requireAdmin())) return { ok: false, error: 'Not authorized.' };

  const primary = normalizeHex(input.primaryHex);
  const secondary = normalizeHex(input.secondaryHex);
  const accent = normalizeHex(input.accentHex);

  if (input.primaryHex && !primary) {
    return { ok: false, error: 'That primary colour is not a valid hex value.' };
  }

  const db = getSupabaseAdminClient();

  // Pinned tokens must survive re-extraction (brief, deliverable 5), so they
  // are read BEFORE deriving and layered on top afterwards.
  const { data: existing } = await db
    .from('brand_kits')
    .select('id, pinned_tokens, logo_path')
    .eq('prototype_id', input.prototypeId)
    .maybeSingle();

  const pinned = (existing?.pinned_tokens ?? {}) as Partial<TokenSet>;
  const tokens = deriveTokens({ primaryHex: primary, secondaryHex: secondary, accentHex: accent }, pinned);

  let logoPath: string | null = existing?.logo_path ?? null;
  if (input.logo) {
    const upload = await uploadLogo({
      prototypeId: input.prototypeId,
      base64: input.logo.base64,
      mediaType: input.logo.mediaType,
    });
    if (!upload.ok) return { ok: false, error: upload.error };
    logoPath = upload.path ?? logoPath;
  }

  const row = {
    prototype_id: input.prototypeId,
    logo_path: logoPath,
    primary_hex: primary,
    secondary_hex: secondary,
    accent_hex: accent,
    derived_tokens: JSON.parse(JSON.stringify(tokens)),
    extraction_source: input.source,
  };

  const { error } = existing
    ? await db.from('brand_kits').update(row).eq('id', existing.id)
    : await db.from('brand_kits').insert(row);

  if (error) return { ok: false, error: 'Could not save the brand kit.' };

  return { ok: true, tokens, logoPath };
}

/**
 * TIER 2 entry point. Called only when the browser path failed AND the
 * feature flag is on; returns a plain 'unavailable' rather than throwing so
 * the caller can fall through to Tier 3 without special-casing.
 */
export async function extractBrandServerSideAction(input: {
  prototypeId: string;
  base64: string;
}): Promise<{ ok: boolean; primaryHex?: string | null; secondaryHex?: string | null; accentHex?: string | null; reason?: string }> {
  if (!(await requireAdmin())) return { ok: false, reason: 'not_authorized' };
  if (!isServerExtractionEnabled()) return { ok: false, reason: 'disabled' };

  try {
    const bytes = Buffer.from(input.base64, 'base64');
    const result = await extractBrandOnServer(bytes);
    if (!result.ok) return { ok: false, reason: result.reason };
    return {
      ok: true,
      primaryHex: result.result.primaryHex,
      secondaryHex: result.result.secondaryHex,
      accentHex: result.result.accentHex,
    };
  } catch {
    return { ok: false, reason: 'decode_failed' };
  }
}

/**
 * Per-token manual override + pinning (brief, deliverable 5). A pinned token
 * is stored separately from derived_tokens precisely so it can survive the
 * next extraction — derived_tokens is regenerated wholesale on every save,
 * pinned_tokens is not.
 */
export async function pinTokenAction(input: {
  prototypeId: string;
  token: keyof TokenSet;
  hex: string | null;
}): Promise<{ ok: boolean; error?: string; tokens?: DerivedTokens }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Not authorized.' };

  const hex = input.hex === null ? null : normalizeHex(input.hex);
  if (input.hex !== null && !hex) return { ok: false, error: 'That is not a valid hex value.' };

  const db = getSupabaseAdminClient();
  const { data: existing } = await db
    .from('brand_kits')
    .select('id, pinned_tokens, primary_hex, secondary_hex, accent_hex')
    .eq('prototype_id', input.prototypeId)
    .maybeSingle();

  if (!existing) return { ok: false, error: 'No brand kit for this prototype yet.' };

  const pinned = { ...((existing.pinned_tokens ?? {}) as Partial<TokenSet>) };
  if (hex === null) delete pinned[input.token];
  else pinned[input.token] = hex;

  // Re-derive so the caller immediately sees the effect of the pin, rather
  // than the pin only taking hold on some later extraction.
  const tokens = deriveTokens(
    {
      primaryHex: existing.primary_hex,
      secondaryHex: existing.secondary_hex,
      accentHex: existing.accent_hex,
    },
    pinned
  );

  const { error } = await db
    .from('brand_kits')
    .update({
      pinned_tokens: JSON.parse(JSON.stringify(pinned)),
      derived_tokens: JSON.parse(JSON.stringify(tokens)),
    })
    .eq('id', existing.id);

  if (error) return { ok: false, error: 'Could not save that override.' };
  return { ok: true, tokens };
}

/** Reads the current kit for an admin editor. Never used by public routes. */
export async function getBrandKitAction(prototypeId: string) {
  if (!(await requireAdmin())) return null;
  const db = getSupabaseAdminClient();
  const { data } = await db
    .from('brand_kits')
    .select('logo_path, primary_hex, secondary_hex, accent_hex, derived_tokens, pinned_tokens, extraction_source')
    .eq('prototype_id', prototypeId)
    .maybeSingle();
  return data ?? null;
}

/**
 * TIER 3 — manual hex entry. A thin wrapper over the same save path,
 * existing as its own export so the "always available, never hidden"
 * requirement is legible in the API surface rather than being a flag on
 * another function.
 */
export async function saveManualBrandAction(input: {
  prototypeId: string;
  primaryHex: string;
  secondaryHex?: string | null;
  accentHex?: string | null;
}): Promise<SaveBrandResult> {
  return saveBrandKitAction({
    prototypeId: input.prototypeId,
    primaryHex: input.primaryHex,
    secondaryHex: input.secondaryHex ?? null,
    accentHex: input.accentHex ?? null,
    source: 'manual',
    logo: null,
  });
}

/** Validates a hex without saving — for live feedback in a manual-entry field. */
export async function validateHexAction(hex: string): Promise<{ valid: boolean; normalized: string | null }> {
  const normalized = normalizeHex(hex);
  return { valid: normalized !== null && hexToRgb(normalized) !== null, normalized };
}
