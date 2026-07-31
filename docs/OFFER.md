# OFFER.md — The Commercial Spec the Code Must Implement

**Status:** decided in Phase 0. Canonical. Phase 2 seeds the `plans` table from §1. Phase 5.5 implements §3–§5 and uses the copy in §4 verbatim. Phase 6 builds §7.

---

## 1. THE TWO TIERS

| | **Foundation** | **Operator** |
|---|---|---|
| Setup | **$500** (launch offer — see §6) | **$2,500** |
| Monthly | **$250** | **$500** |
| AI photo analyses / month | **25** | Unlimited |
| AI photo analyses / visitor session | 3 | 3 |
| Lead capture | Unlimited, always | Unlimited, always |
| Deterministic quoting (slider, finishes, re-quotes) | Unlimited, free | Unlimited, free |
| Branded site + widget | ✓ | ✓ |
| Chatbot | ✓ | ✓ |
| Shareable quote pages `/q/[id]` | ✓ | ✓ |
| Light / Dark Industrial variants | ✓ | ✓ |
| Cure-risk advisor | Locked preview only | ✓ |
| Internal command center | — | ✓ |
| AI implementation review | — | ✓ |
| Revenue share taken | **0%** | **0%** |

Multi-crew is roadmap only. It is not priced, not described, not in the schema, and not mentioned in any customer-facing copy.

### 1.1 Entitlement matrix — the machine-readable version

Phase 2 seeds these into `plans`. Limits live in the database. No limit is ever hardcoded in application code.

| Feature key | Foundation | Operator | Degraded behaviour |
|---|---|---|---|
| `quote.deterministic` | on, unlimited | on, unlimited | stays on — never gated |
| `quote.ai_analysis` | 25/month, 3/session | unlimited, 3/session | off → degraded mode |
| `lead.capture` | on, unlimited | on, unlimited | **stays on — never gated under any condition** |
| `quote.share_page` | on | on | stays on |
| `brand.style_toggle` | on | on | stays on |
| `cure.advisor` | preview only | full | preview only |
| `command_center` | off | on | n/a |
| `ai.implementation_review` | off | on | n/a |

`lead.capture` is not a gated feature. It appears in this table only so that no future phase can mistake its absence for permission to gate it.

---

## 2. THE CAP — precisely defined

**The counted unit is one AI photo analysis. One vision call, successfully completed, equals one unit. Nothing else consumes quota.**

Consumes quota:
- A vision call that returns a valid, schema-passing result.

Does **not** consume quota, ever:
- Moving the square-footage slider. Any number of times.
- Changing finish, colour, or surface type.
- Re-running the deterministic price. Any number of times.
- A vision call that fails, times out, returns invalid JSON, or fails Zod validation — including after its one repair retry.
- Any activity in `prototype` mode (contractor test-driving) or `preview` mode (admin).
- Viewing a saved quote at `/q/[quoteId]`.
- Capturing a lead.

**Session limit: 3 analyses per visitor session**, both tiers, including Operator. This exists so one tire-kicker photographing his whole house cannot consume a contractor's month. It is a fairness limit, not a billing limit, which is why it applies to the unlimited tier too.

**Rollover:** counters reset at `current_period_start` from the subscription, not on the calendar month. A contractor who signs up on the 14th gets 25 analyses from the 14th.

**Concurrency:** the increment is atomic at the database, never read-then-write. Two homeowners uploading simultaneously at analysis 24 must produce 25 and 26, never 25 and 25.

### 2.1 What the contractor's usage display shows

**Always both numbers, side by side, in this order:**

> **18 photo analyses used** of 25 · **31 leads captured** this month

Never the analyses figure alone. The cap counts a cost we incur; the leads figure counts the value he receives, and it is always the larger and always uncapped. Showing the cost without the value is how you make a customer feel metered. Showing both is how you make him feel like he is winning — which, at 31 leads on a $250 plan, he is.

The leads figure is never capped, never greyed, and never displayed in a warning state.

---

## 3. CAP BEHAVIOUR — what each party sees

