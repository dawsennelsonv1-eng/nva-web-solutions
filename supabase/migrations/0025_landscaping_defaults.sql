-- ===========================================================================
-- 0025_landscaping_defaults.sql — pricing defaults for the landscaping vertical
-- ===========================================================================
--
-- WHAT THIS ROW IS. Every rate a landscaping quote uses. The module in
-- lib/verticals/landscaping/index.tsx defines the SHAPE these must satisfy
-- (landscapingPricingRuleSchema, .strict()) and the ARITHMETIC that consumes
-- them. It contains no rates itself, by rule R-113 — a number that affects a
-- price does not belong in TypeScript.
--
-- These are DEFAULTS, not prices. Every contractor overrides them in their own
-- quote_configs.rules. They exist so a new prototype quotes something sane on
-- day one instead of erroring, and so the numbers below have to be defensible
-- rather than round.
--
-- ===========================================================================
-- WHERE THE NUMBERS COME FROM
-- ===========================================================================
--
-- Dallas-Fort Worth residential, mid-market, installed — materials, labour and
-- disposal, before mobilisation and before the range band. Stated per square
-- foot in cents.
--
--   paver_patio       $19.00/sf   Manufactured pavers on a compacted base with
--                                 edge restraint and polymeric sand. The market
--                                 runs roughly $15-25 depending on pattern and
--                                 cuts; herringbone with a soldier course sits
--                                 above a straight running bond.
--   natural_stone     $26.00/sf   Flagstone is the premium hardscape: irregular
--                                 material, hand-fitted, far more labour per
--                                 foot. Market roughly $20-35.
--   artificial_turf   $12.00/sf   Base preparation, weed barrier, turf, infill
--                                 and nailing. Market roughly $9-15 installed.
--                                 The base is most of the labour, which is why
--                                 this does not fall much on larger areas.
--   gravel_xeriscape   $7.50/sf   Decomposed granite or river rock over fabric,
--                                 with drought planting and some boulders.
--                                 Market roughly $5-10. The cheapest way to
--                                 transform a large area, which is exactly what
--                                 makes it the volume seller in Texas.
--   soft_landscape     $8.50/sf   Sod plus edged beds, plants and mulch. Sod
--                                 alone is $1.50-3.00; the beds, edging and
--                                 planting carry the rest. Market roughly
--                                 $6-12 for a finished mix.
--   deck_pergola      $45.00/sf   Composite deck with a pergola over part of
--                                 it. Structural work with footings, framing
--                                 and a permit in most jurisdictions. Market
--                                 roughly $35-60.
--
-- CLEARANCE — what is already on the ground, per square foot:
--
--   none    $0.00   Bare prepared dirt. Charging for this would invent work.
--   light   $2.00   Strip sod or weeds, load out, haul away.
--   standard $3.75  Dig out gravel, mulch and old planting. More volume to
--                   move than sod and it cannot be cut and rolled.
--   heavy   $8.00   Break up concrete or pavers, load out, dump fees. Market
--                   $6-10/sf and the single most under-estimated line in the
--                   trade — it is why the tool asks what is there now rather
--                   than assuming grass.
--
-- drainage $3.00/sf  Grading, and French drain or catch basin where needed.
--                    Applied only when the job requires it.
--
-- MODIFIERS are percentages on the subtotal, and each one is a reason a crew is
-- on site longer rather than a materials cost:
--
--   steep_slope     +15%  Terracing, retaining, and material moved uphill.
--   poor_access     +12%  No gate wide enough for a machine. Everything moves
--                         by wheelbarrow, which roughly doubles the labour on
--                         the excavation and base phases.
--   drainage_issues  +8%  Wet ground slows every phase and can stop work.
--   tree_work       +10%  Root cutting, protection, and working around canopy.
--   retaining_wall  +20%  A structural element the base price does not include
--                         at all. The largest modifier here, and still an
--                         understatement for a tall wall — which is why the
--                         copy says the final quote follows a site visit.
--
-- minimum_job    $2,500   Below this a crew cannot mobilise, dispose and finish
--                         at a profit. It is why a 150 sq ft gravel patch
--                         quotes at the minimum rather than at $1,100.
--   mobilisation   $450   Machine transport, crew travel, dump run.
--   range_spread    18%   Wider than painting's 15%, deliberately: a yard
--                         estimated from one photograph carries real
--                         uncertainty about ground conditions, and a band that
--                         admits it is more honest than a point estimate that
--                         does not.
--
-- ===========================================================================
--
-- finish_catalogue stays '[]'::jsonb. The module is the single source of truth
-- for what a trade offers and PrototypeView reads vertical.finishCatalogue,
-- ignoring this column.
--
-- The keys below must match landscapingPricingRuleSchema exactly. The schema is
-- .strict(), so an extra key here produces a prototype that resolves and then
-- quotes nothing — validate before applying.
-- ===========================================================================

insert into public.vertical_rule_defaults (vertical, rules, finish_catalogue)
values (
  'landscaping',
  '{
    "styleRateCentsPerSqft": {
      "paver_patio": 1900,
      "natural_stone": 2600,
      "artificial_turf": 1200,
      "gravel_xeriscape": 750,
      "soft_landscape": 850,
      "deck_pergola": 4500
    },
    "clearanceRateCentsPerSqft": {
      "none": 0,
      "light": 200,
      "standard": 375,
      "heavy": 800
    },
    "drainageRateCentsPerSqft": 300,
    "conditionModifiers": [
      { "id": "steep_slope",     "label": "Steep slope or terracing",     "pctAdjust": 0.15 },
      { "id": "poor_access",     "label": "No machine access",            "pctAdjust": 0.12 },
      { "id": "drainage_issues", "label": "Drainage problems",            "pctAdjust": 0.08 },
      { "id": "tree_work",       "label": "Large trees or roots",         "pctAdjust": 0.10 },
      { "id": "retaining_wall",  "label": "Retaining wall needed",        "pctAdjust": 0.20 }
    ],
    "minimumJobCents": 250000,
    "mobilizationFeeCents": 45000,
    "rangeSpreadPct": 0.18
  }'::jsonb,
  '[]'::jsonb
)
on conflict (vertical) do update
  set rules = excluded.rules,
      finish_catalogue = excluded.finish_catalogue;
