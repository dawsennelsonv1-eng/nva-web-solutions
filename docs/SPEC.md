# SPEC.md — Numbered Requirements

**Status:** decided in Phase 0. Canonical. Every requirement is testable from a phone. Phase 12A audits against this document.

Numbering: `R-0xx` cross-cutting · `R-1xx` widget · `R-2xx` public hub · `R-3xx` demo · `R-4xx` client prototype · `R-5xx` admin · `R-6xx` billing & entitlements · `R-7xx` brand engine · `R-8xx` verticals.

---

## R-0xx — CROSS-CUTTING

- **R-001** Every surface is usable one-handed at 360px width.
- **R-002** Every interactive element has a visible keyboard focus state.
- **R-003** `prefers-reduced-motion` is respected everywhere, and the reduced state is a designed state, not a broken one.
- **R-004** Animation uses transform and opacity only. Width, height, top and left are never animated.
- **R-005** Every async surface has a loading, empty, and error state.
- **R-006** Error copy states what happened and what to do next. It never apologises and is never vague.
- **R-007** All colour comes from theme tokens. A hardcoded hex anywhere outside the token definitions is a defect.
- **R-008** Framer Motion is imported only via the `LazyMotion` + `domAnimation` wrapper. A bare `motion` import anywhere is a defect.
- **R-009** Total self-hosted webfont payload is under 100KB, latin subset.
- **R-010** No server-only secret is reachable in a client bundle.
- **R-011** Every tenant-scoped database read goes through the single scoping helper in `lib/supabase/`.
- **R-012** Every entitlement decision is made server-side. A client-side check is presentation only and is never trusted.
- **R-013** The application never displays the phrase "website" on a customer-facing surface.
- **R-014** The customer-facing product name is Girder. The legal entity name appears only where NAMING.md §4 permits it.
- **R-015** All timestamps shown to a US contractor render in his local timezone, not the server's or the admin's.

## R-1xx — THE AI QUOTING WIDGET

### Flow
- **R-101** The widget has four steps: surface type, finish, area, lead capture.
- **R-102** Step 1 offers Garage, Patio, Commercial as direct selections, not a dropdown.
- **R-103** Step 1 accepts a photo by file input, drag-drop, and direct camera capture (`capture="environment"`).
- **R-104** The photo is optional. A homeowner who skips it reaches a deterministic quote using manual inputs.
- **R-105** Step 2 presents the finish catalogue for the active vertical with real colour options, usable at 360px with 20+ options.
- **R-106** Step 3 presents a square-footage control with a live-updating price range and an itemised breakdown.
- **R-107** Step 3 offers a "not sure?" affordance giving typical dimensions per surface type.
- **R-108** Step 4 shows the final price blurred until name, phone, email and timeline are submitted.
- **R-109** Back-navigation is available from every step and preserves prior input.
- **R-110** Widget state is resumable within a session.
- **R-111** Abandonment writes the exact step at which the session died to `demo_sessions`.

### Pricing
- **R-112** The AI never produces a price. Price is a deterministic function of `quote_configs` rules.
- **R-113** Every rate, modifier and bound comes from `quote_configs`. There are no magic numbers in pricing code.
- **R-114** The pricing function is pure and unit-tested, with tests shipped in Phase 3.
- **R-115** If the AI is unavailable, unsure, or wrong, the deterministic quote still works.
- **R-116** Slider changes recompute client-side with no server call.
- **R-117** Changing finish never triggers a new vision call.
- **R-118** The itemised breakdown shows which modifiers applied and why.

### Vision
- **R-119** The vision call returns strict JSON validated by Zod: surface type guess, condition grade, damage flags, oil staining, cracking severity, estimated area if inferable, and per-field confidence.
- **R-120** On validation failure the system performs exactly one repair retry, then falls through to manual entry.
- **R-121** Low confidence on a field never silently guesses. The field is handed to the user with clear copy.
- **R-122** The server validates image size and dimensions independently of the client and rejects oversized payloads.

### Modes
- **R-123** The widget takes an explicit mode prop: `live`, `prototype`, or `preview`. Mode is never inferred from route.
- **R-124** `prototype` mode simulates capture, writes no lead, and never consumes quota.
- **R-125** `preview` mode performs zero writes.

