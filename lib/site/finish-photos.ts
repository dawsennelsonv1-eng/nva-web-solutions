/**
 * lib/site/finish-photos.ts — FINISH REFERENCE IMAGERY. One source, two
 * consumers: the hero widget's finish selector (13D Part 1) and the showcase
 * cards (13D Part 3, shipping in the second delivery of this phase).
 *
 * ============================================================================
 * THE HONESTY CONSTRAINT, ENFORCED BY THE TYPE RATHER THAN BY DISCIPLINE
 * ============================================================================
 *
 * These images are FINISH REFERENCE. They show what a coating system looks
 * like. They are not portfolio, not a gallery, and not a claim that anyone
 * connected to this software installed the floor in the frame.
 *
 * That constraint is easy to state and easy to erode — one phase adds a
 * `projectName`, the next adds a `city`, and the page is quietly claiming
 * work it did not do. So the shape of `FinishPhoto` is the guard:
 *
 *   - There is NO field for a client, a job, a location, an installer, or a
 *     date. Not optional ones — absent ones. A future caller wanting to
 *     render "Dallas, TX" has to add a field to this interface, in a diff,
 *     where the decision is visible, instead of filling in a blank that was
 *     already sitting there inviting it.
 *   - `caption` is REQUIRED and is documented as naming the finish type. Every
 *     render site prints it. An uncaptioned photograph on a contractor's
 *     software page reads as a portfolio shot by default, so the caption is
 *     not decoration — it is the thing that stops the image from lying.
 *   - `alt` is required and describes the MATERIAL, for the same reason.
 *
 * ============================================================================
 * THE FILES
 * ============================================================================
 *
 * Convention: /public/finishes/{verticalId}-{tierKey}.webp, tier key
 * lowercased with underscores turned into hyphens. Nothing derives the path
 * at runtime — every path below is a literal, so a missing file is a missing
 * file rather than a silently mistyped string.
 *
 * SUPPLY ALL SOURCES AT 800x600 (4:3), WebP, quality 80, under 60 KB each.
 *
 * 800px is not the size anything renders at. next/image resizes from this
 * source down to whatever each surface declares in `sizes`, so the selector
 * thumbnail fetches roughly a 240px-wide variant (~9 KB) and the showcase card
 * fetches roughly a 480px one. Supplying the larger source once is what lets
 * both surfaces share a file without either of them being served the wrong
 * number of pixels. Do not supply these pre-cropped to thumbnail size — that
 * would make the showcase cards soft.
 *
 * 4:3 rather than 16:9 because a floor is a plane and a wide letterbox crop of
 * a plane is mostly the far wall.
 *
 * THE PAGE MUST RENDER WITH EVERY ONE OF THESE MISSING. components/site/
 * FinishPhoto.tsx falls back to a ruled plate carrying the caption. Ship the
 * code before the photographs; the page degrades to text and stays honest.
 *
 * LICENSING — READ BEFORE PUBLISHING. Every file here must be either (a)
 * photographed by you, (b) licensed stock with a commercial-use grant, or (c)
 * supplied by a manufacturer with written permission. A coating manufacturer's
 * product page image is NOT free to use because it depicts a product you buy.
 * Reverse-image-searching a competitor's install and captioning it as a finish
 * type is still infringement, and it is the specific failure this file's whole
 * comment block exists to prevent.
 */

export interface FinishPhoto {
  /**
   * The pricing tier key this photograph illustrates, matching the vertical
   * module's rate keys exactly. Not a display id — the tier key, so a finish
   * can never show the photograph of a different finish's price.
   */
  tierKey: string;
  /** Literal path under /public. */
  src: string;
  /** Describes the MATERIAL. Never a job, a client, or a location. */
  alt: string;
  /** Names the finish TYPE. Required, and rendered at every call site. */
  caption: string;
}

/**
 * Epoxy. Tier keys are the three in lib/verticals/epoxy — flake, metallic,
 * solid_polyaspartic — and must stay in step with them.
 */
export const EPOXY_FINISH_PHOTOS: readonly FinishPhoto[] = [
  {
    tierKey: 'flake',
    src: '/finishes/epoxy-flake.webp',
    alt: 'Close view of a decorative flake floor coating, showing coloured vinyl chips broadcast into the base coat',
    caption: 'Finish type: decorative flake',
  },
  {
    tierKey: 'metallic',
    src: '/finishes/epoxy-metallic.webp',
    alt: 'Close view of a metallic epoxy floor coating, showing pigment movement through the poured surface',
    caption: 'Finish type: metallic epoxy',
  },
  {
    tierKey: 'solid_polyaspartic',
    src: '/finishes/epoxy-solid-polyaspartic.webp',
    alt: 'Close view of a solid-colour polyaspartic floor coating with an even, unbroken surface',
    caption: 'Finish type: solid polyaspartic',
  },
] as const;

/**
 * Painting. Five sheens, one colour deck — see lib/verticals/painting.
 *
 * These are HARDER TO PHOTOGRAPH HONESTLY than the epoxy set, and the
 * difference is worth stating rather than discovering during the shoot: sheen
 * is a property of how a surface returns light, so it only reads in a
 * photograph with a raking light source and a visible highlight. A flatly lit
 * wall photographs identically at all five sheens. If the five files cannot be
 * made visibly different from each other, supply none of them — the fallback
 * plate is more honest than five photographs that are secretly one.
 */
export const PAINTING_FINISH_PHOTOS: readonly FinishPhoto[] = [
  {
    tierKey: 'flat',
    src: '/finishes/painting-flat.webp',
    alt: 'Painted wall in a flat sheen under raking light, showing no surface highlight',
    caption: 'Sheen: flat',
  },
  {
    tierKey: 'eggshell',
    src: '/finishes/painting-eggshell.webp',
    alt: 'Painted wall in an eggshell sheen under raking light, showing a low, soft highlight',
    caption: 'Sheen: eggshell',
  },
  {
    tierKey: 'satin',
    src: '/finishes/painting-satin.webp',
    alt: 'Painted wall in a satin sheen under raking light, showing a moderate even highlight',
    caption: 'Sheen: satin',
  },
  {
    tierKey: 'semi_gloss',
    src: '/finishes/painting-semi-gloss.webp',
    alt: 'Painted trim in a semi-gloss sheen under raking light, showing a bright defined highlight',
    caption: 'Sheen: semi-gloss',
  },
  {
    tierKey: 'gloss',
    src: '/finishes/painting-gloss.webp',
    alt: 'Painted trim in a gloss sheen under raking light, showing a sharp mirror-like highlight',
    caption: 'Sheen: gloss',
  },
] as const;

/** Every set, keyed by vertical id. The showcase cards iterate this. */
export const FINISH_PHOTOS: Readonly<Record<string, readonly FinishPhoto[]>> = {
  epoxy: EPOXY_FINISH_PHOTOS,
  painting: PAINTING_FINISH_PHOTOS,
};

/**
 * Look up one photograph. Returns undefined for an unknown vertical or tier —
 * never throws, and never substitutes a different finish's image.
 *
 * A missing photograph must degrade to the fallback plate. Returning the wrong
 * floor would be the single worst failure this module could have, because it
 * would be invisible to everyone except the contractor who recognises that the
 * picture above "metallic epoxy" is a flake floor.
 */
export function finishPhotoFor(
  verticalId: string,
  tierKey: string
): FinishPhoto | undefined {
  const set = FINISH_PHOTOS[verticalId];
  if (!set) return undefined;
  return set.find((p) => p.tierKey === tierKey);
}
