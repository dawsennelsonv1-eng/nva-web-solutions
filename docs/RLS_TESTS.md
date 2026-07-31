# RLS_TESTS.md — Numbered Manual Proofs (Phase 2)

**Status:** every test below was executed against the shipped migrations in a
Postgres 16 instance with Supabase role/auth shims before delivery, including
the enumeration and cross-tenant attacks. This document lets you re-prove it
against your real project from Termux with nothing but `curl`, plus a
SQL-editor block for the role-impersonation and atomicity proofs.

**One required edit before Phase 6:** `seed.sql` inserts a placeholder admin
identity. In the SQL editor run:

```sql
update public.app_admins
   set email = 'YOUR-REAL-EMAIL@example.com',
       note  = 'admin'
 where email = 'admin@example.com';
```

---

## Part A — curl proofs (Termux, no node_modules)

Set these once per shell. Both values are on Dashboard → Settings → API:

```bash
export SUPA_URL="https://YOUR-PROJECT-REF.supabase.co"
export ANON="eyJ...your-anon-key..."
```

PostgREST error semantics used below: a **privilege** denial (the role has no
grant at all) returns HTTP 401 with `"code":"42501"`; a **policy** denial (the
grant exists but no row passes / WITH CHECK fails) returns HTTP 403 with
`"code":"42501"` and a row-level-security message. Both are the same verdict:
sealed.

### A1 — anon cannot read leads
```bash
curl -s "$SUPA_URL/rest/v1/leads?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```
**Expect:** `{"code":"42501", ... "permission denied for table leads"}`

### A2 — anon cannot read subscriptions
```bash
curl -s "$SUPA_URL/rest/v1/subscriptions?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```
**Expect:** `"permission denied for table subscriptions"`

### A3 — anon cannot enumerate prototypes (the slug/billing enumeration attack)
```bash
curl -s "$SUPA_URL/rest/v1/prototypes?select=slug,tier,subscription_status" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```
**Expect:** `"permission denied for table prototypes"` — this is the test that
justifies the RPC design; a `USING (status='live')` policy would have returned
every customer's slug here.

### A4 — anon cannot read usage_counters, payments, webhook_events, ai_jobs, prospects
```bash
for t in usage_counters payments webhook_events ai_jobs prospects brand_kits template_configs quote_configs demo_sessions; do
  echo "== $t"; curl -s "$SUPA_URL/rest/v1/$t?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" | head -c 120; echo
done
```
**Expect:** nine `"permission denied for table …"` responses.

### A5 — anon reads ACTIVE plans (the documented deviation; feeds /pricing per R-209)
```bash
curl -s "$SUPA_URL/rest/v1/plans?select=code,setup_fee_cents,monthly_cents,analysis_limit_per_month" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```
**Expect:** exactly two rows — `foundation` (50000 / 25000 / 25) and
`operator` (250000 / 50000 / null).

### A6 — anon resolves the live demo slug through the RPC
```bash
curl -s -X POST "$SUPA_URL/rest/v1/rpc/resolve_prototype_by_slug" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"p_slug":"demoramirezepoxy1"}'
```
**Expect:** a JSON payload with `prototype` (id, slug, vertical only — **no
tier, no subscription_status**), `brand_kit`, `template_config`, and
`quote_config` including the rules object with `"flake": 550`.

### A7 — unknown slug resolves to nothing
```bash
curl -s -X POST "$SUPA_URL/rest/v1/rpc/resolve_prototype_by_slug" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"p_slug":"nosuchslugatall99"}'
```
**Expect:** `null` (HTTP 200). Same result for any `draft` / `revoked` /
`expired` prototype — non-live is indistinguishable from nonexistent.

