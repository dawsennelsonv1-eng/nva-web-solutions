# BUILD_HANDOFF.md — Phases 13D and 14–15

Everything built in one session, what each piece does, and the thing about it
you would otherwise have to rediscover.

Read alongside `LAUNCH_CHECKLIST.md`. This says what exists; that says what to
verify before a customer touches it.

---

## HOW TO READ THIS

Every entry has three parts:

- **What** — the change.
- **Why** — the reasoning, especially where it is non-obvious.
- **Know this** — the thing that will bite you, or the decision you may want to
  revisit.

Anything marked **VERIFY** is a value I could not test from the build
environment and you should check before it matters.

---

## CORRECTIONS TO THE FIRST VERSION OF THIS DOCUMENT

This file was rewritten after two things went wrong in deployment. Both are
recorded here rather than quietly edited out, because the failure mode they
share is the useful part.

### 1. I said seven marketing components were orphaned. Three were load-bearing.

The first version of this document, and three separate messages before it, told
you `components/marketing/*` was imported by nothing and safe to delete. You
deleted them and **the build failed**: `CtaButton`, `FranchiseComparison` and
`useInViewport` are all in active use.

**What actually happened.** I grepped a directory containing only the files you
had sent me in bundles, not your repository. `PayloadScreen.tsx`,
`PurchaseCta.tsx` and `app/(public)/pricing/page.tsx` — the three importers —
were never in any bundle. I searched an incomplete tree and reported the result
as a fact about your codebase.

**The correct answer, audited against the real repo:**

| File | Importers | Verdict |
|---|---|---|
| `CtaButton` | 2 | **KEEP** |
| `FranchiseComparison` | 1 | **KEEP** |
| `useInViewport` | 1 | **KEEP** |
| `Hero` | 0 | orphan |
| `HowItWorks` | 0 | orphan |
| `WhoItsFor` | 0 | orphan |
| `ProofOfFlexibility` | 0 | orphan |
| `InfiniteMotion` | 0 | orphan |

Re-audit before ever acting on a claim like this:

```
for f in Hero HowItWorks WhoItsFor FranchiseComparison ProofOfFlexibility \
         CtaButton InfiniteMotion useInViewport; do
  n=$(grep -rl "marketing/$f" --include=*.tsx --include=*.ts . \
      | grep -v "^./components/marketing/" | wc -l)
  echo "$f: $n importers"
done
```

**The generalisation worth keeping:** anything in this document derived from
searching, counting or "nothing uses X" was computed against the subset of your
repo that reached me in bundles. Statements about specific files I was handed
are reliable. Statements about the ABSENCE of something across the whole tree
are not, and should be re-run locally before you act on them.

**One live finding from that audit:** `useInViewport` has a real importer, so an
IntersectionObserver IS running in your shipped tree. 13A bans scroll-triggered
reveals. Worth checking what imports it and whether that use is legitimate.

### 2. `npm run typecheck` would have caught every red build in this session

Your deployment history is roughly half red, and almost every failure is a type
error or an unresolved module — both of which `tsc` reports in about ten
seconds, offline, in Termux.

```
npm run typecheck
```

**Make it a reflex before every `git push`.** You have no local build, but you do
have a local typechecker, and it catches the exact class of failure that has
been burning your deploy cycles. This is the single highest-leverage habit in
this entire document.

---

# PART 1 — PHASE 13D: THE PUBLIC SITE

## 1.1 The live hero (`CalibrationCheck`, `CountingFigure`)

**What.** The homepage hero was two text inputs and a static table. It is now
the graduated `DatumRule` slider with digit-level counting figures, an
always-visible itemised breakdown, and a flash on the lines that a finish or
modifier choice moved. It opens pre-priced at 480 sqft — a two-car garage.

**Why.** 13B deliberately made it inert ("NOTHING HERE ANIMATES"). That is
affordable for traffic that already decided to evaluate you; it is not
affordable for organic social traffic that decides in under a second, on
movement.

**Know this.**
- Most of the work already existed in the wrong place. `DatumRule` and
  `PriceSpan` were already built for the widget; the hero simply never used
  them. This was largely wiring.
- **Counting is switched OFF while the slider is dragged.** A moving target
  restarts a 240ms ease-out every frame, so the number would trail the thumb and
  never settle. During drag it writes immediately; on a tap it counts.
- Drag events are coalesced to one React commit per animation frame. Without
  that, the pricing kernel's zod parse runs several times between paints.
