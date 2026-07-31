import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/**
 * SERVER CLIENT (anon key + caller's auth cookies, RLS-governed) and THE
 * SINGLE TENANT-SCOPING HELPER (CONVENTIONS.md / DATA_MODEL.md §0).
 *
 * THE TENANCY RULE, enforced here and only here:
 * every read or write that touches prospect-owned data is scoped by
 * prototype_id THROUGH withTenant()/tenantFilter(). A literal
 * `.eq('prototype_id', …)` anywhere outside this file is a defect — it is
 * greppable, and Phase 12A's audit greps for it. RLS (0003) is the security
 * floor; this helper is the consistency layer that keeps every query
 * honest about which tenant it serves.
 */

export function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase server client requested but NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.'
    );
  }
  const cookieStore = cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Safe to ignore: middleware/route handlers perform the writes.
        }
      },
    },
  });
}

// ---------------------------------------------------------------------------
// tenant scoping
// ---------------------------------------------------------------------------

/** Every table carrying a prototype_id column — the tenant surface. */
export const TENANT_TABLES = [
  'brand_kits',
  'template_configs',
  'quote_configs',
  'quotes',
  'leads',
  'demo_sessions',
  'analytics_events',
  'ai_jobs',
  'usage_counters',
  'subscriptions',
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

/** Anything exposing PostgREST's .eq() — select/update/delete builders. */
interface TenantFilterable<T> {
  eq(column: 'prototype_id', value: string): T;
}

/**
 * THE helper. Applies the tenant scope to a query builder:
 *
 *   const db = createSupabaseServerClient();
 *   const q = withTenant(db.from('leads').select('*'), prototypeId);
 */
export function withTenant<T extends TenantFilterable<T>>(
  query: T,
  prototypeId: string
): T {
  return query.eq('prototype_id', prototypeId);
}

/** Alias kept for call sites that read better as a filter step. */
export const tenantFilter = withTenant;
