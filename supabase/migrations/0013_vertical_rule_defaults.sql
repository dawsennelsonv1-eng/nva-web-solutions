-- 0013_vertical_rule_defaults.sql
-- Phase 11. Per-vertical DEFAULT quoting rules, with realistic Dallas-market
-- painting rates.
--
-- WHY A NEW TABLE INSTEAD OF SEEDING quote_configs DIRECTLY.
-- quote_configs rows are keyed to a prototype_id, and there is no painting
-- prototype yet — the first one gets created the day an admin stages a
-- painting prospect. Seeding that table now would mean either inventing a
-- fake prototype to hang rows off, or attaching painting rates to a real
-- epoxy contractor's prototype. Both are worse than an empty table.
--
-- So this is the TEMPLATE a new prototype is built from: one row per vertical,
-- holding the numbers a contractor starts with and then edits from his own
-- dashboard. It changes nothing that is already live.
--
-- THIS MIGRATION DELIBERATELY DOES NOT WRITE TO quote_configs, and does not
-- define a function that does. Copying defaults into a prototype's config is
-- an INSERT against a table whose full constraint set is not in front of me,
-- and a migration that fails halfway through on a NOT NULL I did not know
-- about is worse than one that does less. The copy belongs in the admin
-- staging path, in TypeScript, where a failure is a form error rather than a
-- broken deploy.
--
-- THE RATES ARE THE CONTRACTOR'S, NOT OURS. Every number below is a STARTING
-- POINT for a Dallas repaint crew, meant to be overwritten. What matters
-- architecturally is that they live in the database at all: the pricing rule
-- says price is a pure function of contractor-owned rules, so a rate written
-- in TypeScript would be a defect no matter how correct it was.

create table if not exists public.vertical_rule_defaults (
  vertical            text primary key,
  rules               jsonb       not null,
  finish_catalogue    jsonb       not null default '[]'::jsonb,
  sqft_min            integer     not null,
  sqft_max            integer     not null,
  range_spread_pct    numeric(4,3) not null,
  -- Plain-language note shown to whoever is staging the prototype, so the
  -- person choosing these numbers knows what he is looking at.
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint vertical_rule_defaults_bounds_sane check (sqft_max > sqft_min and sqft_min > 0),
  constraint vertical_rule_defaults_spread_sane check (range_spread_pct >= 0.05 and range_spread_pct <= 0.5)
);

comment on table public.vertical_rule_defaults is
  'Starting quote rules per vertical, copied into quote_configs when a prototype is staged. Never read on the public request path.';

-- RLS on with NO policies: this is admin/service-role data only, and the
-- service-role key bypasses RLS. No policy means no anon or authenticated
-- client can read it, which is the correct default for a table that describes
-- how we price.
alter table public.vertical_rule_defaults enable row level security;

-- ---------------------------------------------------------------------------
-- PAINTING — interior/exterior residential repaint, Dallas market
-- ---------------------------------------------------------------------------
--
-- Painting prices differ STRUCTURALLY from epoxy, and the shape below is why
-- Phase 11 existed:
--
--   * coatRateCentsPerSqft is per sqft FOR ONE COAT, keyed by sheen. Gloss
--     bills higher than flat because it shows every flaw underneath, so the
--     cut-in and the surface both take more care.
--   * additionalCoatFactor is what each coat after the first costs, as a
--     fraction of the first. 0.65 reflects that the masking, cut-in and
--     mobilisation are already paid for by coat one. It is bounded below 1 by
--     the module schema: a second coat costing the same as the first means the
--     setup was never priced in.
--   * prepRateCentsPerSqft is a LEVEL with its own rate, not a percentage
--     added to the coating line. A restoration wall takes the same days
--     whether it is finished in flat or in gloss, so prep must not scale with
--     sheen. On a real repaint this line is routinely a third of the job.
--   * trim is per LINEAR foot and cabinets are per DOOR, because that is how
--     the trade measures them. Neither carries a prep line: their prep is
--     inseparable from the unit rate, and billing a linear foot of baseboard
--     for "prep per square foot" would invent an area nobody measured.
--
-- Bounds are 20-8000 so one config covers both the smallest trim run and the
-- largest two-storey exterior.
--
-- VERIFY: these are plausible Dallas rates, not quotes from a real crew.
-- Have the first painting contractor confirm his own numbers before his
-- prototype goes in front of a homeowner.

insert into public.vertical_rule_defaults
  (vertical, rules, finish_catalogue, sqft_min, sqft_max, range_spread_pct, notes)
