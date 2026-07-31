# CONVENTIONS.md — Code Conventions

**Status:** decided in Phase 0. Canonical. Phase 12A audits against this document.

---

## 1. NAMING

| Thing | Convention | Example |
|---|---|---|
| React component files | PascalCase | `QuoteWidget.tsx` |
| Non-component modules | kebab-case | `mock-lead.ts` |
| Directories | kebab-case | `lib/entitlements/` |
| Functions | camelCase, verb-first | `resolvePrototypeBySlug()` |
| Booleans | `is` / `has` / `was` / `can` prefix | `wasDegraded`, `canAnalyse` |
| Types & interfaces | PascalCase, no `I` prefix | `EntitlementDecision` |
| Enums / unions | Prefer string literal unions over TS enums | `type Tier = 'foundation' \| 'operator'` |
| Database columns | snake_case | `analyses_used` |
| Env vars | SCREAMING_SNAKE | `AI_DAILY_SPEND_CEILING_CENTS` |
| Analytics events | snake_case, `object_action`, past tense | `quote_step_completed` |
| Money | Always integer cents, always suffixed `_cents` | `low_cents` |

**Never abbreviate in a public name.** `subscription`, not `sub`. `prototype`, not `proto`. This code is read on a phone screen where an unfamiliar abbreviation costs more than eight characters saved.

**Money is always integer cents.** A float never touches a price, a fee, or a total. Display formatting happens at the edge, in one helper.

---

## 2. FOLDER RULES

```
app/          routes only — pages, layouts, route handlers, server actions
components/   presentational and interactive UI; no direct database access
lib/          all logic; the only place that touches Supabase, Stripe, or an AI provider
types/        shared types; database.ts is hand-written to match the schema exactly
docs/         canonical specification
supabase/     migrations and seed
```

**The hard boundary: `components/` never imports from `lib/supabase/`, `lib/payments/`, or `lib/ai/`.** Data arrives as props or from a server action. A component that queries is a component that cannot be reused in `prototype` mode, and mode-independence is a product requirement, not a style preference.

`lib/` subdirectory owns its domain completely:

| Directory | Owns |
|---|---|
| `lib/quote/` | pricing, vision, usage, state machine |
| `lib/entitlements/` | the single source of every access decision |
| `lib/payments/` | provider adapters; no Stripe type escapes `lib/payments/stripe/` |
| `lib/billing/` | dunning, cap upsell |
| `lib/brand/` | extraction and token derivation |
| `lib/image/` | the client pipeline |
| `lib/verticals/` | the registry and per-vertical modules |
| `lib/supabase/` | clients and the tenant scoping helper |
| `lib/motion/` | the LazyMotion wrapper |

---

## 3. THE TENANT SCOPING RULE

**Every read of prospect-owned data goes through one helper in `lib/supabase/`.** There is no second path.

Prospect-owned tables: `prototypes`, `brand_kits`, `template_configs`, `quote_configs`, `quotes`, `leads`, `demo_sessions`, `usage_counters`, `ai_jobs`, `subscriptions`, `payments`, `dunning_events`.

Rules:
1. A raw `.from('leads')` outside the helper is a defect, regardless of correctness.
2. The helper takes the scope key as a required argument. There is no default and no "all tenants" mode.
3. `lib/supabase/admin.ts` (service role) is importable **only** from webhook handlers and admin server actions. It is never used to work around an RLS policy — if a query is blocked by RLS, the policy is wrong or the query is wrong, and either is an `ESCALATE`. Reaching for the service role to make a query succeed is the single most dangerous shortcut available in this codebase.
4. RLS is the boundary; the helper is the discipline. Neither substitutes for the other.

---

## 4. COMPONENT BOUNDARIES

- **Server Components by default.** `'use client'` requires a reason: state, effects, browser APIs, or event handlers.
- Push `'use client'` as far down the tree as possible. A client boundary at the layout drags the whole page into the bundle.
- The widget is client-side; its data comes from server actions.
- **The widget takes `mode` as an explicit prop and never infers it from route, pathname, or referrer.** Inferring mode is how a `prototype` session eventually consumes a contractor's quota.
- No component reads an env var directly. Config arrives as props or from a config module.
- Components render states, they don't decide entitlements. `check.ts` decides; the component renders the decision.

---

## 5. ERROR HANDLING

**User-facing copy:** state what happened and what to do next. Never apologise, never vague, never expose a stack trace, a provider name, or an error code the user cannot act on.

Bad: *"Something went wrong. Please try again later."*
Good: *"That photo didn't upload — it may be too large. Try a photo under 10MB, or skip the photo and enter the size yourself."*

**Error class hierarchy:**

