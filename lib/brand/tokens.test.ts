import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, rgbToHsl } from './quantize';
import {
  AA_LARGE_TEXT, AA_NORMAL_TEXT, contrastRatio, deriveTokens, ensureContrast,
  relativeLuminance, tokensToCssVars, type TokenSet,
} from './tokens';

function ratio(aHex: string, bHex: string): number {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  assert.ok(a && b, 'hex must parse: ' + aHex + ' / ' + bHex);
  return contrastRatio(a, b);
}

function satOf(hex: string): number {
  const rgb = hexToRgb(hex);
  assert.ok(rgb);
  return rgbToHsl(rgb).s;
}

/** Deliberately awful brand inputs. */
const NASTY_LOGOS = [
  { name: 'neon green', primaryHex: '#00FF00' },
  { name: 'near white', primaryHex: '#FEFEFE' },
  { name: 'near black', primaryHex: '#010101' },
  { name: 'nearly grey', primaryHex: '#8B8B8D' },
  { name: 'hot magenta', primaryHex: '#FF00FF' },
  { name: 'pure red', primaryHex: '#FF0000' },
  { name: 'muddy brown', primaryHex: '#4A3B2A' },
];

// ---------------------------------------------------------------------------
// WCAG maths
// ---------------------------------------------------------------------------

test('relative luminance matches the WCAG reference points', () => {
  assert.equal(Math.round(relativeLuminance({ r: 255, g: 255, b: 255 }) * 1000) / 1000, 1);
  assert.equal(relativeLuminance({ r: 0, g: 0, b: 0 }), 0);
});

test('black on white is the maximum 21:1', () => {
  assert.equal(Math.round(ratio('#000000', '#ffffff')), 21);
});

test('contrast is symmetric', () => {
  assert.equal(ratio('#1B4B8F', '#F4F5F3'), ratio('#F4F5F3', '#1B4B8F'));
});

test('ensureContrast leaves an already-passing pair untouched', () => {
  const r = ensureContrast('#14171A', '#F4F5F3', AA_NORMAL_TEXT, 'test');
  assert.equal(r.hex, '#14171A');
  assert.equal(r.adjustment, null);
});

test('ensureContrast darkens against a light surface and records the change', () => {
  const r = ensureContrast('#DDDDDD', '#FFFFFF', AA_NORMAL_TEXT, 'test.token');
  assert.notEqual(r.hex, '#DDDDDD');
  assert.ok(r.adjustment);
  assert.ok(ratio(r.hex, '#FFFFFF') >= AA_NORMAL_TEXT, 'must actually reach AA');
  assert.equal(r.adjustment?.token, 'test.token');
  assert.ok(r.adjustment && r.adjustment.finalRatio >= AA_NORMAL_TEXT);
});

test('ensureContrast lightens against a dark surface', () => {
  const r = ensureContrast('#222222', '#191C1B', AA_NORMAL_TEXT, 'test');
  assert.ok(ratio(r.hex, '#191C1B') >= AA_NORMAL_TEXT);
  const rgb = hexToRgb(r.hex);
  assert.ok(rgb && rgbToHsl(rgb).l > rgbToHsl(hexToRgb('#222222')!).l, 'moved lighter, away from the dark surface');
});

// ---------------------------------------------------------------------------
// THE GUARANTEE — the headline requirement of this phase
// ---------------------------------------------------------------------------

test('GUARANTEE 1 (ISOLATION_TEST): every logo produces byte-identical SURFACE tokens', () => {
  // This is the mechanical proof that a cheap logo cannot make an ugly site:
  // the logo simply has no channel through which to affect the surfaces,
  // body text, or rules that carry the design.
  const baseline = deriveTokens({ primaryHex: NASTY_LOGOS[0]!.primaryHex });
  for (const logo of NASTY_LOGOS) {
    const t = deriveTokens({ primaryHex: logo.primaryHex });
    for (const variant of ['light', 'dark'] as const) {
      for (const surfaceToken of ['concrete', 'sheet', 'ink', 'rule'] as const) {
        assert.equal(
          t[variant][surfaceToken],
          baseline[variant][surfaceToken],
          logo.name + ' changed ' + variant + '.' + surfaceToken + ' — the guarantee is broken'
        );
      }
    }
  }
});

test('GUARANTEE 1b: status colours are never brand-derived', () => {
  // A contractor whose logo is red must still get a RED danger state, not a
  // danger state that blends into his branding and stops reading as danger.
  const redBrand = deriveTokens({ primaryHex: '#FF0000' });
  const blueBrand = deriveTokens({ primaryHex: '#1B4B8F' });
  assert.equal(redBrand.light.danger, blueBrand.light.danger);
  assert.equal(redBrand.light.cure, blueBrand.light.cure);
  assert.equal(redBrand.light.warning, blueBrand.light.warning);
});

test('GUARANTEE 2: neon saturation is clamped into a usable band', () => {
  const neon = deriveTokens({ primaryHex: '#00FF00' });
  assert.ok(satOf(neon.light.hazard) <= 0.86, 'neon green was not clamped: ' + neon.light.hazard);
  assert.notEqual(neon.light.hazard.toLowerCase(), '#00ff00');
});

test('GUARANTEE 2b: a nearly-grey brand colour is pushed up so it reads as intentional', () => {
  const grey = deriveTokens({ primaryHex: '#8B8B8D' });
  assert.ok(satOf(grey.light.hazard) >= 0.24, 'nearly-grey brand stayed muddy: ' + grey.light.hazard);
});

test('GUARANTEE 3: a near-white brand colour never becomes an invisible button', () => {
  const t = deriveTokens({ primaryHex: '#FEFEFE' });
  assert.ok(
    ratio(t.light.hazard, t.light.concrete) >= AA_LARGE_TEXT,
    'near-white action failed against the light surface: ' + t.light.hazard
  );
});

