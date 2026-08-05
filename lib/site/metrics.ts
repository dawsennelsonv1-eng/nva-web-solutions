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
 * ============================================================================
 * 13D: THREE READINGS ADDED. NONE OF THEM ARE GUARANTEED TO RENDER.
 * ============================================================================
 *
 * The 13B version listed four metrics as absent because their sources "had not
 * been read into this phase." Three of those four sources turned out to exist
 * and were simply never queried. They are queried now.
 *
 * That is NOT the same as saying they will show a number. Each returns null
 * when its table has no qualifying rows, which on a platform this young is the
 * likely case for at least two of them. That is the intended behaviour, not a
 * degraded one: a metric that renders only once it is true is the entire point
 * of this module. The section will grow by itself as the system does.
 *
 *   liveInstalls()          prototypes, status = 'live', excluding the seeded
 *                           Dallas reference tenant. That row is a demo
 *                           fixture, not a customer, and counting it would
 *                           inflate the one number on the page whose
 *                           credibility comes from being small.
 *   quotesToDate()          quotes, exact row count, head:true so no rows
 *                           cross the wire.
 *   medianAiResponse()      ai_jobs.duration_ms where status = 'succeeded'.
 *   medianLandingToQuote()  analytics_events, widget_opened -> quote_calculated
 *                           paired on session_id.
 *   deploysThisMonth()      build_log rows dated in the current UTC month.
 *
 * STILL ABSENT, and still absent rather than faked:
 *
 *   uptime   No source table exists anywhere in this codebase. Uptime cannot
 *            be measured by the thing whose uptime is in question — if the app
 *            is down it is not writing a row saying so. This needs an external
 *            monitor and it will never be honestly answerable from here.
 *
 * ============================================================================
 * WHY THE MEDIANS ARE COMPUTED IN JAVASCRIPT
 * ============================================================================
 *
 * Postgres has percentile_cont. Reaching it through supabase-js means an RPC,
 * which means a migration defining the function, which means this phase would
 * be shipping a schema change to render a number that may well be null. So the
 * rows are fetched and the median is taken here.
 *
 * That is only defensible because of the volume, and the volume is the reason
 * it is bounded: each query takes at most SAMPLE_LIMIT rows, most recent
 * first. At current scale that is the entire table. If it ever is not, the
 * reading silently becomes "median of the most recent N", which is a different
 * statistic than it claims to be — so the limit is set high enough that
 * crossing it is a real event, and crossing it is the signal to move this to
 * an RPC rather than to raise the constant.
 *
 * MEDIAN, NOT MEAN, and this is not a stylistic preference. One timed-out AI
 * call at 30 seconds drags a mean of twenty samples up by more than a second
 * and makes the system look slower than a visitor will ever experience. The
 * median is what a typical homeowner actually waits.
 */

/** The seeded reference tenant from seed.sql. A fixture, never a customer. */
const SEED_PROTOTYPE_ID = '22222222-2222-4222-8222-222222222222';

/** See the note above before raising this. */
const SAMPLE_LIMIT = 2000;

/**
 * VERIFY: set this to the date the first widget actually went live. It stamps
 * every reading in the proof block, and a wrong date here is the same class of
 * error as a wrong number. It is a constant rather than a query because no
 * table records when measurement began.
 */
export const MEASURED_SINCE = '2026-05';

export interface Reading {
  label: string;
  /**
   * The raw counted number. Kept as a number because the hero Plate takes a
   * numeric count field — see app/(public)/page.tsx.
   */
  value: number;
  /**
   * What is printed. Separate from `value` because a duration is not read the
   * way a count is: 1847 milliseconds is a true number and a useless one on a
   * phone. Formatting lives here, next to the query that knows the units,
   * rather than in the component.
   */
  display: string;
  /** YYYY-MM. Rendered as MEASURED SINCE on the plate line. */
  since: string;
}

/** Median of a numeric sample. Null for an empty sample — never 0. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lo = sorted[mid - 1];
  const hi = sorted[mid];
  if (lo === undefined || hi === undefined) return null;
  return (lo + hi) / 2;
}

/** 1847 -> "1.8 s". 640 -> "0.6 s". Seconds, because that is how waiting is felt. */
function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
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
    return {
      label: 'Live installs',
      value: count,
      display: count.toLocaleString('en-US'),
      since: MEASURED_SINCE,
    };
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
    return {
      label: 'Quotes produced',
      value: count,
      display: count.toLocaleString('en-US'),
      since: MEASURED_SINCE,
    };
  } catch {
    return null;
  }
}

/**
 * Median time the AI took to return a usable answer.
 *
 * status = 'succeeded' ONLY. The enum is ('succeeded','failed','invalid_output')
 * — 0001_init.sql. Including failures would be measuring the wrong thing twice
 * over: a call that timed out at the ceiling reports the ceiling, not a
 * response time, and a homeowner never waited for it because the widget had
 * already degraded him to the deterministic path.
 *
 * This is the reading most likely to be REAL today, because ai_jobs is written
 * by every analysis the platform has ever run, including the ones on /demo.
 */
