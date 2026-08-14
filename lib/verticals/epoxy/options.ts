/**
 * lib/verticals/epoxy/options.ts — WHAT A HOMEOWNER GETS TO CHOOSE.
 *
 * ============================================================================
 * WHAT THIS IS, AND WHAT IT IS EMPHATICALLY NOT
 * ============================================================================
 *
 * This is the SHAPE of an epoxy contractor's catalogue: the systems, colours,
 * blends, topcoats and extras that a garage floor company in this trade
 * actually sells. It is the sample the software is demonstrated with.
 *
 * IT CONTAINS NO PRICES AND MUST NEVER CONTAIN ANY. Money comes from one place
 * in this codebase — the contractor's own rate table, through
 * lib/quote/pricing.ts. A dollar figure written here would be a number this
 * software invented about a business it does not run, which is the exact
 * failure the whole product is built to avoid.
 *
 * ============================================================================
 * costTier: A RANK, NOT A PRICE
 * ============================================================================
 *
 * Every option carries a costTier from 1 to 5. It answers ONE question:
 * relative to the other options in the SAME GROUP, how expensive is this?
 *
 * It exists for a specific reason. Without it, a homeowner picks the most
 * beautiful thing in every group — full metallic, jumbo flake, gloss
 * polyaspartic, coved base, logo inlay — reaches the price and is shocked,
 * and the contractor gets a dead lead with a bad taste attached. Shown a rank
 * as they choose, people self-select into something they will actually buy.
 *
 * THE RANK IS ORDINAL AND ONLY ORDINAL. tier 4 is not "twice tier 2". It is
 * "dearer than tier 3, cheaper than tier 5, within this group". It is never
 * multiplied by anything, never summed into a total, and never rendered as
 * currency. Compare tiers ACROSS groups at your peril — a tier 5 add-on and a
 * tier 5 system are not comparable amounts, and the UI must present them
 * within their group for that reason.
 *
 * VERIFY: the ordering below reflects how this trade generally prices, not any
 * one contractor. When a real contractor is onboarded, their rate table
 * decides money and this ordering should be checked against it.
 *
 * ============================================================================
 * WHY THE DATA LIVES IN THE VERTICAL MODULE
 * ============================================================================
 *
 * Because painting and roofing will have completely different groups, and the
 * registry pattern already exists so a trade owns its own vocabulary. Nothing
 * here is generic and nothing here should leak into a shared module.
 *
 * NO 'server-only'. The picker is a client component and imports these shapes
 * directly. There is nothing secret in a list of floor colours.
 */

/** 1 = cheapest in its group, 5 = dearest in its group. Ordinal only. */
export type CostTier = 1 | 2 | 3 | 4 | 5;

export interface FinishOptionDef {
  /** Stable key. Used in storage, in combination keys and in the render prompt. */
  key: string;
  label: string;
  /** One line a homeowner understands. No jargon he would have to look up. */
  blurb: string;
  costTier: CostTier;
  /**
   * A hex, where the option has one dominant colour. Used ONLY as a fallback
   * swatch until a real photograph is uploaded — a flat rectangle of colour is
   * an honest placeholder, an invented photograph would not be.
   */
  hex?: string;
  /**
   * Words handed to the image model when this option is chosen. This is the
   * option's own description of itself, written for a renderer rather than for
   * a person, which is why it is separate from `blurb`.
   */
  renderHint: string;
  /**
   * Only offered when the named group already has one of these values. A
   * flake blend is meaningless under a metallic pour.
   */
  requires?: { group: string; anyOf: string[] };
}

export interface FinishGroupDef {
  key: string;
  label: string;
  /** Shown above the swatches. Explains what this decision changes. */
  blurb: string;
  /** A choice the visitor must make before the render can run. */
  required: boolean;
  /** Several at once (add-ons) rather than one of many (system, colour). */
  multiple: boolean;
  options: FinishOptionDef[];
}

// ---------------------------------------------------------------------------
// 1. the system — the single decision everything else hangs off
// ---------------------------------------------------------------------------

