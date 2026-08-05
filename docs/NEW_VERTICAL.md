# Adding a vertical

**The claim this document has to defend:** adding roofing should be one
afternoon, touching only new files.

It is close to true and not yet fully true. What follows is the real
checklist, the two files you create, the one line you edit, and — most
importantly — the specific things that would break the claim, so you find out
before you start rather than three hours in.

---

## What you create

### 1. `lib/verticals/roofing/index.tsx`

One file. Copy `lib/verticals/painting/index.tsx` rather than the epoxy one:
painting is the module that proved the contract, and its shape covers more of
what a new trade needs (multiple measurement units, a second pricing
dimension, prep as its own line).

It must export a `VerticalModule` with:

| Field | What it is |
|---|---|
| `id`, `displayName` | `'roofing'`. The id goes in `prospects.vertical` and `quote_configs.vertical`. |
| `copy` | Every key in `VerticalCopy`. A missing one is a **compile error**, which is the point — a blank string on a contractor's page is not. |
| `surfaceTypes` | With `presets` (the "not sure?" affordance) and the deprecated `typicalSqft` mirror. |
| `finishes` + `colourCollections` | Orthogonal. Omit `colourCollectionIds` on a finish to offer every collection. |
| `steps` | The trade's questions. See the constraint section below — this is where the claim is won or lost. |
| `inputSchema` | Zod. Whatever the steps write, keyed by each step's `writesTo`. |
| `pricingRuleSchema` | Zod, `.strict()`. The shape `quote_configs.rules` must satisfy. |
| `price(inputs, rules)` | **Pure.** Compose it from `lib/quote/kit.ts`. |
| `vision` | `buildPrompt`, `responseSchema`, `minConfidence`, `lowConfidenceFields`, `allowancesFromRules`, `mapToInputs`, `fallbackInputs`. |
| `ResultRenderer` | React component. |
| `finishCatalogue`, `photoAnalysisPrompt` | Deprecated v1 mirrors. Generate the first with `legacyFinishCatalogue()`; never hand-write it. |

**Pricing.** Do not import `calculateQuote` unless roofing genuinely prices as
quantity × tier + per-unit prep, which epoxy does and painting does not.
Compose from the kit instead:

```ts
const lines: BreakdownLine[] = [];
// ... your trade's arithmetic ...
const mods = additiveModifierLines(subtotal, inputs.conditionModifierIds, rules.conditionModifiers);
lines.push(...mods.lines);
return finaliseQuote({ lines, minimumJobCents, rangeSpreadPct, modifiersApplied: mods.applied, inputs });
```

`finaliseQuote` is the shared ending every vertical uses: sum, floor at the job
minimum, draw the band, clamp the low end back to the minimum. Do not
reimplement it — a second copy of that arithmetic is a second set of quotes
that can drift.

**The rule that governs everything in this file:** a number that affects a
price does not belong in TypeScript. Rates, fees, minimums and spreads live in
`quote_configs.rules`. The module defines the SHAPE those rules must satisfy
and the ARITHMETIC that consumes them. Coat counts, layer counts and bounds
that are counts rather than rates are fine.

### 2. `supabase/migrations/00NN_roofing_defaults.sql`

A new numbered file. Never edit an applied migration.

Insert one row into `vertical_rule_defaults` (created in `0013`), matching your
`pricingRuleSchema` exactly. Leave `finish_catalogue` as `'[]'::jsonb` — the
module is the single source of truth for what a trade offers, and
`PrototypeView` already reads `vertical.finishCatalogue` and ignores the
column.

Validate the JSON against your schema **before** you write the SQL. A rules
blob that fails `pricingRuleSchema` produces a prototype that resolves fine and
then quotes nothing, which is a much worse failure than a migration that
refuses to apply.

---

## What you edit

### `lib/verticals/manifest.ts` — two lines

```ts
import { roofingVertical } from '@/lib/verticals/roofing';
// ...
registerVertical(roofingVertical);
```

That is the whole edit, and it is by design. The manifest is the ONE
registration point — it belongs to the vertical surface, not the core. Every
other file listed below is untouched.

**Do not add this line until roofing can actually quote end to end.** The
public hub prints a live-verticals count off the registry; registering a
vertical that cannot produce a price puts a claim on the marketing site the
product cannot back.

---

## What you do NOT edit

Verified, not asserted — these were all made vertical-agnostic in Phase 11:

