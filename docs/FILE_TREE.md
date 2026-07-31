# FILE_TREE.md — Intended Repository Structure

**Status:** decided in Phase 0. Canonical. The phase that creates each file is marked `[N]`. Phase 1 scaffolds the structure with placeholder bodies; later phases fill them in.

A file not in this tree should not exist. If a phase needs one that isn't here, that is an `ESCALATE` and this document gets revised.

```
nva-web-solutions/
│
├── app/
│   ├── layout.tsx                          [1] Root layout, font preload, theme bootstrap
│   ├── globals.css                         [1] Token custom properties, base reset
│   ├── error.tsx                           [6] Root error boundary
│   ├── not-found.tsx                       [6] Root 404
│   │
│   ├── (public)/
│   │   ├── layout.tsx                      [1] Public chrome
│   │   ├── page.tsx                        [5] Public hub — widget is the hero
│   │   ├── demo/page.tsx                   [5] Interactive demo, widget in live mode
│   │   ├── pricing/page.tsx                [5] Both tiers read from plans table
│   │   ├── q/[quoteId]/page.tsx            [4] Persistent shareable quote page
│   │   └── checkout/return/page.tsx        [5.5] Pending-until-webhook state
│   │
│   ├── (client)/
│   │   ├── layout.tsx                      [1] Injects per-tenant brand tokens, no flash
│   │   └── s/[slug]/page.tsx               [8] The puppy-dog client prototype
│   │
│   ├── (admin)/
│   │   ├── layout.tsx                      [1] Admin chrome, uses Phase 1 tokens
│   │   ├── admin/page.tsx                  [6] Dashboard: leads, funnel, MRR, near-cap
│   │   ├── admin/combiner/page.tsx         [9] Drag-and-drop staging + deploy
│   │   ├── admin/prospects/page.tsx        [6] Prospect list
│   │   ├── admin/prospects/[id]/page.tsx   [6] Detail + qualification scorecard
│   │   ├── admin/leads/page.tsx            [6] Leads CRM
│   │   ├── admin/billing/page.tsx          [5.5] Subscriptions, MRR, closest-to-cap
│   │   └── admin/ai/page.tsx               [10] AI workspace
│   │
│   ├── api/
│   │   ├── health/route.ts                 [1] Build and deploy liveness
│   │   ├── webhooks/stripe/route.ts        [5.5] runtime='nodejs', signature-verified
│   │   └── ai/[job]/route.ts               [10] Admin-only, rate limited
│   │
│   └── actions/
│       ├── quote.ts                        [3] Analyse, calculate, persist
│       ├── lead.ts                         [5] submitDemoLead + dual routing
│       ├── prospect.ts                     [6] Create, qualify, score
│       ├── prototype.ts                    [9] Stage, mint slug, deploy
│       ├── brand.ts                        [7] Persist extracted tokens
│       └── billing.ts                      [5.5] Checkout, manual payment, refund
│
├── components/
│   ├── widget/
│   │   ├── QuoteWidget.tsx                 [4] Root; takes mode as explicit prop
│   │   ├── StepSurface.tsx                 [4] Step 1 + photo input
│   │   ├── StepFinish.tsx                  [4] Step 2 finish grid
│   │   ├── StepArea.tsx                    [4] Step 3, datum-rule slider
│   │   ├── StepCapture.tsx                 [4] Step 4 blurred-price paywall
│   │   ├── DegradedFlow.tsx                [4] First-class degraded path
│   │   ├── AnalysisMoment.tsx              [4] The scan animation
│   │   ├── PriceSpan.tsx                   [4] Signature: bracketed span on the rule
│   │   ├── DatumRule.tsx                   [4] Signature: the graduated scale
│   │   └── StyleToggle.tsx                 [4] Light / Dark Industrial
│   │
│   ├── public/
│   │   ├── Hero.tsx                        [5] Widget-as-hero
│   │   ├── InfiniteMotion.tsx              [5] Restrained ambient motion
│   │   ├── FranchiseComparison.tsx         [5] The positioning section
│   │   ├── PricingTable.tsx                [5] Reads plans table
│   │   └── PayloadScreen.tsx               [5] Split-screen aha moment
│   │
│   ├── prototype/
│   │   ├── BrandedHeader.tsx               [8] His logo, his colours
│   │   ├── PurchaseCTA.tsx                 [8] "Get this live" + offer + disclosure
│   │   └── ExpiredState.tsx                [8] Expired but still selling
│   │
│   ├── admin/
│   │   ├── LeadsTable.tsx                  [6] Degraded leads visually distinct
│   │   ├── LeadDrawer.tsx                  [6] Full payload + photo
│   │   ├── QualificationScorecard.tsx      [6] Plain-language warning, not a badge
│   │   ├── CombinerCanvas.tsx              [9] dnd-kit, touch + non-drag fallback
│   │   ├── LivePreviewFrame.tsx            [9] Real /s/[slug] in an iframe
│   │   ├── ShareCard.tsx                   [9] URL, QR, pre-written SMS
│   │   ├── LogoPanel.tsx                   [9] Upload, extract, override
│   │   ├── UsageAgainstCap.tsx             [5.5] Sortable upsell call sheet
│   │   └── SubscriptionsList.tsx           [5.5] Status, next charge, manual paid
│   │
│   └── ui/                                 [1] Primitives: Button, Field, Panel, Tick
│
├── lib/
│   ├── motion/index.tsx                    [1] LazyMotion + domAnimation; only framer entry
│   ├── analytics.ts                        [1] Typed emitter, no-ops when unconfigured
│   ├── slug.ts                             [1] Unguessable slug generation
│   ├── stubs.ts                            [1] Renders every route with no database
│   ├── prototype.ts                        [6] resolvePrototypeBySlug, one query
│   │
│   ├── verticals/
│   │   ├── registry.ts                     [1] The additive module contract
│   │   ├── epoxy/index.ts                  [1] Fully registered launch vertical
│   │   └── painting/index.ts               [1→11] Stub in P1, complete in P11
│   │
│   ├── entitlements/
│   │   ├── types.ts                        [1] Tier, Feature, limits, can() signature
│   │   └── check.ts                        [3] The single server-side decision point
│   │
│   ├── quote/
│   │   ├── pricing.ts                      [3] Pure, deterministic, unit-tested
│   │   ├── pricing.test.ts                 [3] Tests ship with the phase
│   │   ├── vision.ts                       [3→10] Single provider, then routed
│   │   ├── usage.ts                        [3] Atomic increment on success only
│   │   └── machine.ts                      [3] Zustand state machine + degraded path
│   │
│   ├── image/pipeline.ts                   [4] Browser-only, zero native deps
│   │
│   ├── supabase/
│   │   ├── client.ts                       [2] Browser client
│   │   ├── server.ts                       [2] Server client + tenant scoping helper
│   │   └── admin.ts                        [2] Service role — webhooks and admin only
│   │
│   ├── payments/
│   │   ├── provider.ts                     [5.5] The adapter interface
│   │   ├── stripe/index.ts                 [5.5] No Stripe type escapes this directory
│   │   ├── manual.ts                       [5.5] Permanent path, not a stub
│   │   └── stub.ts                         [5.5] Deterministic fake
│   │
│   ├── billing/
│   │   ├── dunning.ts                      [5.5] Days 1/3/5/7, grace, suspend
│   │   ├── cap.ts                          [5.5] Warning at 20, upsell at 25
│   │   └── entity.ts                       [1] Legal seller + product name from config
│   │
│   ├── brand/
│   │   ├── extract.client.ts               [7] Canvas extraction, Tier 1
│   │   ├── extract.server.ts               [7] Tier 2, feature-flagged
│   │   └── tokens.ts                       [7] Three hexes → full set, WCAG AA enforced
│   │
│   ├── ai/
│   │   ├── router.ts                       [10] Provider per job type, fallback
│   │   ├── schemas.ts                      [10] Zod per job
│   │   ├── providers/                      [10] anthropic, openai, moonshot, generic
│   │   └── prompts/                        [10] Versioned per job type
│   │
│   ├── cure/                               [11.5] weather.ts, risk.ts — only when sold
│   └── demo/mockLead.ts                    [5] Deterministic per session
│
├── types/
│   ├── database.ts                         [2] Hand-written, matches schema exactly
│   └── index.ts                            [1] Shared application types
│
├── supabase/
│   ├── migrations/0001_init.sql            [2] Core schema
│   ├── migrations/0002_billing.sql         [2] Plans, subscriptions, usage, webhooks
│   ├── migrations/0003_rls.sql             [2] RLS on every table
│   └── seed.sql                            [2] Plans, presets, epoxy config, demo prospect
│
├── docs/
│   ├── NAMING.md                           [0] Product name, hierarchy, disclosure
│   ├── SPEC.md                             [0] Numbered requirements
│   ├── DESIGN.md                           [0] Token system, both passes
│   ├── OFFER.md                            [0] Commercial spec
│   ├── DATA_MODEL.md                       [0] Entities and relationships
│   ├── ENV.md                              [0] Every environment variable
│   ├── EVENTS.md                           [0] Analytics taxonomy
│   ├── CONVENTIONS.md                      [0] Code conventions
│   ├── FILE_TREE.md                        [0] This file
│   ├── BUILD_ORDER.md                      [0] Phase table with models
│   ├── RLS_TESTS.md                        [2] Numbered manual proofs
│   ├── ENTITLEMENTS.md                     [5.5] Feature → plan → degraded behaviour
│   ├── BILLING_TESTS.md                    [5.5] Manual test script, phone-runnable
│   ├── NEW_VERTICAL.md                     [11] Checklist for vertical #3
│   └── RUNBOOK.md                          [12B] Launch and incident procedures
│
├── middleware.ts                           [1] Admin auth, slug resolution, public routes
├── next.config.mjs                         [1]
├── tailwind.config.ts                      [1] Default palette removed, tokens only
├── tsconfig.json                           [1] strict, no skipLibCheck tricks
├── .eslintrc.json                          [1] no-restricted-imports: framer-motion
├── .env.example                            [1] Mirrors ENV.md exactly
├── .gitignore                              [1]
├── package.json                            [1] Exact pinned versions
└── vercel.json                             [1] If needed
```

---

## NOTES

**`lib/billing/entity.ts` is created in Phase 1, not 5.5.** The product name and legal seller strings are needed by the public surfaces before payments exist, and putting them in one module from the start is what makes the future US LLC migration a config change rather than a search-and-replace.

**`lib/verticals/painting/` appears twice.** Phase 1 registers it as a stub purely to prove the registry contract holds without touching core code. Phase 11 makes it real. If Phase 11 has to edit a core file to do that, the Phase 1 contract failed and the contract gets fixed before the doc gets written.

**`components/ui/Tick.tsx`** is the atomic unit of the signature element. It exists in Phase 1 so the admin chrome and the widget cannot drift into two different measurement styles.

**No `contexts/` or `providers/` directory.** Zustand handles client state; React context is used only for the theme and the LazyMotion wrapper, both of which live with their owners.
