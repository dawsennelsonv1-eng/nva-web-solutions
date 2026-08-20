-- ===========================================================================
-- 0026_cabinets_defaults.sql — pricing defaults for the cabinets vertical
-- ===========================================================================
--
-- Shape defined by cabinetPricingRuleSchema in lib/verticals/cabinets/index.tsx,
-- which is .strict() — an extra key here produces a prototype that resolves and
-- then quotes nothing. The module contains no rates itself (R-113).
--
-- Defaults, not prices. Every contractor overrides them.
--
-- ===========================================================================
-- WHERE THE NUMBERS COME FROM
-- ===========================================================================
--
-- Dallas-Fort Worth residential refinishing, mid-market, per FRONT. This trade
-- quotes per door because a door is a unit of work — off, sanded, primed,
-- sprayed both sides, cured, rehung — and that cost barely varies with its
-- size. A 30-door kitchen is a 30-door kitchen whether the doors are 12 inches
-- or 20.
--
--   DOORS, per front:
--     brushed             $80    Hand-applied on site. Cheapest, and the only
--                                one where brush texture is visible. Market
--                                $60-100.
--     sprayed_lacquer    $115    Removed, sprayed off site, rehung. The
--                                standard kitchen refinish. Market $95-150.
--     conversion_varnish $150    Two-part catalysed, sprayed and cured off
--                                site. Considerably harder; the finish that
--                                survives a sink and a family. Market $130-190.
--     stain_refinish     $135    Stripped to bare wood, restained, clear
--                                coated. Stripping is the labour. Market
--                                $110-170, and impossible on laminate.
--     glazed             $175    Painted base plus hand-worked glaze in every
--                                profile. The most labour per door here.
--                                Market $150-220.
--
--   DRAWER FRONTS, per front: roughly 55-60% of the door rate. NOT a fixed
--   fraction — the saving is in handling, not in coats or cure time, so it
--   narrows as the tiers get more expensive. That is why these are their own
--   keys rather than a multiplier.
--     brushed $45 · sprayed $65 · varnish $88 · stain $80 · glazed $100
--
--   BOXES, per linear foot: $42. The frames and end panels stay in the room and
--   are masked, brushed and rolled in place with the kitchen out of use.
--   Market $30-60/lf.
--
--   PREP, per front — charged per front rather than as a percentage, because
--   stripping a greasy door costs the same whatever finish follows it:
--     light     $8   Clean, degrease, scuff sand. Already smooth.
--     standard $18   Chips and worn edges. Sand, fill, prime.
--     heavy    $38   Peeling finish or years of cooker grease. Stripped and
--                    sealed before anything else.
--
--   HARDWARE, per piece: $9 to fit customer-supplied handles and knobs.
--
--   MODIFIERS:
--     grain_filling  +22%  THE BIG ONE, and the most commonly forgotten line in
--                          this trade. Open-grain oak painted white without
--                          filling still reads as oak, and the customer is
--                          disappointed six weeks later rather than on the day.
--                          Filling is real labour on every single front, which
--                          is why it is the largest adjustment here.
--     heavy_grease   +12%  Degreasing and sealing before primer, or nothing
--                          bonds.
--     glass_fronts    +8%  Masking or removing glass, handled separately.
--     water_damage   +15%  Swollen or delaminated fronts needing repair or
--                          replacement before finishing.
--     two_tone        +6%  A second colour means a second full spray setup and
--                          a second cure cycle.
--
--   minimum_job   $1,200  Below this, collecting doors, running a booth cycle
--                         and returning them does not pay.
--
--                         SET FOR THE SMALLEST JOB THIS TOOL OFFERS, NOT FOR A
--                         KITCHEN. An earlier draft used $2,800, which is a
--                         sensible kitchen floor and quoted a single bathroom
--                         vanity at $2,800 — roughly double the market, on a
--                         surface this module deliberately offers. Every real
--                         kitchen clears $1,200 on its own arithmetic, so a
--                         kitchen-shaped minimum protects nothing and only
--                         misprices the small jobs. A refinisher who does not
--                         want vanity work should raise this in their own
--                         config, which is a decision they can make and this
--                         file cannot.
--   mobilisation    $275  Collection and delivery of the doors.
--   range_spread     15%  Narrower than landscaping's 18%: counting doors from
--                         a photograph is a more tractable problem than judging
--                         a yard's square footage, and the customer can verify
--                         the count himself by looking at his own kitchen.
-- ===========================================================================
-- THE COLUMNS, AND WHY THE FIRST VERSION OF THIS FILE FAILED
-- ===========================================================================
--
-- docs/NEW_VERTICAL.md names three columns: vertical, rules, finish_catalogue.
-- The table actually has NINE, and SIX of them are NOT NULL. The first version
-- of this migration inserted the documented three and was rejected on
-- sqft_min. The documentation was incomplete rather than wrong, and the schema
-- is the authority:
--
--   vertical          text       NOT NULL
--   rules             jsonb      NOT NULL
--   finish_catalogue  jsonb      NOT NULL  default '[]'
--   sqft_min          integer    NOT NULL
--   sqft_max          integer    NOT NULL
--   range_spread_pct  numeric    NOT NULL
--   notes             text       NULL
--   created_at        timestamptz NOT NULL default now()
--   updated_at        timestamptz NOT NULL default now()
--
-- BOUNDS FOR THIS VERTICAL:
--   THESE BOUNDS ARE INERT FOR THIS VERTICAL. Nothing in a cabinet quote is measured in area - the module prices doors, drawer fronts and linear feet of box, and its own step controls carry the count limits (80 doors, 60 drawers). The columns are NOT NULL, so they are filled with a range wide enough never to reject anything rather than with numbers pretending to mean something.
--
-- range_spread_pct is set to the same value as rangeSpreadPct inside `rules`.
-- The module reads the one in the JSON; the column is kept in step so the two
-- can never tell a reader different things about the same quote.
-- ===========================================================================

