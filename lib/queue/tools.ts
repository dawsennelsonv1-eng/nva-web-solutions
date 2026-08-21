/**
 * lib/queue/tools.ts — THE CATALOGUE.
 *
 * This is a QUEUE, not a directory. A directory implies a catalogue you could
 * buy from, which would make seventeen unbuilt entries seventeen lies. What is
 * modelled here is the ORDER IN WHICH WORK HAPPENS, which is a document a
 * contractor already runs one of every week.
 *
 * WHY THE SPEC CONTENT LIVES IN CODE AND THE VOTES LIVE IN THE DATABASE:
 * trade math is content — it is reviewed, corrected and versioned like any
 * other source file, and it changes only when somebody who knows the trade
 * says it is wrong. Votes are facts about the world and belong in a table.
 * Mixing the two would mean either editing SQL to fix a formula, or trusting a
 * seeded row to be real.
 *
 * STATUS IS DECLARED HERE BUT VERIFIED AT RENDER. A tool declaring
 * 'IN SERVICE' is cross-checked against the vertical registry in
 * lib/queue/data.ts, and silently downgraded if it is not actually registered.
 * That is the mechanism that makes this page structurally incapable of
 * claiming a trade is live when the module is not loaded. See resolveTools().
 *
 * 'QUEUED' IS NOT A STATUS YOU CAN WRITE HERE. It is derived: a tool is queued
 * when it has at least one real vote, and it is ranked by that count. On day
 * one the queued section is empty and everything sits in SPEC ONLY, which is
 * the truth. No vote is ever seeded, so rank can never be theatre.
 */

/**
 * Below this many votes the count is not shown — only the rank. Lives here
 * rather than in data.ts because VoteForm is a client component and data.ts is
 * 'server-only'; importing it there would fail the build.
 */
export const VOTE_DISPLAY_FLOOR = 10;

export type DeclaredStatus = 'IN SERVICE' | 'IN BUILD' | 'SPEC ONLY';

export interface SpecInput {
  label: string;
  /** What the field actually accepts. Shown in mono as a measured value. */
  accepts: string;
}

export interface SpecLine {
  label: string;
  formula: string;
}

export interface Tool {
  id: string;
  name: string;
  /** How a contractor names his own trade. Used by the concierge matcher. */
  trade: string;
  status: DeclaredStatus;
  /** Plate unit designator. */
  unit: string;
  rev: number;
  /** YYYY-MM. Passed in, never derived from the clock. */
  date: string;
  /**
   * REQUIRED when status is 'IN BUILD'. The month the tool is expected to
   * enter service. Enforced by assertCatalogue() below, so an IN BUILD row
   * without a date cannot ship.
   */
  targetMonth?: string;
  /** One line: what the tool prices. */
  prices: string;
  inputs: SpecInput[];
  math: SpecLine[];
  /** Honest caveats shown on the sheet. */
  notes?: string[];
  /** Concierge matching. Lowercase, no punctuation. */
  keywords: string[];
  /** Stable tiebreak when two tools have equal votes. */
  order: number;
}

