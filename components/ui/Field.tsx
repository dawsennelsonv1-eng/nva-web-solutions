import type { InputHTMLAttributes } from 'react';

/** Phase 1 primitive: labelled input, token-only, 16px floor (DESIGN.md 1.2). */
type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; id: string };

export function Field({ label, id, className = '', ...rest }: Props) {
  return (
    <label htmlFor={id} className="block">
      <span className="font-data text-xs uppercase tracking-wide text-rule">
        {label}
      </span>
      <input
        id={id}
        className={`mt-1 w-full rounded-milled border bg-sheet px-3 py-2 text-base text-ink placeholder:text-rule ${className}`}
        {...rest}
      />
    </label>
  );
}
