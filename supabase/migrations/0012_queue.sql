-- ============================================================================
-- 0012_queue.sql — Phase 13C. The build queue's real data.
--
-- IDEMPOTENT, like every migration in this project: on a phone you will run it
-- twice, and the second run must be a no-op rather than an error wall.
--
-- NOTHING IN THIS FILE SEEDS A ROW. Not one vote, not one log entry, not one
-- completed month, not even "for demonstration". The queue page derives rank
-- from these tables, so a seeded row would not be a placeholder — it would be
-- a fabricated public claim about demand. Every table below starts empty and
-- the page renders honest empty states until real data arrives.
--
-- RLS: enabled with NO policies on every table. That denies anon and
-- authenticated outright; the service role bypasses RLS, and every read and
-- write goes through server code holding the service key. Votes are written by
-- a server action that hashes the voter, so the browser never touches these
-- tables directly and cannot enumerate who voted for what.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- tool_votes — one row per person per tool.
--
-- voter_hash is sha256(salt + ip + user-agent) computed server-side. It is a
-- fingerprint, not an identity: it cannot be reversed to an IP, it is not
-- joined to anything, and it exists solely to make the unique constraint below
-- meaningful. Trivial repeat voting is stopped without an account, which is the
-- requirement; a determined person with a VPN can still vote twice, and no
-- accountless scheme prevents that. Rank is honest to the precision of the
-- data, not to the precision of a claim.
--
-- trade and city are the actual product of this page. They are what decide
-- what gets built, which is why voting costs them rather than costing an email.
-- ----------------------------------------------------------------------------
create table if not exists public.tool_votes (
  id           uuid primary key default gen_random_uuid(),
  tool_id      text        not null,
  voter_hash   text        not null,
  trade        text        not null,
  city         text        not null,
  -- Optional, and buys exactly one thing: a notification when the tool ships.
  email        text,
  created_at   timestamptz not null default now(),
  constraint tool_votes_one_per_voter unique (tool_id, voter_hash)
);

create index if not exists tool_votes_tool_idx    on public.tool_votes (tool_id);
create index if not exists tool_votes_trade_idx   on public.tool_votes (trade);
create index if not exists tool_votes_city_idx    on public.tool_votes (city);
create index if not exists tool_votes_created_idx on public.tool_votes (created_at desc);

alter table public.tool_votes enable row level security;

-- ----------------------------------------------------------------------------
-- build_log — timestamped one-line entries from real deploys.
--
-- A contractor who checks back in three weeks and sees this has moved knows
-- somebody is still here. That is worth more than any badge, and it costs
-- nothing when you commit daily.
--
-- MAINTENANCE MECHANISM: an admin form at /admin/queue. One text field, one
-- optional tool, one button, on a page you are already signed into. Under a
-- minute from a phone.
--
-- occurred_on is a DATE, not a timestamp, and is entered rather than defaulted,
-- because the entry describes when the work shipped — which is not always when
-- you got around to writing it down. created_at records the latter separately.
-- ----------------------------------------------------------------------------
create table if not exists public.build_log (
  id           uuid primary key default gen_random_uuid(),
  occurred_on  date        not null,
  -- Nullable: platform work belongs in the log too and is not one tool's.
  tool_id      text,
  entry        text        not null check (char_length(entry) between 3 and 160),
  created_at   timestamptz not null default now()
);

create index if not exists build_log_occurred_idx on public.build_log (occurred_on desc);

alter table public.build_log enable row level security;

-- ----------------------------------------------------------------------------
-- build_months — the public commitment, and its receipts.
--
-- One tool enters build per month. This table records which one, whether it
-- got there by winning the vote, and whether it actually shipped. The moment
-- one row exists with won_by_vote = true and shipped_on set, the queue page
-- stops being a promise and becomes evidence.
--
-- month is 'YYYY-MM' text rather than a date, because it identifies a month
-- rather than a day and the unique constraint should read that way.
-- ----------------------------------------------------------------------------
create table if not exists public.build_months (
  id                uuid primary key default gen_random_uuid(),
  month             text        not null unique
                      check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  tool_id           text        not null,
  won_by_vote       boolean     not null default false,
  entered_build_on  date,
  shipped_on        date,
  created_at        timestamptz not null default now()
);

create index if not exists build_months_month_idx on public.build_months (month desc);

alter table public.build_months enable row level security;

-- ----------------------------------------------------------------------------
-- concierge_requests — a visitor whose trade is not in the catalogue at all.
--
-- ⚠ DEVIATION, FLAGGED IN THE PHASE RESPONSE. Phase 13C requires these to land
-- in the existing leads table via the existing lead capture path. Neither the
-- leads schema nor app/actions/lead.ts was available when this migration was
-- written, and guessing at either would either fail the build or silently drop
-- a real lead. This table captures the request so nothing is lost.
--
-- lead_id is the seam: once the leads path is wired in, the action mirrors the
-- row into leads and writes the id back here. Nothing needs to be migrated,
-- and no second capture path survives.
-- ----------------------------------------------------------------------------
create table if not exists public.concierge_requests (
  id           uuid primary key default gen_random_uuid(),
  trade        text        not null,
  city         text        not null,
  -- What he wants priced, in his own words. The most valuable field here.
  wants        text,
  email        text,
  -- Set once the row has been mirrored into public.leads.
  lead_id      uuid,
  created_at   timestamptz not null default now()
);

create index if not exists concierge_requests_created_idx
  on public.concierge_requests (created_at desc);
create index if not exists concierge_requests_unmirrored_idx
  on public.concierge_requests (created_at desc) where lead_id is null;

alter table public.concierge_requests enable row level security;

-- ----------------------------------------------------------------------------
-- tool_vote_counts — one aggregate the queue page reads on every render.
--
-- A view rather than counting in application code: the page ranks nineteen
-- tools on every request, and pulling every vote row across the wire to count
-- them in JavaScript stops being reasonable the first time this works.
--
-- security_invoker is off by default on views, so this runs as its owner and
-- the underlying RLS still gates direct access. Only server code with the
-- service key reads it.
-- ----------------------------------------------------------------------------
create or replace view public.tool_vote_counts as
  select tool_id,
         count(*)::bigint       as votes,
         max(created_at)        as last_vote_at
    from public.tool_votes
   group by tool_id;
