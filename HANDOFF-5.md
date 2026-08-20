# HANDOFF-5 — phases 56 to 83

Supersedes HANDOFF-4, which covered 56–77 and is now incomplete. Read
`HOW-WE-WORK.md` first; it still governs and nothing here overrides it.

**State: all of 56–83 pushed, builds green. Nothing has been observed running.**
Those are different claims and section 6 is about the gap between them.

---

## 1. What the product is now

Five registered verticals, each a module + migration + tool page:

| Vertical | Prices by | Defaults migration |
|---|---|---|
| `epoxy` | area (sq ft) | pre-existing |
| `painting` | area × coats | pre-existing |
| `landscaping` | area, clearance as its own line | **0025** |
| `cabinets` | pieces (door / drawer fronts) | **0026** |
| `fencing` | linear feet, gates as pieces | **0027** |

Adding one is documented in `docs/NEW_VERTICAL.md`: one module file, one
defaults migration, two lines in `lib/verticals/manifest.ts`. Every vertical
above used only controls that already existed, so none required a core change
except fencing's map step (phase 82).

`lib/tools/ideas.ts` is the canonical catalogue of candidate tools — 30 entries
with verdicts including the ones that say don't build, the mandatory tool shape,
and `UNBUILT_CAPABILITIES`. **Read it before proposing a new tool.**

---

## 2. Bugs found and fixed, with the reasoning worth keeping

**56 — combination photos vanished after switching coating.** `comboKeyFor`
read `selections` directly instead of the visible groups, so a hidden colour
answer from a previous system kept contributing a key segment. First
combination matched, all later ones missed, and returning to the working one
stayed broken. Now filtered through `visibleGroups`.

**66 — the render returned somebody else's garage.** `resolveMaterials` puts the
combination render first as a consistency anchor (correct), and the prompt called
it "a sample of the exact floor finish" — but it is a photograph of a whole room.
Returning that room satisfied every instruction given. It is now introduced as a
DIFFERENT room with its walls, contents, angle and lighting excluded, plus a
guard that the output must be the room from the first image. **This is a prompt
fix to a model behaviour: a strong push, not a guarantee.** If frames still come
back wrong, the structural fix is chaining — render frame one, then use its
output as a reference for the rest.

**63 — generated swatches all looked alike.** Not a prompt problem. Every swatch
was anchored on `solidPngDataUrl(hex)` — one flat colour — so ten multi-coloured
blends got ten near-identical grey squares, and in an image EDIT the reference
wins over the words. Flake and quartz now get a tile speckled in the palette
their own `renderHint` names.

**67 — the OpenRouter burn.** Rendering was one paid call PER PHOTO while
measurement was one call for the whole set. `MAX_RENDERED_PHOTOS = 1`.

**74 — repeat renders.** Same photo + same selections returned a stored render.
`sessionId` and `prototypeId` are deliberately OUT of the cache key: neither
changes the picture, and including either would mean every take of an advert
missed. In-process only — warm instance hits, cold start does not.

**83 — the visualiser was hardcoded to epoxy.** It imported epoxy's key builders
and called `finishMediaFor('epoxy')`, so landscaping, cabinets and fencing could
quote but not render their own finishes. Now takes a `vertical`, describes the
finish from that vertical's own catalogue, and the widget passes both the
vertical and the picker's answers — which it never did before.

---

## 3. Deliberate limitations. Do not "fix" these without reading why.

**Material references resolve only for epoxy.** `finish_media` holds 25 swatches
and 10 combinations, all `vertical = 'epoxy'`, and no studio exists to generate
them for anything else. Other verticals render from the finish DESCRIPTION —
weaker, and honest. A generic key scheme would be a lookup against an empty
table dressed up as support. When a vertical gains a media library, its key
builder belongs on the module, not in `app/actions/visualise.ts`.

**The landscaping `colour_select` step looks broken and is not.** The widget has
no `colour_select` branch because composites absorb declared steps — `StepFinish`
bundles finish with colour. Painting declares the identical step. Leave it.

**`geo.ts` is spherical, not ellipsoidal.** ~6 inches of error on a 160ft run,
against fence panels sold in 8ft sections. Verified against the JFK–LAX great
circle, a degree of latitude, a degree of longitude at Dallas latitude, and a
constructed 100×50m rectangle — all within 0.25%.

**Phase 59's width clamp was shipped without a measurement.** The probe was never
run. Every rule in it can only make something narrower, so it is inert if the
cause is elsewhere. **If the homepage card still cuts off, replace that layer
rather than adding to it.**

