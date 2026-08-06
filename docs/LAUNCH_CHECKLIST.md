# LAUNCH_CHECKLIST.md — everything to verify before a paying customer touches this

**Status:** written at the end of Phase 14. Nothing in this document is optional
before the first contractor pays.

Work top to bottom. The order is deliberate: each section assumes the ones above
it passed. A failure in §3 makes everything below it meaningless, so do not
skip ahead to the fun parts.

**How to use this:** tick a box only when you have SEEN the thing happen, not
when you believe it should. "The code looks right" is how the 13D build went red
and how a rate would have shipped at 5.75 cents per square foot.

---

## 0. THE TWO THAT MATTER MOST

If you do nothing else on this list, do these. Everything else costs money or
embarrassment; these two cost the business.

- [ ] **§3.2 — a member of company A cannot read company B's lead by primary key.**
      One contractor seeing another's book of business is not a bug you apologise
      for.
- [ ] **§3.6 — a `/demo` lead is invisible to every member.** Those leads are
      YOURS. A customer reading your inbound pipeline is the same failure wearing
      a different hat.

---

## 1. SCHEMA AND TYPES

- [ ] Every migration through `0016_lead_render.sql` has been applied to the
      production project. Check with:
      `select name from supabase_migrations.schema_migrations order by version;`
- [ ] Each migration was run inside `begin; … rollback;` first and came back
      clean before being committed for real.
- [ ] **Types regenerated:**
      `npx supabase gen types typescript --project-id <ref> > types/database.ts`
- [ ] After regenerating, these three workarounds are deleted and the build still
      passes: `lib/queue/db.ts`, the cast inside `lib/companies/db.ts`, and
      `widenedAdmin()` in `lib/site/metrics.ts`.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes — all suites, not just the machine.
- [ ] `npm run lint` passes. Next fails a production build on lint errors, so a
      violation here is a red deploy, not a warning.

---

## 2. ENVIRONMENT

Check these in the Vercel dashboard for the PRODUCTION environment specifically.
A variable set only on Preview is the classic silent launch failure.

- [ ] `NEXT_PUBLIC_SITE_URL` — set to the real domain. It resolves OG image URLs
      and is sent as OpenRouter's attribution header. Wrong value = a bare link
      when somebody pastes your site into a DM.
- [ ] Supabase URL, anon key, and service-role key.
- [ ] `OPENROUTER_API_KEY`, and the account has credit. A prepaid balance at zero
      returns 402 and every AI feature degrades at once.
- [ ] `AI_IMAGE_MODELS` — optional. Leave unset unless §7.4 tells you to reorder.
- [ ] `RESEND_API_KEY` and `EMAIL_FROM`. Absent is a VALID state — email silently
      skips rather than erroring — which means an unconfigured mailer looks
      exactly like a working one until a lead goes unnotified. Verify by sending.
- [ ] Stripe keys and webhook secret, in LIVE mode, not test.
- [ ] The daily AI spend ceiling is set to a real number. Zero switches AI off
      entirely; too high and one bad afternoon empties the balance.

---

## 3. MULTI-TENANCY AND RLS — THE CRITICAL SECTION

You need **two real member accounts on two different companies** to test this.
Create them properly through `/app/team`, not by inserting rows.

Run each as the signed-in member through the app, not with the service role —
service_role bypasses RLS by design and will make every one of these pass
falsely.

- [ ] **3.1** Member of company A lists leads at `/app/leads`. Sees only A's.
- [ ] **3.2** Member of A fetches a lead belonging to B **by primary key**.
      Returns zero rows. *(Critical.)*
- [ ] **3.3** A crew member sees only leads whose `assigned_to` is his own
      membership id. Unassigned leads do not appear.
- [ ] **3.4** A foreman sees every lead on his company, assigned or not.
- [ ] **3.5** A crew member updates another member's lead. Zero rows affected.
- [ ] **3.6** Any member queries a `/demo` lead (`prototype_id is null`).
      Zero rows. *(Critical.)*
- [ ] **3.7** A crew member sets his own role to `principal`. Denied.
- [ ] **3.8** A principal updates `companies.seat_limit`. Denied — the column
      grant, not a policy, is what stops this.
- [ ] **3.9** `anon` selects from `companies` or `company_members`. Error 42501,
      not an empty 200.
- [ ] **3.10** A prototype with `company_id is null` is invisible to every member.
- [ ] **3.11** Removing a member does NOT delete their Supabase Auth user, and
      their leads fall back to principal/foreman visibility.
