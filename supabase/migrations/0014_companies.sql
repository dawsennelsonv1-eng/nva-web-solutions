-- ============================================================================
-- 0014_companies.sql — COMPANIES, MEMBERS, ROLES (Phase 14B)
--
-- WHAT THIS ADDS TO THE ACCESS MODEL IN 0003_rls.sql, which is unchanged:
--
--   service_role  — unchanged. Still the only writer of billing state.
--   admin         — unchanged. is_admin() still sees everything.
--   anon          — unchanged. Tenant tables stay sealed; the two SECURITY
--                   DEFINER point-lookup functions are untouched.
--   MEMBER        — NEW. An authenticated user who belongs to a company via
--                   company_members. Sees that company's prototypes, quotes
--                   and leads, and nothing else. Never sees another company's
--                   anything, and never sees /demo leads (which are OURS).
--
-- THE THREE ROLES, named for a job site rather than for software:
--
--   principal  the owner. Billing, seats, every crew, every lead.
--   foreman    runs a crew. Every lead on his company, cannot manage seats.
--   crew       sees only leads assigned to him.
--
-- ============================================================================
-- THE FAILURE THIS MIGRATION EXISTS TO MAKE IMPOSSIBLE
-- ============================================================================
--
-- One company seeing another company's leads. That is not a bug you recover
-- from with an apology — it is every customer's entire book of business handed
-- to a competitor, and it is the single most likely thing to go wrong when
-- multi-tenancy is added to a codebase that did not start with it.
--
-- So scoping is enforced in the DATABASE, not in a WHERE clause somebody has
-- to remember. Every policy below derives the caller's companies from
-- company_members and nothing else. A server action that forgets to filter
-- returns an empty set instead of another tenant's rows.
--
-- THE SERVICE ROLE STILL BYPASSES ALL OF THIS. That is by design and it is
-- also the remaining sharp edge: lib/supabase/admin.ts is service_role, so any
-- code path that uses it for a member-facing read defeats every policy here.
-- CONVENTIONS.md already forbids that. Member-facing reads must go through the
-- cookie-bound client (lib/supabase/server.ts) so RLS actually runs.
--
-- ============================================================================
-- WHY THE HELPER FUNCTIONS ARE SECURITY DEFINER — AND WHY THAT IS NOT LAZY
-- ============================================================================
--
-- A SELECT policy on company_members that itself queries company_members
-- recurses infinitely and Postgres raises `infinite recursion detected in
-- policy for relation "company_members"`. It is the classic multi-tenant RLS
-- trap and it fails at query time, not at migration time.
--
-- SECURITY DEFINER functions run as the owner, so their reads are not
-- re-filtered by the policies being defined. Each is `stable`, each pins
-- search_path against hijack, and each is revoked from public then granted
-- narrowly — the same pattern is_admin() already uses in 0003.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- roles
-- ----------------------------------------------------------------------------
create type company_role as enum ('principal', 'foreman', 'crew');

-- ----------------------------------------------------------------------------
-- companies
-- ----------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  -- Seats the company has paid for. Enforced by the application at invite
  -- time, not by a trigger: a hard constraint here would make an admin unable
  -- to fix an over-seated company without editing SQL, which is the situation
  -- this whole phase exists to end.
  seat_limit  integer not null default 1 check (seat_limit > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- membership
--
-- user_id references auth.users so a member is a real Supabase Auth identity,
-- the same mechanism admins already sign in with. email is DENORMALISED
-- alongside it on purpose: a principal managing seats needs to see who is on
-- his team, and auth.users is not readable from the public schema by a normal
-- authenticated caller. It is a copy, so it can drift — the invite flow writes
-- it once and nothing else may.
-- ----------------------------------------------------------------------------
create table public.company_members (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  role        company_role not null default 'crew',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, user_id)
);

create index company_members_user_idx    on public.company_members (user_id);
create index company_members_company_idx on public.company_members (company_id);

-- ----------------------------------------------------------------------------
-- attach the existing tenant object to a company
--
-- NULLABLE, and it stays nullable. Every prototype that exists today has no
-- company, and a NOT NULL column would either fail the migration or force a
-- fabricated company row per existing prototype. A null company_id means
-- "single-tenant, admin-managed", which is exactly what those rows are.
-- ----------------------------------------------------------------------------
alter table public.prototypes
  add column company_id uuid references public.companies(id) on delete set null;

