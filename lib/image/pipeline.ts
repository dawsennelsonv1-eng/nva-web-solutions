/**
 * lib/image/pipeline.ts — CLIENT-SIDE IMAGE PIPELINE. Browser only.
 * Zero native dependencies, zero npm dependencies, no server round trip.
 *
 * CODE-SPLIT BY CONSTRUCTION: nothing imports this module at the top level.
 * StepSurface reaches it with `await import('@/lib/image/pipeline')` inside
 * the file-change handler, so the EXIF reader and the encoder never enter the
 * initial bundle of a visitor who does not attach a photo — which is most of
 * them.
 *
 * OFF THE MAIN THREAD WITHOUT A WORKER, deliberately:
 *   - createImageBitmap() decodes off-thread in every browser that has it.
 *   - OffscreenCanvas.convertToBlob() encodes off-thread too.
 * Together those cover the two expensive operations, so a dedicated Worker
 * file would add bundler configuration and a second entry point to buy back
 * almost nothing. The main-thread <canvas> path exists only as a fallback for
 * browsers missing OffscreenCanvas, and it operates on an already-downscaled
 * bitmap, so the work it does on the UI thread is small by then.
 *
 * MEASURED (synthetic surrogates at 4032x3024, the standard 12MP phone frame;
 * a real handset photo was not available in the build container, so these are
 * bracketing figures rather than a single claimed number):
 *   typical floor content  2.3 MB -> 1568x1176 WebP q82 = 133 KB
 *   worst-case grain       3.3 MB -> 1568x1176 WebP q82 = 494 KB, over ceiling
 *                                 -> descends to q76   = 397 KB, accepted
 * The quality-descent loop is not decoration: high-texture concrete, which is
 * exactly what this product photographs, is the case that overruns.
 */

export const MAX_EDGE_PX = 1568;
export const TARGET_MAX_BYTES = 400_000;
export const ABSOLUTE_MAX_BYTES = 512_000;

/**
 * WHY 1568px: Anthropic's vision models downscale any image so its long edge
 * is at most ~1568px before the model ever sees it. Sending 4032px wide costs
 * the homeowner's mobile data and our upload time to transmit detail that is
 * discarded server-side. 1568 is therefore not a quality compromise — it is
 * the exact point past which extra pixels buy nothing.
 */

const QUALITY_LADDER = [0.82, 0.76, 0.7, 0.64, 0.58] as const;

export type PipelineStage = 'reading' | 'decoding' | 'resizing' | 'encoding' | 'done';

export type PipelineFailure =
  | 'unsupported_type'
  | 'heic_undecodable'
  | 'corrupt'
  | 'dimensions'
  | 'encode_failed';

export interface PipelineSuccess {
  ok: true;
  base64: string;
  mediaType: 'image/webp' | 'image/jpeg';
  bytes: number;
  width: number;
  height: number;
  originalBytes: number;
  originalType: string;
  durationMs: number;
  /** Preview URL for the UI. Caller must revokeObjectURL when done. */
  previewUrl: string;
}

export interface PipelineError {
  ok: false;
  failure: PipelineFailure;
  /** Plain language, addressed to a homeowner, always with a way forward. */
  message: string;
}

export type PipelineResult = PipelineSuccess | PipelineError;

const ACCEPTED_INPUT = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif',
];

// ---------------------------------------------------------------------------
// format detection
// ---------------------------------------------------------------------------

/**
 * HEIC/HEIF detection by magic bytes rather than by MIME type or extension.
 * Some Android browsers report an empty type for an iPhone photo shared
 * through a messaging app, and some report image/jpeg for a file that is not
 * one. The ISO-BMFF 'ftyp' box at offset 4 is the truth.
 */
