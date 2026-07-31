# DATA_MODEL.md — Entities, Fields, Relationships

**Status:** decided in Phase 0. Canonical. Phase 2 translates this into SQL. No SQL appears here by design — Phase 2 owns the DDL, this document owns the meaning.

---

## 0. THE SHAPE OF THE THING

A **prospect** is a contractor business, whether or not he has paid. A **prototype** is one staged branded environment belonging to a prospect, addressed by an unguessable slug. A prospect can in principle have more than one prototype (a restage after a lost call), but only one is `live` at a time.

Everything a homeowner touches hangs off a prototype: the brand kit that colours it, the template config that arranges it, the quote config that prices it. Everything commercial hangs off the prospect: subscription, payments, dunning.

**Usage counters hang off the prototype, not the subscription**, because the thing being metered is a site receiving traffic, and because a subscription that lapses and resumes must not lose its usage history.

**The tenancy rule:** every read that touches prospect-owned data is scoped by `prototype_id` or `prospect_id` through one helper. There is no second way to fetch tenant data.

---

## 1. PROSPECTS

The contractor business. Created by the admin before any pitch.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `business_name` | text, required | As he says it on the phone. |
| `contact_name` | text | |
| `phone` | text | E.164. Used in degraded-mode copy on his live site. |
| `email` | text | |
| `city` | text | Drives market-specific copy. |
| `state` | text | |
| `website_url` | text | The site being qualified. |
| `vertical` | text, fk → verticals registry | `epoxy` at launch. Registry id, not an enum — verticals are code-registered. |
| `has_google_ads` | boolean, nullable | Qualification. Nullable means unassessed, which is different from false. |
| `google_review_count` | integer, nullable | Qualification. |
| `estimated_monthly_traffic` | integer, nullable | Qualification. |
| `qualification_score` | integer, nullable | Computed from OFFER.md §7. Stored, not derived on read, so a later scoring change doesn't silently rewrite history. |
| `qualification_notes` | text | Why I declined, or what he said. |
| `status` | enum | `new` · `qualified` · `declined` · `pitched` · `customer` · `churned` |
| `created_at` / `updated_at` | timestamptz | |

**Relationships:** one prospect → many prototypes, many subscriptions (historically), many payments.

---

## 2. PROTOTYPES

One staged branded environment. The unit that gets metered, branded, and sold.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `prospect_id` | uuid, fk → prospects | |
| `slug` | text, unique, required | Unguessable. Entropy justified in Phase 1. This is the public address. |
| `status` | enum | `draft` · `live` · `expired` · `revoked`. Only `live` resolves publicly. |
| `expires_at` | timestamptz, nullable | Null means no expiry. |
| `tier` | text, fk → plans.code, nullable | Null until purchase. |
| `subscription_status` | enum, nullable | Denormalised mirror of the active subscription's status, for fast public reads. **Written only by the webhook path.** Never authoritative — `check.ts` resolves the real answer. |
| `vertical` | text | Inherited from prospect at creation, then independent. |
| `created_at` / `updated_at` | timestamptz | |

**Why `subscription_status` is denormalised.** `/s/[slug]` is read on every homeowner page load and must resolve in one query. Joining to subscriptions on every anonymous request is a cost and a wider RLS surface. The mirror is a cache; the authority is the subscription row.

---

## 3. BRAND_KITS

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `prototype_id` | uuid, fk, unique | One kit per prototype. |
| `logo_path` | text | Supabase Storage path. |
| `primary_hex` / `secondary_hex` / `accent_hex` | text | Extracted or manual. |
| `derived_tokens` | jsonb | The full expanded token set including the Dark Industrial variant. Written by Phase 7. |
| `pinned_tokens` | jsonb | Manual overrides that survive re-extraction. |
| `extraction_source` | enum | `client_canvas` · `server` · `manual` |
| `created_at` / `updated_at` | timestamptz | |

