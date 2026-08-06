import { createStore, type StoreApi } from 'zustand/vanilla';
import type { WidgetMode, Surface, DbDegradedReason } from '@/types';
import type { QuoteComputation } from '@/lib/quote/pricing';
import type { VisionField } from '@/lib/quote/vision';
import type { StepDescriptor } from '@/lib/verticals/registry';

/**
 * lib/quote/machine.ts — THE WIDGET STATE MACHINE (Zustand, vanilla).
 *
 * Vanilla, not a React hook, on purpose: Phase 3 is logic only. Phase 4 binds
 * this store to React with useStore(). Keeping it framework-free is also what
 * makes it directly testable without a renderer.
 *
 * TWO PATHS, both first-class:
 *
 *   happy     surface -> photo -> analyzing -> finish -> sqft -> quote
 *                     -> capture -> unlocked
 *   degraded  surface -> degraded_capture -> degraded_acknowledged
 *
 * Degraded is NOT an error branch off the happy path. It is entered
 * deliberately by enterDegraded(reason) the moment check.ts says so, it skips
 * every step that would promise a price we cannot deliver, and it ends in a
 * state that tells the homeowner a real human is coming back to them. The
 * contact form is live in both.
 *
 * ALL I/O IS INJECTED as ports. The store never imports a Supabase client, an
 * action, or fetch. That keeps it isomorphic, keeps Phase 4 in control of
 * transport, and means a test can drive the whole funnel with four stubs.
 *
 * === PHASE 11 ADDITION: DYNAMIC STEP PLANS ===
 *
 * Phase 4 hard-wired the step list above, which is exactly one trade's set of
 * questions. Painting asks two more — coat count and prep level — and had
 * nowhere to put them, so steps[] on the vertical contract was decorative.
 * It is not any more.
 *
 * Pass `steps` (the module's StepDescriptor[]) to createQuoteMachine and the
 * machine runs a PLAN: the visible subset of those steps, recomputed from the
 * current answers on every read, walked in order by next(). Omit `steps` and
 * every line of the Phase 4 behaviour below runs unchanged, transition table
 * and all. That duality is deliberate and temporary — the /demo and /s/[slug]
 * mounts still take the legacy path, and shipping a change that reds a build
 * I cannot compile locally is worse than carrying two paths for one phase.
 *
 * ANSWERS ARE NOW THE SOURCE OF TRUTH. `answers` is a flat map keyed by each
 * step's `writesTo`. The Phase 4 fields (surfaceTypeId, finishId,
 * finishTierKey, sqft, conditionModifierIds) are kept as MIRRORS, written by
 * setAnswer, so every existing selector and every existing component keeps
 * reading exactly what it always read. The mirror for the primary quantity is
 * deliberately wide — areaSqft, linearFt and doorCount all mirror onto `sqft`
 * — because painting measures three different things and StepArea only knows
 * how to render one slider.
 */

/**
 * PHASE 5 ADDITION. The `analyze` port's contract is "return hints, or
 * null for manual entry" — but analyzePhotoAction (Phase 3) can also
 * discover MID-FLOW that the prototype is now degraded (another visitor
 * just pushed it over the cap, or the daily spend ceiling tripped between
 * page load and this photo). That is a state transition, not a hint, so it
 * does not fit the port's return type. An adapter that detects it throws
 * this instead; attachPhoto's catch clause recognises it and routes to the
 * SAME enterDegraded() every other degraded trigger uses, rather than
 * falling through to the generic "treat it as a network hiccup" path.
 */
export class AnalysisDegradedSignal extends Error {
  constructor(public readonly reason: DbDegradedReason) {
    super('analysis_degraded');
    this.name = 'AnalysisDegradedSignal';
  }
}

/** The steps every vertical ends on, whatever its own questions were. */
export type TerminalQuoteStep =
  | 'quote'
  | 'capture'
  | 'unlocked'
  | 'degraded_capture'
  | 'degraded_acknowledged';