const SYSTEM: FinishGroupDef = {
  key: 'system',
  label: 'The coating',
  blurb:
    'This is the big one. It decides how the floor looks, how it wears, and most of what it costs.',
  required: true,
  multiple: false,
  options: [
    {
      key: 'solid',
      label: 'Solid colour epoxy',
      blurb: 'One clean colour, wall to wall. The workhorse.',
      costTier: 1,
      hex: '#6E7276',
      renderHint:
        'a single uniform solid-colour epoxy coating, smooth and evenly pigmented, with a light sheen',
    },
    {
      key: 'flake',
      label: 'Decorative flake',
      blurb:
        'Coloured vinyl chips broadcast into the coat. Hides dirt and slab imperfections better than anything else here.',
      costTier: 2,
      hex: '#8A8079',
      renderHint:
        'a decorative vinyl flake (chip) epoxy floor, with multi-coloured flakes broadcast densely across the surface under a clear topcoat',
    },
    {
      key: 'quartz',
      label: 'Quartz broadcast',
      blurb:
        'Coloured quartz sand instead of vinyl. Tougher and more textured — common in commercial rooms.',
      costTier: 3,
      hex: '#A79684',
      renderHint:
        'a quartz broadcast epoxy floor with a fine granular coloured-sand texture under a clear sealer',
    },
    {
      key: 'metallic',
      label: 'Metallic pour',
      blurb:
        'Pigments moved through the resin so the floor looks like poured stone. The showpiece.',
      costTier: 4,
      hex: '#7A5C43',
      renderHint:
        'a metallic epoxy floor with swirling pearlescent pigment creating depth and marbled movement, high gloss, reflective',
    },
    {
      key: 'polyaspartic',
      label: 'Solid polyaspartic',
      blurb:
        'Fastest to cure, hardest wearing, best in sunlight. Costs the most and is worth it in a hot garage.',
      costTier: 5,
      hex: '#5C6166',
      renderHint:
        'a solid-colour polyaspartic floor coating, extremely glossy and hard, uniform colour, UV stable',
    },
  ],
};

// ---------------------------------------------------------------------------
// 2. colour — three parallel groups, one per system that needs one
//
// Split rather than merged because a homeowner choosing a flake blend and a
// homeowner choosing a metallic are choosing genuinely different things, and
// one list of forty entries filtered down to eight is a worse experience than
// three lists that appear when they apply.
// ---------------------------------------------------------------------------

const SOLID_COLOUR: FinishGroupDef = {
  key: 'solid_colour',
  label: 'Colour',
  blurb: 'Darker hides tyre marks. Lighter makes the room feel bigger.',
  required: true,
  multiple: false,
  options: [
    { key: 'slate', label: 'Slate grey', blurb: 'The default for a reason. Hides everything.', costTier: 1, hex: '#6B7076', renderHint: 'slate grey' },
    { key: 'charcoal', label: 'Charcoal', blurb: 'Darker, richer, very forgiving.', costTier: 1, hex: '#3C4045', renderHint: 'dark charcoal grey' },
    { key: 'sandstone', label: 'Sandstone', blurb: 'Warm beige. Brightens a windowless garage.', costTier: 1, hex: '#C4AE92', renderHint: 'warm beige sandstone' },
    { key: 'tile_red', label: 'Tile red', blurb: 'Classic workshop floor.', costTier: 1, hex: '#8E4436', renderHint: 'terracotta tile red' },
    { key: 'safety_blue', label: 'Safety blue', blurb: 'Common in commercial bays.', costTier: 1, hex: '#2F5B8C', renderHint: 'deep safety blue' },
    { key: 'jet', label: 'Jet black', blurb: 'Shows dust, looks superb clean.', costTier: 2, hex: '#1E2022', renderHint: 'jet black' },
    { key: 'pearl_white', label: 'Pearl white', blurb: 'Brightest option. Needs the most upkeep.', costTier: 2, hex: '#E4E2DC', renderHint: 'off-white pearl' },
  ],
};

