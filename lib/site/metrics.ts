import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * lib/site/metrics.ts — INSTRUMENT READINGS FOR THE PUBLIC HOMEPAGE.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: a hardcoded number in the proof block
 * is the fabrication that kills every honest thing on the page. So every
 * function here either returns a value it counted in the database, or returns
 * null — and the section renders nothing at all for a null. There is no
 * fallback value, no "approximately", no placeholder.
 *
 * WHAT IS READ, AND FROM WHERE:
 *
 *   liveInstalls()  -> public.prototypes, status = 'live', excluding the
 *                      seeded Dallas reference tenant. That row is a demo
 *                      fixture, not a customer, and counting it would inflate
 *                      the one number on the page whose credibility comes
 *                      from being small and stated in the open.
 *   quotesToDate()  -> public.quotes, exact row count. Counted with head:true
 *                      so no rows cross the wire.
 *
 * WHAT IS DELIBERATELY ABSENT, and why each one is absent rather than faked:
 *
 *   uptime                 no source table exists. Uptime is not measured
 *                          anywhere in this codebase, so it cannot be
 *                          reported. It would need an external monitor.
 *   median landing->quote  needs the analytics_events taxonomy — the exact
 *                          event_name values for landing and quote produced.
 *                          EVENTS.md has not been read into this phase.
 *   median AI response     needs the ai_jobs column names from
 *                          0010_ai_suite.sql, which is not pasted.
 *   deploys this month     there is no build_log table yet. It arrives with
 *                          the build log in 13C.
 *
 * Each of those is a one-function addition here the moment its source exists.
 */

/** The seeded reference tenant from seed.sql. A fixture, never a customer. */
const SEED_PROTOTYPE_ID = '22222222-2222-4222-8222-222222222222';

/**
 * VERIFY: set this to the date the first widget actually went live. It stamps
 * every reading in the proof block, and a wrong date here is the same class of
 * error as a wrong number. It is a constant rather than a query because no
 * table records when measurement began.
 */
export const MEASURED_SINCE = '2026-05';

export interface Reading {
  label: string;
  value: number;
  /** YYYY-MM. Rendered as MEASURED SINCE on the plate line. */
  since: string;
}

export async function liveInstalls(): Promise<Reading | null> {
  try {
    const db = getSupabaseAdminClient();
    const { count, error } = await db
      .from('prototypes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'live')
      .neq('id', SEED_PROTOTYPE_ID);
    if (error || count === null || count === undefined) return null;
    return { label: 'Live installs', value: count, since: MEASURED_SINCE };
  } catch {
    return null;
  }
}

export async function quotesToDate(): Promise<Reading | null> {
  try {
    const db = getSupabaseAdminClient();
    const { count, error } = await db
      .from('quotes')
      .select('*', { count: 'exact', head: true });
    if (error || count === null || count === undefined) return null;
    return { label: 'Quotes produced', value: count, since: MEASURED_SINCE };
  } catch {
    return null;
  }
}

/** Everything the page can honestly show today, in display order. */
export async function homepageReadings(): Promise<Reading[]> {
  const results = await Promise.all([liveInstalls(), quotesToDate()]);
  return results.filter((r): r is Reading => r !== null);
}
