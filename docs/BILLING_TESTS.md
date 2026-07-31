# BILLING_TESTS.md — the manual test script, runnable from a phone

**Everything here runs from Termux + the Supabase SQL editor + the Stripe
dashboard on your phone.** No local build, no node_modules. Each test states
the expected system state afterwards, so you can verify with a SQL query
rather than by trusting a screen.

Run the whole script in **Stripe test mode** before the ship gate.

---

## 0. Before anything works

### 0.1 Required env vars (Vercel → Settings → Environment Variables)

| Var | Value | Notes |
|---|---|---|
| `PAYMENT_PROVIDER` | `stripe` | `manual` or `stub` also valid; **`stub` is refused in production** |
| `STRIPE_SECRET_KEY` | `sk_test_…` | test mode first |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | from the endpoint you create in 0.3 |
| `STRIPE_PRICE_FOUNDATION_SETUP` | `price_…` | one-time price, $500 |
| `STRIPE_PRICE_FOUNDATION_MONTHLY` | `price_…` | recurring monthly, $250 |
| `STRIPE_PRICE_OPERATOR_SETUP` | `price_…` | one-time, $2,500 |
| `STRIPE_PRICE_OPERATOR_MONTHLY` | `price_…` | recurring monthly, $500 |
| `NEXT_PUBLIC_SITE_URL` | `https://…` | no trailing slash — checkout URLs are built from it |
| `CRON_SECRET` | any long random string | Vercel sends it to `/api/cron/dunning` |
| `RESEND_API_KEY` + `EMAIL_FROM` | | dunning and cap emails are silently skipped without these |
| `ADMIN_NOTIFY_EMAIL` | your inbox | receives the HOT UPSELL alert |
| `ADMIN_NOTIFY_PHONE` | your number | appears in the day-7 dunning copy |

Optional: `STRIPE_API_VERSION` (defaults `2024-06-20`),
`STRIPE_SETUP_FEE_MODE` (see 0.4), `ADMIN_NOTIFY_NAME`.

### 0.2 What must exist in the partner's Stripe account

1. **Four Prices**, on two Products. Setup prices are **one-time**; monthly
   prices are **recurring / monthly**. Currency USD on all four.
2. **Billing → Customer portal enabled**, if you want the card-update links
   in the dunning emails to work. Without it, those links land on
   `/admin/billing` and you update the card for him by hand.
3. **Payments → capture method: automatic.**
4. The account must be able to accept USD from US cards. It is a Canadian
   entity, so confirm this before the first real charge.

### 0.3 Webhook endpoint

Stripe dashboard → Developers → Webhooks → Add endpoint:

```
https://YOUR-DOMAIN/api/webhooks/stripe
```

**Enable exactly these six events.** Anything else is stored and ignored:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.

**Smoke test the endpoint before anything else:**

```bash
# Expect 400 and {"error":"bad_signature"} — proves verification is live.
curl -s -X POST https://YOUR-DOMAIN/api/webhooks/stripe \
  -H 'content-type: application/json' \
  -d '{"id":"evt_fake","type":"invoice.paid"}'

# Expect 405 — proves the route exists and rejects browsers.
curl -s https://YOUR-DOMAIN/api/webhooks/stripe
```

If the first returns 200, **stop** — the endpoint is granting entitlements to
unsigned requests.

### 0.4 If the first checkout errors on the setup line item

Stripe accepts a one-time price in `line_items` in subscription mode on
current API versions, but this could not be verified against a live account
from the build container. If checkout returns an error mentioning the setup
price, set:

```
STRIPE_SETUP_FEE_MODE=invoice_item
```

and redeploy. That switches to `subscription_data.add_invoice_items`, the
documented alternative, with no code change.

---

## 1. Successful checkout

**Do:** open `/pricing` → start checkout → pay with `4242 4242 4242 4242`,
any future expiry, any CVC.

**Expected:**
- You land on `/checkout/return`, which shows **"One moment — confirming
  your payment"** first. It must **not** show success immediately — that
  would mean it is trusting the redirect.
