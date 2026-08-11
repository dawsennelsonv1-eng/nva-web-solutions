-- 0023_lead_finish_spec.sql — WHAT THE HOMEOWNER ACTUALLY CHOSE, ON THE LEAD.
--
-- ============================================================================
-- THE GAP THIS CLOSES
-- ============================================================================
--
-- A lead carried a name, a number, a timeline and a price. It did not carry
-- the FLOOR. Somebody could spend three minutes assembling a metallic pour in
-- copper burl with a polyaspartic topcoat and a coved base, and the installer
-- would receive "Marcus Whitfield, $3,069–$4,152" and have to ring him to ask
-- what he wanted — which is precisely the phone call this product exists to
-- make unnecessary.
--
-- The specification is the most valuable thing in the lead after the phone
-- number. It is what makes the quote defensible, it is what the installer
-- prices the prep against, and it is the thing the homeowner will hold us to.
--
-- ============================================================================
-- WHY jsonb AND NOT COLUMNS
-- ============================================================================
--
-- The obvious alternative is a column per group: system, colour, coverage,
-- topcoat. It is wrong here for one decisive reason — THE GROUPS ARE
-- PER-VERTICAL. Epoxy has flake blends and pour colours; painting will have
-- sheen and surface type; roofing will have neither. Columns would mean either
-- a migration per vertical or a table of mostly-null fields belonging to
-- trades this row is not from.
--
-- The catalogue in lib/verticals/*/options.ts is already the schema, and it is
-- versioned in code where it can change without a migration. jsonb stores what
-- that module produced.
--
-- ============================================================================
-- IT STORES KEYS, AND ALSO THE LABELS
-- ============================================================================
--
--   {"selections": {"system": "metallic", "metallic_colour": "copper_burl"},
--    "summary": ["The coating: Metallic pour", "Pour colour: Copper burl"]}
--
-- Both, deliberately. The KEYS are what a future render or re-price needs to
-- reconstruct the choice. The SUMMARY is what a human reads, and it is frozen
-- at the moment of capture — so if "Copper burl" is renamed or retired next
-- year, the lead still says what the homeowner was actually shown. A lead that
-- silently re-labels itself when the catalogue moves is a record that cannot
-- be trusted in a dispute, which is the only time anyone reads it closely.
--
-- NULLABLE. Every lead written before this column existed has none, and a
-- degraded lead may legitimately have none either. Code that assumes it is
-- present is a defect.
--
-- IDEMPOTENT. Safe to run twice.

alter table public.leads
  add column if not exists finish_spec jsonb;

comment on column public.leads.finish_spec is
  'What the homeowner chose in the customisation picker: {selections, summary}. '
  'Keys reconstruct the choice; summary is the frozen human-readable form. '
  'Null for leads captured before the picker, and for degraded leads.';

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
--
--   select id, name, finish_spec -> 'summary' from public.leads
--   where finish_spec is not null order by created_at desc limit 5;
--
-- No policy changes. finish_spec sits on a row whose access is already
-- governed by 0014's leads policies — a member sees his company's leads and
-- this column travels with them. No index either: nothing queries BY the
-- specification, it is only ever read alongside a lead already found by
-- prototype or by id.