---

## 4. TEMPLATE_CONFIGS

The arrangement, separate from the colour.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `prototype_id` | uuid, fk, unique | |
| `template_id` | text | Layout variant. |
| `typography_id` | text | Pairing from the preset list. |
| `button_style_id` | text | |
| `style_variant` | enum | `light` · `dark-industrial` — the default the page loads in. |
| `copy_overrides` | jsonb | Per-section text replacing vertical defaults. |
| `created_at` / `updated_at` | timestamptz | |

---

## 5. QUOTE_CONFIGS

**The contractor's pricing rules. The single source of every number in a quote.**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `prototype_id` | uuid, fk | |
| `vertical` | text | Rules are vertical-shaped; the schema differs per vertical. |
| `rules` | jsonb | Base rates per finish tier, prep rates, condition modifiers, minimum job value, mobilisation fee. Shape validated by the vertical's pricing rule schema. |
| `finish_catalogue` | jsonb | Available finishes with display names, colour swatches, tier mapping. |
| `sqft_min` / `sqft_max` | integer | Slider bounds. |
| `range_spread_pct` | numeric | How wide the low-to-high band is. A quote is always a range. |
| `created_at` / `updated_at` | timestamptz | |

**Rule:** pricing code reads `rules` and nothing else. A number that appears in a `.ts` file and affects a price is a defect (R-113).

---

## 6. QUOTES

A completed calculation, persisted so `/q/[quoteId]` can render it later.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | Internal. |
| `public_id` | text, unique | Unguessable. This is what appears in the URL. Never the uuid. |
| `prototype_id` | uuid, fk, nullable | Null for `/demo` quotes, which belong to no contractor. |
| `vertical` | text | |
| `inputs` | jsonb | Surface type, finish, sqft, condition flags, and whether each came from vision or from the user. |
| `low_cents` / `high_cents` | integer | The range. Cents, integer, always. |
| `breakdown` | jsonb | Itemised lines and which modifiers applied. |
| `photo_path` | text, nullable | Storage path. Null when no photo was used. |
| `used_ai_analysis` | boolean | Whether a vision call contributed. Distinct from `was_capped`. |
| `was_capped` | boolean | True when this quote was produced while the prototype was at or past its cap. |
| `session_id` | text | Links to `demo_sessions`. |
| `created_at` | timestamptz | |

---

## 7. LEADS

**The most important table in the system. A row here is the thing the contractor is paying for.**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `source` | enum | `public_hub` · `demo` · `prototype` · `direct` |
| `prototype_id` | uuid, fk, **nullable** | Null for `/demo` leads, which are *my* inbound prospects, not a contractor's customers. |
| `quote_id` | uuid, fk, **nullable** | **Nullable by design.** In degraded mode a lead exists with no quote row, because no price was calculated. Any code that assumes this is present is a defect. |
| `name` | text, required | |
| `phone` | text, required | |
| `email` | text, required | |
| `timeline` | text | When they want the work done. |
| `was_degraded` | boolean, not null, default false | This lead arrived without an instant quote. |
| `degraded_reason` | enum, nullable | `cap_reached` · `subscription_suspended` · `ai_unavailable`. Non-null if and only if `was_degraded` is true. |
| `routed_at` | timestamptz, nullable | When notification dispatch was attempted. |
| `delivery_status` | jsonb | Per-channel outcome: `{admin_email: 'sent', contractor_email: 'failed', sms: 'skipped'}`. A failure here never fails the lead write. |
| `status` | enum | `new` · `contacted` · `qualified` · `dead`. Admin pipeline. |
| `notes` | text | |
| `created_at` | timestamptz | |

**Why `degraded_reason` is separated from `was_degraded`.** The three reasons need different handling and different tone. `cap_reached` is an upsell. `subscription_suspended` is a payment reminder. `ai_unavailable` is our fault and the contractor is never told about it in a way that implies otherwise. Collapsing them into one boolean would make it impossible to get that tone right.

