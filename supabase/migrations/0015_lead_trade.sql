-- ============================================================================
-- 0015_lead_trade.sql — TRADE ON LEADS (Phase 14)
--
-- THE GAP THIS CLOSES. Phase 13D's audit found that `leads` records name,
-- phone, email and timeline, and nothing that says what work the person wants.
-- For a homeowner lead that is fine — the trade is implied by the widget he
-- used, and the quote row carries the vertical.
--
-- It is not fine for a CONTRACTOR lead. When a roofer fills in a general
-- enquiry on the marketing site, the single most useful fact about him is that
-- he is a roofer, and today there is nowhere to put it. It ends up in `notes`,
-- as prose, where nothing can count it — which means the question "which trade
-- is asking for this most" is unanswerable by the one table that has the data.
--
-- The concierge already collects trade properly into concierge_requests. This
-- makes the lead table capable of the same thing, so a general capture form
-- does not have to route through the concierge to record it.
--
-- ============================================================================
-- NULLABLE, AND FREE TEXT. BOTH ON PURPOSE.
-- ============================================================================
--
-- NULLABLE because every lead already in the table has no trade and always
-- will. Backfilling a guess from the quote's vertical would be inventing data:
-- a homeowner who quoted a garage floor is not "an epoxy contractor", and a row
-- that says he is would be wrong in a way nothing downstream could detect.
--
-- FREE TEXT rather than an enum or a foreign key to lib/queue/tools.ts,
-- because the whole point of asking is to hear trades that are NOT in the
-- catalogue. An enum would force every answer into one of nineteen boxes and
-- silently discard the twentieth — which is precisely the signal that decides
-- what gets built next. The catalogue's keyword matcher can map free text onto
-- a tool when it recognises one; when it does not, the raw words survive.
--
-- Length-bounded so it stays a trade rather than becoming a second notes field.
-- ============================================================================

alter table public.leads
  add column trade text check (trade is null or char_length(trade) between 2 and 80);

-- Answers "which trades are asking" without a sequential scan once the table
-- grows. Partial, because the null rows are the historical ones and nobody
-- will ever group by them.
create index leads_trade_idx on public.leads (trade) where trade is not null;

-- ----------------------------------------------------------------------------
-- RLS: nothing to add.
--
-- 0003 sealed this table and 0014 added the member policies. A column inherits
-- the row's policies — there is no column-level RLS to write, and the existing
-- leads_member_read continues to decide who sees the row this column sits on.
--
-- anon retains INSERT on leads (0003) and can therefore write this column,
-- which is correct: the public capture form is anonymous by definition. The
-- length check above is what stops that being an unbounded text sink.
-- ----------------------------------------------------------------------------