### A8 — anon inserts a lead against the LIVE prototype (the write that must always work)
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$SUPA_URL/rest/v1/leads" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"source":"prototype","prototype_id":"22222222-2222-4222-8222-222222222222","name":"RLS Test","phone":"+12145550100","email":"rls@example.com","timeline":"2 weeks"}'
```
**Expect:** `201`. (`Prefer: return=minimal` is mandatory — anon has INSERT
but not SELECT, so representation-returning inserts are refused by design.)

### A9 — degraded-lead consistency is a database rule, not an app convention
```bash
curl -s -X POST "$SUPA_URL/rest/v1/leads" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"source":"demo","name":"X","phone":"+12145550100","email":"x@example.com","was_degraded":true}'
```
**Expect:** check-constraint violation (`leads_check`): `was_degraded=true`
requires a `degraded_reason`, and vice versa.

### A10 — anon cannot touch the billing write path
```bash
curl -s -X POST "$SUPA_URL/rest/v1/rpc/increment_usage" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"p_prototype_id":"22222222-2222-4222-8222-222222222222","p_period_start":"2026-07-14T00:00:00Z","p_period_end":"2026-08-14T00:00:00Z","p_kind":"analysis","p_limit":25}'
```
**Expect:** `"permission denied for function increment_usage"` — EXECUTE is
granted to the service role only.

### A11 — anon inserts a quote, then reads it back ONLY via its public id
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$SUPA_URL/rest/v1/quotes" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"public_id":"rlstestquote0001","prototype_id":"22222222-2222-4222-8222-222222222222","vertical":"epoxy","inputs":{"sqft":480},"low_cents":300000,"high_cents":380000,"breakdown":{"lines":[]}}'

curl -s -X POST "$SUPA_URL/rest/v1/rpc/get_quote_by_public_id" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"p_public_id":"rlstestquote0001"}'

curl -s "$SUPA_URL/rest/v1/quotes?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" | head -c 100; echo
```
**Expect:** `201`, then the quote JSON (note: **no `photo_path`** in the
payload), then `"permission denied for table quotes"` for the table scan —
point lookup by secret works, enumeration does not.

### A12 — session limit is server-authoritative
```bash
curl -s -X POST "$SUPA_URL/rest/v1/rpc/touch_demo_session" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"p_session_id":"rls_sess_001","p_surface":"demo"}'
for i in 1 2 3 4; do
curl -s -X POST "$SUPA_URL/rest/v1/rpc/increment_session_analyses" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"p_session_id":"rls_sess_001","p_limit":3}'; echo
done
```
**Expect:** `1 2 3 3` — the fourth call returns 3 unchanged; there is no
anonymous write path to `analyses_used_this_session` at all.

---

## Part B — SQL-editor proofs (Dashboard → SQL Editor)

The editor runs as `postgres`, which may impersonate API roles — these mirror
the exact battery run before delivery.

### B1 — role impersonation: the sealed tables
```sql
set role anon;
select * from public.leads;          -- ERROR: permission denied for table leads
reset role;
```

### B2 — cross-tenant / draft write attack
```sql
-- as postgres: stage a draft prototype
insert into public.prototypes (id, prospect_id, slug, status, vertical)
values ('99999999-9999-4999-8999-999999999999',
        '11111111-1111-4111-8111-111111111111',
        'draftsecretslug99','draft','epoxy')
on conflict (id) do nothing;

set role anon;
insert into public.leads (source, prototype_id, name, phone, email)
values ('prototype','99999999-9999-4999-8999-999999999999','X','+1','x@example.com');
-- ERROR: new row violates row-level security policy for table "leads"
reset role;
```

### B3 — the atomic increment and the cap edge
```sql
select analyses_used, cap_reached_at
  from public.increment_usage('22222222-2222-4222-8222-222222222222',
       '2026-07-14T00:00:00Z','2026-08-14T00:00:00Z','analysis',25);
-- run repeatedly: the counter climbs by exactly 1 each time, no matter how
-- many tabs run it concurrently; cap_reached_at flips non-null exactly once,
-- on the call that reaches 25. 'lead' kind keeps counting past any cap.
```

### B4 — webhook idempotency guard
```sql
insert into public.webhook_events (provider, provider_event_id, payload)
values ('stripe','evt_rls_test','{}');
insert into public.webhook_events (provider, provider_event_id, payload)
values ('stripe','evt_rls_test','{"replay":true}');
-- ERROR: duplicate key value violates unique constraint
--        "webhook_events_provider_event_id_key"  (SQLSTATE 23505)
-- This error IS the double-processing prevention: the Phase 5.5 handler
-- inserts first, and on 23505 returns 2xx without touching entitlements.
```

### B5 — admin identity
```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"email":"admin@example.com","role":"authenticated"}';
select count(*) from public.leads;        -- visible (use your real email after the update)
select count(*) from public.prototypes;   -- visible
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"email":"stranger@example.com","role":"authenticated"}';
select count(*) from public.leads;        -- 0: authenticated ≠ admin sees nothing
rollback;
```

---

## What was deliberately NOT granted (the negative space, for Phase 12A)

- No anon SELECT policy exists on any tenant table. Point lookups happen only
  through `resolve_prototype_by_slug` and `get_quote_by_public_id`.
- No anon UPDATE or DELETE exists anywhere, including on rows anon inserted.
- `increment_usage` / `get_usage` are EXECUTE-revoked from anon and
  authenticated: billing writes are service-role only.
- `floor-photos` has no anon storage policies in either direction; uploads
  and reads are service-role and signed-URL only.