### 3.1 The homeowner, at analysis 26

**Sees nothing unusual and learns nothing.** No error, no limit message, no paywall, no mention of the contractor's account. The widget presents as a deliberate, normal flow in which this contractor quotes by hand.

Copy for the degraded step 1:

> **Tell us about the floor**
> [Contractor Name] prices these personally. Answer four quick questions and he'll send your quote — usually the same day.

Copy for the degraded capture step:

> **Where should he send it?**
> Name, phone, email, and when you'd like it done.
>
> [ SEND MY DETAILS ]
>
> Prefer to talk? Call [contractor phone] — tappable.

Copy for the degraded confirmation:

> **Got it — [Contractor Name] has your details.**
> He'll be in touch about the [surface type] shortly. If it's urgent, call [contractor phone].

**Absolutely forbidden in any homeowner-facing string:** "limit", "quota", "cap", "plan", "upgrade", "subscription", "payment", "unavailable", "temporarily", "sorry", "unfortunately", "error". A homeowner who learns his contractor hit a billing limit has been handed a reason to doubt him. That is the single worst thing this product can do, and it is worth more than the feature.

### 3.2 The contractor, at 20 of 25 (early warning)

Subject: **You're at 20 of 25 photo analyses this month**

> Heads up — homeowners have run 20 instant quotes on your site this month, and you've captured 34 leads.
>
> At 25, the instant photo pricing pauses until [renewal date]. Your site stays up, your form stays live, and leads keep coming in — they'll just come through without the instant price attached.
>
> If you'd rather it didn't pause: Operator removes the cap. $500 setup credit applies since you're already set up — [upgrade link].
>
> Nothing to do if you're happy as you are.

### 3.3 The contractor, at 25 (cap reached)

Subject: **25 quotes this month — that's the cap, and it's a good problem**

> Your site ran its 25th instant quote today, and you've captured [N] leads this month. Homeowners are still coming.
>
> Here's exactly what changed: instant photo pricing is paused until [renewal date]. Here's what didn't: your site is up, your form is live, and every homeowner who lands on it still reaches you. Nobody is being turned away.
>
> The leads arriving now come in without an instant price attached, so they may want a callback sooner than usual — they're marked in your inbox.
>
> Operator removes the cap for good: $500/month, no per-quote limit. [Upgrade link.] Or sit tight and the counter resets on [renewal date].

### 3.4 The admin (me)

In-app alert on `/admin`, flagged **HOT UPSELL**, with: prototype name, analyses used, leads captured, days remaining in period, current tier, and a one-tap upgrade payment link. Prototypes at 20+ appear in the sortable "closest to cap" view on `/admin/billing` — that view is the upsell call sheet.

---

## 4. DUNNING — exact copy and timing

**Trigger:** `invoice.payment_failed` webhook. Status → `past_due`. Day 0 is the failure date.

**Principle: a failed card is almost always an expired card.** Escalate urgency, never insult. No message implies he can't afford it or is avoiding payment. Every message contains the same one-tap update link and the same fact — his site is up.

| Day | Channel | Status |
|---|---|---|
| 0 | — | `past_due`. Everything still works. |
| 1 | Email | Everything still works. |
| 3 | Email | Everything still works. |
| 5 | Email | Everything still works. |
| 7 | Email + SMS | Everything still works. |
| 10 | Email + SMS | → `suspended`. Degraded mode begins. Site stays up. |

### Day 1

Subject: **Your card didn't go through**

