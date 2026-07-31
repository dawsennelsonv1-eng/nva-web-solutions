import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  setAnalyticsSink,
  track,
  type EventContext,
  type EventName,
  type EventPropsMap,
} from '@/lib/analytics';

/**
 * lib/analytics.server.ts — the SERVER SINK for the Phase 1 typed emitter.
 *
 * Phase 1 built lib/analytics.ts with a swappable transport and a
 * setAnalyticsSink() extension point precisely so this file could exist
 * without touching it. Importing this module installs a sink that writes
 * every server-side event into analytics_events; the taxonomy, the envelope
 * and the typing all stay owned by Phase 1.
 *
 * Guarantees inherited and preserved: never throws, never blocks the user
 * action, and drops 'preview' mode centrally. Writes are fire-and-forget —
 * an analytics outage must never fail a lead.
 *
 * FILE_TREE.md addition: lib/analytics.server.ts [3]
 */

let installed = false;

function install(): void {
  if (installed) return;
  installed = true;
  setAnalyticsSink((envelope) => {
    try {
      const db = getSupabaseAdminClient();
      void db
        .from('analytics_events')
        .insert({
          event_name: envelope.event_name,
          session_id: envelope.session_id,
          prototype_id: envelope.prototype_id,
          properties: {
            ...envelope.properties,
            surface: envelope.surface,
            mode: envelope.mode,
          },
          occurred_at: envelope.occurred_at,
        })
        .then(({ error }) => {
          if (error && process.env.NODE_ENV === 'development') {
            console.warn('[analytics] insert failed:', error.message);
          }
        });
    } catch {
      /* never throws — Phase 1 rule 1 */
    }
  });
}

install();

/**
 * Server-side emit. Identical signature to the Phase 1 client emitter, so a
 * call site reads the same on either side of the boundary.
 */
export function trackServer<E extends EventName>(
  event: E,
  props: EventPropsMap[E],
  ctx: EventContext
): void {
  track(event, props, ctx);
}
