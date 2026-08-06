import 'server-only';
import { renderFinishImage, type ImageFailureReason } from '@/lib/ai/images';
import { recordAiJob } from '@/lib/ai/jobs';
import { checkBudget } from '@/lib/ai/budget';
import { uploadFloorPhoto } from '@/lib/storage/photos';
import { EMPTY_USAGE } from '@/lib/ai/types';

/**
 * lib/ai/visualise.ts — "SHOW ME MY FLOOR WITH THAT FINISH ON IT."
 *
 * ============================================================================
 * THE HONESTY PROBLEM, WHICH IS BIGGER THAN THE ENGINEERING ONE
 * ============================================================================
 *
 * A render is a PICTURE OF AN INTENTION. It is not a sample, not a proof, and
 * not a commitment about what a contractor will pour. The failure mode is
 * specific and expensive: a homeowner sees a gorgeous metallic swirl, accepts
 * a quote, receives a floor that does not match, and blames the contractor —
 * who blames the software that showed it. That ends accounts.
 *
 * Three things in this file exist only to prevent that, and none of them are
 * optional:
 *
 *  1. THE PROMPT FORBIDS EMBELLISHMENT. It does not ask for a beautiful floor.
 *     It asks for a realistic, evenly-lit coating in the specified colour, and
 *     it explicitly forbids changing anything else in the frame. A model asked
 *     to make a room look good will stage it, and a staged garage is a
 *     different room.
 *
 *  2. THE GEOMETRY MUST SURVIVE. Walls, door, ceiling, shelving, parked
 *     objects, camera angle and lighting are all named as things to preserve.
 *     If the render moves the walls it is worthless — the homeowner is trying
 *     to see HIS garage, and a prettier stranger's garage answers no question
 *     he has.
 *
 *  3. WHAT WAS SHOWN IS STORED. The exact image goes to the floor-photos
 *     bucket and its path travels with the lead, so there is a record of what
 *     was on screen when the homeowner said yes. That record protects the
 *     contractor in the argument, which is the only reason the argument is
 *     survivable.
 *
 * The label the UI must carry ships with the result rather than being left to
 * the component: see RENDER_DISCLOSURE. A caller that renders the image
 * without it has forgotten the one thing that makes this feature safe.
 *
 * ============================================================================
 * IT SPENDS MONEY, SO IT ASKS FIRST
 * ============================================================================
 *
 * A render costs roughly ten to forty times a vision analysis. The daily
 * ceiling in lib/ai/budget.ts already exists for exactly this class of
 * problem, so this checks it BEFORE calling out — a visualiser that quietly
 * empties the balance would take the quoting engine's AI down with it, and the
 * quoting engine is the product.
 *
 * The estimate is deliberately pessimistic. Under-estimating spend is the
 * direction that breaks a ceiling.
 */

/** VERIFY against the endpoint you settle on: curl /api/v1/images/models */
const ESTIMATED_COST_CENTS = 6;

/**
 * The sentence that must appear beside every render, everywhere it is shown.
 *
 * It lives here rather than in a component because it is a property of the
 * ARTEFACT, not of one screen. The same image goes to the widget, to the
 * contractor's email and into the leads inbox, and it needs this caption in
 * all three.
 */
export const RENDER_DISCLOSURE =
  'Illustration only — a preview of the finish on your photo, not a sample of the finished work. Colour and pattern vary with the slab, the light and the pour.';

export interface VisualiseArgs {
  /** The homeowner's photo, base64, already compressed by lib/image/pipeline. */
  photoBase64: string;
  photoMediaType: string;
  /** e.g. 'Metallic epoxy'. From the vertical module, never typed here. */
  finishLabel: string;
  /** e.g. 'Copper Burl'. Optional — some finishes are a single colour. */
  colourLabel?: string;
  /** Hex of the chosen colour, so the model is told the target directly. */
  colourHex?: string;
  /** e.g. 'garage'. Used to name the surface, not to price anything. */
  surfaceLabel: string;
  sessionId: string;
  prototypeId: string | null;
}

