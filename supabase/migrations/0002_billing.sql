-- ============================================================================
-- 0002_billing.sql — BILLING SCHEMA (Phase 2)
-- Canonical source: docs/DATA_MODEL.md §§12–17 and docs/OFFER.md §1.
-- Money is integer cents, always (CONVENTIONS.md). Limits live in the plans
-- table, never in application code (R-611).
-- ============================================================================

create type payment_provider as enum ('stripe','manual','stub');

create type subscription_status as enum
  ('trialing','active','past_due','grace','suspended','canceled');

create type payment_kind as enum ('setup','recurring','refund');

create type payment_status as enum ('succeeded','failed','refunded');

create type dunning_channel as enum ('email','sms');

-- ----------------------------------------------------------------------------
-- 12. plans — LIMITS LIVE HERE. NEVER IN CODE.
-- ----------------------------------------------------------------------------
create table public.plans (
  code text primary key,           -- 'foundation' · 'operator'
  name text not null,
  setup_fee_cents integer not null check (setup_fee_cents >= 0),
  monthly_cents integer not null check (monthly_cents >= 0),
  -- NULL means unlimited. Deliberate (DATA_MODEL.md §12): a sentinel like
  -- 999999 invites a comparison that silently works until someone hits it.
  analysis_limit_per_month integer check (analysis_limit_per_month > 0),
  analysis_limit_per_session integer not null default 3,
  features jsonb not null default '{}'::jsonb, -- feature-key → enabled, per OFFER.md §1.1
  is_active boolean not null default true,     -- retire without deleting referenced rows
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- Seeded here (idempotently — seed.sql re-upserts the same rows so either
-- runs safely in any order). Founding rate per OFFER.md: the change to
-- $1,500 setup after the first 10 DFW contractors or Oct 31 2026 is an
-- UPDATE to this row, not a deploy.
insert into public.plans
  (code, name, setup_fee_cents, monthly_cents, analysis_limit_per_month,
   analysis_limit_per_session, features, is_active)
values
  ('foundation', 'Foundation', 50000, 25000, 25, 3, '{
     "quote.deterministic": true,
     "quote.ai_analysis": true,
     "lead.capture": true,
     "quote.share_page": true,
     "brand.style_toggle": true,
     "cure.advisor": false,
     "command_center": false,
     "ai.implementation_review": false
   }'::jsonb, true),
  ('operator', 'Operator', 250000, 50000, null, 3, '{
     "quote.deterministic": true,
     "quote.ai_analysis": true,
     "lead.capture": true,
     "quote.share_page": true,
     "brand.style_toggle": true,
     "cure.advisor": true,
     "command_center": true,
     "ai.implementation_review": true
   }'::jsonb, true)
on conflict (code) do update set
  name = excluded.name,
  setup_fee_cents = excluded.setup_fee_cents,
  monthly_cents = excluded.monthly_cents,
  analysis_limit_per_month = excluded.analysis_limit_per_month,
  analysis_limit_per_session = excluded.analysis_limit_per_session,
  features = excluded.features,
  is_active = excluded.is_active;

-- Now that plans exists, attach the deferred fk from 0001.
alter table public.prototypes
  add constraint prototypes_tier_fkey
  foreign key (tier) references public.plans(code);

-- ----------------------------------------------------------------------------
-- 13. subscriptions (DATA_MODEL.md §13)
-- STATUS IS WRITTEN ONLY BY THE WEBHOOK PATH or an explicit admin action
-- through the 'manual' provider. No other code path may write it — enforced
-- in 0003 by granting billing writes to the service role only.
-- ----------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  prototype_id uuid not null references public.prototypes(id) on delete cascade,
  plan_code text not null references public.plans(code),
  provider payment_provider not null,
  provider_customer_id text,
  provider_subscription_id text,   -- null for 'manual'
  status subscription_status not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  grace_ends_at timestamptz,       -- set on entering past_due; day 10
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);

create index subscriptions_prospect_idx on public.subscriptions (prospect_id);
create index subscriptions_prototype_idx on public.subscriptions (prototype_id);
create index subscriptions_status_idx on public.subscriptions (status);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 14. payments (DATA_MODEL.md §14)
-- amount_cents is NEGATIVE for refunds, so summing the column yields net
-- revenue with no special case.
-- ----------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  provider_payment_id text,
  kind payment_kind not null,
  amount_cents integer not null,
  currency text not null default 'usd',
  status payment_status not null,
  failure_reason text,
  occurred_at timestamptz not null,  -- the provider's timestamp, not ours
  created_at timestamptz not null default now(),
  check ((kind = 'refund' and amount_cents < 0)
      or (kind <> 'refund' and amount_cents >= 0))
);

create index payments_subscription_idx on public.payments (subscription_id, occurred_at desc);

