-- ============================================================================
-- 0006_billing_ops.sql — OUT-OF-ORDER WEBHOOK GUARD (Phase 5.5)
--
-- WHY THIS COLUMN EXISTS: webhook delivery is not ordered. Stripe retries on
-- its own schedule, and a `customer.subscription.updated` emitted at 10:00:01
-- can easily arrive AFTER one emitted at 10:00:05 — for example when the
-- first delivery attempt times out and is retried a minute later. Without a
-- guard, the late-arriving older event overwrites the newer status, and a
-- contractor who has just paid gets flipped back to past_due by a stale
-- message about a failure he already resolved.
--
-- The UNIQUE constraint on webhook_events.provider_event_id (0002_billing)
-- solves DUPLICATE delivery. It does nothing for OUT-OF-ORDER delivery,
-- because two different events are not duplicates. This is the other half.
--
-- The rule the handler enforces with it: a status-changing event whose
-- occurredAt is older than last_provider_event_at is stored and acknowledged,
-- but does not mutate subscription state.
--
-- IDEMPOTENT: guarded throughout, so a re-run is a no-op rather than an
-- error wall. (0001-0004 are NOT; 0005 and this one are.)
-- ============================================================================

alter table public.subscriptions
  add column if not exists last_provider_event_at timestamptz;

comment on column public.subscriptions.last_provider_event_at is
  'Provider timestamp of the most recent status-changing webhook applied. Used to reject out-of-order events. Written only by the webhook path.';

-- The admin billing view sorts by "closest to cap" and by failed payments;
-- both read subscriptions by status constantly.
create index if not exists subscriptions_status_period_idx
  on public.subscriptions (status, current_period_end);

-- dunning_events is read per-subscription to decide which day is next.
create index if not exists dunning_events_sub_day_idx
  on public.dunning_events (subscription_id, day_number);

-- ----------------------------------------------------------------------------
-- Reconciliation helper: every prototype with its live usage against its cap,
-- newest period first. This is the admin's upsell call sheet (OFFER.md 3.4)
-- and the source for /admin/billing's "closest to cap" view.
--
-- SECURITY DEFINER + service-role-only execute, matching every other billing
-- function in this schema: it joins prospects, prototypes, subscriptions and
-- usage_counters, so anon must never reach it.
-- ----------------------------------------------------------------------------
create or replace function public.billing_overview()
returns table (
  prototype_id uuid,
  slug text,
  business_name text,
  contact_name text,
  phone text,
  email text,
  plan_code text,
  subscription_id uuid,
  status subscription_status,
  provider payment_provider,
  current_period_start timestamptz,
  current_period_end timestamptz,
  analyses_used integer,
  leads_captured integer,
  analysis_limit integer,
  cap_reached_at timestamptz,
  pct_of_cap numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.slug,
    pr.business_name,
    pr.contact_name,
    pr.phone,
    pr.email,
    s.plan_code,
    s.id,
    s.status,
    s.provider,
    s.current_period_start,
    s.current_period_end,
    coalesce(uc.analyses_used, 0),
    coalesce(uc.leads_captured, 0),
    pl.analysis_limit_per_month,
    uc.cap_reached_at,
    case
      when pl.analysis_limit_per_month is null or pl.analysis_limit_per_month = 0 then null
      else round((coalesce(uc.analyses_used, 0)::numeric / pl.analysis_limit_per_month) * 100, 1)
    end
  from public.subscriptions s
  join public.prototypes p on p.id = s.prototype_id
  join public.prospects pr on pr.id = s.prospect_id
  join public.plans pl on pl.code = s.plan_code
  left join public.usage_counters uc
    on uc.prototype_id = s.prototype_id
   and uc.period_start = s.current_period_start
  order by
    case
      when pl.analysis_limit_per_month is null then null
      else coalesce(uc.analyses_used, 0)::numeric / pl.analysis_limit_per_month
    end desc nulls last,
    s.current_period_end asc;
$$;

revoke execute on function public.billing_overview() from public, anon, authenticated;