insert into public.vertical_rule_defaults
  (vertical, rules, finish_catalogue, sqft_min, sqft_max, range_spread_pct, notes)
values (
  'cabinets',
  '{
    "doorRateCentsPerFront": {
      "brushed": 8000,
      "sprayed_lacquer": 11500,
      "conversion_varnish": 15000,
      "stain_refinish": 13500,
      "glazed": 17500
    },
    "drawerRateCentsPerFront": {
      "brushed": 4500,
      "sprayed_lacquer": 6500,
      "conversion_varnish": 8800,
      "stain_refinish": 8000,
      "glazed": 10000
    },
    "boxRateCentsPerLinearFt": 4200,
    "prepRateCentsPerFront": {
      "light": 800,
      "standard": 1800,
      "heavy": 3800
    },
    "hardwareRateCentsPerPiece": 900,
    "conditionModifiers": [
      { "id": "grain_filling", "label": "Open grain to fill (oak)", "pctAdjust": 0.22 },
      { "id": "heavy_grease",  "label": "Heavy grease build-up",    "pctAdjust": 0.12 },
      { "id": "glass_fronts",  "label": "Glass-panel doors",        "pctAdjust": 0.08 },
      { "id": "water_damage",  "label": "Water-damaged fronts",     "pctAdjust": 0.15 },
      { "id": "two_tone",      "label": "Two colours",              "pctAdjust": 0.06 }
    ],
    "minimumJobCents": 120000,
    "mobilizationFeeCents": 27500,
    "rangeSpreadPct": 0.15
  }'::jsonb,
  '[]'::jsonb,
  1,
  100000,
  0.15,
  'THESE BOUNDS ARE INERT FOR THIS VERTICAL. Nothing in a cabinet quote is measured in area - the module prices doors, drawer fronts and linear feet of box, and its own step controls carry the count limits (80 doors, 60 drawers). The columns are NOT NULL, so they are filled with a range wide enough never to reject anything rather than with numbers pretending to mean something.'
)
on conflict (vertical) do update
  set rules            = excluded.rules,
      finish_catalogue = excluded.finish_catalogue,
      sqft_min         = excluded.sqft_min,
      sqft_max         = excluded.sqft_max,
      range_spread_pct = excluded.range_spread_pct,
      notes            = excluded.notes,
      updated_at       = now();