- `CountingFigure` duplicates ~40 lines of `PriceSpan` on purpose:
  `PriceSpan` uses the condensed font face, which is **not preloaded** — fine
  behind a modal, wrong for the largest number above the fold on cold 4G.
- I removed a `left` transition from `DatumRule`. It lagged the thumb ~180ms and
  transitioned a *layout* property every frame. This also improved `/demo` and
  `/s/[slug]`.

## 1.2 Finish photography (`finish-photos.ts`, `FinishPhoto`)

**What.** A single source of finish reference imagery serving the hero
selector, the showcase cards and the widget's finish step.

**Why.** The design doc specified photographs instead of icons; zero shipped,
which is why the page read as a wall of text.

**Know this.**
- **The type has no field for a client, a job, a location or a date.** Not
  optional ones — absent ones. Adding "Dallas, TX" requires editing the
  interface in a visible diff, rather than filling a blank that was already
  inviting it.
- `caption` is required and printed at every call site. An uncaptioned
  photograph on a contractor's page reads as portfolio by default.
- **Missing files degrade to a ruled plate with the caption.** Ship before you
  have the photos.
- Nothing is ever `priority`. Your LCP element is the headline, and preloading
  images would push its font back.
- **You still owe 8 files**, 800×600 WebP q80 under 60KB:
  `epoxy-flake`, `epoxy-metallic`, `epoxy-solid-polyaspartic`,
  `painting-{flat,eggshell,satin,semi-gloss,gloss}` in `/public/finishes/`.
- **Licensing is on you.** Own photos, commercial stock, or written
  manufacturer permission. A manufacturer's product-page image is not free
  because you buy the product.
- Painting sheens only photograph under raking light. Flatly lit, all five look
  identical — supply none rather than five that are secretly one.

## 1.3 The showcase (`Showcase`, `MiniPricer`)

**What.** Live cards on the homepage for in-service tools, each with a working
zero-quota pricer, plus an honest strip linking to the build queue.

**Know this.**
- **`MiniPricer` consumes zero quota by construction, not by a flag.** No photo
  step, no vision call, no server action, no network request. It calls the
  pricing kernel in the browser. A flag can be dropped by a refactor; an absent
  code path cannot.
- **Only epoxy has a live card.** Painting is genuinely IN SERVICE — the module
  is registered and prices repaints — but there is no published rate document
  for it, and inventing Dallas painting rates would put a fabricated number on
  your most-viewed surface. Painting shows a truthful card with a stated reason.
- To make painting live: write the painting equivalent of
  `lib/site/reference-rates.ts`, then add one entry to `LIVE_PRICERS`.
- The "17 more trades" count is computed from the catalogue, never typed.

## 1.4 Navigation and `/categories`

**What.** Nav is now Home · Categories · Build queue · Pricing · Demo (five,
the ceiling). Mobile menu is full-screen, opaque, links bottom-weighted into
thumb reach, 60px targets, no transition. `/categories` groups all 19 trades
into 6 categories.

**Know this.**
- Statuses come from `getQueueSections()`, which reconciles against the vertical
  registry — so the page **cannot** show green for a module that cannot price.
- `assertCategories()` fails the route loudly if a 20th tool is added without a
  category. Verified passing against all 19.
- `demoHrefFor()` exists because `/demo` is hardwired to epoxy. Sending a
  painter there would show him a garage floor under his own trade's name.

## 1.5 Real metrics (`lib/site/metrics.ts`, `ProofOfOperation`)

**What.** Three new metrics queried from real sources. The section now returns
`null` entirely when nothing is real.

**Know this.**
- Previously the grid was gated but the heading and "counted from the database"
  paragraph rendered regardless — announcing data and showing none.
- Real today: live installs, quotes produced, median AI response
  (`ai_jobs.duration_ms` where `status='succeeded'`), median time to quote
  (`widget_opened` → `quote_calculated` paired on `session_id`), build log
  entries this month.
- **Uptime is absent and always will be.** Software cannot report its own
  downtime — if it were down it would not be writing the row.
- I renamed "deploys" to "build log entries." `build_log` is hand-written, not a
  deploy hook. Calling it deploys claims an automated measurement for a manual
  one.
- Medians are computed in JS over a 2000-row sample, not `percentile_cont`, to
  avoid shipping a migration for a number that may be null. **Median not mean:**
  one 30s timeout drags a mean of twenty samples up by a second.

---

# PART 2 — MULTI-TENANCY