const FLAKE_BLEND: FinishGroupDef = {
  key: 'flake_blend',
  label: 'Flake blend',
  blurb: 'The chip mix. This is what people notice first.',
  required: true,
  multiple: false,
  options: [
    { key: 'domino', label: 'Domino', blurb: 'Black, white and grey. The most-ordered blend in the trade.', costTier: 1, hex: '#7C7F82', renderHint: 'black, white and grey vinyl flake blend' },
    { key: 'granite', label: 'Granite', blurb: 'Greys and off-whites. Reads like stone.', costTier: 1, hex: '#8D8F8C', renderHint: 'grey and off-white granite-look flake blend' },
    { key: 'cappuccino', label: 'Cappuccino', blurb: 'Browns and creams. Warm, very forgiving.', costTier: 1, hex: '#9C8266', renderHint: 'brown, tan and cream flake blend' },
    { key: 'tuxedo', label: 'Tuxedo', blurb: 'Black and white, high contrast.', costTier: 2, hex: '#5A5C5E', renderHint: 'high-contrast black and white flake blend' },
    { key: 'sedona', label: 'Sedona', blurb: 'Tan, rust and brown. Desert tones.', costTier: 2, hex: '#A5714A', renderHint: 'tan, rust and brown desert flake blend' },
    { key: 'coastal', label: 'Coastal', blurb: 'Blue-greys and white.', costTier: 2, hex: '#6C8296', renderHint: 'blue-grey and white coastal flake blend' },
    { key: 'copper_canyon', label: 'Copper canyon', blurb: 'Copper, bronze and black.', costTier: 3, hex: '#8E5A32', renderHint: 'copper, bronze and black flake blend' },
    { key: 'forest', label: 'Forest', blurb: 'Greens, browns and black.', costTier: 3, hex: '#4F6350', renderHint: 'green, brown and black flake blend' },
    { key: 'wineberry', label: 'Wineberry', blurb: 'Burgundy, grey and black.', costTier: 3, hex: '#6E3A44', renderHint: 'burgundy, grey and black flake blend' },
    { key: 'silver_fox', label: 'Silver fox', blurb: 'Pale greys and silver. Bright and modern.', costTier: 3, hex: '#A8ABAD', renderHint: 'pale grey and silver flake blend' },
  ],
};

const METALLIC_COLOUR: FinishGroupDef = {
  key: 'metallic_colour',
  label: 'Pour colour',
  blurb: 'Metallics move as they cure, so no two floors come out identical.',
  required: true,
  multiple: false,
  options: [
    { key: 'molten_silver', label: 'Molten silver', blurb: 'Silver through charcoal. The safe showpiece.', costTier: 2, hex: '#9BA0A5', renderHint: 'silver and charcoal metallic pour with pearlescent movement' },
    { key: 'copper_burl', label: 'Copper burl', blurb: 'Copper and bronze, deep and warm.', costTier: 3, hex: '#9A5F30', renderHint: 'copper and bronze metallic pour, warm and deep' },
    { key: 'midnight', label: 'Midnight blue', blurb: 'Blue-black with silver veining.', costTier: 3, hex: '#25384F', renderHint: 'midnight blue metallic pour with silver veining' },
    { key: 'emerald', label: 'Emerald', blurb: 'Deep green through black.', costTier: 4, hex: '#245245', renderHint: 'deep emerald green metallic pour with black depth' },
    { key: 'lava', label: 'Lava', blurb: 'Red and orange through black. The loudest option here.', costTier: 4, hex: '#8C3524', renderHint: 'red and orange lava metallic pour over black' },
    { key: 'pearl', label: 'Pearl white', blurb: 'White and champagne. Bright, shows the movement most.', costTier: 4, hex: '#DCD5C9', renderHint: 'white and champagne pearl metallic pour' },
  ],
};

