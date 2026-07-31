# NAMING.md — Product Name, Brand Hierarchy & Billing Disclosure

**Status:** decided in Phase 0. Canonical. Every later phase uses these strings.

---

## 1. THE PROBLEM

The company is **NVA Digital Solutions**. That name cannot go on the customer-facing product.

"Digital Solutions" is the exact phrase used by every marketing agency in Dallas. The positioning in this build is that we are *not* an agency — we sell the customer-getting system a $49,500 franchise sells, at $500 and 0% of revenue. A contractor who reads "Digital Solutions" before he reads anything else has already filed us next to the three agencies that took his money in 2023. The name loses the argument before the copy starts.

The brief: sound like equipment or infrastructure a contractor trusts. Banned words: web, digital, solutions, AI, pro, smart, hub, flow, sync.

**The test that decided this.** Not how the name looks in a logo. How it survives this sentence, spoken on a cold call to a man in a truck who did not ask to be called:

> "Hey Mike — this is Dawsen with ______. I built you something, can I text you a link?"

If he has to say "with *what*?", the name has cost a call.

---

## 2. THE FIVE CANDIDATES

### GIRDER
**Implies:** the load-bearing member. The thing inside the structure that carries the weight, that you don't see once the building is finished. Steel, not software.
**Cold call:** "Dawsen with Girder." Two syllables, hard G, lands clean. Nobody asks him to repeat it. Sounds like a company that has been around and has a filing cabinet.
**Objection:** girders are structural steel and high-rise, not residential concrete. The material is one trade over from his. Slightly abstract about what the product actually does.

### TAKEOFF
**Implies:** in estimating, a *takeoff* is literally the process of measuring quantities off a plan to produce a bid. It is the single most precise word in English for what this widget does.
**Cold call:** "Dawsen with Takeoff." Ambiguous — aviation, departure, parody. Risk of "with *what*?"
**Objection:** strategically the best name and practically the worst. A common English word is near-impossible to protect, impossible to search for, and the domain will be gone. The domain fluency is real: it proves in one word that we speak his trade. Worth stealing as a *product-surface* word even though it loses as the brand.

### ANVIL
**Implies:** forge, mass, permanence, the surface work gets done on. The most instantly trusted of the five.
**Cold call:** "Dawsen with Anvil." Excellent. Memorable after one hearing.
**Objection:** heavily occupied — apparel, software, brewing, foundries. He will Google it during the call and find eleven other Anvils, which is the opposite of the reassurance we need.

### DATUM
**Implies:** in surveying, the datum is the fixed reference every other measurement is taken from. Instrument-grade. Precise.
**Cold call:** "Dawsen with Datum." He hears *data*. The whole build is engineered so that a contractor never thinks "software company," and this name hands him the thought for free.
**Objection:** fatal on the one axis that matters most. Kept as a *design* word, not a brand word — see DESIGN.md, where the signature element is the datum rule.

### KEYWAY
**Implies:** the notched joint that locks one concrete slab to the next. Genuinely concrete-specific. The metaphor is exact — the piece that makes two things hold together.
**Cold call:** "Dawsen with Keyway." Plausible, no mishearing.
**Objection:** reads as access control or locksmithing to anyone outside the trade, including the homeowners who will see it on the widget. A name only half your audience decodes is doing half a job.

---

## 3. RECOMMENDATION: **GIRDER**

Girder wins on the axis this product actually lives or dies on: the contractor's stated deepest fear is being scammed by a fly-by-night vendor. Girder sounds like it predates him. It has weight, it is unmistakably construction, it survives being said once on a bad connection, and it is short enough to sit inside a widget header at 360px without wrapping.

It also beats the alternatives where they fail. Anvil is more instantly likeable but too occupied to own. Takeoff is more precise but unprotectable and mishearable. Datum and Keyway each sound like a different industry to half the people who read them.

The one real weakness — that a girder is structural steel rather than concrete — is worth paying. The name is not describing the floor. It is describing what we are to his business: the member carrying the load, invisible once the thing is standing. That sentence is usable in sales copy verbatim, which is the test of a name that's doing work rather than decorating.

**Deployed as:** `Girder` alone. Never "Girder Systems," never "Girder Technologies," never a tagline welded to it. The bare noun is the whole point; a suffix reintroduces exactly the software smell we removed.

> **VERIFY:** Trademark search for GIRDER in US classes 35 (advertising/business services) and 42 (SaaS) before printing anything. Also check `girder.com` / `getgirder.com` / `girder.io` availability. If the mark is blocked in class 42, the fallback order is ANVIL, then KEYWAY. Do not fall back to TAKEOFF or DATUM — they lost on merit, not availability.

