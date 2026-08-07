-- ============================================================================
-- 0017_implementation_requests.sql — CONTRACTORS ASKING US TO BUILD (Phase 16B-2)
--
-- ============================================================================
-- WHY A NEW TABLE AND NOT ONE OF THE TWO THAT ALREADY EXIST
-- ============================================================================
--
-- There are already two capture paths, and this is neither of them:
--
--   leads                 A HOMEOWNER who used a contractor's widget. Name,
--                         phone, timeline, a quote, sometimes a render. The
--                         person on the other end is the contractor.
--
--   concierge_requests    A contractor whose TRADE IS NOT ON THE QUEUE. Trade,
--                         city, what he wants priced, email. It answers one
--                         question — which tool should be built next — and it
--                         is a demand signal, not a sale.
--
-- This table answers a third question: a contractor who has seen a tool and
-- wants it running on his own site, or who has a problem and wants something
-- built for it. He is a customer, not a vote and not a homeowner.
--
-- Forcing him into `leads` would put a business with a website and a customer
-- profile into a table whose columns are `timeline` and `quote_id`, and would
-- corrupt every count of "how many leads did the widget capture" — the one
-- number the product is judged on. Forcing him into `concierge_requests` would
-- mix people asking for a tool that exists with people voting for one that does
-- not, and lose the distinction that decides what to do next.
--
-- ============================================================================
-- ONE TABLE FOR BOTH FORMS, SPLIT BY `kind`
-- ============================================================================
--
-- Two surfaces write here and they are deliberately NOT two tables:
--
--   tool_install    from a tool page. "Get this on my site." He knows what he
--                   wants; tool_id says which.
--   custom_build    from the homepage. "Something in my business is slow or
--                   expensive — see if you can build something for it."
--                   tool_id is null and `description` carries the problem.
--
-- They collect almost the same facts and they arrive in one inbox to be worked
-- the same way. Splitting them would mean two tables, two actions, two admin
-- screens and two places to forget to look.
--
-- ============================================================================
-- EVERY FIELD BUT FOUR IS NULLABLE, ON PURPOSE
-- ============================================================================
--
-- Required: kind, name, email, description. That is the minimum that makes a
-- row worth having — who, how to reach them, and what they want.
--
-- Everything else is optional because this form is competing with the reader
-- closing the tab. A contractor on a phone at the end of a working day will
-- abandon a form that demands a website URL he does not have and a customer
-- profile he has never written down. A row with a name, an email and two
-- sentences about a problem is worth infinitely more than a perfect row that
-- was never submitted.
--
-- No enum for business_field, for the same reason 0015 made leads.trade free
-- text: the point of asking is to hear the trades that are NOT in the
-- catalogue, and an enum silently discards the twentieth answer, which is
-- precisely the signal that decides what gets built.
-- ============================================================================

create table public.implementation_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  kind text not null check (kind in ('tool_install', 'custom_build')),

  -- Which tool page he came from. Free text rather than a foreign key: the
  -- catalogue lives in TypeScript (lib/queue/tools.ts), not in a table, so a
  -- reference here could not be enforced and would only look enforced.
  tool_id text check (tool_id is null or char_length(tool_id) between 1 and 60),

  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 160),
  phone text check (phone is null or char_length(phone) between 7 and 40),

  business_name text check (business_name is null or char_length(business_name) between 2 and 160),
  business_field text check (business_field is null or char_length(business_field) between 2 and 80),

  -- Stored as typed. NOT normalised to a canonical URL here: a contractor
  -- writes "joesfloors.com" and a database that rejects it has thrown away a
  -- customer to enforce a scheme. Normalisation, if it is ever wanted, belongs
  -- in the admin view where a human can see what was meant.
  website_url text check (website_url is null or char_length(website_url) between 3 and 300),

  -- "Who are your customers" — homeowners, builders, property managers.
  customer_type text check (customer_type is null or char_length(customer_type) between 2 and 200),

  -- The business description (tool_install) or the problem (custom_build).
  -- Generous ceiling: somebody describing what is broken in his week should not
  -- hit a limit mid-sentence, and this is the field that decides whether the
  -- request is actionable.
  description text not null check (char_length(description) between 10 and 4000),

  -- Which page it came from, for attribution. Not user-supplied.
  source text check (source is null or char_length(source) between 1 and 120),

  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),

  -- Bot signals and notification outcomes, same shape as leads.delivery_status.
  delivery_status jsonb not null default '{}'::jsonb
);

-- The working query is "what is new, most recent first". Partial, because a
-- closed request is never in that list and there will eventually be more of
-- those than open ones.
create index implementation_requests_new_idx
  on public.implementation_requests (created_at desc)
  where status = 'new';

create index implementation_requests_kind_idx
  on public.implementation_requests (kind, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS
--
-- SEALED BY DEFAULT, then opened exactly twice — the same posture 0003 took for
-- leads, and for the same reason: this table holds a business owner's name,
-- email, phone and a description of what is wrong with his company. That is
-- commercially sensitive in a way a homeowner's garage size is not.
--
--   INSERT for anon   The forms are public and anonymous by definition. There
--                     is no account at the point somebody asks for this. The
--                     char_length checks above are what stop that being an
--                     unbounded text sink; the server action's rate limit is
--                     what stops it being a flood.
--
--   SELECT for admin  Only. There is no member-level read policy, deliberately.
--                     Unlike `leads`, these rows do not belong to a company —
--                     they are addressed TO us, and a contractor who joins
--                     later must never be able to read the enquiries of the
--                     other businesses that asked before him.
--
-- No UPDATE or DELETE policy for anon or authenticated: `status` moves only
-- through the service role from an admin action. A public form that can also
-- close its own tickets is not a form, it is a hole.
-- ----------------------------------------------------------------------------

alter table public.implementation_requests enable row level security;

create policy implementation_requests_anon_insert
  on public.implementation_requests
  for insert
  to anon
  with check (true);

create policy implementation_requests_admin_read
  on public.implementation_requests
  for select
  to authenticated
  using (public.is_admin());