- Within a few seconds it flips to **"You're set up."**

**Verify in SQL:**

```sql
select s.status, s.plan_code, s.provider, s.current_period_end,
       p.kind, p.amount_cents, p.status as payment_status
from public.subscriptions s
join public.payments p on p.subscription_id = s.id
order by s.created_at desc limit 5;
```

Expect `status='active'`, `provider='stripe'`, one `kind='setup'` payment
with `amount_cents` = setup + first month combined (they are one charge —
see `lib/payments/stripe/index.ts`), `payment_status='succeeded'`.

```sql
select slug, tier, subscription_status from public.prototypes
where id = 'THE-PROTOTYPE-UUID';
```

Expect the mirror to read `active`.

---

## 2. Duplicate webhook delivery

**Do:** Stripe dashboard → Webhooks → your endpoint → the
`checkout.session.completed` event → **Resend**.

**Expected:** HTTP 200, and **nothing changes**.

```sql
select provider_event_id, processed_at, processing_error
from public.webhook_events order by received_at desc limit 5;

-- Must be exactly ONE row per event id, and exactly one setup payment:
select count(*) from public.payments where kind = 'setup';
```

If a second payment row appeared, the idempotency guard is broken.

---

## 3. Out-of-order webhook

**Do:** in the Stripe dashboard, resend an **older**
`customer.subscription.updated` event after a newer one has already landed.

**Expected:** 200, and the subscription status does **not** regress.

```sql
select status, last_provider_event_at from public.subscriptions
where id = 'THE-SUBSCRIPTION-UUID';
```

`last_provider_event_at` must still hold the **newer** timestamp. This is the
guard added by `0006_billing_ops.sql`.

---

## 4. Failed recurring payment → day 0

**Do:** Stripe → Customers → your test customer → update the card to
`4000 0000 0000 0341` (attaches fine, fails on charge). Then Subscriptions →
the subscription → **Actions → Advance clock** (test clocks) or wait for the
next invoice.

**Expected:**

```sql
select status, grace_ends_at from public.subscriptions where id = '…';
-- status='past_due', grace_ends_at = failure date + 10 days

select kind, status, failure_reason from public.payments
where subscription_id = '…' order by occurred_at desc limit 1;
-- kind='recurring', status='failed'
```

**Critically — the site must still work.** Open `/s/[slug]` and confirm the
widget still gives instant prices. `past_due` is entitling by design.

---

## 5. The full 10-day dunning timeline

The cron runs daily at 15:00 UTC (`vercel.json`). To walk it faster, invoke
it by hand once per simulated day:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://YOUR-DOMAIN/api/cron/dunning
```

To move the clock, backdate `grace_ends_at` — the whole timeline is derived
from it, so this is the only value you need to change:

```sql
-- Simulate "it is now day 5 of dunning":
update public.subscriptions
   set grace_ends_at = now() + interval '5 days'
 where id = 'THE-SUBSCRIPTION-UUID';
```

Then run the cron and check:

```sql
select day_number, channel, sent_at, delivery_status
from public.dunning_events
where subscription_id = 'THE-SUBSCRIPTION-UUID'
order by day_number, channel;
```

**Expected across the whole walk:** rows for days 1, 3, 5, 7, 10 — each
exactly once. Days 7 and 10 also get a `channel='sms'` row with
`delivery_status='skipped_not_configured'` until an SMS provider is wired.

**Expected at day 10:**

```sql
select status from public.subscriptions where id = '…';  -- 'suspended'
```

**Then the thing that actually matters — open `/s/[slug]` on your phone:**
- The site loads. It does **not** 404 and does **not** error.
- The widget shows the degraded flow: "Tell us about your floor".
- The contractor's phone number is present and tappable.
- The words *limit, quota, cap, plan, upgrade, subscription, payment,
  unavailable, temporarily, sorry, unfortunately, error* appear **nowhere**.
- Submitting the form still captures a lead:

```sql
select name, was_degraded, degraded_reason from public.leads
order by created_at desc limit 1;
-- was_degraded=true, degraded_reason='subscription_suspended'
```

**If lead capture failed here, that is a Critical incident, not a test
failure.** It is the one unforgivable outcome.

**Sunday check:** run the cron on a Sunday. No `dunning_events` rows should
be created, but a day-10 suspension still applies — the state change is not
a message.

---

## 6. Recovery

**Do:** update the card back to `4242…` and either wait for Stripe's retry or
trigger it from the dashboard.

**Expected:**

```sql
select status, grace_ends_at from public.subscriptions where id = '…';
-- status='active', grace_ends_at=null

