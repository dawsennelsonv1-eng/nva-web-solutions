'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * components/prototype/PreviewRefreshListener.tsx — the "instant" half of
 * "any swap updates the preview instantly."
 *
 * The parent combiner page posts a same-origin message after every staged
 * change; this listens and calls router.refresh() — Next.js's built-in
 * mechanism to re-run the current route's SERVER components and re-fetch
 * their data WITHOUT a full page navigation or losing client state. That is
 * what makes this genuinely instant rather than an iframe reload: the
 * preview re-renders in place, the same way editing and saving triggers a
 * live update on any modern Next.js app.
 *
 * Origin-checked: only messages from the same origin, with the expected
 * payload shape, trigger a refresh — an iframe embedded in an admin tool
 * still shouldn't act on postMessage from an untrusted source.
 */
export function PreviewRefreshListener() {
  const router = useRouter();

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data === 'nva-combiner-refresh') router.refresh();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [router]);

  return null;
}
