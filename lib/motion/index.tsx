'use client';

/**
 * THE ONLY FILE IN THIS REPOSITORY THAT MAY IMPORT 'framer-motion'.
 *
 * Enforcement is twofold (CONVENTIONS.md 6):
 *  1. Module boundary — everything imports { m, MotionProvider } from
 *     '@/lib/motion'. LazyMotion + domAnimation loads ~15KB instead of the
 *     ~34KB whole-library import; a single bare `motion` import anywhere
 *     would silently defeat that for the entire bundle.
 *  2. Lint rule — .eslintrc.json bans 'framer-motion' via
 *     no-restricted-imports everywhere except lib/motion/**. Next.js fails
 *     the production build on lint errors, so a violation cannot reach
 *     Vercel green. The rule exists from the first commit precisely so this
 *     is caught at build time, not in the Phase 12A audit.
 *
 * `domMax` (drag gestures) is forbidden project-wide; Phase 9's combiner
 * uses dnd-kit instead, so this file never needs to change.
 */
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import type { ReactNode } from 'react';

export { m, AnimatePresence };

export function MotionProvider({ children }: { children: ReactNode }) {
  // strict: a bare <motion.*> component inside this tree throws in dev,
  // turning an accidental full-bundle import into a loud failure.
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
