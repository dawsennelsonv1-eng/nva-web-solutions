'use client';

import { setAnalyticsSink, track, type EventContext, type EventName, type EventPropsMap } from '@/lib/analytics';

/**
 * lib/analytics.client.ts — Phase 5 addition. The browser half of the
 * client/server split lib/analytics.server.ts already established.
 *
 * THE GAP THIS CLOSES: lib/analytics.ts's default sink, unconfigured, is
 * console.debug in dev and a genuine no-op in production — there was no path
 * from a 'use client' component's track() call to the analytics_events
 * table. lib/analytics.server.ts solved this for events emitted FROM server
 * code (trackServer() inside server actions), but that installation only
 * affects the server's own module instance; the browser bundles a completely
 * separate copy of lib/analytics.ts with its own module-level sink variable.
 *
 * This installs a client sink that forwards every event to the
 * recordEventAction server action, which performs the actual insert with the
 * admin client — mirroring, on the client side, exactly what
 * lib/analytics.server.ts does on the server side.
 *
 * Import this file once, for its side effect, from the top of any 'use
 * client' module that emits analytics — QuoteWidget.tsx does so, which
 * covers every surface the widget mounts on.
 */

let installed = false;

export function installClientAnalytics(): void {
  if (installed) return;
  installed = true;
  setAnalyticsSink((envelope) => {
    // Fire-and-forget: analytics must never block or fail a user action.
    // Dynamic import keeps the server-action reference out of any bundle
    // that never actually emits an event.
    import('@/app/actions/analytics')
      .then(({ recordEventAction }) => recordEventAction(envelope))
      .catch(() => {
        /* never surfaces */
      });
  });
}

installClientAnalytics();

/** Re-exported so call sites only ever import from one analytics module. */
export { track };
export type { EventContext, EventName, EventPropsMap };
