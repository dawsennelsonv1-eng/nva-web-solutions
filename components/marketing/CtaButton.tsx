'use client';

import { m } from '@/lib/motion';
import type { ReactNode } from 'react';

/**
 * components/marketing/CtaButton.tsx — the glow/pulse primary action.
 *
 * "GLOW AND PULSE ON EXACTLY ONE ELEMENT PER VIEWPORT" is enforced by
 * DISCIPLINE, not by a runtime singleton: a runtime guard (a module-level
 * counter refusing a second glowing button) would make the SECOND CTA on a
 * page silently render inert, which is a worse failure than the rule being
 * violated once in review — a silent downgrade is harder to notice than a
 * visually busy page. So: `glow` is an explicit prop, and exactly one call
 * site per route may pass it. Every other CTA on the same page uses the
 * default (no glow) — a real button, just not the one competing for
 * attention.
 *
 * Motion is transform/opacity only (a scale pulse + an opacity-based glow
 * ring), GPU-composited, and stops completely under prefers-reduced-motion —
 * the button is exactly as clickable, just visually still.
 */
export function CtaButton({
  children,
  onClick,
  href,
  glow = false,
  variant = 'hazard',
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  glow?: boolean;
  variant?: 'hazard' | 'outline';
}) {
  const classes =
    'relative inline-flex min-h-[3.25rem] items-center justify-center rounded-milled px-6 font-body text-base font-semibold transition-colors duration-step ' +
    (variant === 'hazard' ? 'bg-hazard text-sheet hover:bg-hazard/90' : 'border border-ink bg-sheet text-ink hover:bg-concrete');

  const content = (
    <>
      {glow ? (
        <m.span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-milled bg-hazard"
          initial={{ opacity: 0.35, scale: 1 }}
          animate={{ opacity: [0.35, 0, 0.35], scale: [1, 1.18, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ willChange: 'transform, opacity' }}
        />
      ) : null}
      <span className="relative">{children}</span>
    </>
  );

  if (href) {
    return (
      <a href={href} className={classes}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  );
}
