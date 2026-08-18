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
  /**
   * The full assembled description of every choice, from the picker's
   * renderDescription(). When present it SUPERSEDES finishLabel in the prompt.
   *
   * finishLabel is one phrase — "Metallic pour". This is the whole floor: the
   * coating, the pour colour, the coverage, the chip size, the topcoat and any
   * extras, each in the words its own catalogue entry supplies. The difference
   * between the two is the difference between a model guessing and a model
   * being told.
   */
  finishDescription?: string;
  /**
   * Public URLs of material sample photographs for what was chosen. Resolved
   * server-side; never taken from a browser.
   */
  materialUrls?: string[];
  /**
   * True when the FIRST entry of materialUrls is a combination render — a
   * photograph of a whole finished floor in somebody else's room — rather than
   * a close-cropped material tile. PHASE 66.
   *
   * THE PROMPT HAS TO KNOW, because the two need opposite instructions and
   * calling both "a sample" is what produced the worst bug this tool has had.
   * See the note above the material clauses in buildPrompt.
   */
  materialsLeadWithInstalledPhoto?: boolean;
  /** Hex of the chosen colour, so the model is told the target directly. */
  colourHex?: string;
  /** e.g. 'garage'. Used to name the surface, not to price anything. */
  surfaceLabel: string;
  sessionId: string;
  prototypeId: string | null;
}

export type VisualiseResult =
  | { ok: true; storagePath: string | null; base64: string; mediaType: string; disclosure: string }
  | {
      ok: false;
      reason: ImageFailureReason | 'over_budget';
      /**
       * =====================================================================
       * THE DIAGNOSIS, CARRIED OUT RATHER THAN LEFT ON THE FLOOR.
       * =====================================================================
       *
       * This file already assembles the good evidence. `renderFinishImage`
       * returns an `attempts` list — every model tried, in order, with the
       * vendor's own sentence — and the recordAiJob call below writes it into
       * `ai_jobs.request`.
       *
       * And then the return statement threw it away: `{ ok: false, reason }`
       * and nothing else. So the browser received one enum value out of seven,
       * mapped it to a sentence written for a homeowner, and the operator was
       * left inferring a retired model slug from a support conversation — while
       * the exact answer sat in a database column nobody thought to open.
       *
       * That is precisely the shape of the bug that hid the measurement
       * failure for weeks (see lib/quote/vision.ts), one layer up.
       *
       * NEITHER FIELD IS EVER SHOWN TO A HOMEOWNER. app/actions/visualise.ts
       * keeps them separate from the copy he reads.
       */
      detail?: string | null;
      attempts?: string[];
    };

/**
 * Build the instruction. Written as a constraint list rather than a
 * description, because every clause here is a thing the model must NOT do.
 */
