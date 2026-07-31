import type { ReactNode } from 'react';
import { MotionProvider } from '@/lib/motion';
import { PRODUCT_NAME } from '@/lib/billing/entity';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      <div className="min-h-dvh">
        <header className="border-b">
          <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
            <span className="font-display font-condensed text-lg font-bold uppercase tracking-wide">
              {PRODUCT_NAME}
            </span>
            <a href="/pricing" className="text-base underline-offset-4 hover:underline">
              Pricing
            </a>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </MotionProvider>
  );
}