const QUARTZ_COLOUR: FinishGroupDef = {
  key: 'quartz_colour',
  label: 'Quartz blend',
  blurb: 'Coloured sand, so the texture is part of the look.',
  required: true,
  multiple: false,
  options: [
    { key: 'grey_blend', label: 'Grey blend', blurb: 'Neutral, commercial.', costTier: 1, hex: '#8B8D8C', renderHint: 'grey quartz aggregate blend' },
    { key: 'desert_tan', label: 'Desert tan', blurb: 'Warm sand tones.', costTier: 1, hex: '#BFA47F', renderHint: 'tan and cream quartz aggregate blend' },
    { key: 'autumn', label: 'Autumn', blurb: 'Rust, brown and gold.', costTier: 2, hex: '#96663D', renderHint: 'rust, brown and gold quartz aggregate blend' },
    { key: 'sierra', label: 'Sierra', blurb: 'Grey, black and white speckle.', costTier: 2, hex: '#75787A', renderHint: 'grey, black and white speckled quartz aggregate' },
  ],
};

// ---------------------------------------------------------------------------
// 3. flake coverage — only when there is flake to cover with
// ---------------------------------------------------------------------------

const FLAKE_COVERAGE: FinishGroupDef = {
  key: 'flake_coverage',
  label: 'How much flake',
  blurb:
    'How densely the chips are broadcast. More flake hides more, and costs more in material and in labour.',
  required: false,
  multiple: false,
  options: [
    {
      key: 'light',
      label: 'Light scatter',
      blurb: 'Chips scattered over the base colour. The base still reads through.',
      costTier: 1,
      renderHint: 'lightly scattered flakes with the base colour clearly visible between them',
      requires: { group: 'system', anyOf: ['flake'] },
    },
    {
      key: 'medium',
      label: 'Medium',
      blurb: 'Roughly half covered. The usual choice.',
      costTier: 2,
      renderHint: 'medium flake coverage, roughly half the base colour showing through',
      requires: { group: 'system', anyOf: ['flake'] },
    },
    {
      key: 'full',
      label: 'Full broadcast',
      blurb: 'Chips to refusal — no base colour showing. The deepest, most uniform look.',
      costTier: 4,
      renderHint:
        'full broadcast flake coverage, chips packed edge to edge with no base colour visible, sanded smooth under a thick clear topcoat',
      requires: { group: 'system', anyOf: ['flake'] },
    },
  ],
};

const FLAKE_SIZE: FinishGroupDef = {
  key: 'flake_size',
  label: 'Chip size',
  blurb: 'Bigger chips read as stone from standing height. Smaller reads as a speckle.',
  required: false,
  multiple: false,
  options: [
    { key: 'fine', label: 'Fine, 1/8"', blurb: 'Subtle speckle.', costTier: 1, renderHint: 'small 1/8 inch flakes, fine speckled appearance', requires: { group: 'system', anyOf: ['flake'] } },
    { key: 'standard', label: 'Standard, 1/4"', blurb: 'What most floors use.', costTier: 1, renderHint: 'standard quarter-inch flakes', requires: { group: 'system', anyOf: ['flake'] } },
    { key: 'jumbo', label: 'Jumbo, 1/2"', blurb: 'Bold, stone-like. Needs a thicker topcoat.', costTier: 3, renderHint: 'large half-inch jumbo flakes, bold stone-like appearance', requires: { group: 'system', anyOf: ['flake'] } },
  ],
};

// ---------------------------------------------------------------------------
// 4. topcoat
// ---------------------------------------------------------------------------

const TOPCOAT: FinishGroupDef = {
  key: 'topcoat',
  label: 'Finish',
  blurb: 'How much the floor shines, and how hard the surface is.',
  required: false,
  multiple: false,
  options: [
    { key: 'satin', label: 'Satin', blurb: 'A soft sheen. Hides dust best.', costTier: 1, renderHint: 'a satin sheen, softly reflective' },
    { key: 'gloss', label: 'High gloss', blurb: 'Wet-look shine. The showroom finish.', costTier: 2, renderHint: 'a high-gloss wet-look finish with strong reflections' },
    { key: 'matte', label: 'Matte', blurb: 'Almost no shine. Modern and understated.', costTier: 2, renderHint: 'a matte low-sheen finish with almost no reflection' },
    { key: 'poly_clear', label: 'Polyaspartic clear', blurb: 'The toughest topcoat, and UV stable so it will not yellow.', costTier: 4, renderHint: 'a thick, glassy, clear polyaspartic topcoat, very glossy and deep' },
  ],
};

