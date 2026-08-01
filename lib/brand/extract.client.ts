'use client';

import { quantizePixels, type QuantizeResult } from './quantize';

/**
 * lib/brand/extract.client.ts — TIER 1, the primary extractor.
 *
 * ARCHITECTURE CONSTRAINT (from the brief, non-negotiable): this runs in the
 * ADMIN'S BROWSER with ZERO native dependencies. sharp, node-canvas and
 * node-vibrant all depend on native binaries that break on Vercel runtime
 * changes, and a broken native build cannot be debugged from a phone. The
 * browser already ships a complete, battle-tested image decoder — this uses
 * it. Only the resulting hex strings ever reach the server.
 *
 * This file is deliberately THIN. All the actual colour reasoning lives in
 * ./quantize.ts as a pure function so it can be unit-tested against the six
 * awkward-logo cases; everything here is just "turn a File into an RGBA
 * array". If a bug appears in extraction, it is almost certainly in
 * quantize.ts, which has tests, rather than here.
 *
 * DECODE + ORIENTATION reuse the Phase 4 image pipeline exactly as the brief
 * requires — same createImageBitmap path, same EXIF handling, same HEIC
 * detection and plain-language failure messages. A logo photographed on a
 * phone (which happens: contractors send a picture of their van) arrives
 * correctly rotated for free.
 */

/** Downscale before sampling. Extraction needs colour, not detail. */
const EXTRACT_MAX_EDGE = 256;

export type ClientExtractionResult =
  | { ok: true; result: QuantizeResult; previewUrl: string }
  | { ok: false; message: string };

export async function extractBrandFromFile(file: File): Promise<ClientExtractionResult> {
  // Reuse the Phase 4 pipeline for decode + orientation + format handling.
  // Code-split identically: nothing imports it at module scope.
  const { processImage } = await import('@/lib/image/pipeline');
  const processed = await processImage(file);
  if (!processed.ok) return { ok: false, message: processed.message };

  try {
    const blob = await (await fetch('data:' + processed.mediaType + ';base64,' + processed.base64)).blob();
    const bitmap = await createImageBitmap(blob);

    // Downscale hard: a 256px edge holds every colour relationship that
    // matters for extraction while cutting the pixel count ~40x on a typical
    // logo, which keeps the whole operation well inside one frame.
    const scale = Math.min(1, EXTRACT_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });

    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;

    if (!ctx) {
      bitmap.close?.();
      return { ok: false, message: 'This browser could not read the logo. Enter the colours by hand instead.' };
    }

    // No background fill — transparency must survive to quantizePixels, which
    // depends on real alpha to drop it (CASE 1). Filling white here would
    // silently convert every transparent logo into a white-background one.
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    bitmap.close?.();

    const result = quantizePixels(imageData.data, { stride: 1 });
    return { ok: true, result, previewUrl: processed.previewUrl };
  } catch {
    // NEVER HARD-FAIL (brief). A logo that defeats extraction still has to
    // produce a usable site — the caller falls through to Tier 3.
    return {
      ok: false,
      message: 'Automatic colour extraction did not work on this logo. Enter the colours by hand.',
    };
  }
}
