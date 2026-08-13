'use server';

import { requireAdmin } from '@/lib/auth/admin';
import { visualiseFinish } from '@/lib/ai/visualise';
import { finishMediaFor, indexByKey } from '@/lib/finishes/media';
import {
  EPOXY_GROUPS,
  comboKeyFor,
  renderDescription,
  selectionSummary,
  swatchKeyFor,
  visibleGroups,
  type Selections,
} from '@/lib/verticals/epoxy/options';

/**
 * app/actions/comboGen.ts — render one finish combination onto a base photo.
 *
 * ============================================================================
 * WHY THIS IS ONE COMBINATION AND NOT ALL OF THEM
 * ============================================================================
 *
 * The ask was a single button that generates every combination. The catalogue,
 * counted with the three groups currently on screen, produces ONE HUNDRED AND
 * THIRTY-SIX of them:
 *
 *     solid         7 colours x 4 topcoats = 28
 *     flake        10 blends  x 4 topcoats = 40
 *     quartz        4 colours x 4 topcoats = 16
 *     metallic      6 colours x 4 topcoats = 24
 *     polyaspartic  7 colours x 4 topcoats = 28
 *
 * An image generation takes 30 to 90 seconds. 136 of them is two to three
 * HOURS of continuous work. A serverless function is capped at 300 seconds, so
 * a single request that tried to do all of them would be killed after the
 * fourth or fifth and there would be no way to know which had succeeded.
 *
 * So the button still exists and still says "generate all" — it just runs the
 * queue FROM THE BROWSER, one request per combination, with the page showing
 * progress and able to stop and resume. Each render is independently saved the
 * moment it succeeds, so an interrupted run keeps everything it finished.
 *
 * That is not a compromise forced by the platform. It is the right shape for
 * work measured in hours: a run that must complete in one uninterrupted
 * request is a run that cannot be paused, cannot report progress, and loses
 * everything if the tab closes.
 *
 * ============================================================================
 * IT USES THE SAME PIPELINE AS A CUSTOMER'S RENDER
 * ============================================================================
 *
 * `visualiseFinish`, not a private copy. So these previews get the same prompt
 * — including the realism clauses added after the first courtyard render came
 * back with an invented highlight — the same budget ceiling, the same model
 * chain and the same ledger row.
 *
 * If a combination looks wrong here it will look wrong on a customer's floor,
 * which makes this screen a genuine test of the render quality rather than a
 * decorative gallery.
 */

export interface ComboSpec {
  /** The system key: solid, flake, quartz, metallic, polyaspartic. */
  system: string;
  /** The colour group that applies to that system, and the chosen key. */
  colourGroup: string;
  colourKey: string;
  topcoat: string;
}

export interface ComboGenResult {
  ok: boolean;
  comboKey?: string;
  dataUrl?: string;
  summary?: string[];
  costCents?: number;
  error?: string;
}

/**
 * Rebuild the Selections object server-side from three keys.
 *
 * The browser sends keys, never a prompt and never a description. Everything
 * that shapes the image — the render hints, the hexes, the material samples —
 * is looked up here from the catalogue, so a crafted request cannot spend the
 * image budget on arbitrary generations.
 */
function selectionsFor(spec: ComboSpec): Selections | null {
  const system = EPOXY_GROUPS.find((g) => g.key === 'system');
  if (!system?.options.some((o) => o.key === spec.system)) return null;

  const groups = visibleGroups({ system: spec.system });
  const colour = groups.find((g) => g.key === spec.colourGroup);
  if (!colour?.options.some((o) => o.key === spec.colourKey)) return null;

  const topcoat = groups.find((g) => g.key === 'topcoat');
  if (!topcoat?.options.some((o) => o.key === spec.topcoat)) return null;

  return {
    system: spec.system,
    [spec.colourGroup]: spec.colourKey,
    topcoat: spec.topcoat,
  };
}

export async function generateComboAction(args: {
  /** The base photograph, as a data URL, uploaded by the operator. */
  photoBase64: string;
  photoMediaType: string;
  spec: ComboSpec;
}): Promise<ComboGenResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Not signed in as an admin.' };

  const selections = selectionsFor(args.spec);
  if (!selections) {
    return { ok: false, error: 'That is not a combination this catalogue offers.' };
  }

  const comboKey = comboKeyFor(selections);
  const summary = selectionSummary(selections);

  /**
   * THE SWATCHES GO IN AS MATERIAL REFERENCES, exactly as they do for a
   * customer's render. This is why generating the swatches first matters: a
   * combination rendered without them is the model's idea of "midnight blue
   * metallic", while one rendered with them is the actual product this
   * contractor installs.
   */
  const materialUrls: string[] = [];
  try {
    const byKey = indexByKey(await finishMediaFor('epoxy'));
    for (const [group, key] of [
      ['system', args.spec.system],
      [args.spec.colourGroup, args.spec.colourKey],
      ['topcoat', args.spec.topcoat],
    ] as const) {
      const hit = byKey.get('swatch|' + swatchKeyFor(group, key));
      if (hit && hit.src.startsWith('https://')) materialUrls.push(hit.src);
    }
  } catch {
    // A render with no samples is worse than one with them and far better than
    // none at all — the same rule app/actions/visualise.ts applies.
  }

  const colourGroupDef = visibleGroups({ system: args.spec.system }).find(
    (g) => g.key === args.spec.colourGroup
  );
  const colourDef = colourGroupDef?.options.find((o) => o.key === args.spec.colourKey);

  const result = await visualiseFinish({
    photoBase64: args.photoBase64,
    photoMediaType: args.photoMediaType,
    finishLabel: summary.join(', '),
    finishDescription: renderDescription(selections),
    ...(colourDef?.label ? { colourLabel: colourDef.label } : {}),
    ...(colourDef?.hex ? { colourHex: colourDef.hex } : {}),
    ...(materialUrls.length > 0 ? { materialUrls } : {}),
    surfaceLabel: 'garage floor',
    // Namespaced so these never mix with a visitor's session in the ledger.
    sessionId: 'admin-combo-' + comboKey.slice(0, 40),
    prototypeId: null,
  });

  if (!result.ok) {
    return {
      ok: false,
      comboKey,
      summary,
      error: result.reason + (result.detail ? ': ' + result.detail : ''),
    };
  }

  return {
    ok: true,
    comboKey,
    summary,
    dataUrl: `data:${result.mediaType};base64,${result.base64}`,
  };
}
