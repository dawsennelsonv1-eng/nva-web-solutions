import type { ReactNode } from 'react';
import { MotionProvider } from '@/lib/motion';
import { PRODUCT_NAME } from '@/lib/billing/entity';

/** Admin chrome uses the SAME Phase 1 tokens — no new colour values anywhere. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      <div className="min-h-dvh">
        <header className="border-b bg-sheet">
          <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
            <span className="font-display font-condensed text-lg font-bold uppercase tracking-wide">
              {PRODUCT_NAME} <span className="font-data text-xs text-rule">/ADMIN</span>
            </span>
            <nav className="flex gap-4 font-data text-sm">
              <a href="/admin" className="hover:underline">Dash</a>
              <a href="/admin/leads" className="hover:underline">Leads</a>
              <a href="/admin/prospects" className="hover:underline">Prospects</a>
              <a href="/admin/billing" className="hover:underline">Billing</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </MotionProvider>
  );
}
