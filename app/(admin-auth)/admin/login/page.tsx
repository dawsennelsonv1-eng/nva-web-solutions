import type { Metadata } from 'next';
import { LoginForm } from '@/components/admin/LoginForm';
import { PRODUCT_NAME } from '@/lib/billing/entity';

export const metadata: Metadata = {
  title: 'Admin sign in',
  robots: { index: false, follow: false },
};

/**
 * /admin/login — the one door in. Not gated by middleware (it has to be
 * reachable), but middleware DOES bounce an already-authenticated admin
 * straight past it to /admin.
 */
export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <div className="w-full">
        <p className="font-data text-xs uppercase tracking-wide text-rule">{PRODUCT_NAME} / Admin</p>
        <h1 className="mt-1 font-display font-condensed text-2xl font-bold">Sign in</h1>
        <div className="mt-6">
          <LoginForm reason={searchParams.reason} />
        </div>
      </div>
    </div>
  );
}