> **VERIFY:** There is an existing open-source scientific data platform called Girder (Kitware). Different sector, different classes, no contractor will ever encounter it — but confirm it does not hold a conflicting registered mark in 35/42 before filing.

---

## 4. BRAND HIERARCHY

The rule: **Girder is what he buys. NVA Digital Solutions is who he pays.** The company name is never a surprise and never a headline.

| Surface | Name shown | Notes |
|---|---|---|
| Quoting widget (all modes) | **Girder** | Small mark in the widget footer only. On `/s/[slug]` it is *his* logo in the header — Girder appears once, quietly, at the bottom. |
| Public hub `/` | **Girder** | Sole brand. |
| Pricing page `/pricing` | **Girder** + billing disclosure line | Disclosure above the fold, not in a footer. |
| Client prototype `/s/[slug]` | **His logo**, Girder in footer | This must read as *his* site. Girder is a maker's mark, not a co-brand. |
| Shareable quote `/q/[quoteId]` | **His logo**, Girder in footer | Same rule. This gets screenshotted and texted. |
| Admin `/admin` | **Girder** | Internal. |
| Stripe checkout page | **Partner legal entity** | Set by the Stripe account, not by us. This is why the disclosure must come earlier. |
| Card statement descriptor | **Partner legal entity** | Configure the Stripe statement descriptor to include `GIRDER` if the account permits — a line item he doesn't recognise is a chargeback. |
| Invoice / receipt | **Partner legal entity**, "for Girder services, supplied by NVA Digital Solutions" | Pulled from config. Never hardcoded in a component. |
| Transactional email `From` | **Girder** | e.g. `Girder <notifications@…>` |
| Transactional email footer | **NVA Digital Solutions** + entity line | One line, small, factual. |
| Contracts, refunds, disputes | **NVA Digital Solutions** | Legal correspondence uses the company. |

**Implementation note for Phase 1 and 5.5:** these strings live in one config module (`lib/brand/entity.ts` or equivalent — Phase 1 decides the path and registers it in FILE_TREE.md). Swapping the Canadian partner entity for a future US LLC must be a change to that one file plus env, never a search-and-replace across components.

---

## 5. THE BILLING-ENTITY DISCLOSURE LINE

**The principle.** The fact is ordinary. The discovery is not. A contractor who reads on the pricing page that a Canadian company processes the payment files it under "administrative detail" and keeps scrolling. The same contractor who first sees a foreign company name on the Stripe page, card in hand, has just found evidence for the exact fear he walked in with. Same fact, opposite outcome, and the only variable is which screen he learns it on.

**The line, verbatim:**

> Payments are processed by [PARTNER LEGAL ENTITY NAME] (Canada) on behalf of NVA Digital Solutions. That's the name that will appear on your receipt.

**Rules for its use:**

1. Appears on `/pricing` above the fold, and beside the "Get this live" CTA on `/s/[slug]`. Both are pre-checkout.
2. Plain body text at normal size. Not a tooltip, not an asterisk, not a modal, not smaller than the copy around it. Anything that looks like it is being minimised reads as something being hidden.
3. No apology, no explanation, no "don't worry." Explaining it makes it a problem. It is one sentence and then the page moves on.
4. Second sentence is doing the real work — it removes the surprise at the exact moment surprise would be expensive, on the card statement.
5. When the entity changes to a US LLC, this line changes in config and the copy stays structurally identical.

> **VERIFY:** Insert the partner's exact registered legal name and province. Use the registered name, not the trading name — the receipt will show the registered one.

---

## 6. WHAT NOT TO SAY

Banned across every customer-facing surface, permanently:

- **"website"** — invites the $1,500 web-designer comparison. Say *the system that turns visitors into booked jobs*.
- **"digital", "solutions", "AI-powered", "platform", "leverage", "seamless", "cutting-edge"** — agency vocabulary. He has heard all of it from someone who took his money.
- **"we'll get you more traffic"** — we do not create traffic, we convert it. Promising it is both false and the fastest route to a refund request.
- **"leads guaranteed"** — no lead-count promise appears anywhere. The guarantee is the 30-day setup refund, nothing more.
- **"Multi-crew"** — the tier is not designed. It does not appear in copy, pricing, or schema.

The voice: plain verbs, sentence case, specific over clever, written from his side of the screen. He is 45, runs a crew, and is reading this in a truck. Every sentence he has to read twice is a sentence that cost us.
