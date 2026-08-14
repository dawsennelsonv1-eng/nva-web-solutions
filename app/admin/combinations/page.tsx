import { ComboStudio } from '@/components/admin/ComboStudio';
import { finishMediaFor } from '@/lib/finishes/media';

/**
 * /admin/combinations — render every finish combination onto one garage floor.
 *
 * The picker shows a photograph when the visitor's exact mix already has one,
 * and an honest "no reference photo of this exact combination yet" panel when
 * it does not. That panel is correct and it is not persuasive. This screen is
 * how it stops being the common case.
 */

export const dynamic = 'force-dynamic';

/**
 * 300 is the ceiling for ONE render, not for the run. The queue lives in the
 * browser and issues a separate request per combination — see ComboStudio for
 * why 136 renders cannot be a single request.
 */
export const maxDuration = 300;

export default async function CombinationsPage() {
  /**
   * Which combinations already have a picture, resolved on the server so the
   * page arrives knowing what to skip. Without it a re-run would regenerate —
   * and pay for — everything that already exists.
   *
   * PHASE 35: THE ADDRESS COMES DOWN TOO, not just the key. This used to be a
   * list of keys, which meant the studio knew a picture existed but had no way
   * to show it — so after a refresh every completed row rendered an empty box
   * next to the words "Has a picture", and the run looked as though it had
   * been thrown away. It had not; the rows were in finish_media all along. See
   * the note on `savedSrc` in ComboStudio.
   */
  const existing = (await finishMediaFor('epoxy'))
    .filter((s) => s.kind === 'combination')
    .map((s) => ({ mediaKey: s.mediaKey, src: s.src }));

  return (
    <div>
      <h1 className="n15-h3">Combination previews</h1>
      <p style={{ marginTop: '0.6rem', maxWidth: '62ch' }}>
        Pick one photograph of a garage floor, then generate every combination
        the catalogue offers onto it. Each result is attached to its combination
        automatically, so a visitor who builds that exact mix sees it straight
        away instead of the &ldquo;no reference photo yet&rdquo; panel.
      </p>
      <p style={{ marginTop: '0.6rem', maxWidth: '62ch', fontSize: '0.85rem', opacity: 0.7 }}>
        Generate the swatches first. A combination rendered without them is the
        model&apos;s idea of the finish; one rendered with them is the product this
        contractor actually installs.
      </p>

      <div style={{ marginTop: '1.5rem' }}>
        <ComboStudio existing={existing} />
      </div>
    </div>
  );
}