/** Phase 4's epoxy-shaped plan, still the default when no steps are supplied. */
export type LegacyQuoteStep = 'surface' | 'photo' | 'analyzing' | 'finish' | 'sqft';

/**
 * Widened in Phase 11: a dynamic plan's step ids come from the vertical
 * module and cannot be known here. `(string & {})` keeps editor autocomplete
 * on the known members while admitting a module's own ids.
 */
export type QuoteStep = LegacyQuoteStep | TerminalQuoteStep | (string & {});

const TERMINAL_STEPS: string[] = [
  'quote',
  'capture',
  'unlocked',
  'degraded_capture',
  'degraded_acknowledged',
];

/** Forward transitions for the LEGACY plan. Back navigation uses history. */
const FORWARD: Record<string, QuoteStep[]> = {
  surface: ['photo', 'finish', 'degraded_capture'],
  photo: ['analyzing', 'finish', 'degraded_capture'],
  analyzing: ['finish', 'degraded_capture'],
  finish: ['sqft', 'degraded_capture'],
  sqft: ['quote', 'degraded_capture'],
  quote: ['capture', 'degraded_capture'],
  capture: ['unlocked', 'degraded_capture'],
  unlocked: [],
  degraded_capture: ['degraded_acknowledged'],
  degraded_acknowledged: [],
};

/** Steps a user may navigate back to in the legacy plan. Terminals are one-way. */
const CAN_RETURN_TO: string[] = ['surface', 'photo', 'finish', 'sqft', 'quote'];

/**
 * Answer keys that mirror onto the legacy `sqft` field. Painting measures
 * walls in square feet, trim in linear feet and cabinets in fronts; all three
 * are "the primary quantity" as far as the slider is concerned.
 */
const QUANTITY_KEYS: string[] = ['sqft', 'areaSqft', 'linearFt', 'doorCount'];

export interface LeadDraft {
  name: string;
  phone: string;
  email: string;
  timeline: string;
  /** Set by the machine, never by the form. */
  wasDegraded: boolean;
  degradedReason: DbDegradedReason | null;
  quotePublicId: string | null;
  /**
   * Storage path of the finish render the homeowner was shown, if he asked to
   * see one. Phase 14.
   *
   * OPTIONAL, and that is the design decision rather than laziness. Every
   * existing implementer of the submitLead port — DemoExperience,
   * PrototypeExperience — compiles unchanged and simply never sets it. Making
   * it required would have forced an edit to every adapter for a field most of
   * them have no way to produce, and a required field nobody sets is a
   * required field somebody fills with a lie.
   *
   * Set by the machine from its own state, never by the capture form.
   */
  renderPath?: string | null;
}

export interface QuoteMachinePorts {
  /** Records step progression and abandonment. Fire-and-forget. */
  touchSession?: (args: { step: QuoteStep; abandoned: boolean }) => void;
  /** Runs the paid analysis. Resolves to hints or null when unavailable. */
  analyze?: (args: { imageBase64: string; mediaType: string }) => Promise<{
    surfaceTypeId?: string;
    estimatedSqft?: number;
    conditionModifierIds: string[];
    handToUser: VisionField[];
    /** Phase 6: Storage path if the adapter uploaded the photo. */
    photoPath?: string | null;
    /**
     * PHASE 11: vertical-shaped hints, keyed by the module's own writesTo
     * keys. Optional, so every Phase 5 adapter keeps compiling; when present
     * it is merged into `answers` AFTER the legacy fields, letting a painting
     * adapter hand back prepLevelId and coats without inventing a home for
     * them among the epoxy-shaped fields above.
     */
    answers?: Record<string, unknown>;
  } | null>;
  /** Recomputes and persists server-side, returning the public id. photoPath
   * is passed separately (Phase 6) rather than folded into QuoteComputation,
   * since pricing.ts stays photo-agnostic — a photo is provenance for the
   * quote row, not an input to the price itself. */
  persistQuote?: (computation: QuoteComputation, photoPath: string | null) => Promise<string | null>;
  /** Phase 5 owns the real lead write; the machine only hands it the draft. */
  submitLead?: (draft: LeadDraft) => Promise<void>;
}

