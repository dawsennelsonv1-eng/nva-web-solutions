import type { Metadata } from 'next';
import Link from 'next/link';
import { MemberSignupForm } from '@/components/member/MemberSignupForm';

export const metadata: Metadata = {
  title: 'Create an account',
  robots: { index: false, follow: false },
};

/**
 * /signup — self-serve account creation.
 *
 * Sits in the (member) group beside /login, so it inherits the same chrome and
 * the same middleware treatment: reachable when signed out, and an
 * already-signed-in visitor is bounced to /app rather than being shown a form
 * that would create a second account.
 *
 * VERIFY: middleware.ts's PASS_THROUGH list decides that bounce. If /signup is
 * not in it, a signed-in visitor tapping "Sign up" gets sent to the sign-in
 * page instead of /app — harmless but confusing. Worth adding it there when you
 * next touch that file.
 */
export default function MemberSignupPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <div className="w-full">
        <p className="font-data text-xs uppercase tracking-wide text-rule">Your account</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold uppercase">Create an account</h1>
        <p className="mt-2 text-sm text-rule">
          Your leads, your crew, your numbers — under your business name.
        </p>
        <div className="mt-6">
          <MemberSignupForm />
        </div>
        <p className="mt-6 text-sm text-rule">
          Want us to build the branded version first?{' '}
          <Link href="/start" className="underline">
            Tell us about your business
          </Link>{' '}
          instead.
        </p>
      </div>
    </div>
  );
}
