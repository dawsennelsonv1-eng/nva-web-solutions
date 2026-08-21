# HANDOFF-6 — phases 84 to 88

Continues HANDOFF-5, and **corrects it in two places**. Read `HOW-WE-WORK.md`
first; it still governs.

---

## 0. Corrections to HANDOFF-5 — read these before acting on it

**"Builds green through 83" was true only until 83 deployed.** Two builds failed
afterwards. Both are fixed (84, 85). Current head is 88.

**Migrations 0025, 0026 and 0027 are APPLIED. Do not ask for them to be run.**
HANDOFF-5 lists this as the top outstanding item. It is done. The table has five
rows — cabinets, epoxy, fencing, landscaping, painting — with per-vertical
bounds and `range_spread_pct` in fraction form (0.15, 0.18), matching epoxy and
painting.

They were applied as a **single condensed INSERT**, not by pasting the files:
three 9KB files, mostly comments, could not be copied through a phone terminal
without truncating. The `.sql` files remain in the repo as the record of where
each rate came from and why. **They are not stale and must not be deleted** —
`lib/demo/verticals.ts` names them as the authority when a rate disagrees.

---

## 1. Two build failures, and what they teach

**84 — a type error.** Phase 82 made `apiKey` optional on `PropertyTapMap` and
introduced `resolvedKey` for the env fallback, then guarded the early return on
`resolvedKey` while the JSX still passed `apiKey`. Narrowing applied to one
variable; usage read the other.

**85 — a runtime invariant.** `validateModule()` in `registry.ts` rejects two
steps writing the same input key, and fencing's map step and length step both
wrote `linearFt`. **This fires at prerender, not at compile**, so neither
parsing nor typechecking catches it. Read `validateModule` before touching any
module's steps.

The map step now writes `mapLinearFt` and sits AFTER the length step — better
order anyway, since a tapped boundary reads as improving a number already on
screen rather than a chore before anything has happened. `priceFencing` prefers
the measurement outright rather than averaging; zero counts as absent.

**Verification changed as a result.** A syntax parser was in use through phase
83; it proves a file is well-formed and nothing else. There is now a real
typechecker (`tsconfig.check.json`, paths mapped to the tree). It caught a
temporal-dead-zone bug in phase 88 that would have crashed at runtime. Use it.

---

## 2. Three discoveries that changed the plan

**NOTHING IN THE APP READS `vertical_rule_defaults`.** Verified by grep across
`app/`, `lib/` and `components/` — zero references. It is a provisioning record.
This is why running the migrations changed nothing visible, and why a public
demo needs its rates published in TypeScript instead.

**`ToolCard` is the EPOXY card, not a generic one.** It calls
`calculateQuote(inputs, pricer.rules)` — epoxy's pricing function — with
sqft-shaped inputs, and its UI is a square-footage slider. Cabinets prices door
counts; fencing prices a run with gates as pieces. That control surface cannot
express either. **No rate document fixes this.** Do not try to make other
verticals live inside `ToolCard`.

**`QuoteWidget` was built vertical-agnostic all along.** `WidgetConfig.rules` is
`unknown`, and `getWidgetCatalogue(verticalId, modifiers)` in `lib/demo/config.ts`
already reads steps, surfaces and finishes off any registered module. The widget
is the generic surface; the card is the epoxy one.

---

## 3. What shipped

**86 — migrations carry every required column.** `vertical_rule_defaults` has
nine columns, six NOT NULL. `docs/NEW_VERTICAL.md` documents three. The first
version inserted the documented three and was rejected on `sqft_min`. Bounds are
per vertical: landscaping 100–20000 (area), cabinets 1–100000 (inert — nothing
there is measured in area), fencing 20–2000 (**linear feet in a column named
sqft**).

**87 — every registered vertical has a page.** Two were 404ing, not merely
demo-less: `getQueueRow()` returns null and the route calls `notFound()`.

- The queue row was `landscaping-sod` while the page and the module are
  `landscaping`. **That id is a join key on both sides** — it also meant the
  registry could never promote the row to IN SERVICE. Renamed.
- `cabinets` had no queue row at all. Added.
- Both specs described tools that were never built — fencing promised
  post-by-post arithmetic and frost-line lookup; landscaping was written for sod
  pallets. Rewritten to what the modules do. On a site whose pitch is "check the
  arithmetic", published math that does not match the code is worse than none.
- `PUBLIC_TOOLS` now lists all five.

**88 — the tools, running.** `DemoExperience` gained an optional `verticalId`.
Omitted means epoxy and every existing caller omits it, so `/demo` and the
homepage are unchanged. A prop rather than a second copy, because that file is
200 lines of session handling and port adapters that would drift.

`lib/demo/verticals.ts` publishes rate documents for landscaping, cabinets and
fencing — verified byte-for-byte against migrations 0025–0027. Tool pages mount
the widget for any vertical with published rates.

**Painting is excluded on purpose.** Module registered, no defaults migration
ever written, so no verified rates exist. It keeps its `QUIET_REASON`. Inventing
rates to fill the gap is the failure `pricerFor()` returning null exists to
prevent.

---

## 4. Exterior painting — the blocker moved

HANDOFF-5 section 4 lists an unknown fifth item: "whatever constructs
`WidgetConfig`". **Found.** It is built in `components/demo/DemoExperience.tsx`
and `components/prototype/PrototypeExperience.tsx`, both via
`getWidgetCatalogue()` in `lib/demo/config.ts`.

The remaining chain for body + trim + accent is now fully known:

1. `registry.ts` — `colour_select` needs an optional `collectionId`.
2. `registry.ts` — `ColourCollection` needs `surfaceTypeIds`, or the exterior
   decks added in phase 72 show on interior jobs.
3. `QuoteWidget.tsx` — `WidgetConfig` carries no `colourCollections`.
4. `QuoteWidget.tsx` — colour is set only inside `StepFinish`, which hardcodes
   `setAnswer('colourId', cid)`. A second colour step writes nowhere, silently.

Note `getWidgetCatalogue` returns `finishes` with colours nested per finish. A
deck attached to a SURFACE rather than a finish has no path through that shape
today — that is item 2, and it is the load-bearing one.

---

## 5. Open

**Decision needed:** the homepage deck links to the working tool pages. Mounting
widgets inline means four quoting machines loading at once on a phone. The offer
on the table is to mount them collapsed behind a "Try it" control.

**Nothing since 83 has been observed running.** Migrations are confirmed applied
by query; the widgets, pages and quotes are not.

**No material libraries outside epoxy.** `finish_media` is epoxy-only and no
studio generates swatches for other trades, so those renders fall back to
describing the finish. **Quoting works everywhere; the wow is still epoxy-only.**

**All five `ResultRenderer`s are placeholders** dumping JSON.

**`public/debug/overflow.html`** is still shipped to production. Delete once the
homepage width is confirmed.

**Phase 59's width clamp** was shipped without a measurement. If the card still
cuts off, replace that layer rather than adding to it.