- `lib/verticals/registry.ts` — the contract
- `lib/quote/kit.ts` — shared arithmetic
- `lib/quote/pricing.ts` — now one pricing strategy among several, not "the engine"
- `lib/quote/price-quote.ts` — resolves the module and asks it to price itself
- `lib/quote/machine.ts` — runs whatever plan the module declares
- `lib/quote/vision.ts` — asks the module for prompt, schema, confidence and mapping
- `app/actions/quote.ts` — dispatches by vertical id
- `components/widget/QuoteWidget.tsx` — renders declared steps generically
- `components/prototype/PrototypeView.tsx` — already reads `getVertical(prototype.vertical)`
- `lib/demo/config.ts` — `getWidgetCatalogue(verticalId, modifiers)` works for any vertical
- Every entitlement, quota and cost file. Roofing must not introduce a second
  quota path, and the contract gives it no way to: modules supply prompts and
  schemas, core makes the call and core counts it.

---

## The constraints that decide whether it is actually an afternoon

Read these before you start. Each one is a way the claim fails.

### 1. Your steps must use control kinds the widget draws

The dynamic renderer draws exactly five:

`surface_select` · `quantity` · `finish_select` · `stepper` · `single_select`

Roofing fits comfortably: material → `finish_select`, squares → `quantity`,
pitch → `single_select`, tear-off layers → `stepper`.

If roofing needs a kind that does not exist — a date picker, a satellite-area
tool, a multi-field address — that is a new `StepControl` variant, which means
editing `registry.ts` AND `QuoteWidget.tsx`. **That is not an afternoon, and it
breaks the claim.** Design the questions around the five kinds if you can.

### 2. Three components are composites, and absorb steps

`StepSurface` bundles the surface choice with the photo. `StepFinish` bundles
finish with colour. `StepArea` bundles the quantity slider with the condition
modifiers.

So a declared `photo`, `colour_select` or `multi_select` step is **absorbed by
its composite and skipped by the renderer** — it will not appear on its own.
Declare them anyway (they document the flow and the machine walks past them
correctly), but do not expect a separate screen.

This is the largest remaining wart in the system and the honest reason the
success test is "nearly" rather than "yes." Decomposing the composites is its
own job.

### 3. `BreakdownKind` is a fixed five-member union

`coating` · `prep` · `modifier` · `mobilization` · `minimum_adjustment`

Express trade specifics in the line `label` and `detail`, not as new kinds.
Painting fits coats and four prep levels inside these five. Widening the union
risks breaking an exhaustive switch in a renderer.

### 4. `sqft_min` / `sqft_max` are shared across all your quantity steps

One config pair bounds every `quantity` step in the vertical. Painting spans
20–8000 to cover both a small trim run and a large two-storey exterior. If
roofing's units differ wildly between steps, pick bounds that hold for all of
them, or bound the smaller one with a `stepper` instead.

### 5. Vision hints are filtered against the contractor's config

`mapToInputs` receives `allowed`, derived from the parsed rules. Filter every
inferred modifier id through it. An id the contractor's config never defined
would otherwise reach the pricing engine and throw `unknown_modifier` — a paid
photo analysis that produces no price at all. This was a real bug; do not
reintroduce it.

Match your canonical ids to the ids in your seed migration. Ids that do not
match are silently dropped, so the AI appears to work and never moves a price.

### 6. Hold area to a higher confidence bar than categorical fields

Getting a category wrong shifts a price by a rate. Getting area wrong scales
the whole quote linearly, and the homeowner is the one person who can actually
measure their own roof. Epoxy and painting both use 0.6 categorical / 0.8 area.

### 7. `fallbackInputs` must not guess

Return `{}`. A guessed value there is a price adjustment written in TypeScript.

---

## Verification, from a phone

No local build required.

1. **Schema round-trip.** Parse your seed rules blob through
   `pricingRuleSchema` and price three realistic jobs. If the smallest one does
   not land on the job minimum, the minimum is wrong.
2. **Plan resolution.** For each surface type, confirm exactly one quantity
   step is visible and it writes the key you expect.
3. **No blank screens.** Walk the plan the way the widget does — advancing past
   absorbed steps — and confirm every landing is a drawable kind or `quote`.
4. **Degraded path.** `mapVisionToInputs` with `null`, with garbage, and with a
   low-confidence payload. All three must return the fallback and none may
   throw.
5. **Quota untouched.** `prototype` and `preview` modes must still consume zero
   analyses. The contract gives a module no way to change this; confirm anyway.

---

## Honest status

**As of Phase 11:** the contract is genuinely additive, the machine runs
declared plans, vision and pricing both dispatch by module, and the seed
pattern has two worked examples.

**Remaining before this document is fully true:** the widget's `steps` must be
threaded through `PrototypeView` → `LaunchGate` → `PrototypeExperience` so a
real contractor's page renders a module's declared plan. Until that lands, a
new vertical prices correctly server-side and renders epoxy's four steps on
`/s/[slug]`.

Once it lands, roofing is: two new files, one manifest line, and the seven
constraints above.