function buildPrompt(args: VisualiseArgs): string {
  const colour = args.colourLabel
    ? `${args.colourLabel}${args.colourHex ? ` (approximately ${args.colourHex})` : ''}`
    : 'the existing colour';

  /**
   * The full picker description when there is one, the single label otherwise.
   * Every pre-picker caller passes only a label and gets the original
   * behaviour byte for byte.
   */
  const finish =
    args.finishDescription && args.finishDescription.trim().length > 0
      ? args.finishDescription.trim()
      : `${args.finishLabel} coating in ${colour}`;

  const materials = (args.materialUrls ?? []).length;

  const lines = [
    // POSITIONAL, AND IT MATTERS. The reference array puts the garage first and
    // the samples after; naming that order in words is what stops the model
    // editing a swatch and returning a picture of a material sample.
    `The FIRST image is a photograph of a ${args.surfaceLabel}. Edit that photograph.`,
  ];

  /**
   * ==========================================================================
   * THE REFERENCES ARE NOT ALL THE SAME KIND OF THING. PHASE 66.
   * ==========================================================================
   *
   * THE BUG THIS FIXES, IN THE WORDS IT WAS REPORTED IN: "instead of the output
   * being the combination I chose previewed on the picture I uploaded, the
   * backend keeps pushing the combination pictures I saw before to me instead
   * of my floor."
   *
   * That is exactly what the old wording asked for. `resolveMaterials` puts the
   * COMBINATION RENDER first in the array — deliberately, as a consistency
   * anchor, and the reasoning there is good — but a combination render is a
   * photograph of a WHOLE GARAGE FLOOR IN SOMEBODY ELSE'S ROOM. The prompt then
   * announced it as "a sample of the exact floor finish to apply".
   *
   * So the model was handed two photographs of garages, told the first was the
   * subject and the second was a "sample", and asked to produce a garage with
   * that finish. Returning the second image satisfies every instruction it was
   * given. It is not a model failure; it is an accurate description of a tile
   * applied to something that is not a tile.
   *
   * THE FIX IS NOT TO REMOVE THE ANCHOR. Without it, three photographs become
   * three independent calls that each invent their own reading of "domino
   * flake", and the renders disagree with each other — the second complaint in
   * the same report. The anchor is what makes them agree. What was missing is
   * that its ROLE was never stated.
   *
   * So an installed example is now introduced as a different room, explicitly,
   * with the single thing to take from it named and everything else forbidden.
   * And whatever the references are, the output is required to be the first
   * room and returning a reference is ruled out in as many words.
   */
  if (materials > 0) {
    if (args.materialsLeadWithInstalledPhoto) {
      lines.push(
        'The SECOND image shows this same floor finish already installed in a DIFFERENT room. It is a material reference ONLY.',
        'Take from it just one thing: what this finish looks like across a whole floor at real scale — the colour, the pattern, the density of any flakes or aggregate, and the level of gloss.',
        'Ignore everything else about it. Its room, its walls, its doors, its contents, its camera angle, its lighting and its shadows are irrelevant and must not appear in your output.'
      );
      if (materials > 1) {
        lines.push(
          `The remaining ${materials - 1} images are close-up samples of the same finish. Use them to pin the colour and the texture exactly.`
        );
      }
    } else {
      lines.push(
        materials === 1
          ? 'The SECOND image is a close-up sample of the exact floor finish to apply.'
          : `The following ${materials} images are close-up samples of the exact floor finish to apply.`
      );
    }

    lines.push(
      'Match the samples closely: the colour, the pattern, the size and density of any flakes or aggregate, and the level of gloss.',
      'Reproduce the material shown, not your own interpretation of its name.',
      /* Stated positively AND negatively, because this is the failure that
         matters most: a homeowner shown a stranger's garage and told it is his
         own has been lied to by the product. */
      'Your output must be the room from the FIRST image: the same walls, the same doors, the same objects in the same positions, from the same camera position.',
      'Do not return any of the reference images, edited or unedited. Do not replace the first room with a room from a reference. If the finished result does not show the same room as the first image, it is wrong.'
    );
  }

  lines.push(
    `Replace ONLY the floor surface in the first image with: ${finish}.`,
    'Apply it across the whole visible floor, including under and around anything standing on it, following the floor plane in correct perspective.',
    'Keep the camera angle, perspective, lighting and shadows exactly as they are.',
    'Keep the walls, ceiling, doors, windows, shelving, vehicles and every other object',
    'unchanged and in the same position. Do not tidy, restage, redecorate or relight the room.',
    'Do not add furniture, people, text or reflections that were not there.',
    'The coating should look evenly applied and ordinary, as a real installed floor looks',
    'in this exact lighting — not idealised, not a showroom, not a catalogue photograph.',

    /**
     * ======================================================================
     * THE REALISM CLAUSES. EACH ONE IS A FLAW OBSERVED IN AN ACTUAL RENDER.
     * ======================================================================
     *
     * The first working render of a Port-au-Prince courtyard came back
     * convincing at a glance and wrong in two specific, repeatable ways, both
     * of which a contractor would notice immediately and neither of which the
     * prompt above forbids.
     *
     * 1. A BLOWN-OUT WHITE HIGHLIGHT IN THE MIDDLE OF THE FLOOR, with no
     *    light source anywhere in frame to justify it. It reads as spilled
     *    paint rather than as a reflection. Image models add a hero highlight
     *    to glossy surfaces because that is how glossy surfaces are usually
     *    PHOTOGRAPHED — in a studio, lit deliberately. A courtyard at dusk has
     *    no such light, so the highlight is an object that does not exist.
     *
     * 2. THE FAR EDGE FADED TO NEAR-WHITE, which looks like an unfinished
     *    pour — the single most alarming thing a coating can look like to
     *    somebody about to pay for one.
     *
     * A gloss finish reflects what is ACTUALLY THERE. That is the instruction:
     * not "less shiny", which would flatten the wet look that makes high gloss
     * worth paying for, but "reflect the real room". A floor mirroring the
     * doorway that is genuinely in the photograph looks more expensive than
     * one carrying an invented highlight, and it is also true.
     */
    'Any shine must reflect only what is actually visible in the photograph — the doorway, the walls, the sky, the objects already present.',
    'Do not add a bright highlight, a glare spot, a light bloom or a sun flare. If no light source appears in the photograph, none may appear on the floor.',
    'Carry the finish right to the edges of the slab at full strength. Do not fade, lighten, blur or wash out the far edge or the corners — a pale edge reads as an unfinished pour.',
    'Keep the coating continuous and consistent across the whole floor: the same colour, the same density of pattern and the same gloss at the front as at the back, allowing only for the room\'s own natural falloff in light.',
    'Match the photograph\'s own exposure, white balance, colour temperature and grain. The result must look like the same camera took it at the same moment, not like a rendering composited into a snapshot.',
    'Keep the existing shadows: anything that cast a shadow on the old floor casts the same shadow on the new one, in the same place and the same softness.',

    'Return only the edited photograph.'
  );

  return lines.join(' ');
}

