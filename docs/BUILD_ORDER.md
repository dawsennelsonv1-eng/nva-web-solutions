# BUILD_ORDER.md — Phase Table & Model Routing

**Status:** decided in Phase 0. Canonical. Reflects the v6 master prompt with the Phase 0 and Phase 10 re-routing applied.

One phase per chat. Never two.

---

## THE TABLE

| Phase | Build | Model | Fable $ | Gate |
|---|---|---|---|---|
| 0 | Spec, design thesis, offer, naming | **Opus 5** | — | Build the Claude Project after this |
| 1 | Scaffold, routing, theme engine | **Fable 5** | ~$5 | |
| 2 | Schema, billing tables, RLS | **Fable 5** | ~$6 | |
| 3 | Quoting engine + cap enforcement | Opus 5 | — | The actual product |
| 4 | Widget UI, image pipeline, degraded states | Opus 5 | — | Expect continuations |
| 5 | Public hub + demo + dual routing | Sonnet 5 | — | Expect 3–4 continuations |
| **5.5** | **Payments, plans & entitlements** | **Opus 5** | — | **Cannot advertise until this ships** |
| **★** | **SHIP GATE — start advertising** | — | — | |
| 6 | Admin auth, leads inbox, prospect scoring | Sonnet 5 | — | |
| 7 | Brand engine | Opus 5 | — | |
| 8 | Client prototype + purchase CTA | Sonnet 5 | — | |
| 9 | Component Combiner + deploy engine | Sonnet 5 | — | Expect 3+ continuations |
| 10 | Multi-provider AI suite | **Opus 5** | — | Re-routed from Fable — see below |
| 11 | Vertical module system | Opus 5 | — | |
| 11.5 | Cure-risk advisor | Opus 5 | — | **Build only when sold** |
| 12A | Security, money & cost audit | Opus 5 | — | |
| 12B | Launch runbook | Haiku 4.5 | — | |
| — | Emergency debug reserve | Fable 5 | ~$25 | |

**Fable burn: ~$11 planned (Phases 1 and 2), leaving ~$25 of a ~$36–40 balance as debugging reserve.**

---

## WHY THE ROUTING IS DRAWN HERE

**Fable holds Phases 1 and 2 only.** These are the two phases where a wrong decision is expensive to unwind rather than merely annoying. Phase 1 fixes the theme engine, the entitlement contract, the vertical registry and the motion boundary — every later phase codes against them. Phase 2 fixes the schema and the RLS policies, and an RLS leak is business-ending rather than inconvenient. Everything downstream of these two is a consumer of decisions they made.

**Phase 0 was re-routed from Sonnet to Opus.** It is the one phase that authors rather than consumes contracts: SPEC, DESIGN, OFFER and NAMING are declared canonical and every other phase inherits their mistakes. The naming call, the design thesis and the dunning copy are judgement work rather than volume work, which inverts the usual reason for putting a phase on a lighter model.

**Phase 10 was re-routed from Fable to Opus** for budget reasons. At a real balance near $36–40, the original plan of ~$17 planned plus $25 reserve did not close. Phase 10 writes adapters against an interface already defined and lands well after the ship gate, so it is the cheapest phase to move. Protecting the Phase 2 RLS budget matters more.

**Sonnet holds Phases 5, 6, 8 and 9** — the highest file volume and lowest novelty in the project. They exist there to keep the Opus cap free for Phases 3, 4, 5.5, 7 and 12A, where reasoning actually decides the outcome. Each Sonnet phase carries explicit forbidden zones and an `ESCALATE` instruction, because the real failure mode of a lighter model is improvising past the edge of its competence without announcing it.

**Haiku holds 12B** because a runbook is typing, not thinking.

---

## COST DISCIPLINE FOR FABLE PHASES

Fable input is $10/M and context grows with every continuation, so a phase needing four continuations costs far more than four times its first turn.

In a Fable chat: send the phase prompt, then send only `continue`. No discussion, no questions, no thinking out loud. Every conversational turn is re-billed against the entire accumulated context.

**If money gets tight, the priority is:** Phase 2 (RLS) > Phase 1 (contracts) > debugging reserve. If Phase 1 runs past ~$8, move it to Opus and protect Phase 2.

---

## THE ESCALATION PATH

If any phase emits:

```
ESCALATE: <what it hit>
FILES NEEDED: <paths>
ACTIVATE MODEL: Opus 5
```

that is the system working. Open a new chat on Opus 5, paste only the named files, and resolve it there. Escalating is never penalised; guessing and continuing is the worst outcome available.

---

## GATES

| Gate | Condition |
|---|---|
| After Phase 0 | Build the Claude Project. Upload all Phase 0 docs to project knowledge. Run Phases 1–12 inside it. |
| After Phase 2 | Re-check the real Fable balance and recalibrate this table. |
| After Phase 5.5 | **Ship gate.** Merge, tag `ship-1`, re-run RLS tests in production, run BILLING_TESTS in test mode, one real $1 charge and refund, walk the funnel on a phone using the camera, settle the merchant structure in writing. Then start ads. |
| After the ship gate | Let drop-off data pick the next phase. If contractors leave at step 2, fix step 2 before building the combiner. |
| Before Phase 11.5 | An Operator customer must have paid. Do not build it on spec. |

---

## WHAT IS NOT IN THIS TABLE

The command center, per-employee AI assistants, and the multi-crew tier. They are real products, they are documented in SPEC.md's out-of-scope list, and no phase above may quietly start them.

Ship the widget, sell five contractors, then let those five decide what gets built next.