### Performance
- **R-126** Widget JS is under 150KB gzipped, excluding framework. The measured figure is stated in Phase 4.
- **R-127** The widget is interactive within 2.5s on a mid-range Android over 4G.
- **R-128** The image pipeline is code-split and loads only when a photo is chosen.

## R-13x — CLIENT IMAGE PIPELINE

- **R-131** Nothing over 400KB leaves the browser.
- **R-132** EXIF orientation is read and applied before resizing.
- **R-133** HEIC/HEIF is detected; if the browser cannot decode it, the user is told in plain language and given a working alternative. It never fails silently with a broken preview.
- **R-134** Images are downscaled to a stated maximum longest edge, justified against what the vision model resolves.
- **R-135** Re-encode targets WebP with JPEG fallback, tuned to a hard 400KB ceiling; if still over, downscale and retry.
- **R-136** All metadata is stripped, GPS included.
- **R-137** Processing runs off the main thread.
- **R-138** Three distinct progress states are shown: compressing, uploading, analyzing.
- **R-139** Unsupported type, corrupt file and absurd dimensions each refuse gracefully with copy telling the user what to do instead.

## R-14x — DEGRADED MODE

- **R-141** Degraded mode is a first-class code path with its own states, not an error path.
- **R-142** Degraded mode triggers on: monthly quota exhausted, session limit reached, subscription suspended, or AI unavailable.
- **R-143** In degraded mode the instant price and photo analysis are off and lead capture remains fully on.
- **R-144** The degraded lead is written with `was_degraded = true` and the correct `degraded_reason`.
- **R-145** The contractor's phone number is prominent and tappable in every degraded state.
- **R-146** No homeowner-facing string in degraded mode contains: limit, quota, cap, plan, upgrade, subscription, payment, unavailable, temporarily, sorry, unfortunately, or error.
- **R-147** The session-limit variant reads as normal, never as punishment.
- **R-148** Degraded mode never shows a paywall, an error, or anything implying the contractor is in arrears.

## R-2xx — PUBLIC HUB `/`

- **R-201** The live widget is the hero. Not a screenshot, not a video, not a headline with a button beneath it.
- **R-202** A visitor from a social ad can begin quoting without scrolling or clicking anything first.
- **R-203** LCP is under 2.5s on a mid-range Android over 4G.
- **R-204** Total first-load page weight is under 1MB.
- **R-205** The page holds 60fps on that device with all motion running, tested on scroll and not only on the hero.
- **R-206** Ambient motion pauses off-screen and when the tab is hidden.
- **R-207** Exactly one glowing or pulsing element per viewport.
- **R-208** Sections present: proof of flexibility, how it works, who it's for, the franchise comparison.
- **R-209** `/pricing` reads both tiers from the `plans` table. No price is hardcoded.
- **R-210** The billing-entity disclosure line appears above the fold on `/pricing`, at body size, never in a footer or tooltip.
- **R-211** Open Graph and Twitter card metadata are correct on every public route.

## R-3xx — INTERACTIVE DEMO `/demo`

- **R-301** `/demo` runs the widget in `live` mode, framed so the contractor understands he is walking the homeowner's path.
- **R-302** The contractor enters real contact information to unlock the result.
- **R-303** Submission writes a lead and quote to the database before any notification fires.
- **R-304** Admin notification and contractor confirmation are non-blocking; failure of either never fails the write or the on-screen result.
- **R-305** Notification failures are recorded in `leads.delivery_status`.
- **R-306** The payload screen shows Side A: his own submitted data, timestamped, rendered as the notification he would receive.
- **R-307** The payload screen shows Side B: a simulated homeowner lead package with generated name, photo, finish, calculated range, arrival time, and mock Accept / Call / Schedule actions.
- **R-308** Side B is deterministic per session and never re-randomises on re-render.
- **R-309** At 360px the payload screen uses a deliberate mobile treatment, not a squeezed side-by-side.
- **R-310** The payload screen ends with the purchase CTA, one tap from checkout.
- **R-311** The public submission endpoint has bot and duplicate protection.

## R-4xx — CLIENT PROTOTYPE `/s/[slug]`

