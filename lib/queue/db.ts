import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * lib/queue/db.ts — the Supabase client for the queue's own tables.
 *
 * WHY THIS EXISTS. The admin client is typed against the GENERATED Database
 * type, and 0012_queue.sql adds four objects that type has never seen:
 * tool_votes, build_log, build_months, concierge_requests, plus the
 * tool_vote_counts view. Against a generated type, from('tool_votes') resolves
 * to never, and every insert into it is a compile error.
 *
 * The correct long-term fix is to regenerate the Database type after running
 * the migration:
 *
 *   npx supabase gen types typescript --project-id <ref> > types/supabase.ts
 *
 * Until that is run, this widens the client for the queue tables only. It is
 * ONE function, in ONE file, so the untyped surface is visible and greppable
 * rather than sprinkled through call sites as inline casts — and every other
 * query in the codebase keeps its generated types intact. Delete this file
 * once the types are regenerated; nothing else changes but the import.
 */
export function getQueueDb(): SupabaseClient {
  return getSupabaseAdminClient() as unknown as SupabaseClient;
}