values (
  'painting',
  jsonb_build_object(
    'coatRateCentsPerSqft', jsonb_build_object(
      'flat',        115,   -- $1.15 / sqft / coat
      'eggshell',    125,
      'satin',       135,
      'semi_gloss',  150,
      'gloss',       165
    ),
    'additionalCoatFactor', 0.65,
    'prepRateCentsPerSqft', jsonb_build_object(
      'light',        25,   -- wipe down, caulk, mask
      'standard',     55,   -- patch, sand, spot-prime
      'heavy',       110,   -- peeling, multiple patches, big colour change
      'restoration', 195    -- water damage, failing plaster
    ),
    'primerRateCentsPerSqft', 45,
    'trimRateCentsPerLinearFt', 350,   -- $3.50 / linear ft
    'cabinetRateCentsPerDoor', 9500,   -- $95 / door or drawer front
    'conditionModifiers', jsonb_build_array(
      jsonb_build_object('id','popcorn_ceiling',    'label','Popcorn ceiling texture',            'pctAdjust',0.15),
      jsonb_build_object('id','high_ceilings',      'label','Ceilings over 10 ft',                'pctAdjust',0.18),
      jsonb_build_object('id','occupied_home',      'label','Occupied home, furniture in place',  'pctAdjust',0.10),
      jsonb_build_object('id','water_damage_repair','label','Water damage repair',                'pctAdjust',0.14),
      jsonb_build_object('id','wallpaper_removal',  'label','Wallpaper removal',                  'pctAdjust',0.28),
      jsonb_build_object('id','mildew_treatment',   'label','Mildew treatment',                   'pctAdjust',0.12),
      jsonb_build_object('id','lead_safe_prep',     'label','Lead-safe prep (pre-1978 home)',     'pctAdjust',0.22),
      jsonb_build_object('id','two_storey_exterior','label','Two-storey exterior access',         'pctAdjust',0.20)
    ),
    'minimumJobCents',     45000,   -- $450 — below this the crew will not roll
    'mobilizationFeeCents', 15000,  -- $150 flat, added after the percentages
    'rangeSpreadPct',       0.15
  ),
  '[]'::jsonb,  -- sheens and colours are module-owned; see the note below
  20,
  8000,
  0.150,
  'Dallas starting rates. Four of these eight modifiers are inferable from a photo (water damage, wallpaper, mildew, popcorn) — an id removed here can never be applied by the AI, which is the intended way to turn one off.'
)
on conflict (vertical) do nothing;

-- FINISH CATALOGUE IS EMPTY ON PURPOSE.
-- quote_configs carries a finish_catalogue column from Phase 1, but Phase 11
-- made the vertical module the single source of truth for what a trade
-- offers: components/prototype/PrototypeView.tsx already reads
-- vertical.finishCatalogue and ignores the database column entirely. Seeding a
-- second copy here would create two catalogues that drift, and the one that
-- drifts silently is the one nobody is reading.

-- ---------------------------------------------------------------------------
-- EPOXY — recorded for symmetry, so vertical #3 has two worked examples
-- ---------------------------------------------------------------------------
-- These are the same numbers already seeded for live epoxy prototypes. This
-- row does not change any existing quote_config; it exists so that adding
-- roofing means copying a pattern rather than reverse-engineering one.

insert into public.vertical_rule_defaults
  (vertical, rules, finish_catalogue, sqft_min, sqft_max, range_spread_pct, notes)
values (
  'epoxy',
  jsonb_build_object(
    'baseRateCentsPerSqft', jsonb_build_object(
      'flake',              550,
      'metallic',           850,
      'solid_polyaspartic', 650
    ),
    'prepRateCentsPerSqft', 150,
    'conditionModifiers', jsonb_build_array(
      jsonb_build_object('id','oil_heavy',        'label','Heavy oil contamination',  'pctAdjust',0.18),
      jsonb_build_object('id','cracking_moderate','label','Moderate cracking repair', 'pctAdjust',0.12),
      jsonb_build_object('id','previous_coating', 'label','Previous coating removal', 'pctAdjust',0.25)
    ),
    'minimumJobCents',     150000,
    'mobilizationFeeCents', 25000,
    'rangeSpreadPct',       0.15
  ),
  '[]'::jsonb,
  100,
  6000,
  0.150,
  'Matches the rates already seeded for live epoxy prototypes. Present as a reference example, not as a change to anything running.'
)
on conflict (vertical) do nothing;
