import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/**
 * BROWSER CLIENT — anon key, RLS-governed. Lazy singleton: env is read at
 * first call, never at import, so the production build succeeds with no env
 * configured (Phase 1 guarantee holds through every phase).
 *
 * What this client can actually do is defined by 0003_rls.sql, not by app
 * code: insert leads/quotes/sessions/analytics, read active plans, and call
 * the two public point-lookup RPCs. Everything else is a hard 42501.
 * Reminder from that file: NEVER chain .select() on anon inserts — the anon
 * role has no SELECT privilege on those tables; keep the default
 * return=minimal.
 */

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase browser client requested but NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.'
    );
  }
  browserClient = createBrowserClient<Database>(url, key);
  return browserClient;
}