- **R-401** The page renders with the contractor's logo, extracted colours, and vertical-specific copy naming his market.
- **R-402** It reads as his site, not as a demo of ours. The Girder mark appears once, in the footer.
- **R-403** LCP is under 2s.
- **R-404** The widget runs in `prototype` mode and never consumes quota.
- **R-405** A Style Toggle flips the widget between Light and Dark Industrial live, framed as proof of flexibility.
- **R-406** First-visit orientation is one line. No modal, no tour.
- **R-407** The "Get this live" CTA is reachable the instant he finishes testing the widget.
- **R-408** The CTA carries the prototype slug into checkout so the environment he tested is what he buys.
- **R-409** The offer beside the CTA states the franchise comparison, the price, the 30-day guarantee, 0% revenue share, and the billing-entity disclosure.
- **R-410** Slugs are unguessable. Entropy choice is justified in Phase 1.
- **R-411** A non-active slug returns 404, resolved in middleware.
- **R-412** Expiry and revoke produce a clean expired state that still sells.
- **R-413** Open Graph metadata pulls his logo and business name so the SMS preview is branded before he taps.
- **R-414** Analytics record: opened, furthest step reached, toggle used, CTA viewed.

## R-5xx — ADMIN `/admin`

- **R-501** Admin authentication is Supabase Auth, single operator, email and password.
- **R-502** All `/admin/*` routes require an authenticated admin session, enforced in middleware.
- **R-503** Every admin surface is fully usable at 360px. Desktop is not assumed to exist.
- **R-504** The dashboard shows today's leads, funnel step conversion, abandonment by step, MRR, and prototypes nearing their cap.
- **R-505** `/admin/leads` provides a table, source filter, detail drawer with full quote payload and photo, status pipeline, notes, and CSV export.
- **R-506** Degraded leads are visually distinct in the leads list and show their `degraded_reason`.
- **R-507** `/admin/prospects` implements the qualification scorecard from OFFER.md §7 and warns in plain language when a prospect is below the viable band.
- **R-508** `/admin/combiner` supports touch drag-and-drop and provides a non-drag fallback path to every action.
- **R-509** The combiner's live preview renders the actual `/s/[slug]` in an iframe with staged config injected — not a screenshot, not a mock.
- **R-510** A saved preset applies a full combination to a new prospect in one tap.
- **R-511** The deployment action saves config, mints a slug via `lib/slug.ts`, and produces a share card with URL, copy button, QR code, and pre-written SMS.
- **R-512** Prototype lifecycle supports draft, live and expired states with an expiry date and revoke.
- **R-513** `/admin/billing` lists subscriptions with status and next charge date, MRR and setup revenue, failed payments, manual mark-as-paid, refund recording, and a sortable closest-to-cap view.

## R-6xx — BILLING & ENTITLEMENTS

- **R-601** Only a verified webhook changes a subscription status or grants an entitlement. A checkout redirect never does.
- **R-602** Webhook signatures are verified; unsigned and mis-signed requests are rejected.
- **R-603** Webhook events are inserted into `webhook_events` before processing, using the UNIQUE `provider_event_id` constraint as the idempotency guard.
- **R-604** A duplicate webhook is acknowledged without reprocessing.
- **R-605** The webhook endpoint returns 2xx once the event is stored, even if downstream processing fails. Failures are recorded in `processing_error` for retry.
- **R-606** `/checkout/return` shows a pending state until the webhook lands, then resolves. It never grants access itself.
- **R-607** Checkout is a single hosted session containing both the one-time setup fee and the recurring subscription.
- **R-608** The failure mode where the setup fee succeeds but the subscription does not is explicitly handled.
- **R-609** The application never touches card data.
- **R-610** The payment provider sits behind an adapter. No Stripe type leaks outside `lib/payments/stripe/`.
- **R-611** Three provider implementations ship: `stripe`, `manual`, `stub`, selected by env var.
- **R-612** The `manual` provider is a permanent path, usable to record a payment by hand without deploying code.
- **R-613** Quota increments atomically at the moment a vision call succeeds, never before and never on failure.
- **R-614** `leads_captured` increments on lead write, independently of quota.
- **R-615** Usage counters reset on `current_period_start`, not on the calendar month.
- **R-616** Dunning follows days 1, 3, 5, 7, grace to day 10, then suspension, using OFFER.md §4 copy verbatim.
- **R-617** Every dunning send is logged to `dunning_events`.
- **R-618** Any successful payment resets the dunning machine to `active` immediately.
- **R-619** Suspension never takes a site offline and never stops lead capture.
- **R-620** No entitlement decision compares a tier string directly. Every call site routes through `check.ts`.
- **R-621** A client-supplied value can never influence a price, a plan, or a usage counter.
- **R-622** AI spend is bounded by a per-request output ceiling and a daily spend ceiling from env, both enforced server-side.
- **R-623** An unauthenticated request can never trigger a paid AI call outside the entitlement path.