// ---------------------------------------------------------------------------
// 5. extras — several at once
// ---------------------------------------------------------------------------

const EXTRAS: FinishGroupDef = {
  key: 'extras',
  label: 'Extras',
  blurb: 'Pick any of these, or none. Each one adds to the job.',
  required: false,
  multiple: true,
  options: [
    { key: 'anti_slip', label: 'Anti-slip grit', blurb: 'Fine aggregate in the topcoat. Worth it if the floor gets wet.', costTier: 1, renderHint: 'a subtle anti-slip texture in the topcoat' },
    { key: 'border', label: 'Border band', blurb: 'A band of a second colour around the edge.', costTier: 2, renderHint: 'a contrasting solid-colour border band running around the perimeter of the floor' },
    { key: 'cove', label: 'Coved base', blurb: 'The coating curves up the wall a few inches. No dirt trap at the edge.', costTier: 4, renderHint: 'the coating curving up the base of the walls in a smooth integral cove' },
    { key: 'logo', label: 'Logo or crest inlay', blurb: 'A badge or emblem set into the floor.', costTier: 5, renderHint: 'a circular emblem inlay set into the centre of the floor' },
    { key: 'striping', label: 'Line striping', blurb: 'Painted bay or walkway lines. Commercial rooms mostly.', costTier: 2, renderHint: 'painted line striping marking out bays' },
    { key: 'uv_clear', label: 'UV-stable clear', blurb: 'Stops the floor yellowing where sun hits it.', costTier: 3, renderHint: 'a clear UV-stable finish, no yellowing' },
  ],
};

// ---------------------------------------------------------------------------
// 6. preparation — invisible in the render, decisive in the price
// ---------------------------------------------------------------------------

const PREP: FinishGroupDef = {
  key: 'prep',
  label: 'Slab preparation',
  blurb:
    'What happens before any coating goes down. It changes nothing about how the floor looks and a great deal about how long it lasts.',
  required: false,
  multiple: false,
  options: [
    { key: 'grind', label: 'Diamond grind', blurb: 'The standard. Opens the concrete so the coating bonds.', costTier: 1, renderHint: '' },
    { key: 'grind_patch', label: 'Grind and patch', blurb: 'Adds filling of cracks, pits and old anchor holes.', costTier: 2, renderHint: '' },
    { key: 'shot_blast', label: 'Shot blast', blurb: 'Aggressive mechanical prep for a slab in poor shape.', costTier: 4, renderHint: '' },
    { key: 'moisture', label: 'Moisture barrier', blurb: 'A primer for slabs pushing damp up from below. Without it a coating can lift.', costTier: 4, renderHint: '' },
  ],
};

// ---------------------------------------------------------------------------

export const EPOXY_GROUPS: readonly FinishGroupDef[] = [
  SYSTEM,
  SOLID_COLOUR,
  FLAKE_BLEND,
  METALLIC_COLOUR,
  QUARTZ_COLOUR,
  FLAKE_COVERAGE,
  FLAKE_SIZE,
  TOPCOAT,
  EXTRAS,
  PREP,
];

/**
 * Which colour group belongs to which system. Kept as data rather than as a
 * chain of ifs in the picker, so adding a system is one entry here and nothing
 * in the UI changes.
 */
const COLOUR_GROUP_FOR_SYSTEM: Record<string, string> = {
  solid: 'solid_colour',
  flake: 'flake_blend',
  metallic: 'metallic_colour',
  quartz: 'quartz_colour',
  polyaspartic: 'solid_colour',
};

export type Selections = Record<string, string | string[] | undefined>;

function chosenIn(selections: Selections, group: string): string[] {
  const v = selections[group];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v;
  return [];
}