export async function medianAiResponse(): Promise<Reading | null> {
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db
      .from('ai_jobs')
      .select('duration_ms')
      .eq('status', 'succeeded')
      .not('duration_ms', 'is', null)
      .order('created_at', { ascending: false })
      .limit(SAMPLE_LIMIT);
    if (error || !data) return null;

    const samples: number[] = [];
    for (const row of data) {
      const d = (row as { duration_ms: number | null }).duration_ms;
      if (typeof d === 'number' && d > 0) samples.push(d);
    }
    const m = median(samples);
    if (m === null) return null;

    return {
      label: 'Median AI response',
      value: Math.round(m),
      display: seconds(m),
      since: MEASURED_SINCE,
    };
  } catch {
    return null;
  }
}

/**
 * Median time from the widget becoming interactive to a price existing.
 *
 * Paired on session_id: the first `widget_opened` and the first
 * `quote_calculated` in the same session. Both event names are canonical in
 * EVENTS.md and both are emitted server-side through analytics.server.ts.
 *
 * SESSIONS THAT NEVER REACHED A PRICE ARE EXCLUDED, and that exclusion is a
 * bias worth naming: this measures how long the people who GOT a quote waited,
 * not how long everyone waited. It is not a completion rate and the label does
 * not imply one. The abandonment question is answered by `widget_abandoned`,
 * which is a different number for a different page.
 *
 * Negative or absurd deltas are dropped rather than clamped — a clamped
 * outlier is a fabricated data point, and dropping is the honest handling of a
 * clock that disagreed with itself.
 */
export async function medianLandingToQuote(): Promise<Reading | null> {
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db
      .from('analytics_events')
      .select('event_name, session_id, occurred_at')
      .in('event_name', ['widget_opened', 'quote_calculated'])
      .not('session_id', 'is', null)
      .order('occurred_at', { ascending: true })
      .limit(SAMPLE_LIMIT);
    if (error || !data) return null;

    const opened = new Map<string, number>();
    const quoted = new Map<string, number>();
    for (const raw of data) {
      const row = raw as { event_name: string; session_id: string | null; occurred_at: string };
      if (!row.session_id) continue;
      const t = Date.parse(row.occurred_at);
      if (Number.isNaN(t)) continue;
      // Ascending order means the first write per session is the earliest.
      if (row.event_name === 'widget_opened') {
        if (!opened.has(row.session_id)) opened.set(row.session_id, t);
      } else if (!quoted.has(row.session_id)) {
        quoted.set(row.session_id, t);
      }
    }

    const deltas: number[] = [];
    for (const [session, start] of opened) {
      const end = quoted.get(session);
      if (end === undefined) continue;
      const delta = end - start;
      // Drop a delta that ran backwards, or one over an hour — a tab left open
      // overnight is not a measurement of how fast the software is.
      if (delta <= 0 || delta > 3_600_000) continue;
      deltas.push(delta);
    }

    const m = median(deltas);
    if (m === null) return null;

    return {
      label: 'Median time to a quote',
      value: Math.round(m),
      display: seconds(m),
      since: MEASURED_SINCE,
    };
  } catch {
    return null;
  }
}

/**
 * Build-log entries dated in the current UTC month.
 *
 * NAMED "Build log entries", not "deploys", and the difference is deliberate.
 * build_log (0012_queue.sql) is a hand-written record of work, not a deploy
 * hook — nothing counts Vercel deployments. Labelling these "deploys this
 * month" would claim an automated measurement for a manual one, which is
 * precisely the class of small lie this whole section exists to avoid. When a
 * real deploy webhook exists, that becomes its own function.
 */
export async function buildLogThisMonth(): Promise<Reading | null> {
  try {
    const db = getSupabaseAdminClient();
    const now = new Date();
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const firstOfMonth = first.toISOString().slice(0, 10);

    const { count, error } = await db
      .from('build_log')
      .select('*', { count: 'exact', head: true })
      .gte('occurred_on', firstOfMonth);
    if (error || count === null || count === undefined) return null;
    // Zero entries this month is a true statement, but it is a statement about
    // the calendar rather than about the software, and on the third of the
    // month it reads as a dead project. Withheld until there is one.
    if (count === 0) return null;

    return {
      label: 'Build log entries this month',
      value: count,
      display: count.toLocaleString('en-US'),
      since: firstOfMonth.slice(0, 7),
    };
  } catch {
    return null;
  }
}

/**
 * Everything the page can honestly show today, in display order.
 *
 * Ordered most-verifiable first: counts he could in principle audit, then
 * derived timings. Every one of these can be null and the caller must render
 * nothing at all when they all are — see ProofOfOperation.
 */
export async function homepageReadings(): Promise<Reading[]> {
  const results = await Promise.all([
    liveInstalls(),
    quotesToDate(),
    medianAiResponse(),
    medianLandingToQuote(),
    buildLogThisMonth(),
  ]);
  return results.filter((r): r is Reading => r !== null);
}
