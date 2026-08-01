/**
 * lib/combiner/designOptions.ts — the four palettes' actual contents, and an
 * honest note about what's real today.
 *
 * WHAT THIS FILE DOES NOT DO: pretend there are five templates or six
 * button styles to make the combiner look fuller. DESIGN.md's whole
 * argument is ONE coherent system (CONVENTIONS.md 7: "ONE radius in the
 * whole system") — this build has never had more than one template
 * (template-datum-01) or one typography pairing rendered anywhere, and
 * fabricating alternates that don't actually differ on screen would be
 * exactly the "looks complete but isn't" failure this whole project's
 * discipline exists to avoid. What IS real:
 *
 *   TEMPLATES     1 entry.    The spec-sheet/datum-rule system. A real
 *                             registry (below), ready for #2 the day one
 *                             is designed — adding it is a new array entry,
 *                             not a core rewrite, same contract as
 *                             lib/verticals/registry.ts.
 *   TYPOGRAPHY    2 entries.  "Standard" and "Condensed" — genuinely
 *                             different, using Archivo Variable's WIDTH
 *                             AXIS that app/globals.css already exposes as
 *                             .font-condensed. Zero new font files.
 *   BUTTON STYLE  2 entries.  "Solid" and "Outline" — a real visual
 *                             difference (filled vs bordered) that never
 *                             touches --r-milled, respecting the one-radius
 *                             rule rather than working around it.
 *   COLOUR        Not listed here — colours come from Phase 7's brand
 *                 PALETTE   engine (deriveTokens) plus the 4 seeded
 *                             style_presets rows, handled by
 *                             lib/combiner/presets.ts instead of this file,
 *                             since a colour "option" is per-prospect data,
 *                             not a fixed design constant.
 */

export interface DesignOption {
  id: string;
  name: string;
  description: string;
}

export const TEMPLATES: DesignOption[] = [
  {
    id: 'template-datum-01',
    name: 'Datum',
    description: 'The spec-sheet system — graduated scale, milled edges, one hazard action.',
  },
];

export interface TypographyOption extends DesignOption {
  /** Applied to the page root; matches app/globals.css's existing utilities. */
  className: 'font-condensed' | '';
}

export const TYPOGRAPHY_OPTIONS: TypographyOption[] = [
  { id: 'archivo-standard', name: 'Standard', description: 'Archivo Variable at full width.', className: '' },
  {
    id: 'archivo-condensed',
    name: 'Condensed',
    description: 'The same file, pulled narrow via the width axis — tighter, more industrial.',
    className: 'font-condensed',
  },
];

export interface ButtonStyleOption extends DesignOption {
  /** Applied to the primary CTA; both use the same --r-milled radius token. */
  variant: 'solid' | 'outline';
}

export const BUTTON_STYLES: ButtonStyleOption[] = [
  { id: 'button-milled', name: 'Solid', description: 'Filled hazard, the default.', variant: 'solid' },
  {
    id: 'button-milled-outline',
    name: 'Outline',
    description: 'Bordered, transparent fill — quieter without changing the radius.',
    variant: 'outline',
  },
];

export function findTemplate(id: string): DesignOption {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]!;
}
export function findTypography(id: string): TypographyOption {
  return TYPOGRAPHY_OPTIONS.find((t) => t.id === id) ?? TYPOGRAPHY_OPTIONS[0]!;
}
export function findButtonStyle(id: string): ButtonStyleOption {
  return BUTTON_STYLES.find((b) => b.id === id) ?? BUTTON_STYLES[0]!;
}

/** The default template_config for a freshly-created draft prototype. */
export const DEFAULT_TEMPLATE_SELECTION = {
  templateId: TEMPLATES[0]!.id,
  typographyId: TYPOGRAPHY_OPTIONS[0]!.id,
  buttonStyleId: BUTTON_STYLES[0]!.id,
  styleVariant: 'light' as const,
};
