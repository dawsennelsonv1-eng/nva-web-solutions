import type { ReactNode } from 'react';
import { MotionProvider } from '@/lib/motion';

/**
 * BRANDED-PAGE THEME SCOPE.
 * The /s/[slug] page passes the tenant's variant + brand-token overrides up
 * via this layout's children — but layouts can't read page data in App
 * Router, so the scope element itself is rendered BY THE PAGE (see
 * app/(client)/s/[slug]/page.tsx). This layout provides the motion context
 * and nothing visual: the page owns its themed wrapper so the data-theme
 * attribute and inline brand vars are in the server HTML. Zero flash.
 */
export default function ClientLayout({ children }: { children: ReactNode }) {
  return <MotionProvider>{children}</MotionProvider>;
}
