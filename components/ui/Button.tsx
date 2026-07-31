import type { ButtonHTMLAttributes } from 'react';

/**
 * Phase 1 primitive. Token-only styling; the ONE hazard action per viewport
 * rule (DESIGN.md 1.1) is enforced by usage, not by this component.
 * Phase 4/5 refine; the token consumption is what Phase 1 proves.
 */
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'hazard' | 'outline';
};

export function Button({ variant = 'outline', className = '', ...rest }: Props) {
  const base =
    'inline-flex items-center justify-center rounded-milled px-4 py-2 text-base font-body font-semibold transition-colors duration-step disabled:opacity-50';
  const look =
    variant === 'hazard'
      ? 'bg-hazard text-sheet hover:bg-hazard/90'
      : 'border border-ink bg-sheet text-ink hover:bg-concrete';
  return <button className={`${base} ${look} ${className}`} {...rest} />;
}
