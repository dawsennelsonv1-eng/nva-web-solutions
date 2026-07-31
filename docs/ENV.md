# ENV.md — Environment Variables

**Status:** decided in Phase 0. Canonical. **No phase may invent an env var not listed here.** A missing variable is an `ESCALATE`, not a gap to fill. When a phase genuinely needs a new one, this document is revised and re-uploaded to project knowledge.

**Marking:** `PUBLIC` is exposed to the browser via the `NEXT_PUBLIC_` prefix and must be assumed readable by anyone. `SECRET` is server-only and must never appear in a client bundle (R-010).

**Phase column** = the phase that first requires it. Earlier phases must build and deploy without later variables set.

---

## Supabase

| Variable | Vis | Phase | Value source |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | PUBLIC | 2 | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | PUBLIC | 2 | Same page → `anon` `public` key. Safe to expose; RLS is the actual boundary. |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRET** | 2 | Same page → `service_role`. **Bypasses RLS entirely.** Used only in `lib/supabase/admin.ts`, only in webhook handlers and admin server actions. Never imported into a client component. If this leaks, every lead in the system is public. |

## AI — vision (Phase 3)

| Variable | Vis | Phase | Value source |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **SECRET** | 3 | console.anthropic.com → API Keys |
| `AI_VISION_MODEL` | SECRET | 3 | Model string. In config so a model change is not a deploy. |
| `AI_MAX_OUTPUT_TOKENS` | SECRET | 3 | Hard per-request ceiling. |
| `AI_DAILY_SPEND_CEILING_CENTS` | SECRET | 3 | Server-enforced daily cap across all AI calls. The last line of defence against a runaway loop. |

## AI — multi-provider (Phase 10)

| Variable | Vis | Phase | Value source |
|---|---|---|---|
| `OPENAI_API_KEY` | **SECRET** | 10 | Optional. Router falls back only if present. |
| `MOONSHOT_API_KEY` | **SECRET** | 10 | Optional. |
| `MOONSHOT_BASE_URL` | SECRET | 10 | OpenAI-compatible base URL. |
| `AI_GENERIC_API_KEY` | **SECRET** | 10 | Optional generic OpenAI-compatible adapter. |
| `AI_GENERIC_BASE_URL` | SECRET | 10 | |

## Payments (Phase 5.5)

| Variable | Vis | Phase | Value source |
|---|---|---|---|
| `PAYMENT_PROVIDER` | SECRET | 5.5 | `stripe` · `manual` · `stub`. Selects the adapter. |
| `STRIPE_SECRET_KEY` | **SECRET** | 5.5 | Stripe → Developers → API keys. Test key until the ship gate. |
| `STRIPE_WEBHOOK_SECRET` | **SECRET** | 5.5 | Stripe → Developers → Webhooks → the endpoint → Signing secret. Per-endpoint; test and live differ. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | PUBLIC | 5.5 | Only needed if a client-side Stripe surface is ever added. Hosted checkout does not require it — set it only when something uses it. |
| `STRIPE_PRICE_FOUNDATION_SETUP` | SECRET | 5.5 | Price ID for the one-time setup line item. |
| `STRIPE_PRICE_FOUNDATION_MONTHLY` | SECRET | 5.5 | Recurring price ID. |
| `STRIPE_PRICE_OPERATOR_SETUP` | SECRET | 5.5 | |
| `STRIPE_PRICE_OPERATOR_MONTHLY` | SECRET | 5.5 | |

> **VERIFY:** Price IDs are per-account and differ between test and live mode. The test-to-live switchover therefore changes eight variables, not two. Phase 12B's runbook must list all eight.

## Legal entity & branding (Phase 5.5, read from Phase 1)

| Variable | Vis | Phase | Value source |
|---|---|---|---|
| `NEXT_PUBLIC_PRODUCT_NAME` | PUBLIC | 1 | `Girder`. In env so the Phase 11 vertical work can't force a rename through code. |
| `LEGAL_SELLER_NAME` | SECRET | 5.5 | The partner's registered Canadian legal name. Appears on receipts and in the disclosure line. |
| `LEGAL_SELLER_COUNTRY` | SECRET | 5.5 | `Canada`. Changes to `United States` at LLC migration. |
| `LEGAL_SELLER_SUPPORT_EMAIL` | SECRET | 5.5 | On receipts and refund correspondence. |

## Email & SMS (Phase 5)

| Variable | Vis | Phase | Value source |
|---|---|---|---|
| `RESEND_API_KEY` | **SECRET** | 5 | resend.com → API Keys |
| `EMAIL_FROM` | SECRET | 5 | e.g. `Girder <notifications@yourdomain.com>`. Domain must be DNS-verified in Resend before anything sends. |
| `ADMIN_NOTIFY_EMAIL` | SECRET | 5 | Where lead alerts land. |
| `ADMIN_NOTIFY_PHONE` | SECRET | 5.5 | Appears in day-7 dunning copy. |
| `SMS_PROVIDER_KEY` | **SECRET** | 5.5 | Stubbed in Phase 5, live in 5.5. |

> **VERIFY:** Resend requires SPF and DKIM records on the sending domain. Dunning email that lands in spam is functionally identical to no dunning at all. Do this before the ship gate, not after.

## Application

| Variable | Vis | Phase | Value source |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | PUBLIC | 1 | Canonical origin. Used for Open Graph absolute URLs, checkout return URLs, and slug links. Differs per Vercel environment. |
| `NEXT_PUBLIC_ANALYTICS_KEY` | PUBLIC | 1 | Optional. `lib/analytics.ts` no-ops when unset (R-005 equivalent for analytics). |
| `ADMIN_ALLOWED_EMAIL` | SECRET | 6 | Single operator address. A second authenticated user is not an admin. |
| `RATE_LIMIT_WINDOW_SECONDS` | SECRET | 3 | Per-IP window for AI calls. |
| `RATE_LIMIT_MAX_ANALYSES_PER_IP` | SECRET | 3 | Pairs with the per-session limit. The session counter alone is defeatable by minting a new session id. |

## Weather (Phase 11.5 — only when sold)

| Variable | Vis | Phase | Value source |
|---|---|---|---|
| `WEATHER_API_KEY` | **SECRET** | 11.5 | Provider TBD. Free-tier limits verified in Phase 11.5. |

---

## Rules

1. **A missing optional variable degrades a feature. A missing required variable fails the build loudly.** Nothing fails silently.
2. `lib/analytics.ts` and the SMS stub no-op cleanly when unconfigured, so Phases 1–4 deploy green with only the Supabase and Anthropic groups set.
3. `.env.example` mirrors this document exactly, with every value blank and every `SECRET` commented as such.
4. **Vercel environment scoping:** Preview deployments use test Stripe keys and the test webhook secret. Production uses live. Getting this backwards means real charges from a branch deploy.
5. No variable is read outside a server context unless it carries the `NEXT_PUBLIC_` prefix. Phase 12A greps for violations.
