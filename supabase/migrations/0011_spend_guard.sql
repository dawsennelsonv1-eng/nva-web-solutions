-- 0011_spend_guard.sql — Phase 12A.
--
-- WHY THIS MIGRATION EXISTS.
--
-- lib/quote/guards.ts computed today's AI spend by SELECTing every ai_jobs row
-- for the day and summing in JavaScript. PostgREST caps a response at
-- max-rows (1000 by default), so past a thousand jobs in a UTC day the sum
-- silently stopped growing and the daily ceiling became
--   min(ceiling, 1000 * cost_per_call)
-- regardless of what the ceiling was set to. Under the exact conditions the
-- ceiling exists for — an attacker issuing thousands of calls — it stopped
-- counting first and then stopped stopping.
--
-- Summing in Postgres has no row cap.
--
-- Nothing here is granted to anon or authenticated. Both functions are
-- service-role only, called from server code that already holds the key.

-- ---------------------------------------------------------------------------
-- 1. the sum, computed where the rows live
-- ---------------------------------------------------------------------------

create or replace function public.ai_spend_today_cents()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(cost_cents), 0)::int
  from public.ai_jobs
  where created_at >= (date_trunc('day', (now() at time zone 'utc')) at time zone 'utc');
$$;

comment on function public.ai_spend_today_cents() is
  'Total ai_jobs.cost_cents since 00:00 UTC today. Replaces a JS-side sum that PostgREST truncated at 1000 rows.';

revoke all on function public.ai_spend_today_cents() from public;
revoke all on function public.ai_spend_today_cents() from anon;
revoke all on function public.ai_spend_today_cents() from authenticated;

-- ---------------------------------------------------------------------------
-- 2. the early-warning ledger
-- ---------------------------------------------------------------------------
--
-- One row per (scope, UTC day, threshold). The unique constraint is the whole
-- mechanism: the alert fires on the first request that crosses a threshold and
-- never again that day, so crossing 75% under attack sends one email rather
-- than one per request.

create table if not exists public.ai_spend_alerts (
  id             bigint generated always as identity primary key,
  scope          text        not null,
  utc_day        date        not null,
  threshold_pct  integer     not null,
  spent_cents    integer     not null,
  ceiling_cents  integer     not null,
  created_at     timestamptz not null default now(),
  constraint ai_spend_alerts_unique_per_day unique (scope, utc_day, threshold_pct)
);

comment on table public.ai_spend_alerts is
  'Deduplication ledger for AI spend warnings. One row per threshold per UTC day per scope.';

alter table public.ai_spend_alerts enable row level security;

-- Deliberately NO policies. RLS on with zero policies denies anon and
-- authenticated everything; the service role bypasses RLS and is the only
-- intended writer. This is a spend-surveillance table and no browser has any
-- business reading it.

revoke all on table public.ai_spend_alerts from anon;
revoke all on table public.ai_spend_alerts from authenticated;

-- ---------------------------------------------------------------------------
-- 3. atomic claim
-- ---------------------------------------------------------------------------
--
-- Returns true to EXACTLY ONE caller per (scope, day, threshold), even when a
-- hundred concurrent requests cross the same threshold in the same second.
-- The unique index does the arbitration; there is no read-then-write window.

create or replace function public.claim_spend_alert(
  p_scope         text,
  p_threshold_pct integer,
  p_spent_cents   integer,
  p_ceiling_cents integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
begin
  insert into public.ai_spend_alerts
    (scope, utc_day, threshold_pct, spent_cents, ceiling_cents)
  values
    (p_scope, v_day, p_threshold_pct, p_spent_cents, p_ceiling_cents)
  on conflict (scope, utc_day, threshold_pct) do nothing;

  -- FOUND is true only when the INSERT actually wrote a row.
  return found;
end;
$$;

comment on function public.claim_spend_alert(text, integer, integer, integer) is
  'Claims the right to send one spend alert for a threshold today. True for the first caller only.';

revoke all on function public.claim_spend_alert(text, integer, integer, integer) from public;
revoke all on function public.claim_spend_alert(text, integer, integer, integer) from anon;
revoke all on function public.claim_spend_alert(text, integer, integer, integer) from authenticated;
