import { calculateQuote, type QuoteComputation } from '@/lib/quote/pricing';
import { epoxyVertical } from '@/lib/verticals/epoxy';
import { DEMO_RULES, DEMO_SQFT_MIN, DEMO_SQFT_MAX } from './config';

/**
 * lib/demo/mockLead.ts — the Side B simulated homeowner lead package.
 *
 * DETERMINISTIC PER SESSION, NEVER RE-RANDOMISING (spec, verbatim). Called
 * exactly once, server-side, inside submitDemoLead, and the result is
 * returned to the client as part of the split-screen payload — it is
 * generated once and handed over, not regenerated on every render, so
 * "deterministic" here is satisfied by construction rather than by having to
 * reproduce the same random draw twice from a shared seed.
 *
 * The seed (the visitor's own session id) still matters: if a visitor
 * resubmits within the dedupe window (lib/quote/guards.ts / app/actions/
 * lead.ts), the EXISTING lead is returned rather than a new row, and the mock
 * package attached to it must read identically the second time — a pure
 * function of the seed is what makes that true without storing the mock
 * package anywhere.
 *
 * NO EXTERNAL IMAGE, DELIBERATELY: fetching or generating a photograph for a
 * permanent, deployed marketing surface carries a real licensing question
 * that isn't this build's to answer casually. photoDescriptor is a labelled,
 * on-brand placeholder in the product's own visual language (see
 * PayloadScreen.tsx) rather than an image asset — it also means the payload
 * has zero image weight, which matters for the phase's 1MB budget.
 */

function seededInt(seed: string, salt: string, min: number, max: number): number {
  // A small, dependency-free string hash (FNV-1a variant). Not cryptographic
  // — it only needs to be a stable, well-distributed function of the seed.
  let h = 0x811c9dc5;
  const s = seed + ':' + salt;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const unsigned = h >>> 0;
  return min + (unsigned % (max - min + 1));
}

function pick<T>(seed: string, salt: string, items: readonly T[]): T {
  const idx = seededInt(seed, salt, 0, items.length - 1);
  const item = items[idx];
  if (item === undefined) throw new Error('pick: empty list');
  return item;
}

const FIRST_NAMES = ['Karen', 'Mike', 'Susan', 'David', 'Linda', 'Robert', 'Patricia', 'James'] as const;
const LAST_INITIALS = ['M.', 'T.', 'R.', 'B.', 'H.', 'C.', 'W.', 'D.'] as const;
const DAMAGE_LABELS = [
  'Cracked two-car garage floor',
  'Oil-stained garage floor with hairline cracks',
  'Faded, previously-coated garage floor',
] as const;

export interface MockLead {
  displayName: string;
  photoDescriptor: string;
  surfaceLabel: string;
  finishLabel: string;
  colourLabel: string;
  colourHex: string;
  sqft: number;
  computation: QuoteComputation;
  /** ISO timestamp, always a few seconds to a few minutes before "now". */
  arrivedAt: string;
  arrivedLabel: string;
}

/**
 * The spec names the shape of the mock explicitly: a cracked-garage photo,
 * metallic finish, a calculated range. Those three are fixed rather than
 * randomised — they are the scenario the "aha moment" is written around, the
 * one where the value (a cracking-repair modifier, a premium finish rate) is
 * most visible in the breakdown. What varies by seed is everything cosmetic:
 * the name, the exact square footage, the colour, and how long ago it
 * "arrived" — enough variation that two visitors comparing screenshots don't
 * see an identical fake person, without diluting the one scenario that sells.
 */
export function generateMockLead(seed: string): MockLead {
  const metallic = epoxyVertical.finishCatalogue.find((f) => f.id === 'metallic_epoxy');
  const colours = metallic?.colours ?? [{ id: 'titanium', label: 'Titanium', hex: '#9BA1A6' }];
  const colour = pick(seed, 'colour', colours);

  const sqft = seededInt(seed, 'sqft', 420, 560); // two-car garage range
  const arrivedSecondsAgo = seededInt(seed, 'arrival', 40, 260);
  const arrivedAt = new Date(Date.now() - arrivedSecondsAgo * 1000).toISOString();

  const computation = calculateQuote(
    {
      sqft,
      surfaceTypeId: 'garage',
      finishTierKey: 'metallic',
      conditionModifierIds: ['cracking_moderate'],
      sqftMin: DEMO_SQFT_MIN,
      sqftMax: DEMO_SQFT_MAX,
    },
    DEMO_RULES
  );

  return {
    displayName: pick(seed, 'first', FIRST_NAMES) + ' ' + pick(seed, 'last', LAST_INITIALS),
    photoDescriptor: pick(seed, 'photo', DAMAGE_LABELS),
    surfaceLabel: 'Garage',
    finishLabel: 'Metallic Epoxy',
    colourLabel: colour.label,
    colourHex: colour.hex,
    sqft,
    computation,
    arrivedAt,
    arrivedLabel:
      arrivedSecondsAgo < 60
        ? arrivedSecondsAgo + ' seconds ago'
        : Math.round(arrivedSecondsAgo / 60) + ' minutes ago',
  };
}