-- ----------------------------------------------------------------------------
-- 15. usage_counters — one row per prototype per billing period
--     (DATA_MODEL.md §15). Increments MUST be atomic; see increment_usage().
-- ----------------------------------------------------------------------------
create table public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid not null references public.prototypes(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  analyses_used integer not null default 0,   -- THE metered unit (OFFER.md §1.2)
  leads_captured integer not null default 0,  -- NEVER capped; shown beside analyses always
  cap_reached_at timestamptz,                 -- set once, on first reaching the limit
  warned_at_20 timestamptz,                   -- dedupes the early-warning send
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prototype_id, period_start),
  check (period_end > period_start)
);

create trigger usage_counters_updated_at before update on public.usage_counters
  for each row execute function public.set_updated_at();

-- THE ATOMIC INCREMENT (required by the phase spec: "safe under concurrent
-- increments; use an atomic increment, not read-then-write").
--
-- WHY THIS IS RACE-FREE: the whole mutation is a single INSERT ... ON
-- CONFLICT DO UPDATE statement. Two concurrent calls for the same
-- (prototype_id, period_start) both target one row; Postgres serialises the
-- conflicting writes on the row lock, and each UPDATE computes
-- `analyses_used + 1` from the row value it actually sees at execution time.
-- There is no window where both read 17 and both write 18. cap_reached_at is
-- set in the same statement the moment the limit is crossed, exactly once,
-- because only one caller can be the one that moves the counter to the limit.
--
-- p_kind: 'analysis' increments the metered unit; 'lead' increments the
-- never-capped companion count. p_limit null = unlimited plan (Operator).
-- Returns the full row so check.ts gets counters + cap state in one call.
create or replace function public.increment_usage(
  p_prototype_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_kind text,
  p_limit integer default null
) returns public.usage_counters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.usage_counters;
begin
  if p_kind not in ('analysis','lead') then
    raise exception 'increment_usage: p_kind must be analysis or lead, got %', p_kind;
  end if;

  insert into public.usage_counters as uc
    (prototype_id, period_start, period_end, analyses_used, leads_captured, cap_reached_at)
  values (
    p_prototype_id, p_period_start, p_period_end,
    case when p_kind = 'analysis' then 1 else 0 end,
    case when p_kind = 'lead' then 1 else 0 end,
    case when p_kind = 'analysis' and p_limit is not null and p_limit <= 1
         then now() else null end
  )
  on conflict (prototype_id, period_start) do update set
    analyses_used  = uc.analyses_used  + (case when p_kind = 'analysis' then 1 else 0 end),
    leads_captured = uc.leads_captured + (case when p_kind = 'lead' then 1 else 0 end),
    cap_reached_at = coalesce(
      uc.cap_reached_at,
      case when p_kind = 'analysis'
            and p_limit is not null
            and uc.analyses_used + 1 >= p_limit
           then now() else null end
    )
  returning uc.* into v_row;

  return v_row;
end;
$$;

-- Companion read that never increments (for check.ts pre-flight decisions).
create or replace function public.get_usage(
  p_prototype_id uuid,
  p_period_start timestamptz
) returns public.usage_counters
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.usage_counters
   where prototype_id = p_prototype_id and period_start = p_period_start;
$$;

-- ----------------------------------------------------------------------------
-- 16. dunning_events (DATA_MODEL.md §16)
-- UNIQUE (subscription_id, day_number, channel): a retried job cannot send
-- the same dunning message twice.
-- ----------------------------------------------------------------------------
create table public.dunning_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  day_number integer not null check (day_number in (1,3,5,7,10)),
  channel dunning_channel not null,
  sent_at timestamptz not null default now(),
  delivery_status text,
  unique (subscription_id, day_number, channel)
);

-- ----------------------------------------------------------------------------
-- 17. webhook_events — THE IDEMPOTENCY GUARD (DATA_MODEL.md §17)
--
-- HOW THE UNIQUE CONSTRAINT PREVENTS DOUBLE-PROCESSING: the webhook handler
-- INSERTs the event here BEFORE it does anything else. If that insert raises
-- unique_violation (23505) on provider_event_id, this exact event was already
-- received — the handler returns 2xx immediately without touching a
-- subscription, a payment, or an entitlement. The database is the lock: two
-- concurrent deliveries of the same event race on one index entry, exactly
-- one insert wins, and the loser cannot proceed. No application-level dedup
-- store, no cache, no race window.
-- ----------------------------------------------------------------------------
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null unique,
  payload jsonb not null,          -- raw, stored before processing
  received_at timestamptz not null default now(),
  processed_at timestamptz,        -- null = received but not yet applied
  processing_error text
);

create index webhook_events_received_idx on public.webhook_events (received_at desc);