/**
 * The groups to show, given what has been chosen so far.
 *
 * PROGRESSIVE, NOT ALL AT ONCE. Ten groups on screen simultaneously is a form,
 * and people abandon forms. Revealed one decision at a time it is a
 * conversation, and each answer visibly narrows what comes next — which is
 * also the honest structure, because a flake blend genuinely does not exist
 * until somebody has chosen flake.
 */
/**
 * ============================================================================
 * THE THREE GROUPS THAT DECIDE A JOB. THE OTHER SEVEN ARE PARKED, NOT DELETED.
 * ============================================================================
 *
 * Ten groups and fifty-three options is a catalogue. A person being shown this
 * for the first time — on a video, or on a contractor's website with his thumb
 * already hovering over the back button — is not shopping a catalogue. He wants
 * to know what it costs.
 *
 * WHAT SURVIVES, and why these three:
 *
 *   system        The coating. Solid, flake, quartz, metallic, polyaspartic.
 *                 It decides how the floor looks, how it wears, and most of
 *                 what it costs. Nothing else can be chosen until it is.
 *
 *   the colour    Whichever colour group belongs to the chosen system —
 *                 flake_blend for flake, solid_colour for solid, and so on.
 *                 This is the one people actually engage with. It is what they
 *                 point at on the screen.
 *
 *   topcoat       Satin, gloss, matte, polyaspartic. The second-biggest visual
 *                 difference and a real line on the invoice.
 *
 * WHAT IS PARKED: flake_coverage, flake_size, extras, prep, and the colour
 * groups for systems not chosen.
 *
 * Coverage and chip size are decisions an installer makes at the slab, not
 * ones a homeowner has an opinion about before anyone has visited. Prep is
 * priced from the CONDITION OF THE SLAB, which the vision analysis already
 * grades from the photographs — asking the customer to grade his own concrete
 * is asking him to do the surveyor's job. Extras are a genuine upsell and
 * belong in the conversation the lead starts, not ahead of the price.
 *
 * NOTHING IS REMOVED. Every group, every option, every hex, every renderHint
 * and every price rule stays exactly where it is and stays exported. The
 * catalogue is intact; three of its groups are on screen.
 *
 * TO BRING THEM ALL BACK: set NEXT_PUBLIC_EPOXY_ALL_GROUPS=1 in Vercel. No
 * redeploy and no code change — and `NEXT_PUBLIC_` specifically because
 * FinishPicker is a client component, so a bare server-side variable would be
 * `undefined` in the browser and the flag would appear not to work.
 *
 * WHY A FLAG AND NOT AN ADMIN TOGGLE YET. The admin surface is the right home
 * for this and it is coming. A flag is what can ship today, and today is what
 * matters — this is the difference between a demo that scrolls for a minute
 * and one that gets to a price.
 */
const CORE_GROUP_KEYS: ReadonlySet<string> = new Set(['system', 'topcoat']);

function allGroupsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EPOXY_ALL_GROUPS === '1';
}

export function visibleGroups(selections: Selections): FinishGroupDef[] {
  const system = chosenIn(selections, 'system')[0];
  const out: FinishGroupDef[] = [SYSTEM];
  if (!system) return out;

  const colourKey = COLOUR_GROUP_FOR_SYSTEM[system];
  for (const g of EPOXY_GROUPS) {
    if (g.key === 'system') continue;

    // Colour groups: only the one belonging to the chosen system.
    if (g.key.endsWith('_colour') || g.key === 'flake_blend') {
      if (g.key === colourKey) out.push(g);
      continue;
    }

    // Everything else appears when at least one of its options applies.
    const usable = g.options.filter(
      (o) => !o.requires || o.requires.anyOf.includes(chosenIn(selections, o.requires.group)[0] ?? '')
    );
    if (usable.length === 0) continue;

    /**
     * The trim happens HERE, at the last gate, and deliberately not earlier.
     *
     * Everything above — the system check, the colour-group routing, the
     * `requires` filtering — runs untouched, so a parked group that is later
     * switched back on reappears with its progressive-reveal behaviour exactly
     * as it was. Filtering at the top of the function would have meant the
     * reveal logic never ran for those groups and would rot unnoticed.
     *
     * The colour group is already narrowed to the chosen system by the branch
     * above, so it does not need naming here — it arrives as the one group
     * that survived.
     */
    if (!allGroupsEnabled() && !CORE_GROUP_KEYS.has(g.key)) continue;

    out.push({ ...g, options: usable });
  }
  return out;
}

