# GIRDER — PHASE 4 HANDOFF

You are picking up from a session that shipped Phases 1–3 of the customer-flow
rebuild. Read `docs/BUILD_HANDOFF.md` first for how Dawsen works; this file
covers only what Phase 4 is and what it inherits.

---

## 1. WHAT PHASES 1–3 DID

**Phase 1 — the card presents itself properly.**
- Media gallery moved ABOVE the upload invitation (`.tc-gallery-lead`).
- `capture="environment"` REMOVED from the file input. That attribute does not
  mean "prefer the camera" on Android Chrome — it means camera only, no
  chooser, no camera roll. Every visitor was being forced to stand in the
  garage. Do not put it back.
- The card's second action was "More information" pointed at `specHref` — the
  page it was already on. Now "Implement this in my business" → `intakeHref`,
  which defaults to `/start?tool=<id>`.
- `app/phase26.css`.

**Phase 2 — measurement and the admin uploader.**
- 3–5 photos, a review grid, then ONE analysis call carrying every frame.
  `MIN_PHOTOS`/`MAX_PHOTOS` in `components/site/ToolCard.tsx`.
- `analyzePhotoAction` takes `images[]`; `imageBase64`/`mediaType` retained so
  older callers compile. Guards 1/2/4/5/6 stay per-REQUEST — one analysis, one
  session slot, one unit of the contractor's cap, however many frames.
- `lib/verticals/epoxy` gained `MULTI_PHOTO_PROMPT`, appended only when
  `selections.photoCount > 1`. BASE_PROMPT is untouched because every
  confidence floor in that module was calibrated against its exact wording.
- Admin media uploader: signed upload URL → browser PUTs straight to the
  `tool-media` bucket. The file never passes through a server action, because
  Next caps action bodies at 1 MB and base64 inflates by a third.
- `supabase/migrations/0021_tool_media_bucket.sql`, `app/phase27.css`.

**Phase 3 — the gate.**
- Price is LOCKED until name/phone/email/timeline are given.
  `components/site/ContactGate.tsx`.
- The render runs only on the far side of the gate, `autoStart`, because it
  costs 10–40× a vision call and an anonymous visitor must never trigger one.
- `attachRenderToLead` in `app/actions/lead.ts` writes `render_path` onto the
  lead and re-sends the notification once the picture exists.
- `app/phase28.css`.

---

## 2. WHAT PHASE 4 IS

### 2a. THE THREE-WAY EMAIL

Dawsen's words: the customer, Dawsen, and **the contractor who is testing the
tool** all receive the same submission, each seeing it from their own side.
The contractor's copy is topped with something like "As the customer:" then
"As the business owner:" below, so a prospect trying the demo sees exactly what
his own customers would send him and exactly what he would receive.

**What already exists** in `lib/notify/email.ts`:
- `notifyAdminOfDemoLead(fields)` → Dawsen
- `sendDemoContractorConfirmation(fields)` → currently the submitter
- `DemoLeadEmailFields` already carries `priceRange`, `renderUrl`,
  `renderDisclosure`, `surface`, `createdAt`
- `evidenceBlock(fields)` builds the shared HTML

**What is missing:** there is no third recipient and no concept of "the
contractor testing this". `submitDemoLead` has no field for one.

Likely shape — confirm with him before building:
- The tool page carries an optional `?via=<prototypeId|email>`, or the
  contractor's address is collected at `/start` and threaded through.
- A `demoRecipientEmail` on `SubmitDemoLeadInput`, bounded and optional.
- A third template composing both views into one message.

**Do not fabricate a contractor identity.** If nobody is testing, there is no
third recipient and the email must not invent one.

### 2b. THE NVA SERVICES DASHBOARD

He wants a company account named **NVA Services** whose `/app` he can film,
showing a real lead arriving with all its information. He will use this footage
to sell.

Two problems, both real:

1. **`/app` is on the legacy `globals.css` token system.** The member area was
   never restyled — it will not look like the homepage on camera, which is the
   entire reason he wants it. This is the bulk of the phase: a `phase29.css`
   covering `/app`, `/app/leads`, `/app/team` at the same standard as the
   marketing site.

2. **A self-serve company has no prototype, so it has no leads.** Leads are
   scoped by `company_of_prototype(prototype_id)` in `0014_companies.sql`. A
   demo lead has `prototype_id = null` and belongs to Girder, not to any
   contractor — RLS excludes it from every member. So a lead submitted through
   the public card will NOT appear in NVA Services' dashboard.

   To film this he needs: a `companies` row named NVA Services, a `prototypes`
   row with `company_id` pointing at it, and leads written with that
   `prototype_id`. That is also **exactly the gap that blocks self-serve
   purchase** (see §3), so solve it once, properly, rather than seeding a row
   by hand for the video.

---

## 3. THE OUTSTANDING ARCHITECTURAL GAP — READ THIS

**A self-serve signup creates a company and a membership and NO prototype.**

Consequences, all of which are live right now:
- `createCheckoutAction` requires `prospectId` AND `prototypeId`. A self-serve
  company has neither, so **a contractor who signs up today cannot buy.**