export const TOOLS: Tool[] = [
  // -------------------------------------------------------------- IN SERVICE
  {
    id: 'epoxy',
    name: 'Concrete & Epoxy Coating',
    trade: 'Epoxy floor coating',
    status: 'IN SERVICE',
    unit: 'NVA-EPX-01',
    rev: 12,
    date: '2026-08',
    prices: 'Garage, patio and commercial floor coating by area and finish tier.',
    inputs: [
      { label: 'Surface type', accepts: 'garage · patio · commercial' },
      { label: 'Square feet', accepts: '100–6000' },
      { label: 'Finish', accepts: 'decorative flakes · metallic · solid polyaspartic' },
      { label: 'Slab condition', accepts: 'oil · cracking · previous coating' },
      { label: 'Photo of the floor', accepts: 'optional — read for condition only' },
    ],
    math: [
      { label: 'Coating', formula: 'square feet × base rate per sqft for the finish tier' },
      { label: 'Preparation', formula: 'square feet × prep rate per sqft' },
      { label: 'Condition modifiers', formula: 'percentage of the subtotal, added not compounded' },
      { label: 'Mobilisation', formula: 'flat, applied after the percentages' },
      { label: 'Midpoint', formula: 'raised to the job minimum if it lands under' },
      { label: 'Quoted band', formula: 'midpoint ± spread, low clamped to the minimum' },
    ],
    notes: ['The AI reads the slab. It never sets the price — the table above does, every time.'],
    keywords: ['epoxy', 'garage floor', 'floor coating', 'polyaspartic', 'concrete coating', 'flake floor'],
    order: 1,
  },

  // ----------------------------------------------------------------- IN BUILD
  {
    id: 'painting',
    name: 'Interior & Exterior Painting',
    trade: 'Painting',
    status: 'IN BUILD',
    unit: 'NVA-PNT-01',
    rev: 2,
    date: '2026-08',
    // VERIFY: this is the month painting is expected to enter service. It is a
    // public commitment on the queue page. Change it or move the status.
    targetMonth: '2026-09',
    prices: 'Interior and exterior repaint by wall area, coat count and prep condition.',
    inputs: [
      { label: 'Interior or exterior', accepts: 'interior · exterior · both' },
      { label: 'Wall area', accepts: 'square feet, or room count with ceiling height' },
      { label: 'Ceilings and trim', accepts: 'included · excluded' },
      { label: 'Coats', accepts: '1 (refresh) · 2 (standard) · 3 (colour change over dark)' },
      { label: 'Surface condition', accepts: 'sound · patch and sand · peeling or failed' },
      { label: 'Stories', accepts: '1 · 2 · 3 — drives staging on exterior' },
    ],
    math: [
      { label: 'Paintable area', formula: 'perimeter × ceiling height, less openings' },
      { label: 'Body coats', formula: 'paintable area × coat count × labour rate per sqft' },
      { label: 'Ceilings', formula: 'floor area × ceiling rate, flat or textured' },
      { label: 'Trim and doors', formula: 'linear feet of trim + per-door and per-window rates' },
      { label: 'Preparation', formula: 'percentage of body, by condition tier' },
      { label: 'Material', formula: 'gallons = area ÷ spread rate × coats, at the product tier' },
      { label: 'Staging', formula: 'story multiplier on exterior labour only' },
    ],
    notes: [
      'Painting was pulled from service when the module could not satisfy the current pricing contract. It is being rebuilt against it, not patched.',
    ],
    keywords: ['painting', 'painter', 'interior paint', 'exterior paint', 'repaint', 'cabinet painting'],
    order: 2,
  },

  // ---------------------------------------------------------------- SPEC ONLY
  {
    id: 'roofing',
    name: 'Roof Replacement',
    trade: 'Roofing',
    status: 'SPEC ONLY',
    unit: 'NVA-ROF-00',
    rev: 0,
    date: '2026-08',
    prices: 'Full roof replacement by squares, pitch, tear-off depth and material tier.',
    inputs: [
      { label: 'Roof footprint', accepts: 'square feet of plan area, or squares if he knows them' },
      { label: 'Pitch', accepts: '3/12 through 12/12' },
      { label: 'Existing layers', accepts: '0 (overlay) · 1 · 2 — 2 is a full tear-off in most codes' },
      { label: 'Material', accepts: '3-tab · architectural · impact-rated · standing seam metal' },
      { label: 'Underlayment', accepts: '15# felt · synthetic · ice and water full coverage' },
      { label: 'Ridge and valley', accepts: 'linear feet of each' },
      { label: 'Penetrations', accepts: 'count of pipe boots, vents, skylights' },
      { label: 'Stories', accepts: '1 · 2 · 3' },
    ],
    math: [
      {
        label: 'Pitch multiplier',
        formula: '√(1 + (rise ÷ 12)²) — 4/12 = 1.054, 6/12 = 1.118, 8/12 = 1.202, 10/12 = 1.302, 12/12 = 1.414',
      },
      { label: 'Squares', formula: '(footprint × pitch multiplier) ÷ 100' },
      { label: 'Waste', formula: '+10% simple gable, +15% where valleys and hips are cut in' },
      { label: 'Tear-off', formula: 'squares × layers × tear-off rate per square' },
      { label: 'Disposal', formula: 'squares of tear-off × weight per square ÷ dumpster tonnage' },
      { label: 'Field material and labour', formula: 'squares × rate per square for the material tier' },
      { label: 'Underlayment', formula: 'squares × rate for the underlayment tier' },
      { label: 'Ridge cap', formula: 'ridge linear feet × cap rate' },
      { label: 'Valley', formula: 'valley linear feet × closed or open valley rate' },
      { label: 'Flashing and boots', formula: 'per penetration, plus step flashing by wall linear feet' },
      { label: 'Steep and access', formula: 'surcharge above 8/12, again above 2 stories' },
    ],
    notes: [
      'Squares are plan area corrected for pitch, never plan area alone. A 6/12 roof is 12% more material than its footprint.',
      'Decking replacement is quoted on site. No estimator can see rot from the ground, and pricing it blind is how a range becomes a lie.',
    ],
    keywords: ['roof', 'roofing', 'roofer', 'shingles', 'reroof', 'roof replacement', 'metal roof'],
    order: 3,
  },
  {
    id: 'siding',
    name: 'Siding Replacement',
    trade: 'Siding',
    status: 'SPEC ONLY',
    unit: 'NVA-SID-00',
    rev: 0,
    date: '2026-08',
    prices: 'Full siding replacement by wall squares, material tier and tear-off.',
    inputs: [
      { label: 'Wall area', accepts: 'perimeter × wall height, or square feet directly' },
      { label: 'Openings', accepts: 'count of windows and doors, deducted from area' },
      { label: 'Material', accepts: 'vinyl · insulated vinyl · fibre cement · engineered wood' },
      { label: 'Existing siding', accepts: 'tear-off · side over' },
      { label: 'Trim and corners', accepts: 'linear feet' },
      { label: 'Soffit and fascia', accepts: 'linear feet, included or excluded' },
      { label: 'Stories', accepts: '1 · 2 · 3' },
    ],
    math: [
      { label: 'Wall squares', formula: '(perimeter × wall height − openings) ÷ 100' },
      { label: 'Waste', formula: '+10%, more on cut-up elevations with dormers' },
      { label: 'Tear-off and disposal', formula: 'squares × tear-off rate + haul-off by tonnage' },
      { label: 'House wrap', formula: 'squares × wrap rate, required under most warranties' },
      { label: 'Field material and labour', formula: 'squares × rate per square for the material tier' },
      { label: 'Trim, corners, J-channel', formula: 'linear feet × rate, by material' },
      { label: 'Soffit and fascia', formula: 'linear feet × rate, priced separately from wall' },
      { label: 'Staging', formula: 'story multiplier on labour only' },
    ],
    notes: [
      'Fibre cement carries a labour rate roughly double vinyl for the same square, because of weight, cutting and fastening schedule.',
    ],
    keywords: ['siding', 'vinyl siding', 'hardie', 'fibre cement', 'fiber cement', 'cladding'],
    order: 4,
  },
  {
    id: 'gutters',
    name: 'Gutters & Downspouts',
    trade: 'Gutters',
    status: 'SPEC ONLY',
    unit: 'NVA-GUT-00',
    rev: 0,
    date: '2026-08',
    prices: 'Seamless gutter replacement by eave linear feet, profile and guard tier.',
    inputs: [
      { label: 'Eave run', accepts: 'linear feet' },
      { label: 'Profile', accepts: '5" K-style · 6" K-style · half-round' },
      { label: 'Material', accepts: 'aluminium · steel · copper' },
      { label: 'Downspouts', accepts: 'count, and drop height in feet' },
      { label: 'Guards', accepts: 'none · screen · micro-mesh' },
      { label: 'Corners', accepts: 'count of inside and outside miters' },
      { label: 'Stories', accepts: '1 · 2 · 3' },
    ],
    math: [
      { label: 'Gutter run', formula: 'eave linear feet × rate for profile and material' },
      { label: 'Downspouts', formula: 'count × drop height × rate per linear foot, plus elbows' },
      { label: 'Miters', formula: 'per corner — a miter is a fabricated part, not a cut' },
      { label: 'Guards', formula: 'eave linear feet × guard rate for the tier' },
      { label: 'Removal and disposal', formula: 'existing linear feet × removal rate' },
      { label: 'Access', formula: 'story multiplier, ladder versus staging' },
    ],
    notes: [
      '6" gutter carries roughly 40% more water than 5" and is the correct call on steep or large roofs. The tool asks pitch for that reason.',
    ],
    keywords: ['gutter', 'gutters', 'downspout', 'seamless gutter', 'gutter guard', 'eavestrough'],
    order: 5,
  },
  {
    id: 'windows',
    name: 'Window Replacement',
    trade: 'Windows',
    status: 'SPEC ONLY',
    unit: 'NVA-WIN-00',
    rev: 0,
    date: '2026-08',
    prices: 'Replacement windows priced per opening by size band, frame and install type.',
    inputs: [
      { label: 'Openings', accepts: 'count, grouped by size' },
      { label: 'Size', accepts: 'united inches — width + height per opening' },
      { label: 'Frame', accepts: 'vinyl · fibreglass · wood-clad · aluminium' },
      { label: 'Glass', accepts: 'double low-E argon · triple' },
      { label: 'Install type', accepts: 'insert retrofit · full-frame with new nail fin' },
      { label: 'Special glazing', accepts: 'tempered · egress-compliant · obscure' },
      { label: 'Trim', accepts: 'interior and exterior, linear feet' },
    ],
    math: [
      { label: 'Size band', formula: 'united inches: ≤101 standard, 102–125 large, 126+ oversize' },
      { label: 'Unit cost', formula: 'per opening by size band × frame tier × glass package' },
      { label: 'Install labour', formula: 'per opening — full-frame runs roughly double an insert' },
      { label: 'Full-frame extras', formula: 'exterior trim, siding patch and interior return per opening' },
      { label: 'Special glazing', formula: 'per-opening surcharge, tempered where code requires it' },
      { label: 'Disposal', formula: 'per opening' },
      { label: 'Minimum', formula: 'job minimum — a single window is a trip charge with a window on it' },
    ],
    notes: [
      'Insert retrofit keeps the existing frame and loses about an inch of glass per dimension. Full-frame is the honest answer where the frame is rotted, and the tool asks rather than assuming.',
    ],
    keywords: ['window', 'windows', 'window replacement', 'glazing', 'double glazing', 'window install'],
    order: 6,
  },
  {
    id: 'fencing',
    name: 'Fence Installation',
    trade: 'Fencing',
    /**
     * SPEC REWRITTEN TO THE BUILT MODULE. PHASE 87.
     *
     * The previous sheet promised post-by-post arithmetic — line posts at 8ft
     * spacing, terminal posts counted separately, concrete volume by hole depth,
     * frost-line lookup by city. The module that exists prices the RUN by style
     * and charges gates as pieces. Both are defensible ways to quote a fence;
     * only one of them is what the code does, and this page invites a contractor
     * to check the arithmetic against a job he has done.
     */
    status: 'IN SERVICE',
    unit: 'NVA-FEN-01',
    rev: 1,
    date: '2026-08',
    prices: 'New fence by linear feet and style, with gates priced as pieces.',
    inputs: [
      { label: 'Run', accepts: 'linear feet — back yard · one side · frontage · whole perimeter' },
      { label: 'Style', accepts: 'chain link · cedar privacy · board on board with steel posts · horizontal slat · vinyl · ornamental metal · stone or brick columns' },
      { label: 'Finish', accepts: 'timber stain · metal powder coat · vinyl colour · masonry' },
      { label: 'Gates', accepts: 'walk gates and drive gates, counted' },
      { label: 'Ground', accepts: 'rock or caliche · slope · trees on the line · machine access' },
      { label: 'Removal', accepts: 'whether an existing fence comes out' },
      { label: 'Photo, or the map', accepts: 'optional — estimated from a photo, or measured exactly by tapping the boundary on a satellite view' },
    ],
    math: [
      { label: 'Fence', formula: 'linear feet × rate per foot for the chosen style, at six feet' },
      { label: 'Removal', formula: 'linear feet × removal rate, charged on the full run' },
      { label: 'Gates', formula: 'per gate — flat, because most of a gate is hardware and two properly set posts rather than width' },
      { label: 'Site modifiers', formula: 'percentage of the subtotal, added not compounded' },
      { label: 'Mobilisation', formula: 'flat, applied after the percentages' },
      { label: 'Midpoint', formula: 'raised to the job minimum if it lands under' },
      { label: 'Quoted band', formula: 'midpoint ± spread, low clamped to the minimum' },
    ],
    notes: [
      'Height is a modifier, not a dimension. An eight-foot fence is not a third more fence — it is longer posts, deeper holes, more concrete and an extra rail, which is about a quarter more money.',
      'Rock and caliche are the largest site adjustment and the most under-quoted condition in this market. Setting a post in limestone shelf is coring, not augering.',
    ],
    keywords: ['fence', 'fencing', 'fence install', 'privacy fence', 'chain link', 'wood fence', 'cedar fence', 'iron fence'],
    order: 7,
  },
  {
    id: 'decks',
    name: 'Deck Construction',
    trade: 'Decks',
    status: 'SPEC ONLY',
    unit: 'NVA-DCK-00',
    rev: 0,
    date: '2026-08',
    prices: 'New deck by square feet, decking material, height and railing.',
    inputs: [
      { label: 'Deck size', accepts: 'square feet, or length × width' },
      { label: 'Decking material', accepts: 'pressure-treated · composite · PVC · hardwood' },
      { label: 'Height above grade', accepts: 'under 30" · 30–72" · over 72"' },
      { label: 'Railing', accepts: 'linear feet, and material' },
      { label: 'Stairs', accepts: 'rise in inches, and tread width' },
      { label: 'Attached or freestanding', accepts: 'ledger to house · freestanding posts' },
      { label: 'Demolition', accepts: 'square feet of existing deck' },
    ],
    math: [
      { label: 'Framing', formula: 'square feet × framing rate, joists at 16" on centre — 12" for diagonal or PVC' },
      { label: 'Footings', formula: 'count by beam span and post spacing, priced per footing including concrete' },
      { label: 'Decking', formula: 'square feet × material rate, +8% waste, +12% on diagonal layout' },
      { label: 'Railing', formula: 'linear feet × rate, posts every 6 ft or less by code' },
      { label: 'Stairs', formula: 'risers = total rise ÷ 7.5, rounded — priced per riser × tread width' },
      { label: 'Ledger and flashing', formula: 'linear feet, attached decks only — the most common failure point' },
      { label: 'Height band', formula: 'multiplier on framing above 30", guard rail required above 30"' },
      { label: 'Permit', formula: 'flat, by jurisdiction' },
    ],
    notes: [
      'Over 72" of height usually pulls in engineered footings and lateral bracing. The tool bands it rather than pretending one rate covers a ground-level deck and a second-storey one.',
    ],
    keywords: ['deck', 'decks', 'deck builder', 'composite deck', 'trex', 'patio deck', 'porch'],
    order: 8,
  },
  {
    id: 'concrete-flatwork',
    name: 'Concrete Flatwork',
    trade: 'Concrete',
    status: 'SPEC ONLY',
    unit: 'NVA-CON-00',
    rev: 0,
    date: '2026-08',
    prices: 'Driveways, patios and sidewalks by area, thickness and finish.',
    inputs: [
      { label: 'Area', accepts: 'square feet' },
      { label: 'Thickness', accepts: '4" residential · 5" · 6" for vehicle or heavy load' },
      { label: 'Reinforcement', accepts: 'fibre mesh · welded wire · #3 rebar on 18" grid' },
      { label: 'Base', accepts: 'existing · 4" compacted aggregate' },
      { label: 'Finish', accepts: 'broom · exposed aggregate · stamped · integral colour' },
      { label: 'Tear-out', accepts: 'square feet of existing slab, and its thickness' },
      { label: 'Access', accepts: 'truck can reach · pump or buggy required' },
    ],
    math: [
      { label: 'Cubic yards', formula: 'area × (thickness ÷ 12) ÷ 27, +8% for subgrade variation' },
      { label: 'Material', formula: 'cubic yards × delivered rate, short-load fee under 5 yards' },
      { label: 'Base', formula: 'area × aggregate rate, compacted in lifts' },
      { label: 'Forming', formula: 'perimeter linear feet × forming rate' },
      { label: 'Reinforcement', formula: 'area × rate for the chosen system' },
      { label: 'Placement and finish', formula: 'area × finish rate — stamped runs roughly triple broom' },
      { label: 'Control joints', formula: 'saw-cut linear feet, at 24–36× slab thickness in inches' },
      { label: 'Tear-out and haul', formula: 'area × demolition rate + disposal by cubic yard' },
      { label: 'Access', formula: 'pump or buggy surcharge where the truck cannot reach' },
    ],
    notes: [
      'Control joint spacing is a function of thickness — roughly 10 ft on a 4" slab. Getting it wrong cracks the pour, so the tool computes it rather than asking.',
    ],
    keywords: ['concrete', 'driveway', 'patio', 'sidewalk', 'flatwork', 'slab', 'concrete contractor'],
    order: 9,
  },
  {
    id: 'pressure-washing',
    name: 'Pressure & Soft Washing',
    trade: 'Pressure washing',
    status: 'SPEC ONLY',
    unit: 'NVA-PWA-00',
    rev: 0,
    date: '2026-08',
    prices: 'Exterior cleaning by surface area and surface type, with sealing as an add-on.',
    inputs: [
      { label: 'Surfaces', accepts: 'driveway · walkway · house exterior · roof · deck or fence' },
      { label: 'Area', accepts: 'square feet per surface' },
      { label: 'Stains', accepts: 'oil spots, rust, organic growth — counted' },
      { label: 'Sealing', accepts: 'none · concrete sealer · wood stain' },
      { label: 'Stories', accepts: '1 · 2 · 3' },
      { label: 'Water access', accepts: 'on site · tank required' },
    ],
    math: [
      { label: 'Flat concrete', formula: 'square feet × rate, surface cleaner rather than wand' },
      { label: 'House soft wash', formula: 'square feet of wall × soft-wash rate, chemical not pressure' },
      { label: 'Roof soft wash', formula: 'squares × roof rate — pressure is never used on shingles' },
      { label: 'Wood', formula: 'square feet × rate, lower pressure and a brightener step' },
      { label: 'Stains', formula: 'per spot for oil and rust, treated separately from area' },
      { label: 'Sealing', formula: 'square feet × sealer rate, priced as a second visit' },
      { label: 'Trip minimum', formula: 'job minimum below which the drive costs more than the work' },
    ],
    notes: [
      'Roof and siding are soft-washed with chemistry, not pressure. A tool that prices them at a flatwork rate is pricing damage.',
    ],
    keywords: ['pressure washing', 'power washing', 'soft wash', 'exterior cleaning', 'driveway cleaning'],
    order: 10,
  },
  {
    id: 'tile',
    name: 'Tile Installation',
    trade: 'Tile',
    status: 'SPEC ONLY',
    unit: 'NVA-TIL-00',
    rev: 0,
    date: '2026-08',
    prices: 'Floor and wall tile by area, tile size, pattern and substrate work.',
    inputs: [
      { label: 'Area', accepts: 'square feet, floor and wall separately' },
      { label: 'Tile size', accepts: 'mosaic under 4" · 4–12" · 12–24" · large format over 24"' },
      { label: 'Pattern', accepts: 'straight · diagonal · herringbone · versailles' },
      { label: 'Substrate', accepts: 'sound · backer board · self-levelling required' },
      { label: 'Waterproofing', accepts: 'none · membrane · full shower pan' },
      { label: 'Demolition', accepts: 'square feet of existing floor covering' },
      { label: 'Detail', accepts: 'niches, curbs, bullnose linear feet' },
    ],
    math: [
      { label: 'Labour band', formula: 'square feet × rate by tile size — mosaic and large format both cost more than 12"' },
      { label: 'Pattern multiplier', formula: 'straight 1.00 · diagonal 1.15 · herringbone 1.30 · versailles 1.25' },
      { label: 'Waste', formula: '+10% straight, +15% diagonal and herringbone' },
      { label: 'Substrate', formula: 'square feet × backer board or self-levelling rate' },
      { label: 'Flatness', formula: 'large format over 15" requires 1/8" in 10 ft — levelling is priced, not assumed' },
      { label: 'Waterproofing', formula: 'square feet × membrane rate, shower pan flat' },
      { label: 'Detail work', formula: 'niches and curbs each, bullnose by linear foot' },
      { label: 'Demolition', formula: 'square feet × removal rate by existing material' },
    ],
    notes: [
      'Large format tile is more expensive to set, not less, because the substrate has to be flatter. Tools that price by area alone get this backwards.',
    ],
    keywords: ['tile', 'tiling', 'tile setter', 'backsplash', 'shower tile', 'floor tile'],
    order: 11,
  },
  {
    id: 'drywall',
    name: 'Drywall & Finishing',
    trade: 'Drywall',
    status: 'SPEC ONLY',
    unit: 'NVA-DRY-00',
    rev: 0,
    date: '2026-08',
    prices: 'Hang, tape and finish by sheet count and finish level.',
    inputs: [
      { label: 'Area', accepts: 'square feet of wall and ceiling' },
      { label: 'Sheet size', accepts: "4×8 · 4×12" },
      { label: 'Finish level', accepts: 'level 3 (texture) · level 4 (standard) · level 5 (smooth)' },
      { label: 'Texture', accepts: 'none · orange peel · knockdown' },
      { label: 'Ceiling height', accepts: 'under 9 ft · 9–12 ft · over 12 ft' },
      { label: 'Type', accepts: 'standard · moisture-resistant · type X fire-rated' },
      { label: 'Scope', accepts: 'full room · patch and repair, counted per patch' },
    ],
    math: [
      { label: 'Sheets', formula: 'area ÷ 32 for 4×8, ÷ 48 for 4×12, +10% waste' },
      { label: 'Hanging', formula: 'per sheet — ceilings carry a 1.15 to 1.25 multiplier' },
      { label: 'Taping and finishing', formula: 'square feet × rate by finish level' },
      { label: 'Level 5', formula: 'skim coat over the whole surface — roughly double level 4' },
      { label: 'Texture', formula: 'square feet × rate for the texture type' },
      { label: 'Corner bead', formula: 'linear feet of outside corner' },
      { label: 'Height surcharge', formula: 'staging multiplier above 9 ft' },
      { label: 'Patches', formula: 'per patch by size band, with a job minimum' },
    ],
    notes: [
      'Level 5 exists because raking light shows every joint under flat or gloss paint. Quoting level 4 for a wall that needs level 5 is the most common callback in the trade.',
    ],
    keywords: ['drywall', 'sheetrock', 'plasterboard', 'taping', 'drywall repair', 'gypsum'],
    order: 12,
  },
  {
    id: 'insulation',
    name: 'Insulation',
    trade: 'Insulation',
    status: 'SPEC ONLY',
    unit: 'NVA-INS-00',
    rev: 0,
    date: '2026-08',
    prices: 'Attic, wall and crawlspace insulation by area and target R-value.',
    inputs: [
      { label: 'Location', accepts: 'attic · walls · crawlspace · rim joist' },
      { label: 'Area', accepts: 'square feet' },
      { label: 'Target R-value', accepts: 'R-13 · R-21 · R-38 · R-49 · R-60' },
      { label: 'Material', accepts: 'blown fibreglass · blown cellulose · batt · open-cell foam · closed-cell foam' },
      { label: 'Existing insulation', accepts: 'none · topping up · removal required' },
      { label: 'Air sealing', accepts: 'included · excluded' },
      { label: 'Access', accepts: 'walkable attic · low clearance · crawlspace' },
    ],
    math: [
      { label: 'Blown depth', formula: 'target R ÷ R-per-inch — fibreglass 2.5/in, cellulose 3.5/in' },
      { label: 'Blown material', formula: 'square feet ÷ coverage per bag at that depth = bag count' },
      { label: 'Batt', formula: 'square feet × rate by R-value, priced per cavity not per sqft of floor' },
      { label: 'Spray foam', formula: 'board feet = square feet × inches — open cell R-3.7/in, closed cell R-6.5/in' },
      { label: 'Air sealing', formula: 'square feet × rate — done before insulating or it is wasted' },
      { label: 'Removal', formula: 'square feet × extraction rate + disposal, higher where contaminated' },
      { label: 'Baffles and hatch', formula: 'per baffle at each soffit bay, hatch flat' },
      { label: 'Access', formula: 'multiplier for low clearance and crawlspace' },
    ],
    notes: [
      'Spray foam is priced per board foot, not per square foot. Any quote for foam that does not name a thickness is not a quote.',
    ],
    keywords: ['insulation', 'attic insulation', 'spray foam', 'blown in', 'r value', 'insulate'],
    order: 13,
  },
  {
    id: 'garage-doors',
    name: 'Garage Doors',
    trade: 'Garage doors',
    status: 'SPEC ONLY',
    unit: 'NVA-GDR-00',
    rev: 0,
    date: '2026-08',
    prices: 'Door replacement priced per door by size, construction and opener.',
    inputs: [
      { label: 'Doors', accepts: 'count' },
      { label: 'Size', accepts: "single 8–9 ft · double 16 ft · custom width" },
      { label: 'Construction', accepts: 'single-layer steel · insulated steel · carriage · full-view aluminium' },
      { label: 'Insulation', accepts: 'none · R-6.5 · R-9 · R-12 · R-18' },
      { label: 'Track', accepts: 'standard lift · high lift · low headroom' },
      { label: 'Opener', accepts: 'none · chain · belt, with horsepower' },
      { label: 'Removal', accepts: 'haul-off of existing door' },
    ],
    math: [
      { label: 'Door unit', formula: 'per door by width × construction tier × insulation R-value' },
      { label: 'Install labour', formula: 'per door — double runs about 1.4× single, not 2×' },
      { label: 'Track and hardware', formula: 'by track type — high lift and low headroom are different kits' },
      { label: 'Springs', formula: 'torsion springs sized to door weight, rated by cycle count' },
      { label: 'Opener', formula: 'per unit by drive type and horsepower, plus rail length for high lift' },
      { label: 'Removal and disposal', formula: 'per existing door' },
      { label: 'Minimum', formula: 'job minimum — spring-only service is a separate call' },
    ],
    notes: [
      'Spring cycle rating is the number that decides whether the door lasts seven years or twenty. The tool asks for it because the cheap quote is always the 10,000-cycle spring.',
    ],
    keywords: ['garage door', 'garage doors', 'overhead door', 'opener', 'garage door repair'],
    order: 14,
  },
  {
    id: 'tree-service',
    name: 'Tree Removal & Stump Grinding',
    trade: 'Tree service',
    status: 'SPEC ONLY',
    unit: 'NVA-TRE-00',
    rev: 0,
    date: '2026-08',
    prices: 'Removal by height, trunk diameter and access difficulty, with stump grinding separate.',
    inputs: [
      { label: 'Trees', accepts: 'count, priced individually' },
      { label: 'Height', accepts: 'under 30 ft · 30–60 ft · 60–80 ft · over 80 ft' },
      { label: 'Trunk diameter', accepts: 'inches measured at 4.5 ft above grade' },
      { label: 'Access', accepts: 'open drop · rigging required · crane needed' },
      { label: 'Proximity', accepts: 'clear · near structure · near power lines' },
      { label: 'Debris', accepts: 'haul away · chip on site · leave logs' },
      { label: 'Stump', accepts: 'grind · leave, with depth' },
    ],
    math: [
      { label: 'Base removal', formula: 'height band × diameter band — both, because a short fat tree is not a tall thin one' },
      { label: 'Access multiplier', formula: 'open drop 1.0 · rigging 1.5–2.0 · crane priced with the crane day rate' },
      { label: 'Proximity surcharge', formula: 'near structure, and again near energised lines' },
      { label: 'Debris', formula: 'chipped on site, or hauled by cubic yard' },
      { label: 'Stump grinding', formula: 'per inch of diameter at grade × depth band' },
      { label: 'Storm premium', formula: 'emergency and after-hours rate, stated not hidden' },
    ],
    notes: [
      'Anything within reach of an energised line is a utility coordination job, not a price. The tool routes that to a call rather than quoting it.',
      'UNVERIFIED against a working arborist. Access difficulty dominates this trade and the bands here are structural, not authoritative.',
    ],
    keywords: ['tree', 'tree service', 'tree removal', 'arborist', 'stump grinding', 'tree trimming'],
    order: 15,
  },
  {
    id: 'junk-removal',
    name: 'Junk Removal',
    trade: 'Junk removal',
    status: 'SPEC ONLY',
    unit: 'NVA-JNK-00',
    rev: 0,
    date: '2026-08',
    prices: 'Hauling by truck volume with weight and item surcharges.',
    inputs: [
      { label: 'Volume', accepts: '1/8 · 1/4 · 1/2 · 3/4 · full truck' },
      { label: 'Truck size', accepts: 'cubic yards of the bed' },
      { label: 'Material', accepts: 'household · construction debris · yard waste · concrete or dirt' },
      { label: 'Heavy items', accepts: 'appliances, mattresses, tyres, safes — counted' },
      { label: 'Access', accepts: 'kerbside · inside · stairs, by flight' },
      { label: 'Hazardous', accepts: 'paint, e-waste, chemicals — counted' },
    ],
    math: [
      { label: 'Volume', formula: 'fraction of truck × rate for that fraction, not linear per yard' },
      { label: 'Weight allowance', formula: 'tonnage included per fraction, surcharge per ton over' },
      { label: 'Dense material', formula: 'concrete, dirt and shingles priced by weight, never volume' },
      { label: 'Heavy items', formula: 'per item, covering the disposal fee at the transfer station' },
      { label: 'Labour access', formula: 'per flight of stairs, per long carry over 50 ft' },
      { label: 'Hazardous', formula: 'per item at the actual facility fee' },
      { label: 'Minimum', formula: 'single-item minimum — the drive is most of the cost' },
    ],
    notes: [
      'Volume pricing breaks on dense loads. A quarter truck of concrete outweighs a full truck of furniture, so the tool switches to weight for those materials.',
    ],
    keywords: ['junk removal', 'hauling', 'debris removal', 'clean out', 'dumpster', 'rubbish'],
    order: 16,
  },
  {
    /**
     * ID CHANGED FROM 'landscaping-sod' TO 'landscaping'. PHASE 87.
     *
     * THE ID IS A JOIN KEY, and it was silently failing on both sides.
     * getQueueRow() looks the row up by the CATALOGUE page id, which is
     * 'landscaping', found nothing, and the tool page called notFound() — the
     * page did not exist at all. And getQueueSections() reconciles against the
     * vertical registry by the same id, so a module registered as 'landscaping'
     * could never promote a row called 'landscaping-sod' to IN SERVICE.
     *
     * THE SPEC ALSO DESCRIBED A DIFFERENT TOOL. It was written for sod: pallet
     * coverage, topsoil depth, irrigation zones. What was built prices six
     * hardscape and softscape styles by area, with clearance as its own line —
     * sod is one of the six. On a site whose whole pitch is "check the
     * arithmetic", published math that does not match what the module does is
     * worse than no math at all.
     */
    id: 'landscaping',
    name: 'Landscaping & Hardscaping',
    trade: 'Landscaping',
    status: 'IN SERVICE',
    unit: 'NVA-LND-01',
    rev: 1,
    date: '2026-08',
    prices: 'Yard transformation by area and style — patios, turf, gravel, planting and decks.',
    inputs: [
      { label: 'Area', accepts: 'square feet — back yard · front yard · patio · whole property' },
      { label: 'Style', accepts: 'paver patio · flagstone · artificial turf · gravel and drought planting · lawn and beds · deck and pergola' },
      { label: 'Material tone', accepts: 'per style — paver, stone, turf, gravel, mulch or timber' },
      { label: 'What is there now', accepts: 'bare dirt · grass · gravel or mulch · concrete or pavers' },
      { label: 'Site conditions', accepts: 'slope · access · drainage · trees · retaining' },
      { label: 'Photo of the yard', accepts: 'optional — measured for area and existing surface' },
    ],
    math: [
      { label: 'Installation', formula: 'square feet × rate per sqft for the chosen style' },
      { label: 'Clearing', formula: 'square feet × rate for what is on the ground now — a line, not a percentage, because removing a slab costs the same whatever replaces it' },
      { label: 'Grading and drainage', formula: 'square feet × rate, only when the job needs it' },
      { label: 'Site modifiers', formula: 'percentage of the subtotal, added not compounded' },
      { label: 'Mobilisation', formula: 'flat, applied after the percentages' },
      { label: 'Midpoint', formula: 'raised to the job minimum if it lands under' },
      { label: 'Quoted band', formula: 'midpoint ± spread, low clamped to the minimum' },
    ],
    notes: [
      'Styles span more than sixfold, from gravel to a composite deck, so the band is wider here than on other trades. That is the estimate being honest rather than vague.',
      'Clearing what is already there is priced separately and is the line most rough estimates leave out.',
    ],
    keywords: ['landscaping', 'sod', 'lawn', 'turf', 'grading', 'landscaper', 'yard', 'patio', 'pavers', 'hardscape', 'xeriscape'],
    order: 17,
  },
  {
    id: 'hvac',
    name: 'HVAC System Replacement',
    trade: 'HVAC',
    status: 'SPEC ONLY',
    unit: 'NVA-HVC-00',
    rev: 0,
    date: '2026-08',
    prices: 'System replacement by load, efficiency tier and ductwork scope.',
    inputs: [
      { label: 'Conditioned area', accepts: 'square feet, with ceiling height' },
      { label: 'System type', accepts: 'AC + furnace · heat pump · dual fuel · package unit' },
      { label: 'Efficiency', accepts: 'SEER2 tier, and AFUE or HSPF2' },
      { label: 'Staging', accepts: 'single stage · two stage · variable speed' },
      { label: 'Ductwork', accepts: 'reuse · partial replacement · full replacement' },
      { label: 'Line set', accepts: 'reuse · new, with length in feet' },
      { label: 'Electrical', accepts: 'existing disconnect and breaker · upgrade required' },
    ],
    math: [
      { label: 'Load', formula: 'Manual J calculation — square feet per ton is a screening estimate, never the sizing' },
      { label: 'Equipment', formula: 'tonnage × efficiency tier × staging' },
      { label: 'Ductwork', formula: 'reuse flat, partial by linear foot, full by conditioned square foot' },
      { label: 'Line set', formula: 'per foot, new required when changing refrigerant type' },
      { label: 'Electrical', formula: 'disconnect, whip and breaker — panel work priced separately' },
      { label: 'Removal', formula: 'old equipment haul-off plus refrigerant recovery' },
      { label: 'Permit and documentation', formula: 'flat, includes the Manual J and S submission where required' },
    ],
    notes: [
      'A range from square footage alone is a screening number and the tool says so on the result. Final sizing is a load calculation, and quoting equipment without one is how systems get oversized.',
      'UNVERIFIED. This sheet needs review by a licensed HVAC contractor before it is used to price anything.',
    ],
    keywords: ['hvac', 'air conditioning', 'ac replacement', 'furnace', 'heat pump', 'heating and cooling'],
    order: 18,
  },
  {
    id: 'electrical-panel',
    name: 'Electrical Service & Panel',
    trade: 'Electrical',
    status: 'SPEC ONLY',
    unit: 'NVA-ELC-00',
    rev: 0,
    date: '2026-08',
    prices: 'Panel and service upgrades by amperage, entry type and circuit count.',
    inputs: [
      { label: 'Service size', accepts: '100A · 150A · 200A · 400A' },
      { label: 'Work type', accepts: 'panel swap only · full service upgrade' },
      { label: 'Service entry', accepts: 'overhead mast · underground lateral' },
      { label: 'Meter socket', accepts: 'reuse · replace' },
      { label: 'Circuits', accepts: 'count, and how many need AFCI or GFCI' },
      { label: 'Grounding', accepts: 'existing · new rods and water bond' },
      { label: 'Sub-panels', accepts: 'count' },
    ],
    math: [
      { label: 'Panel and breakers', formula: 'panel by amperage + breakers by type — AFCI and dual-function cost several times standard' },
      { label: 'Service entry', formula: 'mast, conductors and weatherhead, or trench and lateral by linear foot' },
      { label: 'Meter socket', formula: 'per unit, utility coordination priced with it' },
      { label: 'Circuit termination', formula: 'per circuit re-landed and labelled' },
      { label: 'Grounding and bonding', formula: 'rods by count, water and gas bonds flat' },
      { label: 'Permit and inspection', formula: 'flat by jurisdiction' },
      { label: 'Utility coordination', formula: 'disconnect and reconnect scheduling, priced as a day' },
    ],
    notes: [
      'A panel swap and a service upgrade are different jobs with a large price gap, and homeowners use the words interchangeably. The tool separates them in the first question.',
      'UNVERIFIED. This sheet needs review by a licensed electrician before it is used to price anything.',
    ],
    keywords: ['electrical', 'electrician', 'panel upgrade', 'breaker box', 'service upgrade', 'rewire'],
    order: 19,
  },

  {
    /**
     * CABINET REFINISHING. PHASE 87 — new row, not a rewrite.
     *
     * IT HAD NO QUEUE ENTRY AT ALL, so getQueueRow('cabinets') returned null
     * and the tool page called notFound(). The catalogue page and the module
     * both existed; the page simply could not render.
     *
     * IT IS ITS OWN TRADE, not a painting surface. Refinishers run their own
     * shops and price per door front, and the arithmetic below is what makes
     * that concrete: nothing in this sheet is measured in area.
     */
    id: 'cabinets',
    name: 'Cabinet Refinishing',
    trade: 'Cabinet refinishing',
    status: 'IN SERVICE',
    unit: 'NVA-CAB-01',
    rev: 1,
    date: '2026-08',
    prices: 'Kitchen and vanity refinishing by door and drawer front, not by area.',
    inputs: [
      { label: 'Where', accepts: 'kitchen · island only · bathroom vanity · laundry' },
      { label: 'Doors', accepts: 'count — read from the photo where possible' },
      { label: 'Drawer fronts', accepts: 'count' },
      { label: 'Finish', accepts: 'brushed · sprayed lacquer · conversion varnish · stripped and restained · painted with glaze' },
      { label: 'Colour', accepts: 'cabinet paint deck or stain deck' },
      { label: 'Condition', accepts: 'good · normal wear · heavily worn or greasy' },
      { label: 'Photo of the kitchen', accepts: 'optional — counts fronts and reads the material' },
    ],
    math: [
      { label: 'Doors', formula: 'door count × rate per front for the chosen finish' },
      { label: 'Drawer fronts', formula: 'drawer count × its own rate — about 55-60% of the door rate, narrowing as finishes get more expensive, because the saving is in handling and not in coats or cure time' },
      { label: 'Boxes', formula: 'linear feet of visible frame × rate, finished in place' },
      { label: 'Preparation', formula: 'total fronts × rate for the condition — per front, not a percentage, because stripping a greasy door costs the same whatever finish follows' },
      { label: 'Condition modifiers', formula: 'percentage of the subtotal, added not compounded' },
      { label: 'Collection and delivery', formula: 'flat, applied after the percentages' },
      { label: 'Midpoint', formula: 'raised to the job minimum if it lands under' },
      { label: 'Quoted band', formula: 'midpoint ± spread, low clamped to the minimum' },
    ],
    notes: [
      'Open-grain oak has to be filled before painting or the grain prints through the finish. It is labour on every single front, which is why it is the largest adjustment here and why the tool asks rather than assuming.',
      'Laminate and thermofoil doors cannot be stripped and restained at all. The tool looks for them and says so when it cannot tell.',
    ],
    keywords: ['cabinet', 'cabinets', 'cabinet refinishing', 'cabinet painting', 'kitchen cabinets', 'refinishing', 'respray'],
    order: 20,
  },
];

/**
 * A catalogue error must fail the build, not render a broken row. IN BUILD is
 * the only status carrying a public date commitment, so it is the only one
 * with a hard requirement — and this runs at module load, which means an
 * IN BUILD row without a target month cannot reach Vercel green.
 */
function assertCatalogue(): void {
  const seen = new Set<string>();
  for (const t of TOOLS) {
    if (seen.has(t.id)) throw new Error(`Duplicate tool id '${t.id}' in the queue catalogue.`);
    seen.add(t.id);
    if (t.status === 'IN BUILD' && !t.targetMonth) {
      throw new Error(
        `Tool '${t.id}' is IN BUILD with no targetMonth. An in-build row is a public date commitment and cannot ship without one.`
      );
    }
  }
}
assertCatalogue();

export function getTool(id: string): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}

