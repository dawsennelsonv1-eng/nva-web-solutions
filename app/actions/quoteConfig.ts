'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { ensureVerticalsRegistered } from '@/lib/verticals/manifest';
import { getVertical, hasVertical } from '@/lib/verticals/registry';
import type { Json } from '@/types/database';

/**
 * app/actions/quoteConfig.ts — THE RATES A CONTRACTOR IS ACTUALLY QUOTED FROM.
 *
 * Until this existed, quote_configs.rules could only be changed by editing the
 * database directly. That is survivable with one customer and is the thing
 * that breaks at customer number two — every rate change a contractor asks for
 * becomes a hand-written SQL statement against production, with no validation,
 * no audit, and no second pair of eyes.
 *
 * ============================================================================
 * THE ONLY VALIDATOR IS THE VERTICAL'S OWN SCHEMA
 * ============================================================================
 *
 * saveQuoteConfigAction does not check a single rate itself. It hands the
 * document to `module.pricingRuleSchema` and refuses anything that does not
 * parse. Three properties follow from that and none of them are re-implemented
 * here:
 *
 *   - The schema is `.strict()`, so a key the admin form invented is rejected
 *     rather than written into a document the pricing kernel will later read.
 *   - Its bounds are real. `pctAdjust` is capped at -0.5..1 so a modifier typed
 *     as 1800 instead of 18 cannot multiply a quote by nineteen.
 *   - A vertical shipped next month gets correct validation for free, because
 *     the module it ships with carries its own schema.
 *
 * SPEC R-113 SURVIVES THIS. R-113 forbids a rate living in TypeScript inside
 * the pricing kernel. This file writes rates into the database, which is where
 * R-113 says they belong; it is the editor for the contractor-owned document,
 * not a second source of prices. Nothing here is ever read by the kernel.
 *
 * ============================================================================
 * WHY THE WHOLE DOCUMENT IS REPLACED RATHER THAN PATCHED
 * ============================================================================
 *
 * A partial update would mean a rules document could be half old and half new
 * if a save raced another save. Replacing the whole jsonb makes the write
 * atomic at the row level: a quote priced during a save reads either every old
 * rate or every new one, never a mixture of the two, which is the difference
 * between a stale quote and an incoherent one.
 */

export interface QuoteConfigSummary {
  id: string;
  prototypeId: string;
  slug: string;
  vertical: string;
  /** False when the registered module list has no entry for this vertical. */
  verticalRegistered: boolean;
  sqftMin: number;
  sqftMax: number;
  updatedAt: string;
}