test('GUARANTEE 3b: a near-black brand colour still reads on the DARK variant', () => {
  const t = deriveTokens({ primaryHex: '#010101' });
  assert.ok(
    ratio(t.dark.hazard, t.dark.concrete) >= AA_LARGE_TEXT,
    'near-black action vanished on dark: ' + t.dark.hazard
  );
});

test('GUARANTEE 4: EVERY nasty logo yields AA-passing text in BOTH variants', () => {
  for (const logo of NASTY_LOGOS) {
    const t = deriveTokens({ primaryHex: logo.primaryHex });
    for (const variant of ['light', 'dark'] as const) {
      const set = t[variant];
      assert.ok(
        ratio(set.ink, set.concrete) >= AA_NORMAL_TEXT,
        logo.name + ' / ' + variant + ': body text failed AA'
      );
      assert.ok(
        ratio(set.rule, set.sheet) >= AA_NORMAL_TEXT,
        logo.name + ' / ' + variant + ': muted text failed AA'
      );
      assert.ok(
        ratio(set.hazard, set.concrete) >= AA_LARGE_TEXT,
        logo.name + ' / ' + variant + ': action colour failed the UI-component threshold'
      );
    }
  }
});

test('adjustments are RECORDED, not applied silently', () => {
  const t = deriveTokens({ primaryHex: '#FEFEFE' });
  assert.ok(t.adjustments.length > 0, 'a near-white brand must produce a visible audit trail');
  for (const adj of t.adjustments) {
    assert.ok(adj.token && adj.reason && adj.fromHex && adj.toHex);
    assert.notEqual(adj.fromHex, adj.toHex, 'a recorded adjustment must be a real change');
  }
});

// ---------------------------------------------------------------------------
// completeness, variants, pinning
// ---------------------------------------------------------------------------

test('the full token set is populated in both variants, with no empty values', () => {
  const t = deriveTokens({ primaryHex: '#1B4B8F', secondaryHex: '#D96A1E' });
  const keys: (keyof TokenSet)[] = [
    'concrete', 'sheet', 'ink', 'rule',
    'hazard', 'hazardHover', 'hazardActive', 'hazardDisabled',
    'secondary', 'secondaryHover', 'secondaryActive', 'secondaryDisabled',
    'cure', 'warning', 'danger',
  ];
  for (const variant of ['light', 'dark'] as const) {
    for (const k of keys) {
      assert.match(t[variant][k], /^#[0-9a-f]{6}$/i, variant + '.' + k + ' is not a valid hex');
    }
  }
});

test('hover and active states are genuinely distinct from the base', () => {
  const t = deriveTokens({ primaryHex: '#1B4B8F' });
  assert.notEqual(t.light.hazard, t.light.hazardHover);
  assert.notEqual(t.light.hazardHover, t.light.hazardActive);
  assert.notEqual(t.light.hazard, t.light.hazardDisabled);
});

test('the dark variant is derived from the SAME source, not hardcoded per brand', () => {
  const a = deriveTokens({ primaryHex: '#1B4B8F' });
  const b = deriveTokens({ primaryHex: '#8F1B4B' });
  assert.notEqual(a.dark.hazard, b.dark.hazard, 'dark hazard must track the brand');
  assert.equal(a.dark.concrete, b.dark.concrete, 'dark surface must not');
});

test('disabled states are desaturated relative to their base', () => {
  const t = deriveTokens({ primaryHex: '#1B4B8F' });
  assert.ok(satOf(t.light.hazardDisabled) < satOf(t.light.hazard));
});

test('PINNED tokens survive re-extraction untouched', () => {
  const pinned = { hazard: '#123456' };
  const t = deriveTokens({ primaryHex: '#FF0000' }, pinned);
  assert.equal(t.light.hazard, '#123456', 'pin was overwritten by extraction');
  assert.equal(t.dark.hazard, '#123456', 'pin must hold in both variants');
});

test('pinning one token does not disturb the others', () => {
  const unpinned = deriveTokens({ primaryHex: '#1B4B8F' });
  const pinnedRun = deriveTokens({ primaryHex: '#1B4B8F' }, { hazard: '#123456' });
  assert.equal(pinnedRun.light.secondary, unpinned.light.secondary);
  assert.equal(pinnedRun.light.ink, unpinned.light.ink);
});

test('no brand input at all falls back to the house tokens without throwing', () => {
  const t = deriveTokens({});
  assert.equal(t.provenance.primary, 'house');
  assert.match(t.light.hazard, /^#[0-9a-f]{6}$/i);
  assert.ok(ratio(t.light.ink, t.light.concrete) >= AA_NORMAL_TEXT);
});

test('provenance reports honestly which slots came from the logo', () => {
  const full = deriveTokens({ primaryHex: '#1B4B8F', secondaryHex: '#D96A1E', accentHex: '#1F5F52' });
  assert.deepEqual(full.provenance, { primary: 'logo', secondary: 'logo', accent: 'logo' });
  const monochrome = deriveTokens({ primaryHex: '#333333' });
  assert.equal(monochrome.provenance.secondary, 'derived');
  assert.equal(monochrome.provenance.accent, 'house');
});

test('tokensToCssVars emits the "R G B" triplet form globals.css expects', () => {
  const t = deriveTokens({ primaryHex: '#1B4B8F' });
  const vars = tokensToCssVars(t.light);
  assert.equal(vars['--c-concrete'], '228 230 227', 'must be space-separated bytes, not a hex string');
  assert.match(vars['--c-hazard'] ?? '', /^\d{1,3} \d{1,3} \d{1,3}$/);
  assert.ok(Object.keys(vars).length >= 15, 'every token must be emitted');
});