create index prototypes_company_idx on public.prototypes (company_id);

-- ----------------------------------------------------------------------------
-- lead assignment — what makes the `crew` role mean anything
--
-- Null means unassigned. An unassigned lead is visible to principals and
-- foremen and to NO crew member, which is the correct default: a lead nobody
-- has been given is the principal's problem, not something every crew member
-- can read.
-- ----------------------------------------------------------------------------
alter table public.leads
  add column assigned_to uuid references public.company_members(id) on delete set null;

create index leads_assigned_idx on public.leads (assigned_to);

-- ============================================================================
-- helper functions
-- ============================================================================

-- Every company the caller belongs to. The building block for everything else.
create or replace function public.my_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.company_id
  from public.company_members m
  where m.user_id = auth.uid();
$$;

-- The caller's role in one company, or null if he is not a member.
create or replace function public.my_company_role(target uuid)
returns company_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role
  from public.company_members m
  where m.user_id = auth.uid()
    and m.company_id = target
  limit 1;
$$;

create or replace function public.is_principal(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.my_company_role(target) = 'principal';
$$;

-- Principals and foremen see every lead on the company; crew see only theirs.
create or replace function public.sees_all_company_leads(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.my_company_role(target) in ('principal', 'foreman');
$$;

-- The caller's own membership row in a company. Used to test lead assignment
-- without exposing company_members to a policy that would recurse.
create or replace function public.my_member_id(target uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id
  from public.company_members m
  where m.user_id = auth.uid()
    and m.company_id = target
  limit 1;
$$;

-- Which company owns a prototype. Central because leads and quotes both reach
-- their company THROUGH a prototype rather than carrying a company_id of their
-- own — one source of tenancy, so a lead cannot disagree with its prototype
-- about who it belongs to.
create or replace function public.company_of_prototype(p uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pr.company_id from public.prototypes pr where pr.id = p;
$$;

revoke execute on function
  public.my_company_ids(),
  public.my_company_role(uuid),
  public.is_principal(uuid),
  public.sees_all_company_leads(uuid),
  public.my_member_id(uuid),
  public.company_of_prototype(uuid)
from public;

-- authenticated only. anon has no membership and must not be able to probe.
grant execute on function
  public.my_company_ids(),
  public.my_company_role(uuid),
  public.is_principal(uuid),
  public.sees_all_company_leads(uuid),
  public.my_member_id(uuid),
  public.company_of_prototype(uuid)
to authenticated;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.companies        enable row level security;
alter table public.company_members  enable row level security;

-- Same hard-revocation discipline as 0003: a denied SELECT should be a 42501,
-- not an empty 200 that looks like "no results".
revoke all on public.companies, public.company_members from anon;

-- ---- companies -------------------------------------------------------------
create policy companies_admin_all on public.companies
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy companies_member_read on public.companies
  for select to authenticated
  using (id in (select public.my_company_ids()));

-- Only a principal renames his company. Seats are NOT self-serve: seat_limit
-- is billing state, and 0003 reserves billing writes for service_role. A
-- principal raising his own seat limit would be a contractor granting himself
-- the company tier for free.
--
-- THAT IS ENFORCED BY A COLUMN GRANT, NOT BY A POLICY. An earlier draft of
-- this file tried `with check (... and seat_limit = seat_limit)`, which is a
-- tautology — WITH CHECK only sees the NEW row, so comparing a column to
-- itself is always true and the guard did nothing at all. RLS cannot express
-- "this column may not change"; column privileges can, so UPDATE is revoked
-- wholesale and granted back on exactly the columns a principal may write.
create policy companies_principal_update on public.companies
  for update to authenticated
  using (public.is_principal(id))
  with check (public.is_principal(id));

revoke update on public.companies from authenticated;
grant  update (name, updated_at) on public.companies to authenticated;

-- ---- company_members -------------------------------------------------------
create policy members_admin_all on public.company_members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Everyone on a company can see the roster. A crew member knowing who his
-- foreman is costs nothing and is needed to render an assignment name.
create policy members_read on public.company_members
  for select to authenticated
  using (company_id in (select public.my_company_ids()));

create policy members_principal_write on public.company_members
  for insert to authenticated
  with check (public.is_principal(company_id));

create policy members_principal_update on public.company_members
  for update to authenticated
  using (public.is_principal(company_id))
  with check (public.is_principal(company_id));

create policy members_principal_delete on public.company_members
  for delete to authenticated
  using (public.is_principal(company_id));

-- ---- prototypes ------------------------------------------------------------
-- 0003 sealed this table from anon and gave admin full access. This adds the
-- member door and nothing else: a prototype with a null company_id remains
-- invisible to every member, which is correct for the admin-managed rows that
-- exist today.
create policy prototypes_member_read on public.prototypes
  for select to authenticated
  using (company_id is not null and company_id in (select public.my_company_ids()));

-- ---- quotes ----------------------------------------------------------------
-- prototype_id is nullable and null means a /demo quote — OURS, never a
-- customer's. `is not null` is therefore load-bearing, not defensive: without
-- it, company_of_prototype(null) returns null, null = null is null, and the
-- row is excluded anyway — but relying on three-valued logic for a tenancy
-- boundary is how tenancy boundaries get broken by a later refactor.
create policy quotes_member_read on public.quotes
  for select to authenticated
  using (
    prototype_id is not null
    and public.company_of_prototype(prototype_id) in (select public.my_company_ids())
  );

-- ---- leads -----------------------------------------------------------------
-- The role split lives here, and this is the policy to read twice.
--
--   principal / foreman : every lead on the company
--   crew                : only leads assigned to his own membership row
--
-- A /demo lead (prototype_id null) is OURS and matches nothing below.
create policy leads_member_read on public.leads
  for select to authenticated
  using (
    prototype_id is not null
    and public.company_of_prototype(prototype_id) in (select public.my_company_ids())
    and (
      public.sees_all_company_leads(public.company_of_prototype(prototype_id))
      or assigned_to = public.my_member_id(public.company_of_prototype(prototype_id))
    )
  );

-- Members may update lead status and notes on leads they can already see.
-- The USING clause reuses the read rule, so a crew member cannot touch a lead
-- he cannot read. WITH CHECK repeats it so he cannot reassign a lead OUT of
-- his own company by writing a different prototype_id.
create policy leads_member_update on public.leads
  for update to authenticated
  using (
    prototype_id is not null
    and public.company_of_prototype(prototype_id) in (select public.my_company_ids())
    and (
      public.sees_all_company_leads(public.company_of_prototype(prototype_id))
      or assigned_to = public.my_member_id(public.company_of_prototype(prototype_id))
    )
  )
  with check (
    prototype_id is not null
    and public.company_of_prototype(prototype_id) in (select public.my_company_ids())
  );

-- ---- quote_configs ---------------------------------------------------------
-- READ ONLY for members, and deliberately so. A principal seeing the rates his
-- widget quotes from is reasonable. A principal EDITING them without the
-- validation in app/actions/quoteConfig.ts — which parses through the vertical
-- module's strict schema — would let a typed rate reach a live quote unchecked.
-- Self-serve rate editing is a later phase with its own validated surface.
create policy quote_configs_member_read on public.quote_configs
  for select to authenticated
  using (public.company_of_prototype(prototype_id) in (select public.my_company_ids()));

-- ============================================================================
-- WHAT TO TEST BEFORE TRUSTING THIS — run as two real member sessions.
--
--   1. Member of company A selects from leads. Sees only A's leads.
--   2. Member of company A selects a lead id belonging to company B by
--      primary key. Returns zero rows, not a row.
--   3. Crew member selects leads. Sees only rows where assigned_to is his own
--      membership id. Unassigned rows do not appear.
--   4. Foreman selects leads. Sees every lead on his company, assigned or not.
--   5. Crew member updates another member's lead. Zero rows affected.
--   6. Crew member updates company_members to set his own role to principal.
--      Denied.
--   7. Principal updates companies.seat_limit. Denied.
--   8. anon selects from companies or company_members. 42501, not empty.
--   9. Any member selects a /demo lead (prototype_id is null). Zero rows.
--  10. A prototype with company_id null is invisible to every member.
--
-- Test 2 and test 9 are the two that matter most. Everything else is a
-- convenience boundary; those two are the ones that end the business.
-- ============================================================================
