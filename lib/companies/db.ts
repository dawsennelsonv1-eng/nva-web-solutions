import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * lib/companies/db.ts — the COOKIE-BOUND client for the company tables.
 *
 * TWO SEPARATE REASONS THIS FILE EXISTS. Both matter; neither is optional.
 *
 * 1. THE TYPES ARE STALE. types/database.ts is hand-written and its own header
 *    says it matches migrations 0001–0005. 0014_companies.sql adds `companies`
 *    and `company_members` and adds `assigned_to` to `leads`. Against the
 *    generated schema, from('company_members') resolves to never and every
 *    select on it is a compile error — the same failure lib/queue/db.ts was
 *    written for, and the same one that broke a build in 13D when it was
 *    worked around at the wrong layer.
 *
 *    The correct long-term fix is to regenerate:
 *      npx supabase gen types typescript --project-id <ref> > types/database.ts
 *    Then delete this file's cast and keep the function.
 *
 * 2. IT MUST NOT BE THE SERVICE ROLE, AND THAT IS THE PART THAT MATTERS.
 *    lib/queue/db.ts widens the ADMIN client, which is service_role and
 *    bypasses RLS. Copying that pattern here would silently disable every
 *    policy in 0014 — a member query would return every company's rows and
 *    look perfectly correct while doing it.
 *
 *    So this widens the COOKIE-BOUND server client instead. The types are
 *    loose; the tenancy is not. Every read through here is still filtered by
 *    the caller's own membership, in Postgres, by policies that cannot be
 *    forgotten at a call site.
 *
 * If you take one thing from this file: loosening TYPES is cheap and
 * reversible, loosening the CLIENT is neither.
 */
export function getMemberDb(): SupabaseClient {
  return createSupabaseServerClient() as unknown as SupabaseClient;
}
