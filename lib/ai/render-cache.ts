import { createHash } from 'node:crypto';

/**
 * lib/ai/render-cache.ts — do not pay twice for the same picture.
 *
 * ============================================================================
 * THE PROBLEM THIS SOLVES
 * ============================================================================
 *
 * A render is the most expensive call this product makes, and the same photo
 * with the same selections produced a fresh paid generation every single time.
 * That is invisible in normal use — a homeowner renders once — and brutal in
 * the one workflow that matters most commercially: RECORDING AN ADVERT. Every
 * take of the same demo, with the same photograph and the same finish, was
 * billed again. Phase 67 cut renders from one-per-photo to one-per-visitor;
 * this cuts the repeats.
 *
 * The render is deterministic in its INPUTS, not its output — the same request
 * twice gives two different pictures, because the model is sampling. That is
 * exactly why caching is safe here and also why it is valuable: a visitor who
 * changes nothing and asks again does not WANT a different floor, and before
 * this he got one, at full price.
 *
 * ============================================================================
 * WHAT THIS IS NOT: IT IS NOT PERSISTENT
 * ============================================================================
 *
 * This is an in-process map. It lives inside one serverless instance and dies
 * with it. Two visitors served by two instances share nothing, and a cold start
 * begins empty.
 *
 * THAT IS A REAL LIMITATION AND IT IS STILL THE RIGHT FIRST VERSION, because
 * the case worth fixing is repeats within MINUTES — the second, third and
 * eighth take of the same advert — and those land on a warm instance. A
 * persistent cache would need a storage-backed index and a decision about
 * eviction and privacy for visitor photographs, which is a larger piece of work
 * with a much smaller marginal win.
 *
 * IF THIS IS MADE PERSISTENT LATER: the key below is already the right key. Do
 * not change it to include a session or a prototype — see the note on the hash.
 *
 * ============================================================================
 * WHY IT SITS AFTER THE GUARDS
 * ============================================================================
 *
 * The caller must check the IP rate limit and validate the payload BEFORE
 * consulting this cache. A cache hit costs nothing to serve, so it is tempting
 * to answer it early and skip the guards — but the rate limit is not only about
 * spend, it is about abuse, and an endpoint that answers unlimited requests
 * cheaply is still an endpoint answering unlimited requests.
 *
 * The daily render ceiling is checked deeper in, inside `visualiseFinish`, and a
 * cache hit does bypass it. That is correct rather than an oversight: the
 * ceiling exists to bound SPEND, and a hit spends nothing.
 */

/** What is worth storing: only a successful render. */
export interface CachedRender {
  dataUrl: string;
  storagePath: string | null;
  disclosure: string;
}

interface Entry {
  value: CachedRender;
  bytes: number;
  /** For LRU. Updated on read, which is what makes it least-RECENTLY-used. */
  touchedAt: number;
}

/**
 * Bounds. Data URLs of rendered garages run to a couple of megabytes each, so
 * the byte ceiling matters more than the entry count and both are enforced.
 * Deliberately small: this is a repeat-take cache, not a CDN, and an instance
 * that hoards renders is an instance that gets killed for memory.
 */
const MAX_ENTRIES = 8;
const MAX_BYTES = 24 * 1024 * 1024;
/**
 * Half an hour. Long enough to cover a recording session, short enough that an
 * idle instance is not holding visitor photographs indefinitely — these are
 * pictures of people's homes, and keeping them in memory longer than they are
 * useful is not free of consequence just because it is cheap.
 */
const TTL_MS = 30 * 60 * 1000;

const cache = new Map<string, Entry>();
let bytesHeld = 0;

/**
 * The cache key: everything that changes the picture, and nothing else.
 *
 * WHAT IS IN IT. The photograph, the finish and colour labels, the hex, the
 * surface, and the selections — because the selections decide which reference
 * images are fetched and what the prompt says.
 *
 * WHAT IS DELIBERATELY OUT OF IT. `sessionId` and `prototypeId`. Neither
 * affects the image, and including either would make the cache useless at
 * exactly the moment it matters: every take of an advert is a new session, so a
 * session-scoped key would never hit. This is the one design decision in the
 * file that is easy to get wrong and expensive to get wrong quietly.
 *
 * SELECTIONS ARE SORTED before hashing. The same choices arriving in a
 * different key order are the same request, and an unsorted JSON.stringify
 * would treat them as different ones.
 */
export function renderCacheKey(input: {
  photoBase64: string;
  finishLabel: string;
  surfaceLabel: string;
  colourLabel?: string | undefined;
  colourHex?: string | undefined;
  selections?: Record<string, string | string[] | undefined> | undefined;
}): string {
  const sel = input.selections ?? {};
  const stable = Object.keys(sel)
    .sort()
    .map((k) => {
      const v = sel[k];
      const norm = Array.isArray(v) ? [...v].sort().join('+') : (v ?? '');
      return k + '=' + norm;
    })
    .join('&');

  const h = createHash('sha256');
  h.update(input.photoBase64);
  h.update('\u0000' + input.finishLabel);
  h.update('\u0000' + input.surfaceLabel);
  h.update('\u0000' + (input.colourLabel ?? ''));
  h.update('\u0000' + (input.colourHex ?? ''));
  h.update('\u0000' + stable);
  return h.digest('hex');
}

function dropExpired(now: number): void {
  for (const [k, e] of cache) {
    if (now - e.touchedAt > TTL_MS) {
      cache.delete(k);
      bytesHeld -= e.bytes;
    }
  }
}

function evictUntilWithinBounds(): void {
  while (cache.size > MAX_ENTRIES || bytesHeld > MAX_BYTES) {
    // Least recently touched. Map iteration is insertion-ordered, which is NOT
    // the same as recency once entries are re-read, so the oldest touch is
    // found rather than assumed to be first.
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, e] of cache) {
      if (e.touchedAt < oldestAt) {
        oldestAt = e.touchedAt;
        oldestKey = k;
      }
    }
    if (oldestKey === null) return;
    const victim = cache.get(oldestKey);
    cache.delete(oldestKey);
    if (victim) bytesHeld -= victim.bytes;
  }
}

/** A stored render, or null. Never throws. */
export function getCachedRender(key: string): CachedRender | null {
  const now = Date.now();
  dropExpired(now);
  const hit = cache.get(key);
  if (!hit) return null;
  hit.touchedAt = now;
  return hit.value;
}

/**
 * Store a successful render. Failures are never cached — a rate limit, a
 * provider outage or a bad payload are all transient, and serving a stored
 * failure would turn a minute of trouble into half an hour of it.
 */
export function putCachedRender(key: string, value: CachedRender): void {
  const bytes = value.dataUrl.length;
  // A single render larger than the whole budget is not stored rather than
  // immediately evicting everything else to hold one picture.
  if (bytes > MAX_BYTES) return;

  const existing = cache.get(key);
  if (existing) bytesHeld -= existing.bytes;

  cache.set(key, { value, bytes, touchedAt: Date.now() });
  bytesHeld += bytes;
  evictUntilWithinBounds();
}

/** Present for tests and for the admin surface, if one ever wants it. */
export function renderCacheStats(): { entries: number; bytes: number } {
  return { entries: cache.size, bytes: bytesHeld };
}

/** Test seam. Not called in production. */
export function clearRenderCache(): void {
  cache.clear();
  bytesHeld = 0;
}
