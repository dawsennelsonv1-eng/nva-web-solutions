# ENTITLEMENTS.md — the feature/plan matrix and its call-site proof

**Status:** Phase 5.5. The matrix below is the machine-readable OFFER.md §1.1,
seeded into `plans.features` by `0002_billing.sql`. Limits live in the
database; no limit is hardcoded in application code (SPEC R-611).

---

## 1. The matrix

| Feature key | Foundation | Operator | Degraded behaviour | Decided by |
|---|---|---|---|---|
| `quote.deterministic` | on, unlimited | on, unlimited | **stays on — never gated** | `NEVER_GATED` |
| `quote.ai_analysis` | 25/month, 3/session | unlimited, 3/session | off → degraded mode | plan limit + usage |
| `lead.capture` | on, unlimited | on, unlimited | **stays on — never gated, under any condition** | `NEVER_GATED` |
| `quote.share_page` | on | on | stays on | `features` jsonb |
| `brand.style_toggle` | on | on | stays on | `features` jsonb |
| `cure.advisor` | preview only | full | preview only | `features` jsonb |
| `command_center` | off | on | n/a | `features` jsonb |
| `ai.implementation_review` | off | on | n/a | `features` jsonb |

### Degraded reasons and what each means

| Reason | Trigger | `degradedMode` | Lead capture |
|---|---|---|---|
| `cap_reached` | `analyses_used >= analysis_limit_per_month` | **true** | on |
| `subscription_suspended` | status not in trialing/active/past_due/grace | **true** | on |
| `ai_unavailable` | provider failure, spend ceiling, entitlement read failure | **true** | on |
| `session_limit` | 3 analyses used this visitor session | **false** | on |
| `feature_not_in_plan` | tier does not include the feature | false | on |

`session_limit` is deliberately **not** a degraded state and deliberately
**not** in the database enum: the deterministic quote still completes, so the
lead is not degraded. `degraded_reason` has exactly three values for this
reason (`0001_init.sql`).

Statuses that still entitle the full feature set: `trialing`, `active`,
`past_due`, `grace`. **`past_due` and `grace` are entitling on purpose** —
money rule #3 says we never break his site during dunning. Only `suspended`
and `canceled` degrade.

---

## 2. The proof — every call site, audited

The rule: **no call site gates on a tier string. Every gate goes through
`can()` in `lib/entitlements/check.ts`.**

### 2.1 Every `can()` call site

| File | Line | Feature gated | Mode |
|---|---|---|---|
| `app/actions/quote.ts` | 78 | `quote.ai_analysis` | explicit from request |
| `app/actions/quote.ts` | 269 | `quote.ai_analysis` | explicit from request |
| `app/actions/quote.ts` | 356 | `quote.ai_analysis` | explicit from request |

That is the complete list, and it is short for an honest reason: **the only
gated feature that currently exists is AI photo analysis.** `cure.advisor`,
`command_center` and `ai.implementation_review` are in the matrix but have no
call sites because those features are not built (Phase 11.5 and the
deliberately deferred items in PART H). They are listed so no future phase
mistakes their absence for permission to skip the check.

`quote.deterministic` and `lead.capture` have no gate call sites **by
design** — they are in `NEVER_GATED` and `can()` returns `allowed: true` for
them unconditionally, including at the cap, on suspension, and during an
outage.

### 2.2 Tier-string comparisons — audited, none are gates

`grep -rn "=== 'operator'|=== 'foundation'"` outside `check.ts` returns seven
hits. Every one was inspected:

| File | What it is | Gate? |
|---|---|---|
| `lib/payments/provider.ts:136` | selects which env var holds the Stripe price id | No — price lookup |
| `lib/payments/stripe/index.ts:153` | narrows untrusted webhook metadata to the `Tier` union | No — type validation |
| `lib/billing/cap.ts:133` | narrows `plan_code` to `Tier` for an analytics property | No — type narrowing |
| `app/(public)/pricing/page.tsx:99` | finds the Foundation row to quote its price in copy | No — display |
| `app/(public)/pricing/page.tsx:150` | picks the CTA variant for the primary tier | No — display |
| `components/billing/CheckoutReturnClient.tsx:75` | prints "Foundation" or "Operator" in a sentence | No — display |
| `lib/entitlements/types.ts:12` | the comment forbidding this pattern | No — prose |

**Zero entitlement decisions are made outside `check.ts`.**

### 2.3 `features` jsonb reads outside `check.ts`

Three hits, all in `app/(public)/pricing/page.tsx`, all rendering the public
pricing table's tick-list from the same source of truth the entitlement
engine uses. Display, not enforcement — and reading it from `plans` rather
than a hardcoded marketing list is what keeps the sales page honest when the
matrix changes.

### 2.4 `prototypes.subscription_status` — the denormalised cache

Written in four places, all on the webhook or admin path:
`lib/billing/process.ts` (webhook), `lib/billing/dunning.ts:81` (suspension),
`app/actions/billing.ts:177,248` (manual payment, refund).

**Read for an entitlement decision in zero places.** `check.ts` resolves the
authoritative answer from the `subscriptions` table every time and ignores
the hints passed on `EntitlementSubject`. The cache exists only to make
`/s/[slug]` a single query.

---

## 3. Where enforcement physically happens

```
homeowner action
  → app/actions/quote.ts        (server action — the boundary)
      → can()                   lib/entitlements/check.ts   ← THE decision
          → resolveEntitlement  subscriptions + plans + usage_counters
          → resolveBillingPeriod lib/billing/period.ts       (pure, tested)
      → guards                  lib/quote/guards.ts          (cost, not entitlement)
      → analyzeFloorPhoto       lib/quote/vision.ts
      → consumeAnalysis         lib/quote/usage.ts           ← meters ONLY on success
```

A client-side check is decoration. `check.ts` imports `server-only`, so a
client bundle importing it is a build error rather than a silent bypass.

---

## 4. The three things that must never happen

Audited by Phase 12A against this document:

1. **Lead capture is never gated.** `NEVER_GATED` includes it, `can()`
   short-circuits it, and `app/actions/lead.ts` never calls `can()` at all.
2. **No billing string reaches a homeowner.** The degraded copy in
   `components/widget/DegradedFlow.tsx` contains none of: limit, quota, cap,
   plan, upgrade, subscription, payment, unavailable, temporarily, sorry,
   unfortunately, error.
3. **Only a verified webhook grants entitlements.** `/checkout/return` polls
   and reports; it never writes. The single exception is the admin's manual
   provider path, which is explicit, human-initiated, and recorded with
   `provider='manual'`.
