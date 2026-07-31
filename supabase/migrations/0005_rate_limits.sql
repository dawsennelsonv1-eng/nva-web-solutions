-- ============================================================================
-- 0005_rate_limits.sql — PER-IP RATE LIMITING SUBSTRATE (Phase 3)
--
-- WHY THIS EXISTS: Phase 3's cost guards require a per-IP limit on paid
-- vision calls. An in-memory counter inside a serverless function is
-- per-instance and resets on every cold start — it looks like a rate limiter
-- in code review and is not one in production. Since there is no Redis in
-- this stack, the limiter lives where the truth already lives.
--
-- PRIVACY: the caller NEVER writes a raw IP address here. bucket_key is a
-- salted SHA-256 of the address (lib/quote/guards.ts). We store a fixed-width
-- opaque string that cannot be reversed and is not useful to anyone who
-- obtains it, and it ages out with the window.
--
-- IDEMPOTENT: unlike 0001-0004 (plain CREATE TABLE), every statement here is
-- guarded, so a re-run is a no-op rather than an error wall.
--
-- FILE_TREE.md addition: supabase/migrations/0005_rate_limits.sql [3]
-- ============================================================================

create table if not exists public.rate_limit_hits (
  bucket_key text not null,      -- salted hash of the subject (IP, session, etc.)
  scope text not null,           -- what is being limited, e.g. 'vision_analysis'
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket_key, scope, window_start)
);

create index if not exists rate_limit_hits_window_idx on public.rate_limit_hits (window_start);

alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

drop policy if exists admin_all on public.rate_limit_hits;
create policy admin_all on public.rate_limit_hits
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Atomic check-and-increment, same race-free INSERT..ON CONFLICT DO UPDATE
-- pattern as increment_usage: two concurrent requests from one address
-- serialise on the row lock, and each UPDATE computes hits+1 from the value
-- it actually sees. The caller learns both the new count and the verdict in
-- one round trip.
--
-- Windows are FIXED, not sliding: window_start is the current instant floored
-- to the window length, so the key rotates on its own and old rows simply
-- stop being addressed. A fixed window permits a burst of up to 2x the limit
-- across a boundary; for a spend guard on a $0.003 call that is an acceptable
-- trade for having no background job and no extra table scan.
create or replace function public.check_rate_limit(
  p_bucket_key text,
  p_scope text,
  p_window_seconds integer,
  p_max integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_window_seconds <= 0 or p_max <= 0 then
    raise exception 'check_rate_limit: window and max must be positive';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_hits as r (bucket_key, scope, window_start, hits)
  values (p_bucket_key, p_scope, v_window_start, 1)
  on conflict (bucket_key, scope, window_start) do update
    set hits = r.hits + 1
  returning r.hits into v_hits;

  return jsonb_build_object(
    'allowed', v_hits <= p_max,
    'hits', v_hits,
    'max', p_max,
    'window_start', v_window_start,
    'retry_after_seconds',
      greatest(0, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - now()))))
  );
end;
$$;

-- Service role only, exactly like the billing functions: a client that can
-- call its own rate limiter can exhaust it against someone else's key.
revoke execute on function public.check_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;

-- Housekeeping. No pg_cron dependency: the Phase 12B runbook calls this, and
-- stale rows are harmless until then (they are never read once their window
-- has passed).
create or replace function public.prune_rate_limit_hits(p_older_than interval default interval '2 days')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limit_hits where window_start < now() - p_older_than;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.prune_rate_limit_hits(interval)
  from public, anon, authenticated;