- The Phase-1 entitlement gate (`lib/entitlements/company.ts`) resolves
  company → prototypes → subscriptions. No prototype means permanently unpaid,
  which is *correct* but has no exit.
- No prototype means no leads can ever be scoped to that company.

Fixing this is one piece of work: **provision a prototype at signup**, linked to
the new company. It unblocks purchase, the dashboard, and Phase 4's footage
simultaneously. Ask him for `supabase/migrations/0001_init.sql` (the
`prototypes` table shape) and `app/actions/prospects.ts` before attempting it —
do not guess the insert.

---

## 4. TRAPS SPECIFIC TO THIS WORK

- **CSS layers only ADD.** Phase 27 originally used `.tc-shot`, which
  phase18.css had already given to `FinishVisualiser`'s before/after figures.
  Loading later, it won the cascade and centre-cropped the one image whose job
  is to show an unaltered garage. Corrected in Phase 3 to `.tc-pick*`. **When a
  layer cannot be read, use a prefix nobody would reach for by accident** and
  say so in the file header.
- **`import { cache } from 'react'` does not typecheck** under the pinned
  `@types/react` 18.3.12 — it is declared in that package's `canary.d.ts`, not
  `index.d.ts`. Same family as the `startTransition(async)` trap.
- `types/database.ts` still covers 0001–0005 plus 0017–0019. Post-0005 tables
  need a narrow structural cast, never `@ts-expect-error`.
- `lib/tools/media.ts` is `server-only`; client code imports shapes and limits
  from `lib/tools/media-types.ts`.
- **The permanent `MotionProvider` fix is still owed.** `DemoExperience`
  renders `<m.div initial={{opacity:0}}>` above its own provider, so outside a
  `LazyMotion` tree it sits at opacity 0 with no console error. The tool page
  wraps it; the real fix is moving the provider inside `DemoExperience`.
- **`PAYMENT.SALE.REFUNDED` may be the wrong event name.** If the real payload
  says `PAYMENT.REFUND.COMPLETED`, `EVENT_MAP` in `lib/payments/paypal.ts` is
  wrong and refunds never reverse an entitlement. Confirm from a real payload.

---

## 5. VERIFY ITEMS LEFT IN THE CODE

Grep for `VERIFY:` before starting. The two that matter for Phase 4:

- `components/site/ToolCard.tsx` — `persistDemoQuote` recomputes against
  `DEMO_RULES`, not against the card's own `pricer.rules`. Same constants today
  on the homepage and tool pages, so the stored figures match the screen. If a
  card is ever given different rules, `persistDemoQuote` needs a rules argument.
- `lib/quote/vision.ts` — `images` supersedes `imageBase64`; when both are
  passed, `images` wins.

---

## 6. HOW TO VERIFY BEFORE SHIPPING

He cannot build locally — Vercel is the only compiler, and there is no SWC
binary for android-arm64. **You are the build check.**

1. Typecheck against stubs of imports you cannot see. **Prove the harness is
   live by injecting a deliberate error and confirming it fails.**
2. Parse every new CSS file with postcss; diff its selector set against EVERY
   earlier layer you hold, and name the ones you do not.
3. Confirm no unused imports (his lint rejects them).
4. Confirm every `@/` import resolves to a file that exists or that you ship.
5. **Confirm your changes are actually in the output file** before zipping.
   Grep the built file for a distinctive string from each change.
6. Package from an explicit whitelist, never `zip -r` over a working directory
   — a harness stub shipped into `lib/` would overwrite a real module.

---

## 7. HIS ENVIRONMENT — NON-NEGOTIABLES

- Android phone + Termux. No laptop, no IDE, no local build.
- Full files only, never diffs. He does not edit code by hand.
- ZIP mirroring repo structure, delivered with `present_files`.
- Exact copy-pasteable Termux commands with his real values.
- Ask for every file you need in ONE bundle. Each round trip costs him real
  time, and he is often near a message limit.

File request shape:

```bash
cd ~/projects/nva-web-solutions && D=~/storage/downloads/nva-NAME.txt && : > $D && \
for f in path/one.ts path/two.tsx; do \
  echo "=== FILE: $f ==="; cat "$f"; echo; done >> $D 2>&1; wc -l $D; termux-open --send $D
```

`termux-open --send` opens the share sheet. `termux-share` does NOT work. `/tmp`
does not exist; use `$TMPDIR` or `~/storage/downloads`.

---

## 8. FIRST MESSAGE TO HIM

Confirm you have read this. State that Phase 4 is the three-way email plus the
NVA Services dashboard, and that the dashboard needs the prototype-provisioning
gap closed first or there will be no leads in it to film. Ask for one bundle:

```bash
cd ~/projects/nva-web-solutions && D=~/storage/downloads/nva-p4.txt && : > $D && \
for f in supabase/migrations/0001_init.sql supabase/migrations/0014_companies.sql \
         app/actions/signup.ts app/actions/prospects.ts lib/notify/email.ts \
         "app/(member)/app/layout.tsx" "app/(member)/app/leads/page.tsx" \
         components/member/LeadRows.tsx app/globals.css; do \
  echo "=== FILE: $f ==="; cat "$f"; echo; done >> $D 2>&1; wc -l $D; termux-open --send $D
```
