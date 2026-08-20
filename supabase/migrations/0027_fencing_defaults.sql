-- ===========================================================================
-- 0027_fencing_defaults.sql — pricing defaults for the fencing vertical
-- ===========================================================================
--
-- Shape defined by fencingPricingRuleSchema in lib/verticals/fencing/index.tsx,
-- which is .strict(). The module holds no rates (R-113).
--
-- ===========================================================================
-- WHERE THE NUMBERS COME FROM
-- ===========================================================================
--
-- Dallas-Fort Worth residential, installed, per linear foot at six feet. Height
-- is a modifier rather than a dimension: an eight-foot fence is not a third
-- more fence, it is longer posts, deeper holes, more concrete and an extra
-- rail, which is about a quarter more money.
--
--   chain_link         $16/ft   Galvanised mesh on steel posts. Market $12-20.
--                               The dog-and-large-run option.
--   wood_privacy       $32/ft   Cedar pickets, six foot, side by side. The
--                               standard Texas back yard. Market $25-40, and
--                               volatile — it moves with lumber.
--   wood_premium       $48/ft   Board on board with GALVANISED STEEL POSTS and
--                               a cap and trim. Market $40-60. The upgrade
--                               people regret skipping: wood posts rot at the
--                               ground line and the fence leans in eight years,
--                               steel posts do not.
--   horizontal_modern  $55/ft   Wide cedar boards run horizontally with an even
--                               reveal. Market $45-70. More material, far more
--                               labour to keep the reveal true, and it is
--                               unforgiving of a post out of plumb.
--   vinyl              $36/ft   Moulded PVC panels. Market $28-45. Never needs
--                               staining, which is most of the pitch.
--   ornamental_metal   $42/ft   Powder-coated iron or aluminium. Market $30-55.
--                               The pool-code and front-yard choice.
--   masonry_column    $110/ft   Stone or brick piers with panels between.
--                               Market $80-150. Footings, a mason and a
--                               different trade on site; ten times chain link,
--                               which is the widest spread of any vertical here.
--
--   GATES, flat per unit rather than proportional to the style rate. A walk
--   gate in cedar and a walk gate in vinyl cost far more similar amounts than
--   their per-foot rates suggest, because most of it is hardware, hinges and
--   two properly set posts:
--     walk_gate    $375   Market $250-450.
--     drive_gate  $1,100  Market $700-1,500. A twelve-foot leaf that must not
--                         sag is a fabrication problem, not a fencing one.
--
--   removal        $6/ft  Take the old fence out, load it, dump fees. Market
--                         $3-8. Charged on the full run because that is the
--                         length being cleared.
--
--   MODIFIERS:
--     rocky_ground   +18%  THE DALLAS ONE. Caliche and limestone shelf are
--                          common here, and setting posts in rock can mean
--                          coring rather than augering. The single most
--                          under-quoted condition in this market, which is why
--                          the vision call is asked to look for visible rock.
--     height_8ft     +25%  Longer posts, deeper holes, more concrete, third
--                          rail.
--     sloped_ground  +12%  Stepping or raking the panels to follow a fall, and
--                          every post set individually.
--     trees_on_line  +10%  Root cutting, hand digging, working around trunks.
--     restricted_access +10% No route for a machine or a materials drop; posts
--                          and panels carried in.
--
--   minimum_job  $1,500  A crew, an auger and a concrete run does not pay below
--                        this. A 40-foot side of chain link lands here.
--   mobilisation   $250
--   range_spread    15%  A fence run is a length, and a length judged from a
--                        photograph is more tractable than a yard's area — but
--                        the same photograph foreshortens a receding boundary,
--                        so this is not narrower than cabinets.
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
--   THE COLUMN IS NAMED sqft AND HOLDS LINEAR FEET. The module reuses this plumbing for its run rather than renaming a shared column for one vertical, and every label shown to a person says 'linear ft'. 20 is a short gate-to-corner run; 2000 covers a large rural perimeter. Copying epoxy's 100-6000 floor-area bounds here would have rejected a 70ft side fence outright.
--
-- range_spread_pct is set to the same value as rangeSpreadPct inside `rules`.
-- The module reads the one in the JSON; the column is kept in step so the two
-- can never tell a reader different things about the same quote.
-- ===========================================================================

insert into public.vertical_rule_defaults
  (vertical, rules, finish_catalogue, sqft_min, sqft_max, range_spread_pct, notes)
values (
  'fencing',
  '{
    "styleRateCentsPerLinearFt": {
      "chain_link": 1600,
      "wood_privacy": 3200,
      "wood_premium": 4800,
      "horizontal_modern": 5500,
      "vinyl": 3600,
      "ornamental_metal": 4200,
      "masonry_column": 11000
    },
    "walkGateCents": 37500,
    "driveGateCents": 110000,
    "removalRateCentsPerLinearFt": 600,
    "conditionModifiers": [
      { "id": "rocky_ground",      "label": "Rock or caliche",        "pctAdjust": 0.18 },
      { "id": "height_8ft",        "label": "Eight foot height",      "pctAdjust": 0.25 },
      { "id": "sloped_ground",     "label": "Sloped ground",          "pctAdjust": 0.12 },
      { "id": "trees_on_line",     "label": "Trees on the line",      "pctAdjust": 0.10 },
      { "id": "restricted_access", "label": "No machine access",      "pctAdjust": 0.10 }
    ],
    "minimumJobCents": 150000,
    "mobilizationFeeCents": 25000,
    "rangeSpreadPct": 0.15
  }'::jsonb,
  '[]'::jsonb,
  20,
  2000,
  0.15,
  'THE COLUMN IS NAMED sqft AND HOLDS LINEAR FEET. The module reuses this plumbing for its run rather than renaming a shared column for one vertical, and every label shown to a person says ''linear ft''. 20 is a short gate-to-corner run; 2000 covers a large rural perimeter. Copying epoxy''s 100-6000 floor-area bounds here would have rejected a 70ft side fence outright.'
)
on conflict (vertical) do update
  set rules            = excluded.rules,
      finish_catalogue = excluded.finish_catalogue,
      sqft_min         = excluded.sqft_min,
      sqft_max         = excluded.sqft_max,
      range_spread_pct = excluded.range_spread_pct,
      notes            = excluded.notes,
      updated_at       = now();