| Kind | Behaviour |
|---|---|
| **Expected degradation** | Not an error. AI unavailable, cap reached, suspension → the degraded path, which is a designed state with its own copy. Never rendered as a failure. |
| **Recoverable** | Show inline, keep state, offer the specific next action. Validation, upload rejection, transient network. |
| **Unrecoverable** | Route-group `error.tsx`. Preserve any captured lead data. Never lose a lead to an error boundary. |

**Server actions never throw to the client.** They return a discriminated result: `{ ok: true, data }` or `{ ok: false, code, message }`. `code` is machine-readable, `message` is the copy above.

**Logging:** log the technical detail server-side, show the human copy client-side. Never log PII. Never log a full webhook payload containing customer data outside `webhook_events`.

**The one absolute rule:** if lead capture is failing, that is Critical no matter what caused it. Every other feature may degrade.

---

## 6. MOTION POLICY

**Framer Motion is imported through `lib/motion/` and nowhere else.**

```ts
// correct
import { m } from '@/lib/motion'

// defect — fails review, fails Phase 12A
import { motion } from 'framer-motion'
```

**Why:** the whole `framer-motion` import is ~34KB gzipped, a quarter of the widget's entire budget. `LazyMotion` + `domAnimation` + the `m` components cut that to roughly 15KB. A single bare `motion` import anywhere in the tree defeats it for the whole bundle, silently, and it will not show up until Phase 12A.

**Enforcement:** an ESLint `no-restricted-imports` rule banning `framer-motion` outside `lib/motion/`. Phase 1 ships the rule with the wrapper. A lint rule that exists from the first commit is cheaper than an audit finding in Phase 12A.

**`domMax` is forbidden** unless a phase explicitly requires drag gestures and states why. Phase 9's combiner uses **dnd-kit**, not Framer drag, specifically so the project never needs `domMax`.

### Per-surface bundle ceilings

| Surface | Ceiling | Measured in |
|---|---|---|
| Quoting widget JS (excl. framework) | **150KB gzipped** | Phase 4 |
| Image pipeline (code-split, loads on photo select) | 40KB gzipped | Phase 4 |
| Public hub `/` first load, total page weight | **1MB** | Phase 5 |
| `/s/[slug]` first load, total page weight | 700KB | Phase 8 |
| Self-hosted webfonts, latin subset | **100KB** | Phase 1 |
| Admin surfaces | No ceiling — single operator, known device | — |

**If a ceiling cannot be met with `domAnimation`, say so and propose CSS animation instead.** Silently exceeding a ceiling is worse than an ugly transition, because the ceiling is a proxy for a contractor's patience on 4G and he will not file a bug — he will just leave.

**Animate transform and opacity only.** Never width, height, top, left. Pause ambient motion off-screen and when the tab is hidden.

**Reduced motion** is a designed state, not a disabled one. Under `prefers-reduced-motion` the datum rule is identical, the span jumps rather than travels, and the layout is unchanged.

---

## 7. STYLING

- **Tailwind, consuming theme tokens.** No arbitrary colour values: `bg-[#FF6A13]` is a defect. `bg-hazard` is correct.
- Tailwind's default colour palette is removed in `tailwind.config.ts` and replaced with the DESIGN.md tokens. It must be *impossible* to write a hardcoded colour and have it look right — the enforcement is that `bg-blue-500` will not exist.
- One radius token: `--r-milled: 2px`.
- Type scale only. No arbitrary font sizes.
- No inline styles except CSS custom properties injected for per-tenant branding.

---

## 8. TYPESCRIPT

- `strict: true`. No `any` — use `unknown` and narrow.
- **No `skipLibCheck` tricks to make a build pass.** If types don't resolve, the code is wrong.
- Every external boundary is Zod-validated: AI responses, webhook payloads, form submissions, URL params.
- `types/database.ts` is hand-written to match the schema exactly. It is not generated, because generation requires tooling that cannot run reliably on the target device.
- Every import must resolve and every referenced file must exist in the delivered ZIP. Vercel is the only compiler; a broken import costs a full push-build-read cycle.

---

## 9. THE PRICING RULE, RESTATED AS A CONVENTION

**No number that affects a price appears in a `.ts` file.** Every rate, modifier, bound and fee is read from `quote_configs`. A magic number in pricing code is a defect even when it is correct, because it is a number the contractor cannot change and I cannot see.

The same applies to limits: `25` never appears in code. It is read from `plans.analysis_limit_per_month`.

---

## 10. GIT

- One branch per phase: `phase/<N>`.
- Merge to `main` only on a green Vercel build.
- Tag every green phase: `p<N>-green`.
- After the ship gate, `main` is revenue. It is never merged into speculatively.