---

## 4. The exterior painting tool — still blocked, and exactly where

Exterior painting and cabinet refinishing are **not new verticals**; both are
surface types inside `lib/verticals/painting/`. Phase 72 added the colour decks
(Exterior Body, Trim & Front Door). What is missing is body + trim + accent as
three separate choices, which is the engagement mechanic.

Blocked by a chain, four known and one unknown:

1. `registry.ts` — `colour_select` needs an optional `collectionId`.
2. `registry.ts` — `ColourCollection` needs `surfaceTypeIds`, or exterior decks
   show on interior jobs. Collections attach to FINISHES, not surfaces.
3. `QuoteWidget.tsx` — `WidgetConfig` carries no `colourCollections` at all, so a
   second deck is unreachable.
4. `QuoteWidget.tsx` — colour is set only inside `StepFinish`, which hardcodes
   `setAnswer('colourId', cid)` — a literal, not `current.writesTo`. A second
   colour step writes nowhere and fails silently.
5. **Unknown**: whatever constructs `WidgetConfig`. That file has never been
   read. **Find it before attempting this.**

---

## 5. New capability: measuring from a map

- `lib/measure/geo.ts` — geodesic distance, open path, closed perimeter, polygon
  area. No key, no network, verified offline.
- `lib/measure/mercator.ts` — Web Mercator projection, tap fractions to
  coordinates. Round-trips exactly; `scale` correctly affects density not
  coverage.
- `components/tools/PropertyTapMap.tsx` — satellite image, tap corners, own
  address lookup. Renders NOTHING without `NEXT_PUBLIC_GOOGLE_MAPS_KEY`.
- `app/actions/geocode.ts` — address to coordinate, server-side key.
- Wired into fencing as a `property_map` step placed BEFORE the length step, so
  a tapped measurement pre-fills the confirmation rather than the visitor
  guessing and being corrected. A cleared map emits zero and **zero is never
  written**, so undoing taps cannot wipe a good photo estimate.

Two keys, not interchangeable:
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY` — browser, travels in the image URL, restrict by
  **HTTP referrer**.
- `GOOGLE_GEOCODING_KEY` — server only, never bundled, restrict by **IP**.

Neither has ever run against the live endpoint. Both parse strictly and fail
closed into manual entry. First real call is the test: a Dallas address should
return near 32.7767, −96.7970 and not 0,0.

---

## 6. Unverified. Read this before building anything else.

**Nothing from 56 to 83 has been seen running.** Green builds mean it compiles.

In priority order:

1. **Does a render return the visitor's own room?** Phase 66. All five verticals
   share this path; if it is wrong, all five are wrong.
2. **Do the three migrations apply?** They assume
   `vertical_rule_defaults(vertical, rules, finish_catalogue)`.
   `NEW_VERTICAL.md` documents the table and `finish_catalogue` but not the
   middle column. If they error, check `0013`. **Until they run, three tool
   pages render fully and quote nothing** — worse than not shipping them.
3. **Does the picker hold its photo across a coating switch?** Phase 56.
4. **Is the homepage card still cut off?** Phase 59.
5. **Swatches must be regenerated** for phases 60 and 63 to have any effect.

---

## 7. Also open

- `public/debug/overflow.html` is a debug page shipped to production. Delete
  once the width is confirmed (`rm -rf public/debug`) — a ZIP cannot delete
  files.
- All five `ResultRenderer`s are placeholders dumping JSON. The real one should
  follow the tool shape in `ideas.ts`: render largest, price and measured size
  beneath it.
- Persistent render caching. The current cache dies with the instance.

---

## 8. Two mistakes this session, worth not repeating

**Four theories were retired by reading code, and one fabrication shipped.** The
combination bug produced three confident wrong diagnoses — key mismatch, wrong
vertical string, stale migration — each disproved by opening the file. The
fabrication was a "32vh" cap asserted in a comment, from a stylesheet that had
never been read. It was retracted in phase 61. **A number in a comment gets
trusted later. Read the file or say you have not.**

**Phase 60 optimised the wrong picture**, treating swatches and combination
renders as one problem when their economics are opposite: twenty-five small
images where bytes are the cost, versus one hero where resolution is the
product. Reverted in 61.

Two calibration errors were caught by RUNNING the arithmetic rather than reading
it: a $2,800 cabinet minimum that priced a single vanity at double market, and a
geodesic test whose expected value was ellipsoidal while the model is spherical.
Both would have passed a careful read.
