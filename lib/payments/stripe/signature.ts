import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * lib/payments/stripe/signature.ts — Stripe webhook signature verification.
 *
 * NOT MARKED server-only, and that is deliberate rather than an oversight:
 * this module is pure. It receives the secret as an ARGUMENT, reads no env
 * var, and performs no I/O — so there is no secret for a `server-only` guard
 * to protect. Adding one would have bought nothing and cost the unit tests
 * below, which cannot run behind that guard (node:test executes outside the
 * React Server Component context that makes `server-only` importable). Since
 * those tests are the entire reason hand-writing this is defensible instead
 * of reckless, the guard would have traded real proof for a symbolic one.
 * The only caller lives in a route handler that is server-side regardless.
 *
 * WRITTEN BY HAND RATHER THAN PULLED FROM THE SDK, deliberately, and this is
 * the one place in the build where that needs justifying properly:
 *
 *   - It is ~40 lines of well-specified HMAC, and it is the single most
 *     security-critical function in the payment path. An unverified webhook
 *     endpoint lets anyone on the internet grant themselves entitlements by
 *     POSTing a fake "invoice paid" event.
 *   - Because it is ours, it is UNIT-TESTED IN THIS REPO against known
 *     vectors (lib/payments/stripe/signature.test.ts), including the attacks
 *     that matter: wrong secret, tampered payload, replayed old timestamp,
 *     and a malformed header. A dependency I cannot execute in the build
 *     container would ship unproven.
 *   - Zero dependency, per the build's dependency discipline, and node:crypto
 *     is already present in the Node runtime.
 *
 * THE SCHEME (Stripe's documented format):
 *   Header: `Stripe-Signature: t=<unix ts>,v1=<hex hmac>[,v1=<hex hmac>...]`
 *   Signed payload: `<timestamp>.<raw request body>`
 *   MAC: HMAC-SHA256 keyed with the endpoint secret (whsec_...), hex digest.
 *
 * Multiple v1 signatures can appear during a secret rotation; ANY match is
 * accepted, which is what makes a zero-downtime secret roll possible.
 */

/** Stripe's own default tolerance. Rejects replay of an old captured request. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

export type SignatureFailure =
  | 'missing_header'
  | 'malformed_header'
  | 'no_signatures'
  | 'timestamp_out_of_tolerance'
  | 'no_match';

export type SignatureResult = { ok: true } | { ok: false; reason: SignatureFailure };

interface ParsedHeader {
  timestamp: number;
  signatures: string[];
}

function parseHeader(header: string): ParsedHeader | null {
  let timestamp = Number.NaN;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') timestamp = Number.parseInt(value, 10);
    else if (key === 'v1') signatures.push(value);
  }
  if (!Number.isFinite(timestamp)) return null;
  return { timestamp, signatures };
}

/** Constant-time compare that cannot throw on a length mismatch. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function computeSignature(rawBody: string, timestamp: number, secret: string): string {
  return createHmac('sha256', secret).update(timestamp + '.' + rawBody, 'utf8').digest('hex');
}

export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  opts: { toleranceSeconds?: number; nowSeconds?: number } = {}
): SignatureResult {
  if (!header) return { ok: false, reason: 'missing_header' };

  const parsed = parseHeader(header);
  if (!parsed) return { ok: false, reason: 'malformed_header' };
  if (parsed.signatures.length === 0) return { ok: false, reason: 'no_signatures' };

  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  // Absolute difference, so a far-future timestamp is rejected as firmly as
  // an old one — a clock-skewed forgery is still a forgery.
  if (Math.abs(now - parsed.timestamp) > tolerance) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }

  const expected = computeSignature(rawBody, parsed.timestamp, secret);
  for (const candidate of parsed.signatures) {
    if (safeEqualHex(candidate, expected)) return { ok: true };
  }
  return { ok: false, reason: 'no_match' };
}