- [ ] **3.12** Removing or demoting the last principal is refused. Confirm the
      error message appears rather than the account being orphaned.

---

## 4. AUTH AND THE TWO DOORS

- [ ] `/admin/login` signs in an `app_admins` email and lands on `/admin`.
- [ ] `/login` signs in a member and lands on `/app`.
- [ ] A member who visits `/admin` is redirected to `/app` and **stays signed
      in**. He must not be logged out for clicking the wrong door.
- [ ] A signed-in user with no membership sees the "No company yet" screen with a
      working sign-out — not a redirect loop.
- [ ] An already-signed-in admin visiting `/admin/login` bounces to `/admin`.
- [ ] Signing out from `/app` lands on `/login`, not `/admin/login`.
- [ ] Session survives a page refresh and an app-switch on Android.

---

## 5. THE WIDGET FUNNEL — WALK IT ON A REAL PHONE

Do this on a mid-range Android, on mobile data, in daylight. Not on desktop.

- [ ] Surface type → photo upload → analysis → finish → area → capture → price.
      The whole path, end to end, on `/demo`.
- [ ] The same path with **no photo** (skip). It must still price and still
      capture a lead.
- [ ] A lead row appears with the right name, phone, email and timeline.
- [ ] The quote row carries `photo_path`, and the photo opens from the leads
      inbox.
- [ ] `/q/[quoteId]` renders for a real quote and is shareable.
- [ ] Back navigation through a dynamic step plan does not lose answers.
- [ ] Abandoning mid-funnel writes `widget_abandoned` with the right
      `abandoned_step`. Test by backgrounding the app, not by closing the tab —
      `beforeunload` frequently never fires on Android.
- [ ] `/s/[slug]` for a real prototype behaves identically.

---

## 6. PRICING CORRECTNESS

This is the one place a bug is invisible and expensive.

- [ ] Take a job you have actually quoted. Run it through the hero calibration
      check. The band brackets your real number, or you understand exactly why
      it does not.
- [ ] The itemised breakdown reproduces the documented order: coating, prep,
      modifiers on the subtotal, flat mobilisation, job minimum, then the band.
- [ ] At the minimum area, the midpoint is raised to the job minimum and the
      breakdown says so.
- [ ] `/admin/pricing` — change a rate, save, and confirm the NEXT quote uses it
      while an existing quote row is unchanged.
- [ ] Type `1800` into a condition modifier. The save is **refused** by the
      vertical's schema.
- [ ] Confirm rates display as dollars (`5.50`) and store as cents (`550`).
      Check the database directly. This is where a 100× error hides.
- [ ] `lib/site/reference-rates.ts` still matches the seeded epoxy config in
      `seed.sql`. They are duplicated deliberately and must not drift.

---

## 7. THE VISUALISER

- [ ] **7.1** Put a **real garage photo** through it. Not a stock image.
- [ ] **7.2** The walls, door, shelving, vehicles and camera angle are unchanged.
      If the model redrew the room, the feature is worse than useless — it is
      misleading.
- [ ] **7.3** Time it. Anything past ~15 seconds mid-funnel needs the chain
      reordered.
- [ ] **7.4** If the lead model fails either test, reorder `AI_IMAGE_MODELS` in
      Vercel. No redeploy needed.
- [ ] **7.5** The disclosure sentence renders directly under the image, at full
      size, every time.
- [ ] **7.6** Before and after appear side by side.
- [ ] **7.7** An `ai_jobs` row is written with `job_type = 'finish_render'` and a
      real `cost_cents`.
- [ ] **7.8** The rendered image lands in the `floor-photos` bucket and
      `leads.render_path` points at it.
- [ ] **7.9** Kill the OpenRouter key. The preview fails gracefully, and **the
      quote and the lead still complete**. This is the most important test in
      this section — the picture must never be load-bearing.
- [ ] **7.10** Hit the endpoint repeatedly from one IP. The rate limit refuses
      before money is spent.
- [ ] **7.11** Set the daily ceiling to 1 cent. The render is refused and no
      `ai_jobs` row is written, because nothing was attempted.

---

## 8. CAPS, QUOTAS AND DEGRADED MODE

- [ ] A Foundation account at 25 analyses enters degraded mode.
- [ ] **Lead capture still works while degraded.** Non-negotiable.
- [ ] The widget never breaks the contractor's site — whatever the payment or
      cap state.
- [ ] `degraded_reason` is set on the lead and visible in the inbox.
- [ ] The contractor's phone number is tappable in the degraded flow.
- [ ] Usage counters reset correctly on a new billing period.

---

## 9. BILLING