export type VisualiseResult =
  | { ok: true; storagePath: string | null; base64: string; mediaType: string; disclosure: string }
  | { ok: false; reason: ImageFailureReason | 'over_budget' };

/**
 * Build the instruction. Written as a constraint list rather than a
 * description, because every clause here is a thing the model must NOT do.
 */
function buildPrompt(args: VisualiseArgs): string {
  const colour = args.colourLabel
    ? `${args.colourLabel}${args.colourHex ? ` (approximately ${args.colourHex})` : ''}`
    : 'the existing colour';

  return [
    `Edit this photograph of a ${args.surfaceLabel}.`,
    `Replace ONLY the floor surface with a realistic ${args.finishLabel} coating in ${colour}.`,
    'Keep the camera angle, perspective, lighting and shadows exactly as they are.',
    'Keep the walls, ceiling, doors, windows, shelving, vehicles and every other object',
    'unchanged and in the same position. Do not tidy, restage, redecorate or relight the room.',
    'Do not add furniture, people, text or reflections that were not there.',
    'The coating should look evenly applied and ordinary, as a real installed floor looks',
    'in this exact lighting — not glossy, not idealised, not a showroom.',
  ].join(' ');
}

export async function visualiseFinish(args: VisualiseArgs): Promise<VisualiseResult> {
  // ---- budget gate ---------------------------------------------------------
  const budget = await checkBudget(ESTIMATED_COST_CENTS);
  if (!budget.allowed) {
    // No ai_jobs row: nothing was attempted and nothing was spent. Recording a
    // job here would put a zero-cost failure in the ledger that looks like a
    // provider problem when it is a deliberate refusal.
    return { ok: false, reason: 'over_budget' };
  }

  const dataUrl = `data:${args.photoMediaType};base64,${args.photoBase64}`;
  const result = await renderFinishImage({
    prompt: buildPrompt(args),
    referenceDataUrl: dataUrl,
  });

  // ---- the ledger ----------------------------------------------------------
  // Recorded on success AND on failure. A failed render is not billed by
  // OpenRouter (billing is all-or-nothing), so cost is zero — but the row is
  // what makes "the visualiser has been timing out since Tuesday" a visible
  // fact rather than a support ticket.
  await recordAiJob({
    prototypeId: args.prototypeId,
    jobType: 'finish_render',
    provider: 'openrouter',
    model: result.ok ? result.model : (process.env.AI_IMAGE_MODEL ?? 'unknown'),
    // Tokens are meaningless for a per-image charge. Zeroed rather than
    // fabricated, so nothing downstream averages a token cost that never
    // existed.
    usage: EMPTY_USAGE,
    costCents: result.ok ? result.costCents : 0,
    status: result.ok ? 'succeeded' : 'failed',
    error: result.ok ? null : result.reason,
    durationMs: result.durationMs,
    request: {
      finish: args.finishLabel,
      colour: args.colourLabel ?? null,
      surface: args.surfaceLabel,
    },
  });

  if (!result.ok) return { ok: false, reason: result.reason };

  /**
   * Store what was shown. This is the record that protects the contractor if a
   * homeowner later says the floor does not match the picture — without it,
   * the only evidence of what was promised is memory.
   *
   * uploadFloorPhoto never throws and returns null on failure, so a storage
   * problem costs the receipt, not the render. The homeowner still sees his
   * picture; the lead simply carries no path.
   */
  const storagePath = await uploadFloorPhoto({
    prototypeId: args.prototypeId,
    sessionId: args.sessionId + '-render',
    base64: result.base64,
    mediaType: result.mediaType,
  });

  return {
    ok: true,
    storagePath,
    base64: result.base64,
    mediaType: result.mediaType,
    disclosure: RENDER_DISCLOSURE,
  };
}
