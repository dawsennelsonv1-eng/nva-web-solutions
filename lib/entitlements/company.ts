import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { ENTITLING_STATUSES } from '@/lib/entitlements/check';

/**
 * lib/entitlements/company.ts — DOES THIS COMPANY HAVE AN ACTIVE SUBSCRIPTION?
 *
 * ============================================================================
 * WHY THIS FILE EXISTS AT ALL, GIVEN check.ts
 * ============================================================================
 *
 * check.ts answers a different question. Its subject is a PROTOTYPE and its
 * features are widget-shaped (quote.ai_analysis, lead.capture, the per-session
 * fairness limit). The member dashboard asks something check.ts has no way to
 * express: "the person signed in belongs to company X — is X a customer?"
 *
 * There is no direct edge from a company to a subscription. The chain is two
 * hops, and both are real columns:
 *
 *     companies.id
 *        <- prototypes.company_id            (0014_companies.sql:109, NULLABLE)
 *        <- subscriptions.prototype_id       (0002_billing.sql:91,  NOT NULL)
 *
 * So the question is resolved as: does any prototype owned by this company
 * carry a subscription in an entitling state. A company with no prototype has
 * no subscription and therefore no entitlement — which is exactly the state a
 * fresh self-serve signup lands in, because app/actions/signup.ts creates a
 * company and a membership and no prototype.
 *
 * ============================================================================
 * THIS USES THE SERVICE ROLE, AND THAT IS DELIBERATE
 * ============================================================================
 *
 * lib/auth/member.ts is emphatic that member-facing reads go through the
 * cookie-bound client so RLS runs, and it is right about the tables it covers.
 * `subscriptions` is not one of them. 0014 grants members read access to
 * companies, company_members, prototypes, leads and quotes; a member has no
 * read policy on the billing tables. A cookie-bound select here would return
 * zero rows for EVERY caller — including a contractor who has paid — and the
 * gate would deny the whole customer base while looking perfectly correct.
 *
 * So this reads through service_role, like check.ts already does for the same
 * question. THE TRUST CHAIN IS STILL SOUND, because the companyId is not
 * supplied by the caller: it comes from requireMember(), which resolved it
 * through the cookie-bound client under members_read. Identity is proved by
 * RLS; only the billing lookup that RLS cannot answer is escalated, and it is
 * scoped to that one proved company id.
 *
 * Never export a variant of this that takes a company id from a request body.
 *
 * ============================================================================
 * FAILURE POSTURE: OPEN, AND THE OPPOSITE OF check.ts ON PURPOSE
 * ============================================================================
 *
 * check.ts fails CLOSED because the thing behind its gate costs us money on
 * every call — an unknown entitlement must not buy inference.
 *
 * Nothing behind THIS gate costs anything. Overview, Leads and Team are reads
 * of the caller's own company, already filtered by 0014's policies, so the
 * worst case of failing open is that somebody who has not paid briefly sees
 * their own empty pipeline. The worst case of failing closed is telling a
 * paying contractor to go buy the product he already bought, during an outage
 * he did not cause. That asymmetry decides it: 'unknown' is treated as access.
 *
 * 'unknown' is a distinct state rather than being folded into 'active' so the
 * caller can tell a real customer from a degraded read if that ever matters.
 *
 * ============================================================================
 * NOT MEMOISED, AND NOT BY CHOICE
 * ============================================================================
 *
 * React's cache() is the right tool: the layout and the page inside it are one
 * render, and it would make them share one lookup instead of issuing the same
 * two queries twice. It is not used because it DOES NOT EXIST in the pinned
 * @types/react 18.3.12 — `cache` is declared in that package's canary.d.ts and
 * not in index.d.ts, so `import { cache } from 'react'` is TS2305 and fails
 * the build. Same class of trap as startTransition(async) in CONVENTIONS.
 *
 * The cost of not having it is two extra indexed lookups on a dashboard render
 * that is already force-dynamic. That is nothing, and it is much cheaper than a
 * module-scope memo, which in Node would be shared ACROSS requests and would be
 * exactly the stale entitlement cache check.ts refuses to keep.
 *
 * VERIFY: when @types/react goes to 19, wrap resolve() in cache() and delete
 * this comment.
 */

/** What the member surfaces are allowed to render. */
export type CompanyAccess =
  | { state: 'active'; planCode: string | null }
  | { state: 'unpaid'; reason: 'no_prototype' | 'no_subscription' | 'not_entitling' }
  | { state: 'unknown' };

/**
 * The one predicate every call site should use. Written so that adding a
 * future state defaults to granting access rather than silently locking
 * customers out — the failure direction argued for above.
 */
export function hasFullAccess(access: CompanyAccess): boolean {
  return access.state !== 'unpaid';
}

/**
 * VERIFY: types/database.ts is hand-written and covers 0001-0005 plus
 * 0017-0019. `prototypes.company_id` arrives in 0014, so the generated row
 * type for `prototypes` does not know the column exists and .eq('company_id')
 * is a compile error against it. This is the same narrow structural cast used
 * in app/actions/signup.ts and lib/companies/db.ts: it names only the two
 * calls relied on here, and every value read off the result is checked below
 * rather than asserted. Delete it when the types are regenerated.
 */
type Row = Record<string, unknown>;

interface NarrowDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): PromiseLike<{ data: Row[] | null; error: unknown }>;
      in(col: string, vals: string[]): PromiseLike<{ data: Row[] | null; error: unknown }>;
    };
  };
}

function idsOf(rows: Row[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const id = r.id;
    if (typeof id === 'string') out.push(id);
  }
  return out;
}

async function resolve(companyId: string): Promise<CompanyAccess> {
  try {
    const db = getSupabaseAdminClient() as unknown as NarrowDb;

    const protoRes = await db.from('prototypes').select('id').eq('company_id', companyId);
    if (protoRes.error) return { state: 'unknown' };

    const prototypeIds = idsOf(protoRes.data ?? []);
    if (prototypeIds.length === 0) return { state: 'unpaid', reason: 'no_prototype' };

    const subRes = await db
      .from('subscriptions')
      .select('plan_code, status')
      .in('prototype_id', prototypeIds);
    if (subRes.error) return { state: 'unknown' };

    const subs = subRes.data ?? [];
    if (subs.length === 0) return { state: 'unpaid', reason: 'no_subscription' };

    // A company can own more than one prototype, so more than one
    // subscription. ANY entitling row grants the dashboard — a contractor with
    // one live site and one cancelled one is still a customer.
    for (const s of subs) {
      const status = s.status;
      if (typeof status === 'string' && ENTITLING_STATUSES.has(status)) {
        const plan = s.plan_code;
        return { state: 'active', planCode: typeof plan === 'string' ? plan : null };
      }
    }

    return { state: 'unpaid', reason: 'not_entitling' };
  } catch {
    return { state: 'unknown' };
  }
}

/**
 * Resolve this company's commercial state. Safe to call more than once in a
 * render; see the note above on why it is not memoised.
 */
export async function resolveCompanyAccess(companyId: string): Promise<CompanyAccess> {
  return resolve(companyId);
}
