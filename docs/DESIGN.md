# DESIGN.md — Design Thesis & Token System

**Status:** decided in Phase 0. Canonical. Phase 1 builds the theme engine from these tokens; Phase 4 builds the widget from this thesis. Both passes are recorded below because the revisions are part of the decision.

---

## 0. THE THESIS — where I disagree with the brief

The starting thesis was: draw the visual language from the material. Cured epoxy, metallic pours, polished concrete, safety-industrial signage, spec-sheet typography.

**Two-thirds right, and the wrong third is the dangerous one.**

If you draw literally from *cured epoxy and metallic pours*, you get depth, sheen, and pooled colour. Translated to a screen, depth and sheen are gradients, and pooled metallic colour is a glow. So a thesis that starts at "look like the material" arrives, by an honest route, at a dark glossy gradient interface — which is a SaaS gradient wearing a hard hat, and it fights both the 100KB font budget and the reduced-motion requirement, because sheen without motion is just a smudge.

**The sharpening: don't imitate the material. Imitate the documentation of the material.**

What a contractor actually reads and trusts is not the floor. It is the paperwork around the floor — the product data sheet, the coverage chart, the batch label on the pail, the mix-ratio table, the temperature-and-humidity window printed on the side. That world is paper, tables, measured numbers, tolerances, stated limits, and exactly one high-visibility colour used for hazard. It is precise without being glossy. It reads as *expensive industrial equipment* because expensive industrial equipment ships with documentation like this and cheap equipment does not.