export interface QuoteMachineState {
  // identity — mode is ALWAYS explicit, never inferred from a route (R-123)
  mode: WidgetMode;
  surface: Surface;
  prototypeId: string | null;
  sessionId: string | null;

  step: QuoteStep;
  history: QuoteStep[];

  /**
   * PHASE 11: the declared plan, empty in legacy mode. Never mutated after
   * construction — visibility is recomputed, the list itself is not.
   */
  steps: StepDescriptor[];

  /** PHASE 11: every answer, keyed by StepDescriptor.writesTo. */
  answers: Record<string, unknown>;

  // collected inputs — MIRRORS of `answers`, kept for every Phase 4 consumer
  surfaceTypeId: string | null;
  photoAttached: boolean;
  finishId: string | null;
  finishTierKey: string | null;
  sqft: number | null;
  conditionModifierIds: string[];

  // results
  analysisHandToUser: VisionField[];
  /** Phase 6: Storage path of the uploaded photo, if analysis produced one. */
  photoPath: string | null;
  /**
   * Phase 14: Storage path of the finish RENDER, which is a different image
   * from photoPath. photoPath is the slab as it is; this is the slab with the
   * chosen finish drawn on it. Kept apart because the pair is the comparison —
   * one path holding either would leave nobody able to tell which.
   */
  renderPath: string | null;
  computation: QuoteComputation | null;
  quotePublicId: string | null;

  // degraded
  degraded: boolean;
  degradedReason: DbDegradedReason | null;

  // lifecycle
  startedAt: number;
  abandoned: boolean;
  busy: boolean;
  error: string | null;
}

export interface QuoteMachineActions {
  goTo: (step: QuoteStep) => boolean;
  back: () => boolean;
  /** PHASE 11: advance to the next VISIBLE step of the plan. */
  next: () => boolean;
  /** PHASE 11: the currently visible plan, recomputed from answers. */
  visiblePlan: () => StepDescriptor[];
  /** PHASE 11: write one answer and mirror it onto the legacy fields. */
  setAnswer: (key: string, value: unknown) => void;
  setAnswers: (patch: Record<string, unknown>) => void;
  selectSurfaceType: (id: string) => void;
  attachPhoto: (args: { imageBase64: string; mediaType: string }) => Promise<void>;
  skipPhoto: () => void;
  selectFinish: (args: { finishId: string; finishTierKey: string }) => void;
  setSqft: (sqft: number) => void;
  /**
   * Record the finish render's storage path. Called by the widget when the
   * visualiser returns, so the path is in machine state before capture rather
   * than being passed down through the form.
   */
  setRenderPath: (path: string | null) => void;
  toggleModifier: (id: string) => void;
  setComputation: (c: QuoteComputation | null) => void;
  commitQuote: () => Promise<void>;
  enterDegraded: (reason: DbDegradedReason) => void;
  submitCapture: (fields: Omit<LeadDraft, 'wasDegraded' | 'degradedReason' | 'quotePublicId'>) => Promise<void>;
  markAbandoned: () => void;
  serialize: () => SerializedMachine;
  reset: () => void;
}

export type QuoteMachine = QuoteMachineState & QuoteMachineActions;

export interface SerializedMachine {
  /** v1 = Phase 4. v2 adds `answers`; a v1 payload still restores cleanly. */
  v: 1 | 2;
  step: QuoteStep;
  history: QuoteStep[];
  surfaceTypeId: string | null;
  photoAttached: boolean;
  finishId: string | null;
  finishTierKey: string | null;
  sqft: number | null;
  conditionModifierIds: string[];
  degraded: boolean;
  degradedReason: DbDegradedReason | null;
  quotePublicId: string | null;
  answers?: Record<string, unknown>;
}

