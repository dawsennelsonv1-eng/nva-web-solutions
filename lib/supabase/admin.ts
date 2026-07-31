import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * SERVICE-ROLE CLIENT. BYPASSES RLS. Read this comment before using it.
 *
 * Legitimate callers (the complete list — extend it consciously, in review):
 *   - the webhook path (Phase 5.5): the ONLY writer of subscriptions,
 *     payments, prototypes.tier / subscription_status
 *   - usage metering (Phase 3): increment_usage / get_usage RPCs, which are
 *     EXECUTE-revoked from anon and authenticated by 0003_rls.sql
 *   - admin server actions and admin pages behind the /admin gate
 *   - lead notification dispatch (reads it must perform after an anon write)
 *
 * NEVER use this client to read tenant data for a user-facing page just
 * because RLS made the anon path inconvenient — that is the exact failure
 * mode CONVENTIONS.md bans, and Phase 12A audits imports of this module.
 * 'server-only' makes any client-bundle import a build error.
 *
 * Lazy singleton; env read at call time so builds pass with no env set.
 */

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase ADMIN client requested but NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. This must only ever happen server-side.'
    );
  }
  adminClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