/** Every group that must be answered before a render can be asked for. */
export function missingRequired(selections: Selections): FinishGroupDef[] {
  return visibleGroups(selections).filter(
    (g) => g.required && chosenIn(selections, g.key).length === 0
  );
}

export function findOption(groupKey: string, optionKey: string): FinishOptionDef | null {
  const g = EPOXY_GROUPS.find((x) => x.key === groupKey);
  return g?.options.find((o) => o.key === optionKey) ?? null;
}

/**
 * The canonical key for one complete set of choices.
 *
 * SORTED AND JOINED DETERMINISTICALLY so the same floor always produces the
 * same string no matter what order the visitor answered in. That matters
 * because this key is how an uploaded combination photograph is found: if the
 * key drifted with answer order, a photo uploaded once would match almost
 * nothing.
 *
 * Groups with no bearing on appearance are EXCLUDED — prep changes nothing
 * visible, so including it would split one photograph into four identical
 * ones.
 */
const APPEARANCE_GROUPS = [
  'system',
  'solid_colour',
  'flake_blend',
  'metallic_colour',
  'quartz_colour',
  'flake_coverage',
  'flake_size',
  'topcoat',
];

export function comboKeyFor(selections: Selections): string {
  const parts: string[] = [];
  for (const g of APPEARANCE_GROUPS) {
    const vals = chosenIn(selections, g);
    if (vals.length === 0) continue;
    parts.push(g + '=' + [...vals].sort().join('+'));
  }
  return parts.join('&');
}

/** The swatch storage key for one option. */
export function swatchKeyFor(groupKey: string, optionKey: string): string {
  return groupKey + ':' + optionKey;
}

/**
 * The description handed to the image model.
 *
 * Assembled from each chosen option's own renderHint rather than written here,
 * so adding an option adds its own words and no central sentence has to be
 * kept in step with the catalogue.
 */
export function renderDescription(selections: Selections): string {
  const bits: string[] = [];
  for (const g of visibleGroups(selections)) {
    for (const key of chosenIn(selections, g.key)) {
      const o = g.options.find((x) => x.key === key);
      if (o && o.renderHint.trim().length > 0) bits.push(o.renderHint.trim());
    }
  }
  return bits.join(', ');
}

/** A short human summary, for the confirmation screen and the lead email. */
export function selectionSummary(selections: Selections): string[] {
  const out: string[] = [];
  for (const g of visibleGroups(selections)) {
    const labels = chosenIn(selections, g.key)
      .map((k) => g.options.find((o) => o.key === k)?.label)
      .filter((l): l is string => Boolean(l));
    if (labels.length > 0) out.push(g.label + ': ' + labels.join(', '));
  }
  return out;
}


