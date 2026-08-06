# EVENTS.md — Analytics Taxonomy

**Status:** decided in Phase 0. Canonical. Phase 1 implements the typed emitter. Every later phase emits from this list and invents nothing.

**Naming:** `object_action`, snake_case, past tense. Never a UI element name — `quote_step_completed`, not `next_button_clicked`. Buttons move; steps don't.

**Every event carries:** `session_id`, `prototype_id` (nullable), `surface` (`public_hub` · `demo` · `prototype` · `admin`), `occurred_at`, `mode` (`live` · `prototype` · `preview`).

---

## THE THREE QUESTIONS THIS MUST ANSWER

The taxonomy is designed backwards from the decisions it has to support after the ship gate. If an event doesn't help answer one of these, it isn't here.

1. **Where do homeowners leave?** — Which of the four widget steps loses people, so I fix that step instead of building the next feature.
2. **Where do contractors leave?** — Where in the demo and prototype funnels a skeptical buyer stops, so I know whether the problem is the pitch, the widget, or the price.
3. **Who is near the cap?** — Which contractors are converting enough traffic to be worth an upsell call today.

---

## 1. WIDGET FUNNEL

| Event | Fires when | Key properties |
|---|---|---|
| `widget_opened` | Widget mounts and is interactive | `entry_point` |
| `quote_step_viewed` | A step becomes visible | `step` (1–4), `step_name` |
| `quote_step_completed` | User advances from a step | `step`, `duration_ms` |
| `quote_step_back` | User navigates backwards | `from_step`, `to_step` |
| `surface_type_selected` | Step 1 selection | `surface_type` |
| `photo_selected` | A file is chosen or captured | `input_method` (`file` · `drag` · `camera`), `original_bytes`, `original_type` |
| `photo_rejected` | Pipeline refuses the file | `reason` (`unsupported_type` · `corrupt` · `dimensions` · `heic_undecodable`) |
| `photo_compressed` | Pipeline finishes | `original_bytes`, `final_bytes`, `duration_ms`, `output_format` |
| `photo_skipped` | User proceeds without a photo | `step` |
| `analysis_started` | Vision request dispatched | — |
| `analysis_completed` | Valid result returned | `duration_ms`, `confidence_low_fields[]` |
| `analysis_failed` | Failure or invalid output after retry | `reason` (`timeout` · `invalid_json` · `schema` · `provider_error` · `rate_limited`) |
| `analysis_field_handed_to_user` | Low confidence surfaces a field for manual entry | `field` |
| `finish_selected` | Step 2 | `finish_id`, `finish_tier` |
| `sqft_changed` | Debounced slider settle — **not every frame** | `sqft`, `method` (`slider` · `not_sure_helper`) |
| `breakdown_expanded` | Itemised breakdown opened | — |
| `quote_calculated` | A price range is produced | `low_cents`, `high_cents`, `used_ai_analysis` |
| `capture_form_viewed` | Step 4 visible with price blurred | — |
| `capture_field_completed` | Each field satisfies validation | `field` |
| `capture_validation_failed` | Inline error shown | `field`, `reason` |
| `lead_captured` | Lead row written successfully | `was_degraded`, `degraded_reason`, `has_quote` |
| `price_unblurred` | The payoff moment renders | — |
| `quote_shared` | `/q/[id]` copy or share action | `method` |
| `quote_page_viewed` | `/q/[quoteId]` loaded | `referrer_type` |
| `widget_abandoned` | Session ends without capture | `abandoned_step`, `time_in_widget_ms` |

**`widget_abandoned` is the most important event in this document.** It writes `abandoned_step` to `demo_sessions`, and after the ship gate that single field decides which phase gets built next.

## 2. DEGRADED MODE

| Event | Fires when | Key properties |
|---|---|---|
| `degraded_mode_entered` | `check.ts` returns `degraded_mode` | `reason` (`cap_reached` · `session_limit` · `subscription_suspended` · `ai_unavailable`) |
| `degraded_lead_captured` | Lead captured while degraded | `reason` |
| `degraded_phone_tapped` | Homeowner taps the contractor's number | `reason` |

Comparing `lead_captured` conversion against `degraded_lead_captured` conversion measures exactly what degraded mode costs. If the gap is small, the cap is cheap and the design worked. If it's large, the degraded copy needs work — and that is a Phase 4 fix, not a pricing change.

## 3. CAP & USAGE

| Event | Fires when | Key properties |
|---|---|---|
| `analysis_quota_consumed` | An analysis successfully decrements the counter | `analyses_used`, `analysis_limit`, `pct_of_cap` |
| `cap_warning_20` | Counter reaches 20 of 25 | `prototype_id`, `leads_captured` |
| `cap_reached` | Counter reaches the plan limit | `prototype_id`, `leads_captured`, `days_remaining_in_period` |
| `session_limit_reached` | Third analysis in one session | — |
| `usage_period_rolled` | Counters reset on a new period | `previous_analyses_used`, `previous_leads_captured` |

`cap_warning_20` and `cap_reached` both carry `leads_captured` deliberately: the upsell call is not "you hit a limit," it is "you got 34 leads and homeowners are still coming." The number has to be in the event or it won't be in the alert.

## 4. CONTRACTOR FUNNEL — demo