## 2.1 `0014_companies.sql` — companies, members, roles, RLS

**What.** `companies`, `company_members`, a `company_role` enum
(`principal`/`foreman`/`crew`), `prototypes.company_id`, `leads.assigned_to`,
six SECURITY DEFINER helpers, and policies on companies, members, prototypes,
quotes, leads and quote_configs.

**Roles.** Principal = owner (billing, seats, every lead). Foreman = every
company lead, no seat control. Crew = only leads assigned to him.

**Know this.**
- **This SQL was never executed.** I could not install Postgres. Run it inside
  `begin; … rollback;` in the SQL editor before committing for real.
- Helpers are `SECURITY DEFINER` because a policy on `company_members` that
  queries `company_members` recurses infinitely — it fails at *query* time, not
  migration time.
- **`seat_limit` is protected by a column grant, not a policy.** My first draft
  used `with check (… and seat_limit = seat_limit)`, which is a tautology —
  `WITH CHECK` only sees the new row. RLS cannot express "this column may not
  change"; column privileges can.
- Leads and quotes reach their company *through* their prototype, so a lead
  cannot disagree with its prototype about who owns it.
- **The service role still bypasses everything.** Any member-facing read through
  `lib/supabase/admin.ts` silently disables every policy here.
- The file ends with 10 tests. Two matter most: another company's lead by
  primary key must return zero rows, and a `/demo` lead must be invisible.

## 2.2 Member surface (`/login`, `/app`, `lib/auth/member.ts`)

**What.** A separate door for contractors, a shell resolving membership once,
an overview with role-scoped stats, and a leads pipeline.

**Know this.**
- **Two sign-in pages on purpose.** A foreman should never see a screen marked
  ADMIN; separate routes keep credential-stuffing blast radius apart; and
  wrong-door handling must differ.
- I changed your admin middleware: it used to sign out any authenticated
  non-admin. A foreman clicking a stale `/admin` link now redirects to `/app`
  **with his session intact**.
- **Middleware does not check membership** — that is a round trip on every
  navigation whose answer the layout needs anyway. It proves someone is signed
  in; the layout resolves who.
- **There is not one company filter in any query.** RLS answers correctly per
  caller. A redundant `.eq('company_id', …)` would imply the filter is what
  protects the data, and the next person would believe it.
- `lib/companies/db.ts` widens the **cookie-bound** client. Copying
  `lib/queue/db.ts` would have used service_role and disabled every policy while
  looking perfectly correct.
- A user can belong to several companies; there is **no switcher**, so the
  oldest membership wins. `otherCompanyCount` is surfaced so it can be stated
  honestly.

## 2.3 Team management (`app/actions/team.ts`, `TeamManager`)

**Know this.**
- Uses **both** Supabase clients. Service role does exactly one thing — minting
  the Auth identity. Everything else is cookie-bound so RLS runs. The membership
  row is deliberately *not* written with the admin client.
- **Seats are enforced only here.** `0014` made `seat_limit` a plain column with
  no trigger so an over-seated company can be fixed without SQL. There is no
  second net.
- **Lockout guard:** demoting or removing the last principal is refused. RLS
  cannot express this — policies decide on rows, not on the table's state after
  a write.
- **Removal deletes the membership, never the Auth user.** Someone may work for
  two contractors; deleting the identity would sign them out of a different
  company's account.
- **Known limit:** if the invited email already has a sign-in, Supabase refuses
  the invite and does not return the id, so the action scans the first 1000 Auth
  users. Fine at your scale; commented in place. No email is sent in that case
  and the action returns a note telling the principal to inform them.

---

# PART 3 — ADMIN

## 3.1 `/admin/pricing`

**What.** A validated editor for `quote_configs.rules`, `sqft_min`, `sqft_max`,
plus condition modifiers.

**Why.** Rates were previously only changeable by editing the database. That is
survivable at one customer and breaks at two.

**Know this.**
- **The form has no field list.** It walks the saved rules document, so any
  vertical gets a working editor with no code change. Admin never learns a
  trade's specifics — the Phase 11 rule.
- **Validation is entirely the module's** `pricingRuleSchema`. `.strict()`
  rejects invented keys; real bounds reject a modifier typed as 1800.
