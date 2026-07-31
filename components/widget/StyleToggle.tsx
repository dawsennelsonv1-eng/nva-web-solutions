'use client';

import { useEffect, useState } from 'react';
import { setThemeVariant, type ThemeVariant } from '@/lib/theme';

/**
 * components/widget/StyleToggle.tsx — Light / Dark Industrial, for /s/[slug].
 *
 * Rendered ONLY when the `enabled` prop says so. It is a selling device on a
 * prototype link — "this is your business, in two different registers" — and
 * it has no business on the public hub or the demo, where a second visual
 * identity would just look indecisive.
 *
 * Dark Industrial is not the light theme inverted. Per DESIGN.md it is a
 * backlit control panel rather than a printed sheet, and --c-hazard is
 * deliberately IDENTICAL in both: safety orange does not change with the
 * lighting, and that constancy is what makes the two read as the same
 * manufacturer rather than two templates.
 *
 * Scope: the toggle writes data-theme on the nearest themed ancestor, not on
 * <html>, so a preview frame in the Phase 9 combiner can hold a different
 * variant from the admin chrome around it.
 */

export function StyleToggle({
  enabled,
  initial = 'light',
  onChange,
}: {
  enabled: boolean;
  initial?: ThemeVariant;
  onChange?: (v: ThemeVariant) => void;
}) {
  const [variant, setVariant] = useState<ThemeVariant>(initial);

  useEffect(() => {
    if (!enabled) return;
    const scope = document.querySelector<HTMLElement>('[data-theme]');
    setThemeVariant(variant, scope);
    onChange?.(variant);
  }, [variant, enabled, onChange]);

  if (!enabled) return null;

  const options: { id: ThemeVariant; label: string }[] = [
    { id: 'light', label: 'Light' },
    { id: 'dark-industrial', label: 'Dark Industrial' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="inline-flex items-center gap-0 rounded-milled border bg-sheet p-0.5"
    >
      {options.map((o) => {
        const active = variant === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setVariant(o.id)}
            className={
              'rounded-milled px-3 py-1.5 font-data text-xs uppercase tracking-wide transition-colors duration-step ' +
              (active ? 'bg-ink text-sheet' : 'text-rule hover:text-ink')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
