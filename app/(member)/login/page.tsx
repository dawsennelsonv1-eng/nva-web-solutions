import type { Metadata } from 'next';
import { MemberLoginForm } from '@/components/member/MemberLoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

/**
 * /login — the contractor's door. Deliberately says nothing about admin.
 *
 * Not gated by middleware (it has to be reachable), but middleware DOES bounce
 * an already-signed-in user straight to /app.
 */
export default function MemberLoginPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <div className="w-full">
        <p className="font-data text-xs uppercase tracking-wide text-rule">Your account</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold uppercase">Sign in</h1>
        <p className="mt-2 text-sm text-rule">
          Your leads, your crew, your numbers.
        </p>
        <div className="mt-6">
          <MemberLoginForm reason={searchParams.reason} />
        </div>
      </div>
    </div>
  );
}