---

## 8. DEMO_SESSIONS

Anonymous funnel tracking, and the enforcement point for the per-session analysis limit.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `session_id` | text, unique | Anonymous, client-generated, no PII. |
| `prototype_id` | uuid, fk, nullable | |
| `surface` | enum | Which of the four surfaces the session occurred on. |
| `step_progression` | jsonb | Ordered steps reached with timestamps. |
| `abandoned_at` | timestamptz, nullable | |
| `abandoned_step` | text, nullable | **The single most valuable field for post-launch decisions.** Where people leave decides what gets built after the ship gate. |
| `analyses_used_this_session` | integer, default 0 | Enforces the 3-per-session limit. Server-authoritative. |
| `created_at` / `updated_at` | timestamptz | |

**Security note for Phase 12A:** a client that can reset `analyses_used_this_session` by minting a fresh `session_id` defeats the session limit. Phase 3 must pair it with a per-IP limit so the session counter is a fairness mechanism, not the only defence.

---

## 9. ANALYTICS_EVENTS

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `event_name` | text | From the EVENTS.md taxonomy. Free text at the database level, typed at the emitter. |
| `session_id` | text | |
| `prototype_id` | uuid, fk, nullable | |
| `properties` | jsonb | |
| `occurred_at` | timestamptz | |

---

## 10. AI_JOBS

Every paid model call, for cost accounting and abuse detection.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `prototype_id` | uuid, fk, nullable | |
| `job_type` | text | `vision_analysis` at launch; Phase 10 adds copy, restyle, pricing-adjust. |
| `provider` | text | |
| `model` | text | |
| `input_tokens` / `output_tokens` | integer | |
| `cost_cents` | integer | Computed at write time from the provider's rate. Stored, not derived — rates change. |
| `status` | enum | `succeeded` · `failed` · `invalid_output` |
| `error` | text, nullable | |
| `created_at` | timestamptz | |

**`status` matters commercially:** only `succeeded` may correspond to a quota decrement. `failed` and `invalid_output` must not (R-613).

---

## 11. STYLE_PRESETS

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `name` | text | |
| `template_id` / `typography_id` / `button_style_id` / `style_variant` | text | |
| `palette` | jsonb | |
| `is_system` | boolean | Seeded presets versus ones I saved. |
| `created_at` | timestamptz | |

---

# BILLING ENTITIES

## 12. PLANS

**Limits live here. Never in code.**

| Field | Type | Notes |
|---|---|---|
| `code` | text, pk | `foundation` · `operator` |
| `name` | text | Display. |
| `setup_fee_cents` | integer | 50000 / 250000. Changes to 150000 when the founding rate ends — a data change, not a deploy. |
| `monthly_cents` | integer | 25000 / 50000. |
| `analysis_limit_per_month` | integer, **nullable** | 25 / **null**. Null means unlimited. Nullable-as-unlimited is deliberate: a sentinel like 999999 invites a comparison that silently works until someone hits it. |
| `analysis_limit_per_session` | integer | 3 / 3. Applies to both tiers. |
| `features` | jsonb | Feature-key → enabled map, per the OFFER.md §1.1 matrix. |
| `is_active` | boolean | Retires a plan without deleting rows that reference it. |

## 13. SUBSCRIPTIONS

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `prospect_id` | uuid, fk | |
| `prototype_id` | uuid, fk | Which environment this subscription entitles. |
| `plan_code` | text, fk → plans | |
| `provider` | enum | `stripe` · `manual` · `stub` |
| `provider_customer_id` | text, nullable | |
| `provider_subscription_id` | text, nullable | Null for `manual`. |
| `status` | enum | `trialing` · `active` · `past_due` · `grace` · `suspended` · `canceled` |
| `current_period_start` / `current_period_end` | timestamptz | Drives counter rollover. |
| `grace_ends_at` | timestamptz, nullable | Set when entering `past_due`; day 10. |
| `canceled_at` | timestamptz, nullable | |
| `created_at` / `updated_at` | timestamptz | |

