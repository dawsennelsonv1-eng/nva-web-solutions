# HANDOFF-4 — phases 56 to 72

Continues HANDOFF-3. Read `HOW-WE-WORK.md` first; it still governs.

---

## 1. What shipped

**56 — the combination photo bug.** `comboKeyFor` read `selections` directly
instead of the visible groups. Switching coating never cleared the previous
system's colour, so the key accumulated segments: `system=solid&solid_colour=slate`
became `system=flake&solid_colour=slate&flake_blend=domino`. First combination
matched, every one after missed, and returning to the working one stayed broken.
Now filtered through `visibleGroups`. Verified by simulation against the real ten
keys in `finish_media`.

**57 — flow.** Confident measurement goes straight to the picker. Photo grid
headed "Your site, before the transformation". Size no longer printed before the
estimate. Unconfident reads still go to step one, because `readyToRender`
requires `areaKnown`.

**58 — expandable photos.** `app/phase58.css`, one rule positioning `.lb-open`
inside `.tc-pick`.

**59 — width clamp. UNVERIFIED.** `app/phase59.css` constrains the card and its
media. Shipped without ever measuring the offending element — the probe was
never run. Every rule can only make something narrower, so it is inert if the
cause is elsewhere. **If the homepage card still cuts off at the right edge,
this layer should be replaced, not added to.**

**60 — swatch weight.** `lib/finishes/resize.ts`, downscale on upload in
SwatchStudio. Only affects newly generated media.

**61 — combination renders upload full size.** Phase 60 downscaled them too;
wrong, because one hero shows at a time and resolution is the product. Also
retracted a fabricated claim from a phase 60 comment (a "32vh" cap that was
never read from any stylesheet).

**62 — big uncropped preview.** Hero drops the fixed 3/2 box, lays out at its
own ratio up to 62vh. Swatches go `cover` → `contain`; they had been losing a
quarter off top and bottom.

**63 — swatch reference rebuilt.** The prompt was never the problem. Every
swatch was anchored on a flat tile of one hex, so ten multi-coloured blends got
ten near-identical grey squares. Flake and quartz now get a tile speckled in the
palette their own `renderHint` names.

**64 — "Your mix" moved below the preview.**

**65 — `MIN_PHOTOS = 1`.**

**66 — the render returning the wrong room.** `resolveMaterials` puts the
combination render first as a consistency anchor — correct, and it is a
photograph of somebody else's garage. The prompt called it "a sample", so
returning it satisfied every instruction. It is now introduced as a different
room with its room, angle and lighting explicitly excluded, plus a guard that
the output must be the first room. **Prompt fix to a model behaviour — a strong
push, not a guarantee. If frames still come back wrong, go structural: chain the
renders so frame one's output is a reference for the rest.**

**67 — cost.** Rendering was one paid call PER PHOTO while measurement was one
call for the whole set. `MAX_RENDERED_PHOTOS = 1`. Also: `vision.ts` now tells
the model when it has a single frame, so it widens its range instead of
confidently guessing a typical garage.

**68/69/70 — `lib/tools/ideas.ts`.** 30 candidate tools, typed, with verdicts
including the ones that say no. Plus `UNBUILT_CAPABILITIES` (satellite
measurement, video frames, render caching) and the mandatory tool shape.

**71 — landscaping vertical.** Module, manifest registration, migration 0025.

**72 — exterior colour decks** on the painting module.

---

## 2. Unverified, in priority order

1. **Nothing from 56 to 72 has been seen running.** Builds went green; that is
   all that is known. Verify the picker holds its photo across a coating switch,
   and that a render returns the visitor's own garage.
2. **Phase 59.** See above.
3. **Migration 0025** assumes `vertical_rule_defaults(vertical, rules,
   finish_catalogue)`. `NEW_VERTICAL.md` documents the table and the
   `finish_catalogue` column but not the middle one. If it errors, check 0013.
4. **Swatches must be regenerated** for 60 and 63 to take effect. ~25 renders.

---

## 3. The exterior painting tool — blocked, and exactly where

Exterior painting and cabinet refinishing are **not new verticals**. Both are
already surface types inside `lib/verticals/painting/` — `exterior_siding`
measured by area, `cabinets` priced per door front. Phase 72 added the colour
decks. What is missing is the thing that makes an exterior tool worth building:

**Body + trim + accent as three separate choices.** A house is never one colour,
and "which colour?" is the engagement mechanic.

That is blocked by a chain of five changes, four of which are known:

1. `registry.ts` — `StepControl`'s `colour_select` needs an optional
   `collectionId`, so a step can name which deck it draws from.
2. `registry.ts` — `ColourCollection` needs `surfaceTypeIds`, or exterior decks
   keep showing on interior jobs. Collections currently attach to FINISHES, not
   surfaces.
3. `QuoteWidget.tsx` — `WidgetConfig` carries `finishes` in the legacy nested
   shape and **no `colourCollections` at all**, so a second deck is not
   reachable by the widget.
4. `QuoteWidget.tsx` — there is no generic `colour_select` branch. Colour is set
   only inside `StepFinish`, which hardcodes
   `setAnswer('colourId', cid)` — a string literal, not `current.writesTo`. A
   second colour step would write nowhere and fail silently.
5. **Unknown**: whoever builds `WidgetConfig` must pass the collections. That
   file was never read and must be found before this is attempted.

Note the widget's own header comment: composites absorb declared steps.
`StepFinish` bundles finish with colour, so a declared `colour_select` step is
skipped rather than rendered. **This is why the landscaping module's `colour`
step is correct as written** — painting declares the identical step. Do not
"fix" it.

---

## 4. Also open

- `public/debug/overflow.html` is a debug page shipped to production. Delete it
  once the width is confirmed (`rm -rf public/debug`). A ZIP cannot delete files.
- **Render caching is the largest remaining cost win.** The same photo with the
  same selections regenerates every time, which is why recording an advert burns
  credit. Key on a hash of photo bytes plus selections. Documented in
  `lib/tools/ideas.ts` under `UNBUILT_CAPABILITIES`.

---

## 5. Two things this session got wrong, worth not repeating

**Four theories were retired by reading code, and one fabrication got shipped.**
The combination bug produced three confident wrong diagnoses — key mismatch,
wrong vertical string, stale migration — each disproved by opening the file. The
fabrication was a "32vh" cap asserted in a comment from a stylesheet that had
never been read. Reading first is cheaper than a deploy cycle, and a number in a
comment gets trusted later.

**Phase 60 optimised the wrong picture** by treating swatches and combination
renders as one problem when their economics are opposite: twenty-five small
images versus one hero where resolution is the product.