## R-7xx — BRAND ENGINE

- **R-701** Colour extraction runs client-side in the admin browser using canvas, with zero native dependencies.
- **R-702** Server-side extraction exists behind a feature flag as Tier 2, with `runtime = 'nodejs'`.
- **R-703** Manual hex entry is Tier 3 and is always available and never hidden.
- **R-704** `brand_kits.extraction_source` records which tier produced the values.
- **R-705** The engine never hard-fails. Any logo produces a usable branded site via Tier 3 in under 30 seconds of admin time.
- **R-706** Extraction handles transparent PNGs, near-white and near-black backgrounds, monochrome logos, single-colour logos, and logos that are mostly one colour with a small accent.
- **R-707** Derived tokens are held to WCAG AA; a failing text colour is lightness-shifted until it passes and the adjustment is recorded.
- **R-708** Derived tokens are injected as CSS custom properties so `/s/[slug]` is branded on first paint with no flash.
- **R-709** Per-token manual overrides survive re-extraction when pinned.

## R-8xx — VERTICALS

- **R-801** A vertical supplies: id, display copy, surface types, finish catalogue, pricing rule schema, photo-analysis prompt, result renderer.
- **R-802** `epoxy` is registered fully in Phase 1; `painting` is registered as a stub proving the contract.
- **R-803** Adding a vertical requires creating new files only. Zero core files are edited.
- **R-804** `quote_configs` and `plans` seed per vertical.
- **R-805** The admin selects a vertical when creating a prospect.

---

## OUT OF SCOPE — explicitly not built

Anything in this list that appears in a pull request is a defect, regardless of how small the addition looks.

1. **The internal command center.** Role-based views for sales, marketing, crews and owner; KPIs, pipeline, ad stats, crew routing. Sold in Operator, scoped only when an Operator customer commits. Roughly ten times the work of the widget.
2. **Per-employee AI assistants.** Voice on a job site running diamond grinders. Revisit after Operator has paying customers.
3. **Multi-crew tier.** Not designed. Not priced, not in copy, not in schema, not in the plans table.
4. **Native mobile apps.** The product is a responsive web application.
5. **Homeowner accounts or logins.** Homeowners are anonymous. Their only artifact is a lead and a shareable quote URL.
6. **Contractor logins.** In this build the contractor does not log in. He receives email and SMS and his site runs without him. Any contractor-facing dashboard is Operator-tier work, deferred.
7. **Multi-operator admin.** Single operator, one account. No roles, no permissions matrix, no team invites.
8. **Scheduling, dispatch, invoicing, job management, CRM beyond a leads inbox.** That is ServiceTitan's territory and not this product.
9. **Payment methods other than card via hosted checkout.** No ACH, no PayPal, no crypto. The `manual` provider covers wires and cheques by hand.
10. **Automated SMS to homeowners.** SMS in this build goes to the contractor and the admin only. Homeowner SMS carries compliance obligations not scoped here.
11. **Traffic generation of any kind.** No SEO service, no ad management, no content production. The product converts existing traffic and the offer says so explicitly.
12. **Internationalisation.** English only, US market, USD only.
13. **Self-serve prototype creation by contractors.** The admin stages every prototype. There is no signup funnel that mints a slug.
14. **A/B testing infrastructure.** Analytics measure; they do not experiment.
15. **Roofing, or any vertical beyond epoxy and painting**, until the Phase 11 contract is proven.
