/**
 * lib/tools/media-presets.ts — the beats a tool page tells its story in.
 *
 * ============================================================================
 * WHY THESE MOVED OUT OF ToolMediaStudio
 * ============================================================================
 *
 * They were written there, and phase 38 gave the SAME generator to
 * ToolMediaEditor so a slot can be filled without crossing between two
 * screens. Two copies of this list would have drifted within a week: somebody
 * improves the wording of "The finished floor" on the screen they happen to be
 * on, and the other screen keeps producing the old picture with no indication
 * that a better prompt exists a file away.
 *
 * ============================================================================
 * WHY PRESETS AT ALL
 * ============================================================================
 *
 * A blank prompt box in an admin screen hands the difficult part back to the
 * operator. A tool page tells one story in a fixed order — photograph the
 * floor, it works out the size, choose the finish, see it on your own floor,
 * the installer calls — and each beat wants a picture of that specific moment.
 *
 * They are STARTING POINTS, not a menu. Every screen that uses them keeps the
 * text editable, because a contractor selling patios rather than garages needs
 * different words, and because the fastest way to improve a generated picture
 * is usually to change one clause rather than to start again.
 *
 * NO 'server-only'. Both callers are client components and there is nothing
 * secret in a list of English sentences.
 */

export interface MediaPreset {
  label: string;
  subject: string;
}

export const MEDIA_PRESETS: readonly MediaPreset[] = [
  {
    label: 'Photographing the floor',
    subject:
      'a person standing in the doorway of a domestic garage holding up a phone to photograph the bare concrete floor, seen from behind',
  },
  {
    label: 'The bare slab',
    subject:
      'the empty concrete floor of a two-car domestic garage in daylight, swept clean, some staining and hairline cracks visible',
  },
  {
    label: 'Choosing the finish',
    subject:
      'a close-up of two hands holding physical epoxy floor sample tiles side by side over a bare concrete floor, comparing them',
  },
  {
    label: 'The finished floor',
    subject:
      'a domestic garage with a finished decorative flake epoxy floor, a car parked on it, ordinary household clutter along one wall',
  },
  {
    label: 'The installer arrives',
    subject:
      'a contractor in work clothes kneeling on a garage floor with a clipboard and a tape measure, checking the concrete',
  },
];

/**
 * The first preset's words, for a screen that needs somewhere to start.
 *
 * Written as a function returning a string rather than exported as a constant
 * because `MEDIA_PRESETS[0]` is `MediaPreset | undefined` under
 * `noUncheckedIndexedAccess`, and every caller would otherwise repeat the same
 * `?? ''` fallback — which is exactly how one of them ends up with an empty
 * prompt box and no explanation.
 */
export function firstPresetSubject(): string {
  return MEDIA_PRESETS[0]?.subject ?? '';
}