select count(*) from public.dunning_events where subscription_id = '…';
-- 0 — the timeline is cleared so a future failure starts fresh
```

Instant pricing returns on `/s/[slug]` within one request. No deploy, no
manual step.

---

## 7. Cap exhaustion

**Do:** force the counter rather than running 25 real analyses:

```sql
-- Sit at 19 of 25, then run ONE real photo analysis on /s/[slug]
update public.usage_counters
   set analyses_used = 19, warned_at_20 = null, cap_reached_at = null
 where prototype_id = 'THE-PROTOTYPE-UUID'
   and period_start = 'THE-PERIOD-START';
```

**Expected at 20:** the early-warning email arrives, subject *"You're at 20 of
25 photo analyses this month"*, and `warned_at_20` is stamped.

```sql
-- Now sit at 24 and run one more real analysis
update public.usage_counters set analyses_used = 24 where …;
```

**Expected at 25:**
- Contractor email: *"25 quotes this month — that's the cap, and it's a good
  problem"*.
- Your inbox: **HOT UPSELL** alert.
- `cap_reached_at` is set, exactly once.
- `/s/[slug]` enters degraded mode; lead capture still works.
- `/admin/billing` shows him at the **top** of "closest to cap".

Run one more analysis and confirm `analyses_used` does **not** exceed 25 and
`cap_reached_at` does **not** move.

**Also confirm the cap counts the right thing:** move the slider, change
finishes, re-quote ten times. `analyses_used` must not change — only a
successful vision call counts.

---

## 8. Upgrade mid-period

**Do:** with the contractor at the cap, run checkout again for Operator.

**Expected:** `plan_code='operator'`, `analysis_limit_per_month` resolves to
`null`, and `/s/[slug]` leaves degraded mode immediately on the next request.
Usage counters are **not** reset — the cap simply no longer binds.

---

## 9. Refund (the 30-day guarantee)

**Do:** Stripe dashboard → the payment → **Refund**.

**Expected:**

```sql
select kind, amount_cents, status from public.payments
where subscription_id = '…' order by occurred_at desc limit 1;
-- kind='refund', amount_cents NEGATIVE, status='refunded'
```

The negative amount is deliberate: `select sum(amount_cents) from payments`
gives net revenue with no special case. `/admin/billing` shows it under
**Refunded** and counts it honestly against MRR.

---

## 10. The stub provider is refused in production

**Do:** set `PAYMENT_PROVIDER=stub` in the production environment.

**Expected:** the Vercel log shows
`[payments] PAYMENT_PROVIDER=stub is refused in production; using stripe.`
and checkout behaves as Stripe. A fake processor that reports success is the
most dangerous possible misconfiguration in this codebase.

**Then set it back.**

---

## 11. What is already proven by automated tests

Run in Termux with `npm test` (no build needed):

- **Webhook signature verification** — 12 tests including tampered payload,
  wrong secret, replayed timestamp, malformed header, and secret rotation.
- **The dunning timeline** — 11 tests including the full 1/3/5/7/10 walk,
  catch-up after a missed cron, the Sunday rule, and copy invariants (every
  message says the site is up; no message insults).
- **Billing period rollover** — 8 tests including the late-webhook case.
- **Pricing engine** — 19 tests.
- **Widget port wiring** — 9 tests.

These do not need Stripe, a database, or a deploy.