export interface QuoteConfigDetail extends QuoteConfigSummary {
  rules: unknown;
  /** Tier keys the module declares, so the form can label rate rows. */
  finishLabels: Record<string, string>;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

/** Every config, newest edit first. Admin-gated. */
export async function listQuoteConfigsAction(): Promise<QuoteConfigSummary[]> {
  if (!(await requireAdmin())) return [];
  ensureVerticalsRegistered();

  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from('quote_configs')
    .select('id, prototype_id, vertical, sqft_min, sqft_max, updated_at')
    .order('updated_at', { ascending: false });
  if (error || !data) return [];

  // Slugs come from a second read rather than a join: the generated schema
  // declares no relationship between these tables (Relationships: []), so a
  // nested select resolves to an error type at compile time.
  const ids = data.map((c) => c.prototype_id);
  const slugs = new Map<string, string>();
  if (ids.length > 0) {
    const { data: protos } = await db.from('prototypes').select('id, slug').in('id', ids);
    for (const p of protos ?? []) slugs.set(p.id, p.slug);
  }

  return data.map((c) => ({
    id: c.id,
    prototypeId: c.prototype_id,
    slug: slugs.get(c.prototype_id) ?? '(unknown)',
    vertical: c.vertical,
    verticalRegistered: hasVertical(c.vertical),
    sqftMin: c.sqft_min,
    sqftMax: c.sqft_max,
    updatedAt: c.updated_at,
  }));
}

export async function getQuoteConfigAction(id: string): Promise<QuoteConfigDetail | null> {
  if (!(await requireAdmin())) return null;
  ensureVerticalsRegistered();

  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from('quote_configs')
    .select('id, prototype_id, vertical, rules, sqft_min, sqft_max, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;

  const { data: proto } = await db
    .from('prototypes')
    .select('slug')
    .eq('id', data.prototype_id)
    .maybeSingle();

  // Finish labels are read off the module so the form says "Metallic epoxy"
  // rather than "metallic". Absent for an unregistered vertical, which the
  // page reports rather than papering over.
  const finishLabels: Record<string, string> = {};
  if (hasVertical(data.vertical)) {
    for (const f of getVertical(data.vertical).finishes) {
      finishLabels[f.tierKey] = f.label;
    }
  }

  return {
    id: data.id,
    prototypeId: data.prototype_id,
    slug: proto?.slug ?? '(unknown)',
    vertical: data.vertical,
    verticalRegistered: hasVertical(data.vertical),
    sqftMin: data.sqft_min,
    sqftMax: data.sqft_max,
    updatedAt: data.updated_at,
    rules: data.rules,
    finishLabels,
  };
}

export interface SaveQuoteConfigInput {
  id: string;
  rules: unknown;
  sqftMin: number;
  sqftMax: number;
}

export async function saveQuoteConfigAction(input: SaveQuoteConfigInput): Promise<SaveResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Not authorized.' };
  ensureVerticalsRegistered();

  const db = getSupabaseAdminClient();
  const { data: existing, error: readError } = await db
    .from('quote_configs')
    .select('id, vertical, prototype_id')
    .eq('id', input.id)
    .maybeSingle();
  if (readError || !existing) return { ok: false, error: 'That configuration no longer exists.' };

  if (!hasVertical(existing.vertical)) {
    return {
      ok: false,
      error:
        `The '${existing.vertical}' module is not registered, so its rules cannot be ` +
        'validated. Saving without validation is how a broken config reaches a live quote.',
    };
  }

  // THE VALIDATION. Everything this action refuses, it refuses here.
  const parsed = getVertical(existing.vertical).pricingRuleSchema.safeParse(input.rules);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'rules'}: ${i.message}`)
      .join(' · ');
    return { ok: false, error: `Rejected by the ${existing.vertical} schema — ${detail}` };
  }

  // The DB has its own check constraint on this pair; failing here gives a
  // sentence instead of a Postgres error string.
  if (!(input.sqftMax > input.sqftMin) || input.sqftMin <= 0) {
    return { ok: false, error: 'Maximum area must be greater than minimum, and both above zero.' };
  }

  const { error: writeError } = await db
    .from('quote_configs')
    .update({
      rules: parsed.data as Json,
      sqft_min: input.sqftMin,
      sqft_max: input.sqftMax,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id);
  if (writeError) return { ok: false, error: 'The save failed. Nothing was changed.' };

  /**
   * NO ANALYTICS EVENT IS EMITTED HERE, and that is a gap worth naming rather
   * than filling badly.
   *
   * A rate edit is the highest-consequence write in the whole admin surface —
   * every quote after it is a different number — so it plainly deserves an
   * audit trail. But trackServer takes a CLOSED union of event names drawn
   * from EVENTS.md, whose first rule is that later phases "emit from this list
   * and invent nothing." Adding `quote_config_updated` means editing the
   * taxonomy document and the typed emitter, which are two files outside this
   * change.
   *
   * Emitting a loosely-related existing event instead would poison the funnel
   * data that taxonomy exists to protect. So: nothing is emitted, and the
   * follow-up is to add the event properly. `admin.email` is already resolved
   * above and is the value that audit line wants.
   */
  void admin;

  return { ok: true };
}