/**
 * ============================================================================
 * DEFAULTS — WHY THE PICKER MUST NEVER SIT ON AN EMPTY GROUP. PHASE 35.
 * ============================================================================
 *
 * THIS IS A BUG FIX, NOT A CONVENIENCE. It looks like a nicety; it is not.
 *
 * `topcoat` is `required: false`, so nothing has ever forced a visitor to
 * answer it — but topcoat IS in APPEARANCE_GROUPS, which means it is part of
 * `comboKeyFor`. Meanwhile ComboStudio generates every combination WITH a
 * topcoat, defaulting to high gloss. So the keys were:
 *
 *   generated by admin   system=solid&solid_colour=slate&topcoat=gloss
 *   asked for by picker  system=solid&solid_colour=slate
 *
 * Those never match. Until the visitor happened to tap a sheen, the preview
 * could not find a photograph for ANY combination, no matter how many had been
 * rendered and paid for — and what he saw instead was the honest "no reference
 * photo of this exact combination yet" panel, which looks exactly like the
 * library being empty. An entire generation run was invisible.
 *
 * WHY THE TOPCOAT DEFAULT IS GLOSS AND NOT THE FIRST OPTION. The first option
 * in the group is Satin. Defaulting to it would move the mismatch rather than
 * fix it: the picker would ask for `topcoat=satin` and the library, generated
 * gloss-first, would still have nothing. The default here and the default in
 * ComboStudio have to be the same value, and `DEFAULT_TOPCOAT_KEY` is that
 * value stated once so the two cannot drift apart again.
 *
 * WHAT GETS FILLED, and nothing else:
 *
 *   - single-select groups that are `required`, and
 *   - `topcoat`, for the reason above.
 *
 * NOT `extras` (multi-select — an unticked add-on is a real answer meaning
 * "no", and pre-ticking one would put a charge on a quote nobody asked for),
 * and NOT `prep` (optional, single, and absent from APPEARANCE_GROUPS, so it
 * changes no picture; it is also the surveyor's judgement rather than the
 * homeowner's).
 *
 * IT IS A LOOP BECAUSE THE REVEAL IS PROGRESSIVE. `visibleGroups` returns only
 * SYSTEM until a system is chosen, so filling the colour group is impossible
 * on the first pass — the group does not exist yet. Each pass re-reads
 * `visibleGroups` against what the previous pass filled. It stops as soon as a
 * pass changes nothing, and is bounded regardless: this cannot spin, and a
 * catalogue change that somehow made it oscillate would stop rather than hang
 * the browser.
 *
 * IT IS PURE. It returns a new Selections and never mutates the argument, so a
 * caller can compare the result against the input to decide whether anything
 * actually needs to change — which is what FinishPicker does to avoid an
 * endless render loop.
 */

/** The sheen the combination library is generated with. ComboStudio agrees. */
export const DEFAULT_TOPCOAT_KEY = 'gloss';

/**
 * Optional groups that are filled anyway because they take part in the
 * combination key. Adding a group here without also generating renders for it
 * reintroduces the mismatch described above.
 */
const AUTOFILL_OPTIONAL_KEYS: ReadonlySet<string> = new Set(['topcoat']);

function defaultOptionFor(group: FinishGroupDef): string | null {
  if (group.key === 'topcoat') {
    const preferred = group.options.find((o) => o.key === DEFAULT_TOPCOAT_KEY);
    if (preferred) return preferred.key;
  }
  /**
   * Otherwise the FIRST option, which throughout this catalogue is the
   * cheapest and most ordinary choice in its group — Slate grey, Domino,
   * Solid colour epoxy. That is the right thing to land a stranger on: it is
   * the honest middle of the market rather than the showpiece, and it does not
   * quietly walk somebody up to a tier-5 price before they have chosen
   * anything.
   */
  return group.options[0]?.key ?? null;
}

export function withDefaults(selections: Selections): Selections {
  let out: Selections = { ...selections };

  // Four passes is two more than the deepest reveal chain the catalogue can
  // express (system -> colour). The bound is a guard, not a mechanism.
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;

    for (const g of visibleGroups(out)) {
      if (g.multiple) continue;
      if (!g.required && !AUTOFILL_OPTIONAL_KEYS.has(g.key)) continue;
      if (chosenIn(out, g.key).length > 0) continue;

      const key = defaultOptionFor(g);
      if (!key) continue;

      out = { ...out, [g.key]: key };
      changed = true;
    }

    if (!changed) break;
  }

  return out;
}

/**
 * Whether a group's answer is one this catalogue insists on having.
 *
 * FinishPicker uses it to decide that tapping the CURRENTLY CHOSEN option is a
 * no-op rather than a clear. Without it, `withDefaults` would immediately put
 * the same value back and the swatch would appear to flicker and refuse to
 * respond — the person would be tapping a thing that visibly does nothing.
 * Where an answer is mandatory, "deselect" is not a state the UI can offer.
 */
export function isAutoFilledGroup(group: FinishGroupDef): boolean {
  if (group.multiple) return false;
  return group.required || AUTOFILL_OPTIONAL_KEYS.has(group.key);
}