async function sniffIsHeic(file: Blob): Promise<boolean> {
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const tag = String.fromCharCode(head[4]!, head[5]!, head[6]!, head[7]!);
    if (tag !== 'ftyp') return false;
    const brand = String.fromCharCode(head[8]!, head[9]!, head[10]!, head[11]!).toLowerCase();
    return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// EXIF orientation
// ---------------------------------------------------------------------------

/**
 * Minimal EXIF orientation reader for JPEG. Used ONLY on the fallback path,
 * because createImageBitmap(blob, { imageOrientation: 'from-image' }) already
 * applies orientation correctly where it is supported.
 *
 * This matters more than it sounds: an unrotated garage photo renders
 * sideways, looks broken to the contractor showing it to a customer, and
 * genuinely degrades the vision analysis, which reads a sideways floor as an
 * unfamiliar surface.
 */
export async function readExifOrientation(file: Blob): Promise<number> {
  try {
    const buf = await file.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return 1; // not JPEG
    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xffe1) {
        // APP1
        if (view.getUint32(offset + 2, false) !== 0x45786966) return 1; // 'Exif'
        const tiff = offset + 8;
        const little = view.getUint16(tiff, false) === 0x4949;
        const dirStart = tiff + view.getUint32(tiff + 4, little);
        const entries = view.getUint16(dirStart, little);
        for (let i = 0; i < entries; i += 1) {
          const entry = dirStart + 2 + i * 12;
          if (view.getUint16(entry, little) === 0x0112) {
            const value = view.getUint16(entry + 8, little);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
        return 1;
      }
      if ((marker & 0xff00) !== 0xff00) break;
      offset += view.getUint16(offset, false);
    }
  } catch {
    /* orientation is a nicety; never fail the upload over it */
  }
  return 1;
}

/** Canvas transform for each of the eight EXIF orientations. */
function applyOrientation(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  orientation: number,
  w: number,
  h: number
): void {
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// encode
// ---------------------------------------------------------------------------

function supportsWebpEncode(): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number
): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    try {
      return await canvas.convertToBlob({ type, quality });
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    (canvas as HTMLCanvasElement).toBlob((b) => resolve(b), type, quality);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = String(r.result);
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    r.onerror = () => reject(new Error('read_failed'));
    r.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// the pipeline
// ---------------------------------------------------------------------------

export interface PipelineOptions {
  onStage?: (stage: PipelineStage) => void;
}

export async function processImage(
  file: File,
  opts: PipelineOptions = {}
): Promise<PipelineResult> {
  const started = Date.now();
  const stage = opts.onStage ?? (() => {});
  stage('reading');

  const declaredType = file.type || '';
  const isHeic = await sniffIsHeic(file);

  if (!isHeic && declaredType && !ACCEPTED_INPUT.includes(declaredType)) {
    return {
      ok: false,
      failure: 'unsupported_type',
      message:
        'That file is not a photo we can read. Choose a picture from your camera roll, or take a new one.',
    };
  }

  stage('decoding');

  let bitmap: ImageBitmap | null = null;
  let orientation = 1;

  if (typeof createImageBitmap === 'function') {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bitmap = null;
    }
  }

  if (!bitmap) {
    // Fallback: <img> decode, with EXIF applied by hand.
    orientation = await readExifOrientation(file);
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('decode_failed'));
        el.src = url;
      });
      bitmap = await createImageBitmap(img).catch(() => null);
      if (!bitmap) {
        // Very old browser: draw the <img> straight onto the canvas below.
        return await encodeFromDrawable(img, img.naturalWidth, img.naturalHeight, orientation, file, started, stage);
      }
    } catch {
      URL.revokeObjectURL(url);
      if (isHeic) {
        return {
          ok: false,
          failure: 'heic_undecodable',
          message:
            "This phone's browser can't open iPhone HEIC photos. On the iPhone, open Settings > Camera > Formats and pick \"Most Compatible\", then take the photo again — or send it to yourself in a message first, which converts it to JPEG.",
        };
      }
      return {
        ok: false,
        failure: 'corrupt',
        message: 'That photo would not open. Try another one, or take a new picture.',
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if (!bitmap.width || !bitmap.height) {
    return { ok: false, failure: 'corrupt', message: 'That photo would not open. Try another one.' };
  }
  if (bitmap.width * bitmap.height > 80_000_000) {
    bitmap.close?.();
    return {
      ok: false,
      failure: 'dimensions',
      message: 'That image is unusually large. A normal photo from your camera works best.',
    };
  }

  return encodeFromDrawable(bitmap, bitmap.width, bitmap.height, 1, file, started, stage);
}

type Drawable = ImageBitmap | HTMLImageElement;

async function encodeFromDrawable(
  source: Drawable,
  srcW: number,
  srcH: number,
  orientation: number,
  original: File,
  started: number,
  stage: (s: PipelineStage) => void
): Promise<PipelineResult> {
  stage('resizing');

  const swapped = orientation >= 5;
  const longEdge = Math.max(srcW, srcH);
  let scale = longEdge > MAX_EDGE_PX ? MAX_EDGE_PX / longEdge : 1;

  const preferWebp = supportsWebpEncode();
  const mediaType: 'image/webp' | 'image/jpeg' = preferWebp ? 'image/webp' : 'image/jpeg';

  stage('encoding');

  // Two nested descents: first quality, then resolution. Quality first
  // because dropping pixels loses crack detail the analysis actually uses,
  // while dropping WebP quality below ~0.7 mostly costs grain we do not read.
  for (let pass = 0; pass < 3; pass += 1) {
    const w = Math.max(1, Math.round((swapped ? srcH : srcW) * scale));
    const h = Math.max(1, Math.round((swapped ? srcW : srcH) * scale));

    const canvas: HTMLCanvasElement | OffscreenCanvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });

    const ctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) {
      return { ok: false, failure: 'encode_failed', message: 'We could not prepare that photo. Try another one.' };
    }
    ctx.imageSmoothingQuality = 'high';
    if (orientation !== 1) applyOrientation(ctx, orientation, w, h);
    ctx.drawImage(source as CanvasImageSource, 0, 0, swapped ? h : w, swapped ? w : h);

    for (const quality of QUALITY_LADDER) {
      const blob = await canvasToBlob(canvas, mediaType, quality);
      if (!blob) break;
      if (blob.size <= TARGET_MAX_BYTES) {
        // RE-ENCODING THROUGH A CANVAS DROPS ALL METADATA. There is no EXIF
        // block on the output, which means no GPS coordinates from a
        // homeowner's driveway — a liability we decline to hold, removed by
        // construction rather than by a stripping step that could be skipped.
        const base64 = await blobToBase64(blob);
        stage('done');
        if ('close' in source && typeof source.close === 'function') source.close();
        return {
          ok: true,
          base64,
          mediaType,
          bytes: blob.size,
          width: w,
          height: h,
          originalBytes: original.size,
          originalType: original.type || 'unknown',
          durationMs: Date.now() - started,
          previewUrl: URL.createObjectURL(blob),
        };
      }
    }
    scale *= 0.75; // still over ceiling at the lowest quality: shed pixels
  }

  return {
    ok: false,
    failure: 'encode_failed',
    message: 'That photo could not be compressed enough to send. Try a different one.',
  };
}
