/**
 * (client) not-found — what /s/[slug] renders via notFound() for anything
 * that isn't an active prototype: draft, revoked, expired, or genuinely
 * nonexistent. Deliberately indistinguishable between those (Phase 1
 * routing contract) — and deliberately NOT phrased like a generic 404,
 * since the visitor here almost always followed a real link from a real
 * contractor and shouldn't read this as "the internet is broken."
 *
 * No theme scope wrapper here (unlike the page this replaces) — without a
 * resolved prototype there is no brand to apply, so this renders in the
 * default light token set, which is the correct fallback.
 */
export default function ClientNotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center bg-concrete px-4 text-center text-ink">
      <p className="font-data text-xs uppercase tracking-wide text-rule">Not available</p>
      <h1 className="mt-2 font-display font-condensed text-2xl font-bold">
        This page isn&apos;t live right now.
      </h1>
      <p className="mt-2 text-base text-rule">
        The link may have expired, or the page hasn&apos;t been published yet.
      </p>
    </div>
  );
}
