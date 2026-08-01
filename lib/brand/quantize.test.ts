import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToRgb, hueDistance, quantizePixels, rgbToHex, rgbToHsl,
} from './quantize';

/**
 * lib/brand/quantize.test.ts — THE SIX CASES, proven.
 *
 * The phase brief names six awkward logo shapes the extractor "must
 * correctly handle" and asks what the algorithm does in each. These tests
 * are that answer in executable form.
 */

/** Builds a flat RGBA buffer from [hex, count] pairs. */
function pixels(...spec: [string, number][]): number[] {
  const out: number[] = [];
  for (const [hex, count] of spec) {
    if (hex === 'transparent') {
      for (let i = 0; i < count; i += 1) out.push(0, 0, 0, 0);
      continue;
    }
    const rgb = hexToRgb(hex);
    assert.ok(rgb, 'test fixture hex must parse: ' + hex);
    for (let i = 0; i < count; i += 1) out.push(rgb.r, rgb.g, rgb.b, 255);
  }
  return out;
}

function hueOf(hex: string): number {
  const rgb = hexToRgb(hex);
  assert.ok(rgb);
  return rgbToHsl(rgb).h;
}

// ---------------------------------------------------------------------------
// CASE 1 — transparent PNG
// ---------------------------------------------------------------------------

test('CASE 1: transparent pixels are dropped, not read as black', () => {
  // 90% transparent, 10% blue. Naive code reads RGBA(0,0,0,0) as black and
  // returns black as the dominant colour.
  const result = quantizePixels(pixels(['transparent', 900], ['#1B4B8F', 100]));
  assert.equal(result.stats.transparent, 900);
  assert.equal(result.primaryHex?.toLowerCase(), '#1b4b8f');
  assert.notEqual(result.primaryHex?.toLowerCase(), '#000000');
});

test('CASE 1: a fully transparent image reports empty rather than guessing', () => {
  const result = quantizePixels(pixels(['transparent', 500]));
  assert.equal(result.detectedCase, 'empty');
  assert.equal(result.primaryHex, null);
});

// ---------------------------------------------------------------------------
// CASE 2 — near-white background
// ---------------------------------------------------------------------------

test('CASE 2: a logo on a white card does not extract white', () => {
  const result = quantizePixels(pixels(['#ffffff', 800], ['#fdfdfd', 100], ['#B22A18', 100]));
  assert.ok(result.stats.nearWhite >= 900, 'white pixels counted as background');
  assert.equal(result.primaryHex?.toLowerCase(), '#b22a18');
});

// ---------------------------------------------------------------------------
// CASE 3 — near-black background
// ---------------------------------------------------------------------------

test('CASE 3: a logo on a black field does not extract black', () => {
  const result = quantizePixels(pixels(['#000000', 800], ['#050505', 100], ['#D96A1E', 100]));
  assert.ok(result.stats.nearBlack >= 900);
  assert.equal(result.primaryHex?.toLowerCase(), '#d96a1e');
});

test('CASES 2 and 3 are symmetric — same predicate, inverted bound', () => {
  const onWhite = quantizePixels(pixels(['#ffffff', 900], ['#1B4B8F', 100]));
  const onBlack = quantizePixels(pixels(['#000000', 900], ['#1B4B8F', 100]));
  assert.equal(onWhite.primaryHex, onBlack.primaryHex, 'the same logo yields the same brand on either field');
});

// ---------------------------------------------------------------------------
// CASE 4 — monochrome logo
// ---------------------------------------------------------------------------

test('CASE 4: a monochrome logo reports monochrome and does NOT invent a hue', () => {
  const result = quantizePixels(pixels(['#ffffff', 700], ['#4A4A4A', 200], ['#8A8A8A', 100]));
  assert.equal(result.detectedCase, 'monochrome');
  assert.equal(result.accentHex, null, 'inventing an accent would brand him a colour not in his logo');
  assert.ok(result.primaryHex, 'still yields a usable primary');
});

test('CASE 4: monochrome primary is the DARKEST grey, not the most common', () => {
  // The mid-grey halo is more numerous; the dark mark is the actual logo.
  const result = quantizePixels(pixels(['#ffffff', 600], ['#9A9A9A', 300], ['#2B2B2B', 100]));
  assert.equal(result.detectedCase, 'monochrome');
  const rgb = hexToRgb(result.primaryHex ?? '');
  assert.ok(rgb);
  assert.ok(rgbToHsl(rgb).l < 0.3, 'picked the dark mark, not the light halo');
});

// ---------------------------------------------------------------------------
// CASE 5 — single-colour logo
// ---------------------------------------------------------------------------

test('CASE 5: a single-hue logo reports single_colour and leaves derivation downstream', () => {
  const result = quantizePixels(pixels(['#ffffff', 600], ['#1B4B8F', 400]));
  assert.equal(result.detectedCase, 'single_colour');
  assert.equal(result.primaryHex?.toLowerCase(), '#1b4b8f');
  assert.equal(result.secondaryHex, null);
  assert.equal(result.accentHex, null);
});

