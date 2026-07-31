import Link from 'next/link';

export default function PublicNotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center px-4 text-center">
      <p className="font-data text-xs uppercase tracking-wide text-rule">404</p>
      <h1 className="mt-2 font-display font-condensed text-2xl font-bold">Page not found.</h1>
      <p className="mt-2 text-base text-rule">That page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="mt-6 min-h-[3rem] rounded-milled bg-hazard px-6 py-3 font-body text-base font-semibold text-sheet"
      >
        Back to home
      </Link>
    </div>
  );
}
