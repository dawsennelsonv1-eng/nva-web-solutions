'use client';

import { useState } from 'react';
import { setThemeAction } from '@/app/actions/appearance';
import type { SiteTheme } from '@/lib/site/theme';

/**
 * components/admin/AppearanceToggle.tsx — the switch itself.
 *
 * Two buttons rather than a checkbox: a toggle labelled "dark mode" makes the
 * operator work out what the current state implies, whereas two explicit
 * choices with the active one marked show it. There is no third state.
 *
 * THE CHANGE IS SITE-WIDE AND IMMEDIATE, and the copy says so plainly. This is
 * not a per-admin preference — every visitor sees the result on their next
 * request — and that is exactly the kind of thing an operator should not
 * discover by accident.
 *
 * Styled with the LEGACY token system (bg-sheet, border-rule, font-data), not
 * the --n15-* layer. Admin is not part of the marketing site's redesign and
 * should not start looking like it while the rest of admin does not.
 */

export function AppearanceToggle({ current }: { current: SiteTheme }) {
  const [theme, setTheme] = useState<SiteTheme>(current);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (next: SiteTheme) => {
    if (next === theme || pending) return;
    setPending(true);
    setError(null);
    void (async () => {
      const r = await setThemeAction(next);
      if (r.ok) setTheme(r.theme);
      else setError(r.message);
      setPending(false);
    })();
  };

  return (
    <div className="max-w-xl">
      <div className="flex gap-2">
        {(['light', 'dark'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => choose(t)}
            disabled={pending}
            aria-pressed={theme === t}
            className={
              'press flex-1 rounded-milled border px-4 py-3 text-base ' +
              (theme === t ? 'border-ink bg-hazard text-sheet' : 'border-rule bg-sheet')
            }
          >
            {t === 'light' ? 'Light' : 'Dark'}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm">
        Currently live: <strong>{theme}</strong>. This changes what every visitor
        sees on their next page load. It is not a preference for this browser.
      </p>

      {error && (
        <p className="mt-3 border border-rule bg-concrete p-3 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
