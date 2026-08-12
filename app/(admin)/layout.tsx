import type { ReactNode } from 'react';
import { MotionProvider } from '@/lib/motion';
import { PRODUCT_NAME } from '@/lib/billing/entity';
import { requireAdmin } from '@/lib/auth/admin';
import { signOutAction } from '@/app/actions/auth';

/**
 * (admin) layout — Phase 6: now async, reads who is actually signed in.
 *
 * Not a second auth gate: middleware.ts already refused anyone who isn't an
 * admin before this ever renders. Calling requireAdmin() again here is
 * purely to DISPLAY the email and wire the sign-out button — if it somehow
 * returned null (a session that expired in the gap between middleware and
 * render), the layout still renders rather than throwing; the next
 * navigation hits middleware again and bounces to login correctly.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  return (
    <MotionProvider>
      <div className="min-h-dvh">
        <header className="border-b bg-sheet">
          <div className="mx-auto max-w-5xl p-4">
            <div className="flex items-center justify-between">
              <span className="font-display font-condensed text-lg font-bold uppercase tracking-wide">
                {PRODUCT_NAME} <span className="font-data text-xs text-rule">/ADMIN</span>
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="font-data text-xs uppercase tracking-wide text-rule hover:text-ink"
                >
                  {admin ? admin.email + ' · ' : ''}Sign out
                </button>
              </form>
            </div>
            <nav className="mt-3 flex gap-4 overflow-x-auto font-data text-sm">
              <a href="/admin" className="whitespace-nowrap hover:underline">Dash</a>
              <a href="/admin/leads" className="whitespace-nowrap hover:underline">Leads</a>
              <a href="/admin/prospects" className="whitespace-nowrap hover:underline">Prospects</a>
              <a href="/admin/pricing" className="whitespace-nowrap hover:underline">Pricing</a>
              <a href="/admin/billing" className="whitespace-nowrap hover:underline">Billing</a>
              {/*
                THE OPERATOR SCREENS, WHICH THIS NAV HAS NEVER MENTIONED.

                app/admin/{swatches,finishes,media,appearance,payments,ai} are
                real, deployed, gated pages. Nothing in the product linked to
                any of them, so the only way in was to know the URL and type
                it — which is why the picture-upload and swatch-generation
                screens appeared not to exist.

                Separated by a rule because they are a different KIND of thing
                from the five links to their left: those are records of the
                business, these configure the product itself.
              */}
              <span aria-hidden className="text-rule">|</span>
              <a href="/admin/swatches" className="whitespace-nowrap hover:underline">Swatches</a>
              <a href="/admin/finishes" className="whitespace-nowrap hover:underline">Finishes</a>
              <a href="/admin/media" className="whitespace-nowrap hover:underline">Media</a>
              <a href="/admin/appearance" className="whitespace-nowrap hover:underline">Appearance</a>
              <a href="/admin/payments" className="whitespace-nowrap hover:underline">Payments</a>
              <a href="/admin/ai" className="whitespace-nowrap hover:underline">AI</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </MotionProvider>
  );
}
