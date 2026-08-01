-- 0010_ai_suite.sql — Phase 10, third-party AI integration suite.
--
-- PURELY ADDITIVE. Every statement is guarded so this runs cleanly whether or
-- not Phase 3 already created ai_jobs, and re-runs without error. It adds no
-- constraint to an existing column and changes no existing type, because the
-- rows Phase 3 wrote must stay valid exactly as they are.
--
-- NOTE ON status: the three values Phase 3 uses ('succeeded', 'failed',
-- 'invalid_output') are still the only three written. Nothing here needs a new
-- enum value, which is deliberate — ALTER TYPE ... ADD VALUE inside a
-- migration transaction is the kind of thing that fails on a Saturday.

-- ---------------------------------------------------------------------------
-- table (no-op when Phase 3 already created it)
-- ---------------------------------------------------------------------------

create table if not exists public.ai_jobs (
  id            uuid primary key default gen_random_uuid(),
  prototype_id  uuid,
  job_type      text not null,
  provider      text not null,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_cents    integer not null default 0,
  status        text not null,
  error         text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- columns added by this phase
-- ---------------------------------------------------------------------------

alter table public.ai_jobs add column if not exists created_at timestamptz not null default now();
alter table public.ai_jobs add column if not exists cached_input_tokens integer not null default 0;
alter table public.ai_jobs add column if not exists cache_write_tokens  integer not null default 0;
-- True when the provider returned no usage block and tokens were counted from
-- characters. Without this flag a streamed Kimi job looks as precisely costed
-- as an Anthropic one, and it is not.
alter table public.ai_jobs add column if not exists cost_estimated boolean not null default false;
alter table public.ai_jobs add column if not exists prompt_version text;
alter table public.ai_jobs add column if not exists attempts integer not null default 1;
alter table public.ai_jobs add column if not exists duration_ms integer;
-- Admin identity for admin-started jobs. Null for the public funnel, which is
-- how the rate limiter tells the two apart.
alter table public.ai_jobs add column if not exists created_by text;
alter table public.ai_jobs add column if not exists request jsonb;
alter table public.ai_jobs add column if not exists output jsonb;
alter table public.ai_jobs add column if not exists fell_back_from text[];
alter table public.ai_jobs add column if not exists applied_at timestamptz;
alter table public.ai_jobs add column if not exists applied_by text;
alter table public.ai_jobs add column if not exists apply_note text;
alter table public.ai_jobs add column if not exists discarded_at timestamptz;

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------

-- The daily spend query reads this every single run. Without it the ceiling
-- gets slower as the ledger grows, which is the wrong direction for a guard.
create index if not exists ai_jobs_created_at_idx on public.ai_jobs (created_at desc);
create index if not exists ai_jobs_job_type_created_idx on public.ai_jobs (job_type, created_at desc);
create index if not exists ai_jobs_created_by_idx on public.ai_jobs (created_by, created_at desc);
create index if not exists ai_jobs_prototype_idx on public.ai_jobs (prototype_id, created_at desc);

-- ---------------------------------------------------------------------------
-- spend today
-- ---------------------------------------------------------------------------

-- One round trip, one number. security definer so it works under the service
-- role without depending on table grants; search_path pinned because a
-- definer function with a loose search_path is a privilege-escalation shape.
create or replace function public.ai_spend_today_cents()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_cents), 0)::integer
  from public.ai_jobs
  where created_at >= date_trunc('day', (now() at time zone 'utc'));
$$;

revoke all on function public.ai_spend_today_cents() from public;
revoke all on function public.ai_spend_today_cents() from anon;
grant execute on function public.ai_spend_today_cents() to service_role;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

-- No policies, on purpose: this table is written and read only by the service
-- role, which bypasses RLS. Enabling it with zero policies means an anon or
-- authenticated key sees nothing, which is what a cost ledger should be.
alter table public.ai_jobs enable row level security;

comment on table public.ai_jobs is
  'One row per AI provider call: tokens, computed cost in cents, and for admin jobs the proposal and its apply/discard decision.';
