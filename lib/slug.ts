/**
 * Unguessable, URL-safe prototype slugs.
 *
 * ENTROPY JUSTIFICATION (Phase 1 requirement):
 * Alphabet: 32 lowercase alphanumerics with the four ambiguous glyphs
 * (0/o, 1/l) removed — these slugs get read aloud off a truck dashboard and
 * typed from an SMS. Length 16 over a 32-char alphabet = 32^16 = 2^80
 * combinations. An attacker enumerating at 1,000 req/s for a full year makes
 * ~2^35 attempts: a 1-in-35-trillion chance of hitting ANY live slug, before
 * the per-IP rate limiting Phase 12A verifies on /s/[slug]. Slugs gate
 * visibility of a branded demo, not money or PII — 80 bits is comfortably
 * past the threat model, while staying short enough to not wrap in an SMS
 * preview. Collision risk across even 10^6 minted slugs is ~2^-40: ignored,
 * and the DB UNIQUE constraint backstops it anyway.
 *
 * Uses Web Crypto (available in Node 20, edge, and browsers) with rejection
 * sampling — no modulo bias, no dependencies.
 */

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 32 chars, no 0 o 1 l
const SLUG_LENGTH = 16;

export function generateSlug(): string {
  const out: string[] = [];
  const buf = new Uint8Array(SLUG_LENGTH * 2); // headroom for rejected bytes
  while (out.length < SLUG_LENGTH) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      // 32 divides 256 exactly (8 x 32), so masking to 5 bits is unbiased —
      // the rejection loop exists only to survive a future alphabet change.
      const idx = byte & 31;
      const ch = ALPHABET[idx];
      if (ch !== undefined) out.push(ch);
      if (out.length === SLUG_LENGTH) break;
    }
  }
  return out.join('');
}

/** Quote public ids share the generator: same alphabet, longer (20 = 100 bits). */
export function generateQuotePublicId(): string {
  return generateSlug() + generateSlug().slice(0, 4);
}

export function isValidSlugShape(s: string): boolean {
  return new RegExp(`^[${ALPHABET}]{${SLUG_LENGTH}}$`).test(s);
}