- **The bug the round-trip test caught:** my first `unitFor` used `/Cents$/`.
  Your two most important keys are `baseRateCentsPerSqft` and
  `prepRateCentsPerSqft` — Cents is in the *middle*. They rendered as raw `550`
  instead of `$5.50`, and correcting a rate to `5.75` would have stored **5.75
  cents per square foot**. A 480 sqft garage would have quoted at ~$28. The
  schema would not have caught it: `z.number().int().positive()` accepts 6 as
  happily as 600.
- Verified after the fix: rates display as dollars, `5.75` stores `575`, an
  unedited round-trip is byte-identical.
- The whole document is replaced rather than patched, so a save racing another
  save cannot leave rules half-old and half-new.

---

# PART 4 — THE VISUALISER

## 4.1 `lib/ai/images.ts` — the image client

**Know this.**
- **Separate from `lib/ai/providers/`** because everything there speaks chat
  completions: messages in, tokens out, cost from a per-million table. Images
  use a different endpoint, return base64, and bill per image.
- **I was wrong about FLUX.1 Kontext** and checked before writing. It is
  superseded by FLUX.2; the current field also includes Gemini Flash Image and
  gpt-image-2. OpenRouter now has a dedicated `/api/v1/images` endpoint.
- Billing is **all-or-nothing**: a failed generation returns 502 and is not
  billed. Actual USD cost comes back in `usage.cost`, so nothing is estimated.
- **There is no auto-router for images.** `openrouter/auto` is a
  chat-completions feature. I built the equivalent: an ordered fallback chain.
- **The chain is ordered by latency, not quality.** OpenRouter's own docs report
  94 seconds for a gpt-image-2 render — not a widget step, an abandonment.
- Only some failures fall through. A stale slug or provider outage advances; an
  empty wallet, rate limit or timeout stops, because a second model spends the
  same absent credit or adds another 45 seconds.
- **VERIFY:** the chain order is from documentation, not from renders I have
  seen. Test three candidates on a real garage photo. Reorder via
  `AI_IMAGE_MODELS` in Vercel — no redeploy.

## 4.2 `lib/ai/visualise.ts` — the job

**Know this.**
- **The prompt is a list of prohibitions, not a description.** It names walls,
  ceiling, door, shelving, vehicles, camera angle and lighting as things to
  preserve, forbids tidying or relighting, and asks for *ordinary* — not glossy,
  not showroom. A model asked to make a room look good will stage it.
- `RENDER_DISCLOSURE` ships **with the result**, not with a component, because
  the same image goes to the widget, the contractor's email and the leads inbox.
- Budget is checked before calling out. A render costs 10–40× a vision analysis;
  emptying the balance would take the quoting AI down with it.
- Failures are recorded in `ai_jobs` at zero cost — that row is what makes "the
  visualiser has been timing out since Tuesday" visible.

## 4.3 The step (`FinishPreview`, `app/actions/visualise.ts`)

**Know this.**
- **Three guards before money is spent:** per-IP rate limit, `validateImagePayload`
  (reused from the vision path — a looser check on the expensive endpoint is
  where the hole would be), then the daily ceiling.
- **Opt-in.** Auto-firing would spend the contractor's money on people who never
  asked for a picture.
- **Before and after side by side**, not a slider. The question is "how
  different is this," which is a comparison. It also makes a bad render obvious
  immediately rather than in the garage.
- **The picture is never load-bearing.** Every failure returns a reason and the
  quote continues. Test this by killing the API key.

## 4.4 Widget wiring

**Know this.**
- **The photo is now retained.** It used to be pass-through — produced, sent for
  analysis, discarded. Kept in component state, not the machine, because the
  machine is serialised into `demo_sessions` and asserted against in tests.
- Prompt words are read off the catalogue, never typed, so the picture and the
  quote describe the same product in the contractor's own names.
- **`renderPath` goes into machine state**, because the lead draft is assembled
  inside the machine at submit time. Held only in the widget it would have
  looked wired and silently dropped every render.
- `LeadDraft.renderPath` is **optional** so `PrototypeExperience` — which I never
  saw — compiles untouched.
- This broke one test, correctly: `machine.test.ts` deep-equals the exact draft
  shape. Adding `renderPath: null` to the expectation is the right fix; making
  the field conditionally absent would have been gaming the guard.

---

# PART 5 — DELIVERY, RETENTION, AUDIT

## 5.1 Lead emails carry the evidence

**Know this.**
- The confirmation template *said* that on a real site it "arrives with the
  calculated price range and photo attached." **It sent neither** — an unkept
  promise in the one email whose job is honest demonstration.
- Signed URLs are **7 days**, not the 300-second default, which would be dead
  before most contractors open their inbox.
