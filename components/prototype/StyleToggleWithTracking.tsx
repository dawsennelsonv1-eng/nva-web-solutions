'use client';

import { StyleToggle } from '@/components/widget/StyleToggle';
import { track } from '@/lib/analytics.client';
import type { ThemeVariant } from '@/lib/theme';

/**
 * components/prototype/StyleToggleWithTracking.tsx — a thin client wrapper
 * so StyleToggle (Phase 4, unmodified) can report style_toggle_used.
 *
 * Kept as its OWN small file rather than inlined in the server-rendered
 * page: this is the only client-side cost the "proof of flexibility" block
 * introduces, isolated from the page's own server content and separate
 * from LaunchGate's much larger deferred widget bundle.
 */
export function StyleToggleWithTracking({
  prototypeId,
  initial,
}: {
  prototypeId: string;
  initial: ThemeVariant;
}) {
  return (
    <div className="mt-2">
      <StyleToggle
        enabled
        initial={initial}
        onChange={(v) =>
          track('style_toggle_used', { to_variant: v }, { surface: 'prototype', mode: 'prototype', prototypeId })
        }
      />
    </div>
  );
}
