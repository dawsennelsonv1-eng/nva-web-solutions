'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';

/**
 * app/actions/dashboard.ts — the numbers behind /admin. Every query here is
 * read-only; middleware already gates the page this feeds, but requireAdmin
 * is still called for the same reason every other admin action calls it —
 * consistency beats relying on two different trust models across the codebase.
 *
 * WINDOW CHOICE: funnel conversion and abandonment look at the last 7 days
 * rather than all-time. All-time would dilute a real recent problem (a step
 * that started failing yesterday) under months of healthy history — the
 * whole point of "make the drop-off point obvious at a glance" is recency.
 */

const WINDOW_DAYS = 7;

function windowStart(): string {
  return new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
}

function todayStart(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export interface DashboardData {
  configured: boolean;
  todaysLeadCount: number;
  funnel: { step: number; stepName: string; count: number }[];
  abandonment: { step: string; count: number }[];
  mrrCents: number;
  activeSubscriptions: number;
  closestToCap: {
    prototypeId: string;
    businessName: string;
    slug: string;
    analysesUsed: number;
    analysisLimit: number | null;
    pctOfCap: number | null;
    leadsCaptured: number;
  }[];
}

const STEP_ORDER: { step: number; stepName: string }[] = [
  { step: 1, stepName: 'surface' },
  { step: 2, stepName: 'finish' },
  { step: 3, stepName: 'sqft' },
  { step: 4, stepName: 'capture' },
];

export async function getDashboardDataAction(): Promise<DashboardData> {
  const empty: DashboardData = {
    configured: false, todaysLeadCount: 0, funnel: [], abandonment: [],
    mrrCents: 0, activeSubscriptions: 0, closestToCap: [],
  };
  if (!(await requireAdmin())) return empty;

  try {
    const db = getSupabaseAdminClient();

    const [{ count: todaysLeadCount }, { data: stepEvents }, { data: abandonedSessions }, { data: overview }] =
      await Promise.all([
        db.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', todayStart()),
        db
          .from('analytics_events')
          .select('properties')
          .eq('event_name', 'quote_step_viewed')
          .gte('occurred_at', windowStart())
          .limit(5000),
        db
          .from('demo_sessions')
          .select('abandoned_step')
          .not('abandoned_step', 'is', null)
          .gte('updated_at', windowStart())
          .limit(2000),
        db.rpc('billing_overview'),
      ]);

    const funnelCounts = new Map<number, number>();
    for (const row of stepEvents ?? []) {
      const step = (row.properties as { step?: unknown } | null)?.step;
      if (typeof step === 'number') funnelCounts.set(step, (funnelCounts.get(step) ?? 0) + 1);
    }
    const funnel = STEP_ORDER.map((s) => ({ ...s, count: funnelCounts.get(s.step) ?? 0 }));

    const abandonCounts = new Map<string, number>();
    for (const row of abandonedSessions ?? []) {
      const step = row.abandoned_step;
      if (step) abandonCounts.set(step, (abandonCounts.get(step) ?? 0) + 1);
    }
    const abandonment = [...abandonCounts.entries()]
      .map(([step, count]) => ({ step, count }))
      .sort((a, b) => b.count - a.count);

    const rows = overview ?? [];
    const active = rows.filter((r) => r.status === 'active' || r.status === 'trialing');
    const { data: plans } = await db.from('plans').select('code, monthly_cents');
    const monthlyByPlan = new Map((plans ?? []).map((p) => [p.code, p.monthly_cents]));
    const mrrCents = active.reduce((sum, r) => sum + (monthlyByPlan.get(r.plan_code) ?? 0), 0);

    const closestToCap = rows
      .filter((r) => r.analysis_limit !== null && (r.pct_of_cap ?? 0) >= 50)
      .slice(0, 5)
      .map((r) => ({
        prototypeId: r.prototype_id,
        businessName: r.business_name,
        slug: r.slug,
        analysesUsed: r.analyses_used,
        analysisLimit: r.analysis_limit,
        pctOfCap: r.pct_of_cap,
        leadsCaptured: r.leads_captured,
      }));

    return {
      configured: true,
      todaysLeadCount: todaysLeadCount ?? 0,
      funnel,
      abandonment,
      mrrCents,
      activeSubscriptions: active.length,
      closestToCap,
    };
  } catch {
    return empty;
  }
}