- Images are **linked, not embedded**: clients block remote images, and inlining
  two photos pushes past Gmail's clipping threshold, which truncates the end —
  where the contractor's details live.
- The disclosure travels with the render here too.
- Bug caught: `quoteUuid` was scoped inside the new-lead branch, so a deduped
  resubmit would have emailed with no price.

## 5.2 `0015_lead_trade.sql`

Nullable and free text, both deliberate. Nullable because backfilling from the
quote's vertical would invent data. **Free text because the point is to hear
trades that are not in your nineteen** — an enum would discard the twentieth,
which is the signal that decides what gets built next.

## 5.3 `0016_lead_render.sql` + type sync

On the **lead**, not the quote, because a degraded capture writes a lead with a
null `quote_id` and the homeowner may still have asked to see his floor.
Separate from `quotes.photo_path` — one is the slab as it is, the other with the
finish on it; the pair *is* the comparison.

I also patched `types/database.ts` to add `assigned_to`, `trade`, `render_path`.
**This is a patch, not a fix** — see the debt section below.

## 5.4 90-day retention (`lib/storage/retention.ts` + cron)

**Know this.**
- `DATA_MODEL.md` §19 promised this; nothing deleted anything, and the
  visualiser doubled the data.
- **The filename is the clock**, not `created_at`. Your paths carry a
  millisecond stamp you wrote.
- **A name this system did not write is skipped, never deleted.** I tested eight
  cases including both 90-day boundaries and four filenames it must refuse.
- **Storage only — never a row.** Nulling `photo_path` would rewrite history: an
  old lead would look like one that never had a photo rather than one whose
  photo aged out.
- Capped at 500 per pass. Slower to drain, impossible to half-finish.
- **Needs `CRON_SECRET` in Vercel** or the route refuses in production.

## 5.5 `quote_config_updated`

Taxonomy first, then the typed emitter, then the call site — the order
`EVENTS.md` requires. Fires only on a successful write. `by` carries the admin
email, because `updated_at` already answers "did rates change"; this answers
"who, and was it the change we meant."

---

# WHAT TO KNOW ACROSS ALL OF IT

## The recurring hazard: `types/database.ts` is hand-written

It says it matches migrations 0001–0005. You are at 0016. This cost **one red
Vercel build and two hand-patches** in a single session, and it fails quietly —
a missing column resolves to `never`, producing a type error several lines from
the real cause.

```
npx supabase gen types typescript --project-id <ref> > types/database.ts
```

That one command also lets you delete `lib/queue/db.ts`, the cast in
`lib/companies/db.ts`, and `widenedAdmin()` in `lib/site/metrics.ts`.

## Service role vs cookie client

`lib/supabase/admin.ts` bypasses RLS entirely. After 0014, using it for a
member-facing read is not a bug — it is one contractor reading another's book of
business, while looking perfectly correct. `lib/companies/db.ts` exists to make
the right choice the easy one.

## Three migrations were never executed

`0014`, `0015`, `0016`. No Postgres in the build environment. Run each inside
`begin; … rollback;` first.

## Things I could not benchmark

- The image model chain order (**VERIFY**).
- Render quality and latency.
- Actual per-render cost.
- 60fps on your specific device.
- Any RLS policy, against a live database.

## Branch and deploy state, as of this writing

Phase 14 was built on `phase/14a` and merged to `main`. Roughly thirty stale
`phase/*` branches remain on the remote — untidy, harmless, and not worth a
build cycle to clean up.

## What is deliberately not built

- Painting has a module but no public surface — no rate document exists.
- Contractors cannot edit their own rates; only you can.
- No company switcher.
- Uptime is not measured and never will be from inside.
- Seventeen queued trades cannot price.

---

# THE HONEST BOTTOM LINE

You have a complete, coherent product. The engineering discipline in it — a
design system structurally unable to overstate what exists, a pricing kernel
that reads every number from config, metrics that return null rather than zero —
is better than most funded startups reach.

**None of that has been verified against a live database, and none of it has
met a contractor.** Those are the two things standing between this being an
asset and being a very well-built liability.

The checklist tells you how to do the first. The second one only you can do.

And one process note, earned the hard way in this session: **the failures here
were never in the hard parts.** The pricing kernel, the RLS policies and the
image pipeline all worked. What broke was a stale type file, a search run
against an incomplete tree, and a merge that went out without a typecheck. Slow
down at the boring steps — that is where this codebase actually breaks.
