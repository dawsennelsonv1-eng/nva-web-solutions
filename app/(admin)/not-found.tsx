import Link from 'next/link';

/**
 * (admin) not-found — the only route-group boundary that assumes an
 * authenticated audience (middleware already gated everything under here),
 * so it can safely link back into admin nav rather than to the public site.
 */
export default function AdminNotFound() {
  return (
    <div className="mx-auto max-w-2xl p-4 text-center">
      <p className="font-data text-xs uppercase tracking-wide text-rule">404</p>
      <h1 className="mt-2 font-display font-condensed text-2xl font-bold uppercase tracking-wide">
        Not found
      </h1>
      <p className="mt-2 text-base text-rule">That admin page doesn&apos;t exist.</p>
      <Link href="/admin" className="mt-4 inline-block font-data text-sm text-hazard hover:underline">
        ← Back to dashboard
      </Link>
    </div>
  );
}
