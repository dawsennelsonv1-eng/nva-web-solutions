import { createStore, type StoreApi } from 'zustand/vanilla';
import type { WidgetMode, Surface, DbDegradedReason } from '@/types';
import type { QuoteComputation } from '@/lib/quote/pricing';
import type { VisionField } from '@/lib/quote/vision';

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

export type QuoteStep =
  | 'surface'
  | 'photo'
  | 'analyzing'
  | 'finish'
  | 'sqft'
  | 'quote'
  | 'capture'
  | 'unlocked'
  | 'degraded_capture'
  | 'degraded_acknowledged';

/** Forward transitions. Back navigation is handled by the history stack. */
const FORWARD: Record<QuoteStep, QuoteStep[]> = {
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

/** Steps a user may navigate back to. Terminal states are one-way. */
const CAN_RETURN_TO: QuoteStep[] = ['surface', 'photo', 'finish', 'sqft', 'quote'];

export interface LeadDraft {
  name: string;
  phone: string;
  email: string;
  timeline: string;
  /** Set by the machine, never by the form. */
  wasDegraded: boolean;
  degradedReason: DbDegradedReason | null;
  quotePublicId: string | null;
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

  // collected inputs
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
  selectSurfaceType: (id: string) => void;
  attachPhoto: (args: { imageBase64: string; mediaType: string }) => Promise<void>;
  skipPhoto: () => void;
  selectFinish: (args: { finishId: string; finishTierKey: string }) => void;
  setSqft: (sqft: number) => void;
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
  v: 1;
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
}

export interface CreateMachineArgs {
  /** REQUIRED and explicit. There is no default and no route inference. */
  mode: WidgetMode;
  surface: Surface;
  prototypeId?: string | null;
  sessionId?: string | null;
  ports?: QuoteMachinePorts;
  restore?: SerializedMachine | null;
}

export function createQuoteMachine(args: CreateMachineArgs): StoreApi<QuoteMachine> {
  const ports = args.ports ?? {};
  const r = args.restore;

  const initial: QuoteMachineState = {
    mode: args.mode,
    surface: args.surface,
    prototypeId: args.prototypeId ?? null,
    sessionId: args.sessionId ?? null,
    step: r?.step ?? 'surface',
    history: r?.history ?? [],
    surfaceTypeId: r?.surfaceTypeId ?? null,
    photoAttached: r?.photoAttached ?? false,
    finishId: r?.finishId ?? null,
    finishTierKey: r?.finishTierKey ?? null,
    sqft: r?.sqft ?? null,
    conditionModifierIds: r?.conditionModifierIds ?? [],
    analysisHandToUser: [],
    photoPath: null,
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

    goTo: (step) => {
      const from = get().step;
      if (!FORWARD[from].includes(step)) return false;
      set({ step, history: [...get().history, from], error: null });
      ports.touchSession?.({ step, abandoned: false });
      return true;
    },

    /**
     * Back navigation pops the history stack rather than reversing the
     * transition table: the path taken matters. A visitor who skipped the
     * photo must land back on 'surface', not on a 'photo' step they never saw.
     */
    back: () => {
      const hist = [...get().history];
      let target = hist.pop();
      while (target && !CAN_RETURN_TO.includes(target)) target = hist.pop();
      if (!target) return false;
      set({ step: target, history: hist, error: null });
      return true;
    },

    selectSurfaceType: (id) => set({ surfaceTypeId: id }),

    attachPhoto: async ({ imageBase64, mediaType }) => {
      if (!ports.analyze) {
        set({ photoAttached: true });
        get().goTo('finish');
        return;
      }
      set({ photoAttached: true, busy: true, error: null });
      get().goTo('photo');
      get().goTo('analyzing');
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
        // enterDegraded already moved the step; do not also push 'finish'.
        if (!wentDegraded) get().goTo('finish');
      }
    },

    skipPhoto: () => {
      set({ photoAttached: false });
      get().goTo('finish');
    },

    selectFinish: ({ finishId, finishTierKey }) => set({ finishId, finishTierKey }),

    setSqft: (sqft) => set({ sqft }),

    toggleModifier: (id) => {
      const cur = get().conditionModifierIds;
      set({
        conditionModifierIds: cur.includes(id)
          ? cur.filter((m) => m !== id)
          : [...cur, id],
      });
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
        v: 1,
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
      };
    },

    reset: () => set({ ...initial, startedAt: Date.now() }),
  }));
}

/** Time spent in the widget, for the widget_abandoned event. */
export function timeInWidgetMs(state: QuoteMachineState): number {
  return Date.now() - state.startedAt;
}