export async function visualiseFinish(args: VisualiseArgs): Promise<VisualiseResult> {
  // ---- budget gate ---------------------------------------------------------
  const budget = await checkBudget(ESTIMATED_COST_CENTS);
  if (!budget.allowed) {
    // No ai_jobs row: nothing was attempted and nothing was spent. Recording a
    // job here would put a zero-cost failure in the ledger that looks like a
    // provider problem when it is a deliberate refusal.
    //
    // The detail still travels, because "our own ceiling stopped this" and "the
    // provider is down" produce almost the same sentence for the visitor and
    // need completely different actions from the operator.
    return {
      ok: false,
      reason: 'over_budget',
      detail: budget.message,
      attempts: [],
    };
  }

  const dataUrl = `data:${args.photoMediaType};base64,${args.photoBase64}`;
  const result = await renderFinishImage({
    prompt: buildPrompt(args),
    referenceDataUrl: dataUrl,
    ...(args.materialUrls && args.materialUrls.length > 0
      ? { materialUrls: args.materialUrls }
      : {}),
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
    model: result.ok ? result.model : 'chain_exhausted',
    // Tokens are meaningless for a per-image charge. Zeroed rather than
    // fabricated, so nothing downstream averages a token cost that never
    // existed.
    usage: EMPTY_USAGE,
    costCents: result.ok ? result.costCents : 0,
    status: result.ok ? 'succeeded' : 'failed',
    error: result.ok ? null : result.reason,
    durationMs: result.durationMs,
    // Models skipped before one answered. A slug quietly going stale shows up
    // here as a pattern rather than as a feature that silently got slower.
    fellBackFrom: undefined,
    request: {
      modelsSkipped: result.fellBackFrom ?? [],
      // WHAT EACH MODEL ACTUALLY SAID. Without this a chain-exhausted render
      // left one reason code from the last candidate, which is the wrong
      // evidence when the real cause was the first candidate's slug being
      // retired. This is the row you read when somebody reports "the preview
      // does not work".
      attempts: result.attempts ?? [],
      finish: args.finishDescription ?? args.finishLabel,
      colour: args.colourLabel ?? null,
      surface: args.surfaceLabel,
      materialRefs: (args.materialUrls ?? []).length,
    },
  });

  if (!result.ok) {
    // The same list that just went into ai_jobs.request, handed to the caller
    // so an operator can read it without opening the database.
    return {
      ok: false,
      reason: result.reason,
      detail: result.detail ?? null,
      attempts: result.attempts ?? [],
    };
  }

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