**Status is written only by the webhook path or by an explicit admin action through the `manual` provider.** No other code path may write it.

## 14. PAYMENTS

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `subscription_id` | uuid, fk | |
| `provider_payment_id` | text | |
| `kind` | enum | `setup` · `recurring` · `refund` |
| `amount_cents` | integer | Negative for refunds, so summing the column gives net revenue without a special case. |
| `currency` | text | `usd`. |
| `status` | enum | `succeeded` · `failed` · `refunded` |
| `failure_reason` | text, nullable | |
| `occurred_at` | timestamptz | Provider's timestamp, not ours. |

## 15. USAGE_COUNTERS

One row per prototype per billing period.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `prototype_id` | uuid, fk | |
| `period_start` / `period_end` | timestamptz | Unique together with `prototype_id`. |
| `analyses_used` | integer, default 0 | **The metered unit.** Atomic increment only. |
| `leads_captured` | integer, default 0 | **Never capped.** Tracked purely so the contractor always sees both numbers together (OFFER.md §2.1). |
| `cap_reached_at` | timestamptz, nullable | Set once, when `analyses_used` first reaches the limit. |
| `warned_at_20` | timestamptz, nullable | Prevents duplicate early-warning sends. |

## 16. DUNNING_EVENTS

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `subscription_id` | uuid, fk | |
| `day_number` | integer | 1, 3, 5, 7, 10. |
| `channel` | enum | `email` · `sms` |
| `sent_at` | timestamptz | |
| `delivery_status` | text | |

Unique on `(subscription_id, day_number, channel)` so a retry cannot send twice.

## 17. WEBHOOK_EVENTS

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `provider` | text | |
| `provider_event_id` | text, **UNIQUE** | The idempotency guard. |
| `payload` | jsonb | Raw, stored before processing. |
| `received_at` | timestamptz | |
| `processed_at` | timestamptz, nullable | Null means received but not yet applied. |
| `processing_error` | text, nullable | |

**How the UNIQUE constraint prevents double-processing:** the handler inserts before it does anything else. If the insert raises a unique violation, this event has already been received, so the handler returns 2xx immediately without touching a subscription, a payment, or an entitlement. The database is the lock; no application-level deduplication is required and no race between two concurrent deliveries can produce two applications.

---

## 18. RELATIONSHIP SUMMARY

```
prospects ──┬── prototypes ──┬── brand_kits (1:1)
            │                ├── template_configs (1:1)
            │                ├── quote_configs (1:n, per vertical)
            │                ├── quotes (1:n)
            │                ├── leads (1:n)
            │                ├── demo_sessions (1:n)
            │                ├── usage_counters (1:n, one per period)
            │                └── ai_jobs (1:n)
            ├── subscriptions (1:n) ──┬── payments (1:n)
            │                         └── dunning_events (1:n)
            └── (qualification fields inline)

plans ── referenced by subscriptions.plan_code and prototypes.tier
webhook_events, analytics_events, style_presets — standalone
```

## 19. RETENTION

- `leads` — retained indefinitely. This is the customer's asset, and deleting it is not ours to do.
- `quotes` — indefinite. `/q/[id]` links get texted and must not rot.
- Uploaded floor photos — **90 days**, then purged from Storage while the quote row survives without its image. A homeowner's photo of their own property is a liability held longer than it is useful.
- `analytics_events` — 12 months.
- `webhook_events` — 12 months, then archived. Needed for dispute evidence.
- `ai_jobs` — 12 months for cost reconciliation.

> **VERIFY:** the 90-day photo retention is my judgement, not a legal requirement I have confirmed. Texas has no state-level rule requiring it. Revisit if a customer contract requires longer.
