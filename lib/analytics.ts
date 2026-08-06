import type { DbDegradedReason, Surface, Tier, WidgetMode } from '@/types';

/**
 * TYPED ANALYTICS EMITTER (Phase 1) — implements the EVENTS.md taxonomy.
 *
 * Guarantees, in order of importance:
 *  1. NEVER throws and NEVER blocks a user action (EVENTS.md rule 3). Every
 *     path is wrapped; a failed emit is silent.
 *  2. Provider-agnostic: the transport is a swappable sink. Unconfigured
 *     (no NEXT_PUBLIC_ANALYTICS_KEY) → no-op, with console.debug in dev.
 *  3. Safe on server and client — no top-level browser APIs.
 *  4. TYPED taxonomy: `track()` only accepts names from EVENTS.md and the
 *     property shape defined for that event. Inventing an event is a type
 *     error, which is the enforcement making the taxonomy canonical.
 *  5. 'preview' mode emits NOTHING (EVENTS.md rule 4) — enforced centrally
 *     here, not left to call sites.
 *  6. No PII (rule 1): property types below deliberately have no fields for
 *     name/email/phone. Do not add them.
 */

// ---------------------------------------------------------------------------
// property shapes (EVENTS.md tables, key properties)
// ---------------------------------------------------------------------------

type Primitive = string | number | boolean | null;
type Props = Record<string, Primitive | Primitive[]>;

export type DecisionReasonProp =
  | 'cap_reached'
  | 'session_limit'
  | 'subscription_suspended'
  | 'ai_unavailable';

export interface EventPropsMap {
  // 1. widget funnel
  widget_opened: { entry_point: string };
  quote_step_viewed: { step: 1 | 2 | 3 | 4; step_name: string };
  quote_step_completed: { step: 1 | 2 | 3 | 4; duration_ms: number };
  quote_step_back: { from_step: number; to_step: number };
  surface_type_selected: { surface_type: string };
  photo_selected: { input_method: 'file' | 'drag' | 'camera'; original_bytes: number; original_type: string };
  photo_rejected: { reason: 'unsupported_type' | 'corrupt' | 'dimensions' | 'heic_undecodable' };
  photo_compressed: { original_bytes: number; final_bytes: number; duration_ms: number; output_format: string };
  photo_skipped: { step: number };
  analysis_started: Record<string, never>;
  analysis_completed: { duration_ms: number; confidence_low_fields: string[] };
  analysis_failed: { reason: 'timeout' | 'invalid_json' | 'schema' | 'provider_error' | 'rate_limited' };
  analysis_field_handed_to_user: { field: string };
  finish_selected: { finish_id: string; finish_tier: string };
  sqft_changed: { sqft: number; method: 'slider' | 'not_sure_helper' };
  breakdown_expanded: Record<string, never>;
  quote_calculated: { low_cents: number; high_cents: number; used_ai_analysis: boolean };
  capture_form_viewed: Record<string, never>;
  capture_field_completed: { field: string };
  capture_validation_failed: { field: string; reason: string };
  lead_captured: { was_degraded: boolean; degraded_reason: DbDegradedReason | null; has_quote: boolean };
  price_unblurred: Record<string, never>;
  quote_shared: { method: string };
  quote_page_viewed: { referrer_type: string };
  widget_abandoned: { abandoned_step: string; time_in_widget_ms: number };
  // 2. degraded mode
  degraded_mode_entered: { reason: DecisionReasonProp };
  degraded_lead_captured: { reason: DecisionReasonProp };
  degraded_phone_tapped: { reason: DecisionReasonProp };
  // 3. cap & usage
  analysis_quota_consumed: { analyses_used: number; analysis_limit: number | null; pct_of_cap: number | null };
  cap_warning_20: { prototype_id: string; leads_captured: number };
  cap_reached: { prototype_id: string; leads_captured: number; days_remaining_in_period: number };
  session_limit_reached: Record<string, never>;
  usage_period_rolled: { previous_analyses_used: number; previous_leads_captured: number };
  // 4. contractor funnel — demo
  demo_started: { referrer_type: string };
  demo_lead_submitted: Record<string, never>;
  payload_screen_viewed: { time_to_render_ms: number };
  payload_side_b_explored: { action: 'accept' | 'call' | 'schedule' };
  purchase_cta_viewed: { source_surface: string };
  purchase_cta_clicked: { source_surface: string; plan_code: Tier };
  // 5. contractor funnel — prototype
  prototype_opened: { slug: string; referrer_type: 'sms' | 'direct' | 'other' };
  prototype_widget_launched: Record<string, never>;
  prototype_step_reached: { step: number };
  style_toggle_used: { to_variant: 'light' | 'dark-industrial' };
  prototype_cta_viewed: Record<string, never>;
  prototype_cta_clicked: { plan_code: Tier };
  prototype_expired_viewed: { slug: string };
  // 6. billing
  checkout_started: { plan_code: Tier; entry_point: 'pricing' | 'demo' | 'prototype' | 'admin_link'; provider: string };
  checkout_completed: { plan_code: Tier; setup_cents: number; monthly_cents: number };
  checkout_abandoned: { plan_code: Tier; entry_point: string };
  setup_paid_subscription_failed: { provider_session_ref: string };
  payment_failed: { attempt: number; failure_reason: string };
  dunning_sent: { day_number: number; channel: 'email' | 'sms' };
  payment_recovered: { days_in_dunning: number };
  subscription_suspended: { days_in_dunning: number };
  subscription_canceled: { reason: string; days_active: number };
  refund_issued: { amount_cents: number; days_since_setup: number; under_guarantee: boolean };
  upgrade_viewed: { from_plan: Tier; trigger: 'cap_warning' | 'cap_reached' | 'manual' };
  upgrade_completed: { from_plan: Tier; to_plan: Tier; days_to_upgrade: number };
  manual_payment_recorded: { kind: 'setup' | 'recurring' | 'refund'; amount_cents: number };
  // 7. admin & prospecting
  prospect_created: { vertical: string };
  prospect_qualified: { qualification_score: number; band: string };
  prospect_declined: { qualification_score: number | null; reason: string };
  prototype_staged: { template_id: string; from_preset: boolean };
  share_card_generated: { method: 'copy' | 'qr' | 'sms' };
  brand_extraction_completed: { extraction_source: 'client_canvas' | 'server' | 'manual'; duration_ms: number; wcag_adjustments: number };
  brand_extraction_fell_back: { from_tier: number; to_tier: number; reason: string };
  lead_status_changed: { from_status: string; to_status: string };
  /**
   * A contractor's RATES were changed. Phase 15.
   *
   * The highest-consequence write in the admin surface: every quote produced
   * after it is a different number, and until this event existed there was no
   * record anywhere of who changed what or when. `by` carries the admin's
   * email because the question this event exists to answer is not "did rates
   * change" — quote_configs.updated_at already says that — but "who changed
   * them, and was it the change we meant."
   */
  quote_config_updated: { vertical: string; by: string };
  // 8. system health
  ai_daily_ceiling_hit: { spend_cents: number };
  rate_limit_triggered: { endpoint: string };
  webhook_received: { provider: string; event_type: string; was_duplicate: boolean };
  webhook_processing_failed: { event_type: string; error: string };
  lead_delivery_failed: { channel: string; error: string };
}