test('CASE 5: shades of ONE hue still count as single-colour, not two brands', () => {
  // Light and dark navy are the same brand colour, not two.
  const result = quantizePixels(pixels(['#ffffff', 500], ['#1B4B8F', 300], ['#2E63B0', 200]));
  assert.equal(result.detectedCase, 'single_colour');
});

// ---------------------------------------------------------------------------
// CASE 6 — mostly one colour with a tiny accent  (the headline case)
// ---------------------------------------------------------------------------

test('CASE 6: a small vivid accent is found even when 95% of the logo is one colour', () => {
  // 950 navy vs 50 orange. Ranking all slots by volume buries the orange.
  const result = quantizePixels(pixels(['#1B4B8F', 950], ['#FF6A13', 50]));
  assert.equal(result.detectedCase, 'chromatic');
  assert.equal(result.primaryHex?.toLowerCase(), '#1b4b8f', 'primary still goes to the dominant colour');
  assert.ok(result.accentHex, 'the tiny accent must be found');
  assert.ok(
    hueDistance(hueOf(result.accentHex), hueOf('#FF6A13')) < 20,
    'accent should be the orange mark, got ' + result.accentHex
  );
});

test('CASE 6: accent selection prefers vividness over volume', () => {
  // A large MUTED field and a small VIVID mark, both distinct from primary.
  const result = quantizePixels(
    pixels(['#1B4B8F', 800], ['#9C8F7E', 300], ['#12C43F', 40])
  );
  assert.ok(result.accentHex);
  assert.ok(
    hueDistance(hueOf(result.accentHex), hueOf('#12C43F')) < 25,
    'the vivid green should win the accent slot over the bulkier muted tan, got ' + result.accentHex
  );
});

test('CASE 6: primary is never displaced by the vividness rule', () => {
  const result = quantizePixels(pixels(['#3E5C6B', 900], ['#FF0000', 60]));
  assert.ok(hueDistance(hueOf(result.primaryHex ?? '#000'), hueOf('#3E5C6B')) < 25);
});

// ---------------------------------------------------------------------------
// general robustness
// ---------------------------------------------------------------------------

test('a normal two-colour logo returns three usable, distinct values', () => {
  const result = quantizePixels(
    pixels(['#ffffff', 500], ['#1B4B8F', 300], ['#D96A1E', 200], ['#1F5F52', 80])
  );
  assert.equal(result.detectedCase, 'chromatic');
  assert.ok(result.primaryHex && result.secondaryHex && result.accentHex);
  assert.ok(
    hueDistance(hueOf(result.primaryHex), hueOf(result.secondaryHex)) >= 25,
    'primary and secondary must be genuinely different colours'
  );
});

test('anti-aliasing noise does not become a brand colour', () => {
  // One stray pixel of a wild hue must not survive the noise floor.
  const result = quantizePixels(pixels(['#1B4B8F', 500], ['#D96A1E', 400], ['#00FF00', 1]));
  const hexes = [result.primaryHex, result.secondaryHex, result.accentHex].filter(Boolean) as string[];
  for (const hex of hexes) {
    assert.ok(hueDistance(hueOf(hex), hueOf('#00FF00')) > 25, 'single-pixel noise leaked into ' + hex);
  }
});

test('stride sampling reaches the same conclusion as a full scan', () => {
  const buf = pixels(['#ffffff', 4000], ['#1B4B8F', 2000], ['#D96A1E', 400]);
  const full = quantizePixels(buf, { stride: 1 });
  const sampled = quantizePixels(buf, { stride: 7 });
  assert.equal(full.detectedCase, sampled.detectedCase);
  assert.ok(
    hueDistance(hueOf(full.primaryHex ?? '#000'), hueOf(sampled.primaryHex ?? '#000')) < 20,
    'sampling must not change which colour is dominant'
  );
});

test('an empty buffer is handled without throwing', () => {
  const result = quantizePixels([]);
  assert.equal(result.detectedCase, 'empty');
  assert.equal(result.primaryHex, null);
});

test('colour space conversions round-trip', () => {
  for (const hex of ['#1B4B8F', '#FF6A13', '#1F5F52', '#000000', '#ffffff', '#7F7F7F']) {
    const rgb = hexToRgb(hex);
    assert.ok(rgb);
    assert.equal(rgbToHex(rgb).toLowerCase(), hex.toLowerCase());
  }
});

test('hueDistance is circular and symmetric', () => {
  assert.equal(hueDistance(10, 350), 20, 'wraps around 0/360');
  assert.equal(hueDistance(350, 10), 20, 'symmetric');
  assert.equal(hueDistance(0, 180), 180, 'maximum is 180');
});
