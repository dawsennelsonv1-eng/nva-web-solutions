import Link from 'next/link';
import { PRODUCT_NAME } from '@/lib/billing/entity';

/**
 * app/not-found.tsx — the ROOT fallback, used only when a more specific
 * not-found.tsx in a route group doesn't apply (a path outside every group,
 * or before Next.js has resolved which group a request belongs to).
 */
export default function RootNotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-4 text-center">
      <p className="font-data text-xs uppercase tracking-wide text-rule">404</p>
      <h1 className="mt-2 font-display font-condensed text-2xl font-bold">Page not found.</h1>
      <p className="mt-2 text-base text-rule">{PRODUCT_NAME} couldn&apos;t find that page.</p>
      <Link
        href="/"
        className="mt-6 min-h-[3rem] rounded-milled bg-hazard px-6 py-3 font-body text-base font-semibold text-sheet"
      >
        Go home
      </Link>
    </div>
  );
}
