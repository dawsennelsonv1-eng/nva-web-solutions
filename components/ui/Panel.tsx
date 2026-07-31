import type { ReactNode } from 'react';

/**
 * The data-sheet panel (DESIGN.md 1.3): a flat labelled block. Elevation is
 * surface value + rule border — there are no shadows in this system.
 */
export function Panel({
  label,
  children,
  className = '',
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-milled border bg-sheet p-4 ${className}`}>
      {label ? (
        <p className="mb-2 font-data text-xs uppercase tracking-wide text-rule">
          {label}
        </p>
      ) : null}
      {children}
    </div>
  );
}