export type EventName = keyof EventPropsMap;

// ---------------------------------------------------------------------------
// envelope (EVENTS.md: every event carries these)
// ---------------------------------------------------------------------------

export interface EventContext {
  surface: Surface;
  mode?: WidgetMode; // default 'live'
  sessionId?: string; // auto-derived on the client when omitted
  prototypeId?: string | null;
}

interface Envelope {
  event_name: EventName;
  session_id: string | null;
  prototype_id: string | null;
  surface: Surface;
  mode: WidgetMode;
  occurred_at: string;
  properties: Props;
}

// ---------------------------------------------------------------------------
// transport — swappable sink; default resolves from env
// ---------------------------------------------------------------------------

type Sink = (e: Envelope) => void;

let sink: Sink | null = null;
let sinkResolved = false;

/** Later phases (or a provider adapter) may install a real transport. */
export function setAnalyticsSink(custom: Sink): void {
  sink = custom;
  sinkResolved = true;
}

function resolveSink(): Sink | null {
  if (sinkResolved) return sink;
  sinkResolved = true;
  const key = process.env.NEXT_PUBLIC_ANALYTICS_KEY;
  if (!key) {
    sink =
      process.env.NODE_ENV === 'development'
        ? (e) => console.debug('[analytics:noop]', e.event_name, e.properties)
        : null;
    return sink;
  }
  // Provider-agnostic default: queue in memory client-side; a concrete
  // provider adapter replaces this via setAnalyticsSink when one is chosen.
  sink = (e) => {
    try {
      if (typeof window !== 'undefined') {
        const w = window as unknown as { __nvaEvents?: Envelope[] };
        (w.__nvaEvents ??= []).push(e);
      }
    } catch {
      /* never throws — rule 1 of this module */
    }
  };
  return sink;
}

// ---------------------------------------------------------------------------
// session id — client-side anonymous, no PII
// ---------------------------------------------------------------------------

const SID_KEY = 'nva_sid';

/**
 * Exported (Phase 5) so callers that need a stable session id for SERVER
 * ACTION calls — not just for track()'s own envelope — reuse this exact
 * derivation instead of re-implementing the same sessionStorage key
 * elsewhere and risking two different ids for one browser tab.
 * components/demo/DemoExperience.tsx is the first such caller: it needs the
 * same session id for analyzePhotoAction/submitDemoLead that track() already
 * derives internally for analytics.
 */
export function deriveSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let sid = window.sessionStorage.getItem(SID_KEY);
    if (!sid) {
      sid = `s_${crypto.randomUUID()}`;
      window.sessionStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return null; // storage blocked — degrade to null, never throw
  }
}

// ---------------------------------------------------------------------------
// track()
// ---------------------------------------------------------------------------

export function track<E extends EventName>(
  event: E,
  props: EventPropsMap[E],
  ctx: EventContext
): void {
  try {
    const mode: WidgetMode = ctx.mode ?? 'live';
    if (mode === 'preview') return; // EVENTS.md rule 4, enforced centrally
    const s = resolveSink();
    if (!s) return;
    s({
      event_name: event,
      session_id: ctx.sessionId ?? deriveSessionId(),
      prototype_id: ctx.prototypeId ?? null,
      surface: ctx.surface,
      mode,
      occurred_at: new Date().toISOString(),
      properties: props as Props,
    });
  } catch {
    /* rule 3: a failed emit is silent, always */
  }
}

