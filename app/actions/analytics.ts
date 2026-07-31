'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { Surface, WidgetMode } from '@/types';

/**
 * app/actions/analytics.ts — Phase 5 addition. The relay a browser-side
 * track() call forwards to, closing the client -> analytics_events gap
 * described in lib/analytics.client.ts.
 *
 * Deliberately NOT re-validated against the full typed EventPropsMap here:
 * the browser already produced a type-checked envelope at its own call site
 * (lib/analytics.ts's track<E extends EventName>() enforces the shape before
 * this ever gets called), so re-deriving that generic constraint server-side
 * would only buy defence against a malicious client deliberately forging a
 * request to this action — which, for an internal telemetry sink with no
 * downstream effect beyond a row in analytics_events, is not worth the
 * shape-widening this file would otherwise need to accept genuinely
 * event-specific property bags. Never throws; a bad payload is dropped, not
 * surfaced.
 */

interface ClientEventEnvelope {
  event_name: string;
  session_id: string | null;
  prototype_id: string | null;
  surface: Surface;
  mode: WidgetMode;
  occurred_at: string;
  properties: Record<string, unknown>;
}

export async function recordEventAction(envelope: ClientEventEnvelope): Promise<void> {
  try {
    if (envelope.mode === 'preview') return; // belt-and-braces; the client already drops these
    const db = getSupabaseAdminClient();
    await db.from('analytics_events').insert({
      event_name: envelope.event_name,
      session_id: envelope.session_id,
      prototype_id: envelope.prototype_id,
      properties: { ...envelope.properties, surface: envelope.surface, mode: envelope.mode },
      occurred_at: envelope.occurred_at,
    });
  } catch {
    /* telemetry never surfaces a failure to the caller */
  }
}
