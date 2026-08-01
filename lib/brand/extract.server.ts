import 'server-only';
import { quantizePixels, type QuantizeResult } from './quantize';

/**
 * lib/brand/extract.server.ts — TIER 2, the explicit server-side fallback.
 *
 * BEHIND A FEATURE FLAG AND OFF BY DEFAULT: set BRAND_SERVER_EXTRACTION=1
 * to enable. It exists because the brief requires all three tiers to exist,
 * not because it is the recommended path — Tier 1 (the browser) is, for the
 * reasons documented there.
 *
 * DOCUMENTED INSTALL REQUIREMENT: this needs `sharp`, which is NOT in
 * package.json and is NOT installed by default, deliberately. sharp ships a
 * native binary; adding it to the main dependency tree would mean every
 * Vercel build depends on a native module that this project's own dependency
 * discipline says must be justified, and that cannot be debugged from a
 * phone when it breaks. To enable Tier 2:
 *
 *     npm install sharp
 *     # then set BRAND_SERVER_EXTRACTION=1 in Vercel
 *
 * The import below is DYNAMIC and wrapped, so the absence of sharp is a
 * clean "unavailable" result rather than a build failure or a crash. That is
 * what lets this ship disabled without breaking anything.
 *
 * VERIFY: sharp could not be installed or exercised in the build container
 * (no native toolchain, and it is not on the allowed-egress list), so this
 * tier is written to sharp's documented API but has NOT been execution-
 * tested the way quantize.ts and tokens.ts have. Tiers 1 and 3 both have
 * been. Treat Tier 2 as untested until you run it once.
 */

export type ServerExtractionResult =
  | { ok: true; result: QuantizeResult }
  | { ok: false; reason: 'disabled' | 'not_installed' | 'decode_failed' };

export function isServerExtractionEnabled(): boolean {
  return process.env.BRAND_SERVER_EXTRACTION === '1';
}

export async function extractBrandOnServer(bytes: Buffer): Promise<ServerExtractionResult> {
  if (!isServerExtractionEnabled()) return { ok: false, reason: 'disabled' };

  let sharp: unknown;
  try {
    // Non-literal specifier keeps the bundler from trying to resolve an
    // optional, uninstalled dependency at build time.
    const moduleName = 'sharp';
    sharp = (await import(/* webpackIgnore: true */ moduleName)).default;
  } catch {
    return { ok: false, reason: 'not_installed' };
  }

  try {
    type SharpFn = (b: Buffer) => {
      resize: (opts: { width: number; height: number; fit: string }) => {
        ensureAlpha: () => {
          raw: () => { toBuffer: () => Promise<Buffer> };
        };
      };
    };
    const s = sharp as SharpFn;

    // Same 256px downscale and same RGBA layout the browser path produces,
    // so both tiers feed byte-identical input into the SAME quantizePixels.
    // Tier 2 is a different way to get pixels, never a second algorithm.
    const raw = await s(bytes)
      .resize({ width: 256, height: 256, fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    return { ok: true, result: quantizePixels(raw, { stride: 1 }) };
  } catch {
    return { ok: false, reason: 'decode_failed' };
  }
}