| Event | Fires when | Key properties |
|---|---|---|
| `demo_started` | `/demo` widget opened | `referrer_type` |
| `demo_lead_submitted` | Contractor submits real details | — |
| `payload_screen_viewed` | Split-screen renders | `time_to_render_ms` |
| `payload_side_b_explored` | Interaction with the simulated lead package | `action` (`accept` · `call` · `schedule`) |
| `purchase_cta_viewed` | CTA enters viewport | `source_surface` |
| `purchase_cta_clicked` | CTA tapped | `source_surface`, `plan_code` |

## 5. CONTRACTOR FUNNEL — prototype `/s/[slug]`

| Event | Fires when | Key properties |
|---|---|---|
| `prototype_opened` | Page loaded | `slug`, `referrer_type` (`sms` · `direct` · `other`) |
| `prototype_widget_launched` | He opens the widget | — |
| `prototype_step_reached` | Furthest step | `step` |
| `style_toggle_used` | Light ↔ Dark Industrial | `to_variant` |
| `prototype_cta_viewed` | "Get this live" in viewport | — |
| `prototype_cta_clicked` | Tapped | `plan_code` |
| `prototype_expired_viewed` | Expired state shown | `slug` |

**These five are live sales instrumentation.** `/admin` surfaces them in near real time so I can see whether he is actually looking while I am still on the phone with him.

## 6. BILLING

| Event | Fires when | Key properties |
|---|---|---|
| `checkout_started` | Checkout session created | `plan_code`, `entry_point` (`pricing` · `demo` · `prototype` · `admin_link`), `provider` |
| `checkout_completed` | **Webhook confirms**, never the redirect | `plan_code`, `setup_cents`, `monthly_cents` |
| `checkout_abandoned` | Session created, no completion inside 24h | `plan_code`, `entry_point` |
| `setup_paid_subscription_failed` | The split failure mode | `provider_session_ref` |
| `payment_failed` | `invoice.payment_failed` | `attempt`, `failure_reason` |
| `dunning_sent` | Each dunning message dispatched | `day_number`, `channel` |
| `payment_recovered` | Successful payment while `past_due` or `grace` | `days_in_dunning` |
| `subscription_suspended` | Day 10 | `days_in_dunning` |
| `subscription_canceled` | Cancellation | `reason`, `days_active` |
| `refund_issued` | Refund recorded | `amount_cents`, `days_since_setup`, `under_guarantee` |
| `upgrade_viewed` | Upgrade surface seen | `from_plan`, `trigger` (`cap_warning` · `cap_reached` · `manual`) |
| `upgrade_completed` | Upgrade confirmed by webhook | `from_plan`, `to_plan`, `days_to_upgrade` |
| `manual_payment_recorded` | Admin marks paid via `manual` provider | `kind`, `amount_cents` |

**`checkout_completed` fires from the webhook handler only.** Firing it from `/checkout/return` would inflate conversion with sessions that never paid, and would be the analytics twin of the entitlement bug the money rules forbid.

## 7. ADMIN & PROSPECTING

| Event | Fires when | Key properties |
|---|---|---|
| `prospect_created` | New prospect | `vertical` |
| `prospect_qualified` | Scorecard computed | `qualification_score`, `band` |
| `prospect_declined` | Marked declined | `qualification_score`, `reason` |
| `prototype_staged` | Config saved, slug minted | `template_id`, `from_preset` |
| `share_card_generated` | Deploy action produces the link | `method` (`copy` · `qr` · `sms`) |
| `brand_extraction_completed` | Colours extracted | `extraction_source`, `duration_ms`, `wcag_adjustments` |
| `brand_extraction_fell_back` | Tier 1 → 2 or 3 | `from_tier`, `to_tier`, `reason` |
| `lead_status_changed` | Pipeline move | `from_status`, `to_status` |
`quote_config_updated` — a contractor's pricing rules were saved from /admin/pricing. Props: `vertical`, `by` (admin email). Emitted by app/actions/quoteConfig.ts on a successful write only; a save refused by the vertical's schema emits nothing, because nothing changed.

`brand_extraction_fell_back` measures whether the Phase 7 client-side approach actually holds. If Tier 1 fails often on real contractor logos, that is a signal to invest in Tier 2 — and it is a signal I would otherwise never see, because the fallback is designed to be invisible.

## 8. SYSTEM HEALTH

| Event | Fires when | Key properties |
|---|---|---|
| `ai_daily_ceiling_hit` | Daily spend cap reached | `spend_cents` |
| `rate_limit_triggered` | Per-IP limit | `endpoint` |
| `webhook_received` | Any webhook stored | `provider`, `event_type`, `was_duplicate` |
| `webhook_processing_failed` | Downstream failure after 2xx | `event_type`, `error` |
| `lead_delivery_failed` | Notification channel failed | `channel`, `error` |

`lead_delivery_failed` is monitored as a near-Critical signal. The lead row survived, which is what matters, but a contractor who isn't told about his lead has effectively lost it.

---

## RULES

1. **Never emit PII.** No name, email, phone or address in any property. Leads carry identity; events carry behaviour.
2. **Never emit on every frame.** `sqft_changed` is debounced to slider settle.
3. **Emission never blocks a user action and never fails a request.** A failed analytics write is silent.
4. **`preview` mode emits nothing.** Admin previewing must not pollute a contractor's funnel data.
5. **`prototype` mode emits contractor-funnel events but no homeowner-funnel events.** He is not a homeowner and mixing them corrupts the abandonment data that decides what gets built next.