> The monthly payment for [Girder / contractor's site] didn't clear today. Nine times in ten it's an expired card.
>
> [Update card — takes about a minute]
>
> Nothing has changed on your end. Your site is up and your leads are coming through as normal.

### Day 3

Subject: **Still can't take the payment for your site**

> We've retried the card on file and it's still declining.
>
> [Update card]
>
> Your site is up and unaffected. If the payment hasn't cleared by [day-10 date], instant photo pricing pauses — your site stays live and your form keeps working, but homeowners stop getting a price on the spot.
>
> If something's changed on your end, reply to this and we'll sort it out.

### Day 5

Subject: **Five days on the card for [Contractor Name]**

> The payment still hasn't cleared. Your site is up and you've captured [N] leads since it failed.
>
> [Update card]
>
> On [day-10 date], instant photo pricing pauses. Your site does not go down and your form does not stop. Homeowners will still reach you — they just won't get an instant price.

### Day 7

Subject: **Three days — [day-10 date]**

> Instant photo pricing on your site pauses on [day-10 date] unless the payment clears.
>
> [Update card — one minute]
>
> To be clear about what does not happen: your site does not go offline, your phone number stays on it, and your form keeps capturing leads. Nothing your customers see will change.
>
> If there's a problem with the card or the timing, call or text me directly: [admin phone].

**SMS (day 7):**
> Girder: the card on your account is declining and instant pricing pauses [date]. Your site stays up either way. Fix in a minute: [link] — or call me, [name].

### Day 10 — suspension

Subject: **Instant pricing is paused — your site is still up**

> The payment didn't clear, so instant photo pricing on your site is paused as of today.
>
> **What your customers see:** a normal form asking about their floor, your phone number, and a note that you'll send their quote personally. They see nothing about billing and nothing is broken.
>
> **What you'll notice:** leads arrive without an instant price attached. They're marked in your inbox so you know to call sooner.
>
> [Update card] — everything switches back on within a minute of it clearing.
>
> If you want to cancel instead, reply and I'll close it out. No hard feelings and no cancellation fee.

**SMS (day 10):**
> Girder: instant pricing is paused, but your site is up and your form is still capturing leads. Turn it back on: [link]

### Recovery — any successful payment, at any point

Status → `active` immediately, entitlements restored on the next server-side check, no manual step.

Subject: **You're back**

> The payment cleared and instant pricing is back on. Nothing else changed.

**Never sent:** more than one message per day, any message on a Sunday, or anything after `suspended` other than a monthly single-line reminder.

---

## 5. THE 30-DAY GUARANTEE

Displayed wording, verbatim:

> **Thirty days. If it's not working, you get the setup fee back.**
> Tell me inside 30 days and I refund the $500 setup in full, no questions and no forms. You keep any leads it captured. I don't refund monthly fees for months already used, and I won't promise you a number of leads — this converts the traffic you already have, it doesn't create traffic. If it doesn't convert it, you shouldn't be paying for it.

Operational rules:
- Applies to the setup fee only. Monthly fees for elapsed months are not refunded.
- Window is 30 days from the setup charge, not from launch.
- Processed as a Stripe refund on the setup payment, recorded in `payments` with `kind='refund'`, and the subscription is cancelled unless he asks otherwise.
- No exit interview required. Asking for one converts a quiet refund into a bad review.
- Refunds are recorded in `/admin/billing` and count against MRR reporting honestly.

---

## 6. THE LAUNCH OFFER — dated, with a real end

**$500 setup is a founding rate, not the price.** The standing price is **$1,500 setup + $250/month**.

**Founding rate: $500 setup, for the first 10 contractors in the DFW metro, or until October 31, 2026 — whichever comes first.**

The stated reason, which is true and is what makes it credible:

> I'm taking ten contractors in DFW at $500 because I want ten sites running in one metro that I can point at. After that it's $1,500. The monthly is $250 either way, and it doesn't change when the founding rate ends — if you're in at $500, your monthly stays $250 for as long as you're a customer.

**Why this is dated rather than permanent.** Contractors in one metro talk. A discount that never expires reads as a lie the first time two of them compare notes, and it costs more trust than it ever bought urgency. A founding rate with a real number, a real date, and a real reason survives that conversation — and it gets *stronger* when they compare notes, because the second man learns the first one wasn't lied to.

**Enforcement rules:**
- The date and the count are real. On November 1, 2026, or after the tenth Foundation customer, the pricing page changes to $1,500. No exceptions, no "extended by popular demand." The one thing that would destroy this offer is honouring it late.
- `plans.setup_fee_cents` changes in the database. The pricing page reads from `plans`, so no code change is needed.
- Existing customers keep $250/month permanently. Grandfathering is stated up front and honoured.
- Operator's $2,500 setup is not discounted and has no promotional period.

> **VERIFY:** Confirm October 31, 2026 works against the actual sales runway before it goes into copy. Once published it cannot move.

---

## 7. PROSPECT QUALIFICATION — the scorecard

**The rule this exists to enforce: this product multiplies existing traffic. It does not create traffic.** A contractor with a dead site who buys this will convert 4% of nothing, conclude we took his money, ask for the refund, and tell every contractor in DFW. He costs more than he pays. The scorecard exists so I decline him before he becomes that.

Recorded in `/admin/prospects` before any pitch. Phase 6 computes the score.

| Signal | Field | Points |
|---|---|---|
| Running Google Ads on epoxy/coating terms | `has_google_ads` | **+30** |
| Google review count ≥ 40 | `google_review_count` | +20 |
| Google review count 15–39 | | +10 |
| Google review count < 15 | | 0 |
| Ranks page 1 for "epoxy garage floor [his city]" | derived | +20 |
| Ranks page 2 | | +10 |
| Estimated monthly site visitors ≥ 500 | `estimated_monthly_traffic` | +25 |
| 200–499 | | +15 |
| 50–199 | | +5 |
| < 50 | | **−20** |
| Site has no quote form or price info at all | derived | +15 (upside — his conversion floor is zero) |
| Site is dead, parked, or last updated >3 years ago | derived | **−25** |

**Bands:**

| Score | Verdict | Action |
|---|---|---|
| **70+** | Strong | Pitch. Stage the prototype before calling. |
| **45–69** | Workable | Pitch, but set expectations in the call: this converts what he has. |
| **25–44** | Weak | Do not pitch Foundation. Offer nothing, or refer him to someone who does traffic. |
| **< 25** | Decline | Do not sell. Note why in `qualification_notes`. |

The admin UI must show the band as a plain-language warning, not a number in a badge — e.g. *"This site probably doesn't get enough visitors for this to work. Selling here usually ends in a refund."* A number I can rationalise past is not a guardrail.

**The paid-ads signal is weighted highest deliberately.** A contractor already spending money to send traffic to a page that doesn't convert is the exact customer this product was built for, and he is the easiest sale in the market because he already believes in the top of the funnel and is already feeling the leak.

---

## 8. POSITIONING — the franchise comparison as copy

Used on `/pricing`, on `/s/[slug]` beside the CTA, and as the spine of the cold-call script.

> **What a franchise charges to hand you the same thing**
>
> An epoxy franchise costs $49,500 to join, plus 6 to 8 percent of everything you invoice, for as long as you're in it. A large part of what that buys is the system that gets you customers — the branded site, the instant quotes, the lead follow-up.
>
> That's what this is. $500 to set up, $250 a month, and I take 0% of your revenue. Ever.
>
> On $600,000 of annual work, a franchise's 7% is $42,000 a year. This is $3,000.
>
> I'm not going to tell you a franchise is worthless — some of them are genuinely good at training crews and buying material. But if what you actually need is the thing that turns the people already looking at your site into booked jobs, you shouldn't have to sign away 7% of your revenue forever to get it.

Voice rules: plain verbs, sentence case, specific numbers over adjectives, written from his side of the screen. Never "website." Never "digital." Never a lead-count promise. See NAMING.md §6.

---

## 9. WHAT THE CODE MUST NEVER DO

These are the five hard rules, restated as things the billing system is forbidden from doing. Phase 12A audits against this list.

1. **Never take a lead capture form offline.** Not at the cap, not on suspension, not on AI failure, not on database degradation. If lead capture is down, that is a Critical incident regardless of cause.
2. **Never show a homeowner anything about the contractor's account.** No billing string may reach a homeowner-facing surface.
3. **Never take a contractor's site down for non-payment.** Degrade features. The page stays up, his phone number stays on it.
4. **Never let a redirect grant entitlements.** Only a verified webhook.
5. **Never gate on a tier string.** Every check goes through `check.ts`, server-side.