export interface CreateMachineArgs {
  /** REQUIRED and explicit. There is no default and no route inference. */
  mode: WidgetMode;
  surface: Surface;
  prototypeId?: string | null;
  sessionId?: string | null;
  ports?: QuoteMachinePorts;
  restore?: SerializedMachine | null;
  /**
   * PHASE 11. Supply the vertical module's steps to run a dynamic plan.
   * Omit for the Phase 4 behaviour, unchanged.
   */
  steps?: StepDescriptor[];
}

function isVisible(step: StepDescriptor, answers: Record<string, unknown>): boolean {
  if (!step.showIf) return true;
  try {
    return step.showIf(answers);
  } catch {
    // A module predicate that throws must not take out the funnel. Showing a
    // step the visitor could have skipped costs one tap; crashing costs the
    // lead, and lead capture never stops.
    return true;
  }
}

export function createQuoteMachine(args: CreateMachineArgs): StoreApi<QuoteMachine> {
  const ports = args.ports ?? {};
  const r = args.restore;
  const plan = args.steps ?? [];
  const dynamic = plan.length > 0;

  const restoredAnswers = r?.answers ?? {};
  const firstVisible = plan.find((s) => isVisible(s, restoredAnswers));

  const initial: QuoteMachineState = {
    mode: args.mode,
    surface: args.surface,
    prototypeId: args.prototypeId ?? null,
    sessionId: args.sessionId ?? null,
    step: r?.step ?? (dynamic ? firstVisible?.id ?? 'quote' : 'surface'),
    history: r?.history ?? [],
    steps: plan,
    answers: { ...restoredAnswers },
    surfaceTypeId: r?.surfaceTypeId ?? null,
    photoAttached: r?.photoAttached ?? false,
    finishId: r?.finishId ?? null,
    finishTierKey: r?.finishTierKey ?? null,
    sqft: r?.sqft ?? null,
    conditionModifierIds: r?.conditionModifierIds ?? [],
    analysisHandToUser: [],
    photoPath: null,
    renderPath: null,
    computation: null,
    quotePublicId: r?.quotePublicId ?? null,
    degraded: r?.degraded ?? false,
    degradedReason: r?.degradedReason ?? null,
    startedAt: Date.now(),
    abandoned: false,
    busy: false,
    error: null,
  };

  return createStore<QuoteMachine>()((set, get) => ({
    ...initial,

    visiblePlan: () => {
      const s = get();
      return s.steps.filter((st) => isVisible(st, s.answers));
    },

    /**
     * Writes an answer and mirrors it onto the Phase 4 fields. Every existing
     * selector reads those fields, so this is what lets painting drive
     * components written for epoxy without either one knowing about the other.
     */
    setAnswer: (key, value) => {
      const patch: Record<string, unknown> = {
        answers: { ...get().answers, [key]: value },
      };
      if (key === 'surfaceTypeId' && (typeof value === 'string' || value === null)) {
        patch.surfaceTypeId = value;
      }
      if (key === 'finishId' && (typeof value === 'string' || value === null)) {
        patch.finishId = value;
      }
      if (key === 'finishTierKey' && (typeof value === 'string' || value === null)) {
        patch.finishTierKey = value;
      }
      if (key === 'conditionModifierIds' && Array.isArray(value)) {
        patch.conditionModifierIds = value;
      }
      if (QUANTITY_KEYS.includes(key) && typeof value === 'number') {
        patch.sqft = value;
      }
      set(patch as Partial<QuoteMachine>);
    },

    setAnswers: (patchAnswers) => {
      for (const [k, v] of Object.entries(patchAnswers)) get().setAnswer(k, v);
    },

    goTo: (step) => {
      const s = get();
      const from = s.step;

      if (s.steps.length > 0) {
        // Dynamic plan: any visible step or terminal is reachable. ORDER is
        // enforced by next(); goTo is how a component jumps deliberately.
        const reachable = [
          ...s.steps.filter((st) => isVisible(st, s.answers)).map((st) => st.id),
          ...TERMINAL_STEPS,
        ];
        if (!reachable.includes(step) || step === from) return false;
        set({ step, history: [...s.history, from], error: null });
        ports.touchSession?.({ step, abandoned: false });
        return true;
      }

      const allowed = FORWARD[from];
      if (!allowed || !allowed.includes(step)) return false;
      set({ step, history: [...s.history, from], error: null });
      ports.touchSession?.({ step, abandoned: false });
      return true;
    },

    /**
     * Advance one step along the visible plan. Past the last question every
     * vertical ends in the same place: a price, then the capture form.
     * Verticals declare their questions; they never declare their ending.
     */
    next: () => {
      const s = get();
      if (s.steps.length === 0) return false;
      const visible = s.steps.filter((st) => isVisible(st, s.answers));
      const idx = visible.findIndex((st) => st.id === s.step);
      const nextStep = idx >= 0 && idx + 1 < visible.length ? visible[idx + 1] : undefined;
      return get().goTo(nextStep ? nextStep.id : 'quote');
    },

    /**
     * Back navigation pops the history stack rather than reversing the
     * transition table: the path taken matters. A visitor who skipped the
     * photo must land back on 'surface', not on a 'photo' step they never saw.
     */
    back: () => {
      const s = get();
      const returnable =
        s.steps.length > 0 ? [...s.steps.map((st) => st.id), 'quote'] : CAN_RETURN_TO;
      const hist = [...s.history];
      let target = hist.pop();
      while (target && !returnable.includes(target)) target = hist.pop();
      if (!target) return false;
      set({ step: target, history: hist, error: null });
      return true;
    },

    selectSurfaceType: (id) => {
      if (get().steps.length > 0) get().setAnswer('surfaceTypeId', id);
      else set({ surfaceTypeId: id });
    },

    attachPhoto: async ({ imageBase64, mediaType }) => {
      const advance = () => {
        if (get().steps.length > 0) get().next();
        else get().goTo('finish');
      };

      if (!ports.analyze) {
        set({ photoAttached: true });
        advance();
        return;
      }
      set({ photoAttached: true, busy: true, error: null });
      if (get().steps.length === 0) {
        get().goTo('photo');
        get().goTo('analyzing');
      }
      let wentDegraded = false;
      try {
        const hints = await ports.analyze({ imageBase64, mediaType });
        if (hints) {
          set({
            surfaceTypeId: hints.surfaceTypeId ?? get().surfaceTypeId,
            sqft: hints.estimatedSqft ?? get().sqft,
            conditionModifierIds: hints.conditionModifierIds,
            analysisHandToUser: hints.handToUser,
            photoPath: hints.photoPath ?? get().photoPath,
          });
          // Vertical-shaped hints last: a module that knows its own keys wins
          // over the epoxy-shaped fields above.
          if (hints.answers) get().setAnswers(hints.answers);
        }
      } catch (e) {
        if (e instanceof AnalysisDegradedSignal) {
          wentDegraded = true;
          get().enterDegraded(e.reason);
        } else {
          // Any other failure is an accelerator failing, never a gate. The
          // visitor fills in what the model would have guessed.
          set({ analysisHandToUser: [] });
        }
      } finally {
        set({ busy: false });
        // enterDegraded already moved the step; do not also advance.
        if (!wentDegraded) advance();
      }
    },

    skipPhoto: () => {
      set({ photoAttached: false });
      if (get().steps.length > 0) get().next();
      else get().goTo('finish');
    },

    selectFinish: ({ finishId, finishTierKey }) => {
      if (get().steps.length > 0) {
        get().setAnswer('finishId', finishId);
        get().setAnswer('finishTierKey', finishTierKey);
      } else {
        set({ finishId, finishTierKey });
      }
    },

    setRenderPath: (path) => set({ renderPath: path }),

    setSqft: (sqft) => {
      const s = get();
      if (s.steps.length > 0) {
        // Write back to whichever quantity key this vertical's visible plan
        // actually declared, so a trim run does not land in areaSqft.
        const quantityStep = s.steps
          .filter((st) => isVisible(st, s.answers))
          .find((st) => QUANTITY_KEYS.includes(st.writesTo));
        get().setAnswer(quantityStep ? quantityStep.writesTo : 'sqft', sqft);
        return;
      }
      set({ sqft });
    },

    toggleModifier: (id) => {
      const cur = get().conditionModifierIds;
      const nextIds = cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id];
      if (get().steps.length > 0) get().setAnswer('conditionModifierIds', nextIds);
      else set({ conditionModifierIds: nextIds });
    },

    setComputation: (c) => set({ computation: c }),

    commitQuote: async () => {
      const { computation, mode } = get();
      if (!computation) return;
      // 'preview' writes nothing, anywhere, ever.
      if (mode === 'preview' || !ports.persistQuote) {
        get().goTo('capture');
        return;
      }
      set({ busy: true });
      try {
        const publicId = await ports.persistQuote(computation, get().photoPath);
        set({ quotePublicId: publicId });
      } catch {
        // A persistence failure must not block lead capture — the homeowner
        // still gets to hand over their details.
        set({ quotePublicId: null });
      } finally {
        set({ busy: false });
        get().goTo('capture');
      }
    },

    /**
     * Enter the degraded path from wherever we are. Idempotent, so a repeated
     * decision does not rewind a visitor already filling in the form.
     */
    enterDegraded: (reason) => {
      const s = get();
      if (s.degraded) return;
      set({
        degraded: true,
        degradedReason: reason,
        computation: null,
        quotePublicId: null,
        history: [...s.history, s.step],
        step: 'degraded_capture',
      });
      ports.touchSession?.({ step: 'degraded_capture', abandoned: false });
    },

    submitCapture: async (fields) => {
      const s = get();
      const draft: LeadDraft = {
        ...fields,
        wasDegraded: s.degraded,
        degradedReason: s.degraded ? s.degradedReason : null,
        quotePublicId: s.quotePublicId,
        renderPath: s.renderPath,
      };
      set({ busy: true, error: null });
      try {
        if (s.mode === 'live' && ports.submitLead) await ports.submitLead(draft);
        set({ step: s.degraded ? 'degraded_acknowledged' : 'unlocked', history: [...s.history, s.step] });
      } catch {
        // The one place an error is surfaced to the user: they typed their
        // details and deserve to know they did not land.
        set({ error: 'We could not send that. Try once more.' });
      } finally {
        set({ busy: false });
      }
    },

    /**
     * The abandonment write. abandoned_step is the single most valuable field
     * in the schema for deciding what gets built after launch, so it records
     * the exact step the session died on rather than a generic "left".
     */
    markAbandoned: () => {
      const s = get();
      if (s.abandoned) return;
      if (s.step === 'unlocked' || s.step === 'degraded_acknowledged') return;
      set({ abandoned: true });
      ports.touchSession?.({ step: s.step, abandoned: true });
    },

    serialize: () => {
      const s = get();
      return {
        v: 2,
        step: s.step,
        history: s.history,
        surfaceTypeId: s.surfaceTypeId,
        photoAttached: s.photoAttached,
        finishId: s.finishId,
        finishTierKey: s.finishTierKey,
        sqft: s.sqft,
        conditionModifierIds: s.conditionModifierIds,
        degraded: s.degraded,
        degradedReason: s.degradedReason,
        quotePublicId: s.quotePublicId,
        answers: s.answers,
      };
    },

    reset: () => set({ ...initial, answers: {}, startedAt: Date.now() }),
  }));
}

/** Time spent in the widget, for the widget_abandoned event. */
export function timeInWidgetMs(state: QuoteMachineState): number {
  return Date.now() - state.startedAt;
}

