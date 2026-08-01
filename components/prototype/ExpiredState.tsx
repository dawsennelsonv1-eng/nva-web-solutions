'use client';

import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics.client';

/**
 * components/prototype/ExpiredState.tsx — item 6: "a clean expired state
 * that still sells." Distinct from the generic app/(client)/not-found.tsx
 * boundary (Phase 6), which stays deliberately uninformative for
 * draft/revoked/nonexistent links — an expired link is different: it once
 * worked, the contractor may have bookmarked or re-tapped an old text
 * thread, and the honest, useful response is "ask for a fresh one," not a
 * bare 404. Deliberately not on-brand-styled (no logo, no token injection):
 * ./layout.tsx renders unstyled house colours for a non-'ok' resolution
 * (Phase 7), which is correct here too — an expired link showing HIS old
 * colours while telling him it doesn't work reads as broken, not current.
 */
export function ExpiredState({ contractorName, slug }: { contractorName: string; slug: string }) {
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    track('prototype_expired_viewed', { slug }, { surface: 'prototype', mode: 'live' });
  }, [slug]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center bg-concrete px-4 text-center text-ink">
      <p className="font-data text-xs uppercase tracking-wide text-rule">This link has expired</p>
      <h1 className="mt-2 font-display font-condensed text-2xl font-bold">
        {contractorName}&apos;s preview isn&apos;t live anymore.
      </h1>
      <p className="mt-3 max-w-xs text-base text-rule">
        These links expire after a while. If you want to see it again — or get it live for
        real — just reply to the text and I&apos;ll set it back up in a couple of minutes.
      </p>
    </div>
  );
}
