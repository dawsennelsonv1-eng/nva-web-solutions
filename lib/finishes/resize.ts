/**
 * lib/finishes/resize.ts — shrink a generated picture before it is stored.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * ComboStudio and SwatchStudio both did the same thing: take the data URL the
 * image model returned, `fetch` it into a Blob, and upload that Blob unchanged.
 * Whatever the model chose to render at became the file every visitor to the
 * picker downloads — and the picker renders thirty-five of them.
 *
 * The dimensions those pictures are actually DISPLAYED at have been written
 * down since the media types were defined: 400x300 for a swatch, 1200x800 for
 * a combination. A swatch is shown as a rectangle a third of a phone screen
 * wide. Storing a 1024px square for that is between four and six times the
 * bytes needed, repeated across twenty-five swatches, on every cold load.
 *
 * ============================================================================
 * WHY ON THE WAY IN AND NOT ON THE WAY OUT
 * ============================================================================
 *
 * The obvious alternative is to request a smaller image at read time. Supabase
 * Storage can do that — `/render/image/` with a width parameter — but it is a
 * PAID PLAN FEATURE, and this project is on the free tier. On the free tier the
 * stored object IS the delivered object, with no transformation available at
 * any URL.
 *
 * So the resize has to happen once, before the bytes are committed, rather
 * than per request. That is strictly better arithmetic anyway: one operation
 * per picture instead of one per visitor per picture. The only thing lost is
 * the ability to change your mind about the size later without regenerating —
 * and regenerating is a button the operator already has.
 *
 * ============================================================================
 * IT FITS, IT DOES NOT CROP, AND IT NEVER UPSCALES
 * ============================================================================
 *
 * `contain`, not `cover`. A combination render is a photograph of a real garage
 * with a floor in it, and cropping to hit an exact 3:2 would cut the floor —
 * the one thing the picture exists to show. A swatch is a close crop of a
 * material and cropping it further is merely pointless. So the longest edge is
 * fitted inside the target box and the aspect ratio is preserved, whatever it
 * happens to be.
 *
 * And if the source is ALREADY within the box, the original bytes are returned
 * untouched. Re-encoding a small picture to prove a point costs quality and
 * saves nothing.
 *
 * ============================================================================
 * BROWSER ONLY
 * ============================================================================
 *
 * This uses Image and canvas, so it runs in the operator's browser inside the
 * two admin studios and must never be imported by a server module. It is
 * deliberately in its own file rather than added to lib/finishes/media.ts,
 * which is server-side and reads the database — the comment at the head of
 * media-types.ts records what that mistake cost the last time it was made.
 */

export interface ShrunkImage {
  blob: Blob;
  contentType: string;
  width: number;
  height: number;
  /** True when the source was already small enough and was passed through. */
  passedThrough: boolean;
}

/** WebP first: it is roughly a third smaller than PNG on these pictures and is
 *  supported everywhere a Supabase browser client runs. JPEG is the fallback
 *  for the same reason it always is, and an untouched pass-through is the last
 *  resort so that a canvas failure degrades to the old behaviour rather than
 *  losing the operator's render. */
const ENCODINGS: ReadonlyArray<{ type: string; quality: number }> = [
  { type: 'image/webp', quality: 0.9 },
  { type: 'image/jpeg', quality: 0.92 },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    /* The sources here are data: URLs from the model, so this is a
       same-document read and no crossOrigin dance is needed. Setting it anyway
       would taint nothing but would fail on some data URLs. */
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The generated picture could not be decoded.'));
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

/**
 * Shrink a data URL to fit inside `target`, preserving aspect ratio.
 *
 * Never throws for size reasons: any failure to re-encode returns the original
 * bytes with `passedThrough: true`, because a slightly heavy picture in the
 * picker is a far better outcome than an operator losing a render he has
 * already paid an inference call for.
 */
export async function shrinkForUpload(
  dataUrl: string,
  target: { width: number; height: number },
  fallbackType = 'image/webp'
): Promise<ShrunkImage> {
  const original = await (await fetch(dataUrl)).blob();
  const originalType = original.type || fallbackType;

  let img: HTMLImageElement;
  try {
    img = await loadImage(dataUrl);
  } catch {
    return {
      blob: original,
      contentType: originalType,
      width: 0,
      height: 0,
      passedThrough: true,
    };
  }

  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  if (!sw || !sh) {
    return { blob: original, contentType: originalType, width: 0, height: 0, passedThrough: true };
  }

  // `Math.min(..., 1)` is the no-upscale clause: a source already inside the
  // box gets a scale of exactly 1 and is returned as it arrived.
  const scale = Math.min(target.width / sw, target.height / sh, 1);
  if (scale === 1) {
    return { blob: original, contentType: originalType, width: sw, height: sh, passedThrough: true };
  }

  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { blob: original, contentType: originalType, width: sw, height: sh, passedThrough: true };
  }

  /* Quality hints matter at this ratio. A 1024px swatch coming down to 400px is
     a big step, and the default nearest-ish resample leaves flake edges
     crawling — which on a picture whose whole job is to show a speckled
     material is the one artefact that would be noticed. */
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, dw, dh);

  for (const enc of ENCODINGS) {
    const out = await toBlob(canvas, enc.type, enc.quality);
    /* Browsers that cannot produce the requested type silently hand back PNG
       instead of null, so the type is checked rather than trusted. A PNG here
       would be larger than the WebP we asked for and often larger than the
       original. */
    if (out && out.type === enc.type && out.size > 0) {
      // A re-encode that came out heavier than the source is a re-encode worth
      // discarding. Rare, but it happens with flat colour swatches.
      if (out.size >= original.size) {
        return {
          blob: original,
          contentType: originalType,
          width: sw,
          height: sh,
          passedThrough: true,
        };
      }
      return { blob: out, contentType: enc.type, width: dw, height: dh, passedThrough: false };
    }
  }

  return { blob: original, contentType: originalType, width: sw, height: sh, passedThrough: true };
}

/** The extension the storage path should carry for a given content type. */
export function extensionFor(contentType: string): string {
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  return 'bin';
}
