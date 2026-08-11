/**
 * lib/finishes/media-types.ts — shapes and limits, importable from the browser.
 *
 * SEPARATE FROM lib/finishes/media.ts FOR ONE REASON, and it is a lesson this
 * codebase already paid for once: lib/tools/media.ts is `server-only`, and a
 * client component importing a constant from it turned into a build error that
 * looked like a typing problem. A server-only module must not also be the home
 * of values the browser needs.
 *
 * So: types and limits here, database access there.
 */

export type FinishMediaKind = 'swatch' | 'combination';

export interface FinishMediaSlot {
  kind: FinishMediaKind;
  /** 'flake_blend:domino' for a swatch, or a comboKeyFor() string. */
  mediaKey: string;
  /** Path under /public, or an absolute https:// URL. */
  src: string;
  alt: string;
  caption: string;
  sortOrder: number;
}

/**
 * A combination photograph is the hero of the picker — the big image above the
 * swatches — so it is shown large and has to hold up at that size.
 *
 * These are guidance for the operator, not enforcement. The bucket's own 8 MB
 * ceiling is the hard limit; a second limit here would be one more thing to
 * keep in step with it, for no benefit.
 */
export const COMBINATION_GUIDANCE = {
  idealWidth: 1200,
  idealHeight: 800,
  note: 'Landscape, roughly 3:2. Shoot the same reference garage every time, so the only thing changing between photographs is the floor.',
} as const;

export const SWATCH_GUIDANCE = {
  idealWidth: 400,
  idealHeight: 300,
  note: 'A close crop of the finish itself, filling the frame. No walls, no horizon — this is a material sample, not a room.',
} as const;
