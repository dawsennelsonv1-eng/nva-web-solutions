/**
 * THEME ENGINE — runtime side.
 *
 * The variants and the switching mechanism. Server components render the
 * data-theme attribute (see app/globals.css for the full no-flash strategy);
 * this module is the single client-safe utility that flips it at runtime
 * (used by the Phase 4 Style Toggle). Switching is one attribute write —
 * every token is a CSS custom property, so no React re-render is involved.
 *
 * FILE_TREE.md note: this file is a Phase 1 addition under lib/ (the theme
 * engine's runtime half). Recorded here so project knowledge can be updated.
 */

export const THEME_VARIANTS = ['light', 'dark-industrial'] as const;
export type ThemeVariant = (typeof THEME_VARIANTS)[number];

/** 'default' resolves to 'light' (DESIGN.md 1.1). */
export const DEFAULT_VARIANT: ThemeVariant = 'light';

export function isThemeVariant(v: unknown): v is ThemeVariant {
  return typeof v === 'string' && (THEME_VARIANTS as readonly string[]).includes(v);
}

/**
 * Flip the variant on a theme scope element (or the document root).
 * Safe to call only in the browser; no-ops on the server.
 */
export function setThemeVariant(
  variant: ThemeVariant,
  scope?: HTMLElement | null
): void {
  if (typeof document === 'undefined') return;
  (scope ?? document.documentElement).setAttribute('data-theme', variant);
}

/**
 * Serialize brand-kit hex overrides into the inline CSS custom properties the
 * (client) layout injects server-side. Accepts #RRGGBB; outputs "R G B"
 * triplets matching the token format in globals.css. Invalid hexes are
 * skipped — a bad brand kit must never break a page (SPEC R-705 spirit).
 */
export function brandOverrideStyle(
  overrides: Partial<Record<'hazard' | 'ink' | 'cure', string>>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, hex] of Object.entries(overrides)) {
    const rgb = hexToTriplet(hex);
    if (rgb) out[`--c-${key}`] = rgb;
  }
  return out;
}

function hexToTriplet(hex: string | undefined): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