It also solves three problems at once: it survives reduced motion (paper doesn't move), it is nearly free in bytes (no imagery, no gradients), and it gives the product a native way to show a *range* — which is the one number this entire business turns on.

Accepted: polished concrete, safety-industrial signage, spec-sheet typography, precision.
Rejected: sheen, depth, metallic pour, gradient.

---

# PASS 1 — THE TOKEN SYSTEM

## 1.1 COLOUR — 6 values

| Token | Hex | Role | Justification |
|---|---|---|---|
| `--concrete` | `#E4E6E3` | Page surface | Polished concrete, cool grey with a faint green cast. Not white — a white page in a truck cab in Texas daylight is a mirror. Not cream — cream is a warm, soft, domestic signal and this product is neither. |
| `--sheet` | `#F4F5F3` | Raised panels, the widget body, cards | The data sheet laid on the slab. Lighter than the surface, so panels read as paper *on* concrete rather than holes cut into it. Still not `#FFFFFF`. |
| `--ink` | `#14171A` | All text, ticks, rules | Print ink. Sits at ~14:1 on `--concrete`, which is readable one-handed, at arm's length, in sun. |
| `--rule` | `#9BA29C` | Measurement ticks, borders, dividers, disabled | The graduation marks on a steel rule. Never used for text. |
| `--hazard` | `#FF6A13` | The single primary action per viewport, and the live price figure | Safety orange. It is already the colour of the cones, tape, and vests on his own job site, so it reads as *his* environment rather than as a brand accent. High chroma, deliberately. |
| `--cure` | `#1F5F52` | Status only: success, confirmed, cured, "quote sent" | Deep cured pigment green. Status semantics only — never a button, never a heading, never decoration. |

**Dark Industrial variant** — not an inversion. Inverting a data sheet gives you a photographic negative, which looks like a bug. This variant is a different instrument: a backlit control panel rather than paper in daylight.

| Token | Hex | Note |
|---|---|---|
| `--concrete` | `#191C1B` | Sealed dark concrete, not black. |
| `--sheet` | `#23272A` | Panel housing, slightly blue-cool against the surface. |
| `--ink` | `#E6E9E5` | Warm-neutral off-white. Never pure white on dark — it haloes. |
| `--rule` | `#4A524D` | Etched marks, lower contrast than the light variant by design. |
| `--hazard` | `#FF6A13` | **Unchanged.** Safety orange does not change with the lighting; that is the entire premise of a safety colour. This is the detail that makes the two variants feel like the same manufacturer. |
| `--cure` | `#3E9C86` | Lifted for contrast against the dark surface. |

Semantic tokens (`--warning`, `--danger`) derive in Phase 1 and are held to WCAG AA against both surfaces.

## 1.2 TYPE — three roles

| Role | Face | Use |
|---|---|---|
| Display | **Archivo**, heavy weight, condensed width, tight tracking | Headlines, step titles, the price figure. A grotesque drawn for signage and high-impact print. Not a startup font, not a serif. Used with restraint: three sizes total, never for anything longer than eight words. |
| Body | **IBM Plex Sans**, 400 / 600 | All prose, labels, form fields, error copy. Engineering provenance, high legibility at small sizes on a mid-range Android. |
| Utility / data | **IBM Plex Mono**, 500 | Every number that is a measurement: square footage, price, coverage rate, tick labels, quote IDs, timestamps. Monospace is the instrument-readout voice, and tabular figures stop numbers from jittering as they animate. |

Estimated payload: Archivo variable subset ~28KB + Plex Sans 400/600 ~34KB + Plex Mono 500 ~16KB ≈ **78KB**. Under budget but tight, and three families is three sets of metrics to reconcile. *Revisited in Pass 2.*

**Scale** (1.25 ratio, spec-sheet compact): 12 / 14 / 16 / 20 / 25 / 31 / 39 / 49px. Body 16px minimum, never smaller — a 14px form label at 360px in sunlight is a support call.

## 1.3 LAYOUT

**Concept.** A data sheet lying on a slab. Content sits in flat panels with a 2px milled radius, separated by generous dead space rather than boxes-inside-boxes. Every panel carries a small monospace field label in the top-left corner, the way a real spec sheet labels its blocks. No cards floating on shadows; elevation is expressed by surface value, not by blur.

### Public hero — `/`

```
┌─────────────────────────────────────────────────────┐
│ GIRDER                                    [Pricing] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  COVERAGE / 01                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  PRICE YOUR FLOOR                             │  │  ← display, condensed heavy
│  │  Photo of the slab. Price in ninety seconds.  │  │  ← body
│  │                                               │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │   [ WIDGET — LIVE, STEP 1 ]             │  │  │  ← the hero IS the widget
│  │  │   What are we coating?                  │  │  │
│  │  │   ┌────────┐┌────────┐┌────────┐        │  │  │
│  │  │   │ GARAGE ││ PATIO  ││ COMM.  │        │  │  │
│  │  │   └────────┘└────────┘└────────┘        │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│ ╫──╫──╫──╫──╫──╫──╫──╫──╫──╫──╫──╫──╫──╫──╫──╫──╫  │  ← the datum rule, page-wide
│                                                     │
│  WHAT IT REPLACES / 02                              │
│  A franchise charges $49,500 and 6-8% of gross,     │
│  forever. This is the same customer-getting         │
│  system for $500 and 0%.                            │
└─────────────────────────────────────────────────────┘
```

No headline-with-a-button-under-it. A visitor arriving from TikTok can tap a surface type before scrolling anything.

### Widget modal — step 3, price

```
┌──────────────────────────────────────┐
│ STEP 03 / 04            [×]          │
│ ╫─╫─╫─╫─╫─╫─╫─╫─╫─╫─╫─╫─╫─╫─╫─╫─╫─╫ │ ← step datum strip
│                                      │
│ AREA                                 │
│ ┌──────────────────────────────────┐ │
│ │  480 SQ FT                       │ │ ← mono, tabular
│ │ ╫────╫────╫────╫──█─╫────╫────╫  │ │ ← the rule IS the slider
│ │ 0   200  400  600  800  1000     │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ESTIMATE                             │
│ ┌──────────────────────────────────┐ │
│ │ ╫────╫────╫────╫────╫────╫────╫  │ │
│ │           ├──────────┤           │ │ ← bracketed span = the range
│ │        $3,840    $5,280          │ │
│ └──────────────────────────────────┘ │
│                                      │
│ BREAKDOWN                            │
│  Surface prep      1,200 sqft  $960  │
│  Metallic epoxy      480 sqft $2,400 │
│  Oil contamination   modifier   +18% │
│                                      │
│ [ GET MY PRICE ]                     │ ← hazard, the only one on screen
└──────────────────────────────────────┘
```

## 1.4 SIGNATURE — the datum rule

**The one element this product is remembered by.**

A machined measurement scale, drawn in CSS, that appears on exactly three surfaces and nowhere else:

1. **The square-footage slider is the rule.** Not a track with a knob on it — a graduated steel scale with a machined indicator riding it, graduations labelled in mono.
2. **The price range is a bracketed span on the rule.** Low and high are two ticks with a bracket drawn between them, not two numbers in a box. This is the reason the whole idea earns its place: a quote *is* a span, and showing it as a span on a scale is more truthful than any other representation. The contractor understands instantly that he is looking at a range and not a promise — which is also the legally safer reading.
3. **Step progression is a datum strip** along the top edge of the widget: short ticks for each step, a long labelled tick for the current one.

**Why it's the risk worth taking.** Every quoting tool on earth puts the number in a big bold box. This one puts it on an instrument. It costs nothing in bytes, it works at 360px, it encodes something true about the content rather than decorating it, and it is not a look any competitor or any other AI-built site is currently wearing.

**Where boldness is *not* spent, so that this can be:** no gradients, no glows, no shadows, no imagery outside the finish swatches, no illustration, no icon set beyond a minimal functional few, one accent colour used on under 3% of pixels.

## 1.5 MOTION

Inside LazyMotion + `domAnimation`. Transform and opacity only.

**Moves:**
- The bracketed span translates and scales along the rule as square footage changes.
- The price figure counts, using tabular mono figures so nothing reflows.
- The analysis moment in step 1 — a scan pass across the uploaded photo, resolving into labelled callouts on the detected conditions. This is the highest-leverage animation in the product and the only place a full orchestrated sequence is permitted.
- Step transitions: 180ms, translate + fade.

**Stays perfectly still, deliberately:**
- Every tick mark on every rule. The scale is a fixed reference; a measuring device whose graduations drift is a broken measuring device. This is the point of the whole thesis.
- All typography. No text animates, ever.
- Panel edges and the page frame.

**Reduced motion:** the span jumps to position, the figure sets without counting, the scan pass resolves to its finished state immediately. The rule is static by nature, so the reduced state loses a transition and no meaning — which is the test the brief set.

---

# PASS 2 — CRITIQUE AND REVISION

## 2.1 It was two decisions away from banned look (c)

"Spec sheet" and "broadsheet with hairline rules, zero radius, dense columns" are close neighbours. A version of Pass 1 exists that is just the default editorial look with construction words on it.

**Changed:**
- **No serif anywhere in the system.** Broadsheet's tell is a high-contrast serif; the whole stack is now grotesque and mono. A serif is not available even as an option.
- **Rules are graduated, not uniform.** A hairline border is decoration. A tick scale with graduation marks of varying length that encode magnitude is information. Every horizontal line in this system is either a measurement scale or it is deleted. There are no divider lines that merely divide.
- **Radius is 2px, not 0.** Zero radius is the editorial tell. 2px reads as a milled edge on a machined part. Small distinction, decisive one.
- **Panels, not columns.** Layout is flat labelled blocks with dead space between them, not dense multi-column text.

## 2.2 The orange was one step from banned look (a)

An orange accent risks reading as the terracotta tell, which on this brief would be the most embarrassing possible outcome.

**Changed / confirmed:**
- Surface is `#E4E6E3` — cool, green-cast grey. Cream `#F4F1EA` is warm and yellow. Held these side by side deliberately; they are not the same family and are not mistakable.
- `--hazard` is `#FF6A13`, high chroma. Terracotta `#D97757` is desaturated and dusty. The distinction is saturation, and it is large.
- Orange is capped at **under 3% of pixels**, is never used for text, never for a large fill, and never appears more than once per viewport.
- The pairing is different in kind: (a) is cream + high-contrast serif + dusty clay. This is cool concrete + condensed grotesque + safety orange + monospace data.

## 2.3 The type stack was overbuilt — the real revision

Three families at ~78KB was within budget but wrong in kind: three sets of metrics, three vertical rhythms to reconcile, and no phase after this one has the budget to fix a type system that fights itself.

**Changed:** Archivo is a variable font with both a weight and a **width** axis. One file therefore serves both display and body — condensed and heavy for headlines, normal width at 400/500 for prose — with perfectly consistent metrics because it is literally the same typeface.

**Revised stack:**

| Role | Face | Est. size |
|---|---|---|
| Display + Body | **Archivo Variable** (wght 400–700, wdth 62–100), latin subset | ~35KB |
| Data / utility | **IBM Plex Mono 500**, latin subset | ~16KB |
| | **Total** | **~51KB** |

Two files instead of three, roughly 27KB saved, and the display/body relationship is now a width relationship rather than a negotiation between strangers. The character that Pass 1 was buying with a separate display face is bought instead with the width axis, which is a more interesting answer.

> **VERIFY:** These are estimates from typical woff2 latin subsets, not measured. Phase 1 must self-host both, subset to `latin` only, and state the measured bytes in the First Push Checklist. If the real total exceeds 100KB, drop Archivo's width axis and ship two static instances.

## 2.4 The truck-cab test

*Would a skeptical contractor in a truck read this as expensive industrial equipment, or as another software company about to waste his money?*

Equipment — but Pass 1 had a glare problem it hadn't accounted for. A phone at full brightness in a Texas cab, plus a near-white panel, is a mirror.

**Changed:**
- `--sheet` is `#F4F5F3`, never `#FFFFFF`. No pure white surface exists in the system.
- Display weights default heavier than a screen designer's instinct, because thin type disappears in glare before body text does.
- Dark Industrial is offered as a genuine equal on `/s/[slug]`, not a novelty toggle. Some of these calls happen at 7am in a cab and some happen at 9pm in a shop.

## 2.5 Removing one accessory

`--cure` teal was going to serve double duty as a secondary button colour. Cut. It is status-only now: success, confirmed, cured. Secondary actions are `--ink` outline on `--sheet`.

Reason: two accent colours is two claims on the reader's attention, and the datum rule cannot be the one memorable thing if there is a teal button competing for the same job. The boldness is spent in one place.

---

## 3. WHAT PHASE 1 INHERITS

- The six light tokens and six Dark Industrial tokens above, as CSS custom properties.
- Three named variants: `default`, `light`, `dark-industrial`. `default` maps to `light`.
- Type scale: 12 / 14 / 16 / 20 / 25 / 31 / 39 / 49.
- Radius: `--r-milled: 2px`. One radius value in the entire system.
- Motion durations: `--t-step: 180ms`, `--t-span: 240ms`, `--t-scan: 1400ms`.
- Font loading: self-hosted, latin subset, `font-display: swap`, preloaded in the root layout.
- The datum rule is a Phase 4 component, but its tick geometry and graduation logic are tokens, defined in Phase 1 so the admin chrome and the widget cannot drift apart.