- [ ] A real Stripe checkout completes end to end in LIVE mode.
- [ ] The webhook is received, verified, and writes subscription state.
- [ ] A failed payment starts the dunning ladder.
- [ ] `/admin/billing` reflects reality after each of the above.
- [ ] Cancellation degrades the widget without breaking the customer's site.
- [ ] Confirm what happens to a live widget when a card fails — you should be
      able to state this from memory before a customer asks.

---

## 10. EMAIL

- [ ] A demo lead notifies you.
- [ ] The contractor confirmation arrives.
- [ ] A team invite email arrives and the link sets a password.
- [ ] An invite to an address that ALREADY has a sign-in returns the note saying
      no email was sent — and you tell the person manually.
- [ ] Check the spam folder for each. A lead notification in spam is a lost job.

---

## 11. PERFORMANCE — MEASURE, DO NOT ESTIMATE

Run Lighthouse on a throttled 4G profile against the deployed URL.

- [ ] LCP under 2.5s on mid-range Android over 4G.
- [ ] Total first load under 1MB including images.
- [ ] 60fps while dragging the hero rule. Use Chrome remote debugging on the
      actual phone.
- [ ] Usable one-handed at 360px width.
- [ ] Legible in direct sunlight — go outside with the phone.
- [ ] Fonts: measured payload still ~59.5KB, and the three preloaded faces are
      the ones above the fold.

---

## 12. CONTENT, LEGAL AND HONESTY

- [ ] **Every finish photograph is licensed.** Your own photo, commercial stock
      with a commercial-use grant, or written manufacturer permission. A
      manufacturer's product-page image is NOT free because you buy the product.
- [ ] No image is captioned as a job, a client, a location, or "our work".
- [ ] The render disclosure is present everywhere a render appears: widget,
      contractor email, leads inbox.
- [ ] Every Plate on the site reflects real status. Nothing says IN SERVICE that
      cannot actually price.
- [ ] The metrics section either shows real counted numbers or does not render.
- [ ] No fake testimonials, no placeholder company names, anywhere.
- [ ] Terms and privacy pages exist and mention the photo retention window
      (`DATA_MODEL.md` §19 sets 90 days — and the deletion job is NOT built yet,
      so either build it or do not promise it).

---

## 13. THE HOUSEKEEPING YOU KEEP DEFERRING

- [ ] **CORRECTED:** only FIVE `components/marketing/*` files are orphaned —
      `Hero`, `HowItWorks`, `WhoItsFor`, `ProofOfFlexibility`, `InfiniteMotion`.
      `CtaButton`, `FranchiseComparison` and `useInViewport` ARE imported and
      deleting them breaks the build. Re-audit with grep before acting.
      This is optional cleanup; skip it until the product works.
- [ ] `useInViewport` has a live importer, so an IntersectionObserver is running
      in the shipped tree. 13A bans scroll-triggered reveals — check what uses
      it and whether that use is legitimate.
- [ ] Run `npm run typecheck` before every push. It is offline, takes ten
      seconds, and would have caught every red build in this project's history.
- [ ] Delete the junk committed at repo root: the file named `main`, the file
      named `"s.env[" "`, and the nested `nva-web-solutions/docs/RUNBOOK.md`.
- [ ] Add the `quote_config_updated` analytics event properly — taxonomy first,
      then the emitter. A rate change is the highest-consequence admin write and
      currently has no audit trail.
- [ ] Build the 90-day photo deletion job, or remove the retention claim.

---

## 14. BEFORE YOU FLIP THE SWITCH

- [ ] You can state, from memory, what happens when: the AI is down, Stripe is
      down, Supabase is down, and the image provider is down. If any answer is
      "I'm not sure," test it.
- [ ] You have a rollback: the previous deployment is known-good in Vercel and
      you know how to promote it.
- [ ] The first customer's `quote_configs` row has HIS rates, not the Dallas
      reference defaults.
- [ ] You have watched one complete stranger use the widget without help.
      Everything above tests correctness; only this tests whether it works.

---

## WHAT IS NOT BUILT, AND MUST NOT BE SOLD

Say these plainly if asked. Every one of them is a thing the product does not
do today:

- Painting has a live pricing module but **no public surface** — there is no
  painting rate document, so no painting demo exists.
- Seventeen trades are specced and queued. None of them can price.
- Contractors cannot edit their own rates. Only you can, via `/admin/pricing`.
- There is no company switcher — a person on two companies sees the oldest.
- Uptime is not measured and never will be from inside this system.
- Photo retention deletion is not implemented.
