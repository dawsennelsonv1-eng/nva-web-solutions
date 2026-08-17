'use client';

import { useState } from 'react';
import { generateSwatchAction, type SwatchGenResult } from '@/app/actions/swatchGen';
import { createFinishUploadAction, saveFinishMediaAction } from '@/app/actions/finishMedia';
import { SWATCH_GUIDANCE } from '@/lib/finishes/media-types';
import { extensionFor, shrinkForUpload } from '@/lib/finishes/resize';
/**
 * '@/lib/supabase/client' — NOT '@/lib/supabase/browser'.
 *
 * Phase 17 wrote the second path from memory while copying the upload
 * sequence out of components/site/CombinationUploader.tsx, and the build died
 * on 'Module not found'. The correct path is on line 124 of that file. When
 * borrowing a sequence, borrow its imports verbatim.
 */
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { EPOXY_GROUPS, swatchKeyFor } from '@/lib/verticals/epoxy/options';

/**
 * components/admin/SwatchStudio.tsx — generate the 53 finish swatches.
 *
 * ONE AT A TIME, BY HAND, AND THAT IS THE DESIGN.
 *
 * A "generate all" button would be one click and about fifty image
 * generations, most of which would be thrown away — image models miss, and the
 * miss rate on material samples is high enough that reviewing each one is the
 * actual work. Batching would spend the budget faster than the operator could
 * judge the output, which is how an admin tool becomes an expensive random
 * number generator.
 *
 * Each row: the flat colour the picker currently paints, the generated
 * photograph beside it for comparison, and a download link. The comparison is
 * the point — a swatch that has drifted from its hex is obvious side by side
 * and invisible on its own.
 */
export function SwatchStudio() {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SwatchGenResult>>({});
  /** Per-row status line for the save half of the job. */
  const [saved, setSaved] = useState<Record<string, string>>({});

  /**
   * ==========================================================================
   * SAVE NOW MEANS SAVE. IT USED TO MEAN DOWNLOAD.
   * ==========================================================================
   *
   * Phase 13 shipped a download link, because lib/finishes/media.ts and
   * lib/storage/toolMedia.ts had not been read and inventing a storage path
   * would have produced code that compiled and failed on deploy. The operator
   * downloaded 53 pictures and re-uploaded them one at a time on another
   * screen.
   *
   * This is the same three-step sequence CombinationUploader already performs,
   * followed exactly rather than reinvented:
   *
   *   1. createFinishUploadAction mints a one-shot signed upload.
   *   2. The BROWSER puts the file into the 'tool-media' bucket. Not the
   *      server: a server action body is capped and base64 inflates by a
   *      third, which is precisely why that action hands back a URL instead of
   *      accepting the file.
   *   3. saveFinishMediaAction writes the row, upserting on
   *      (vertical, kind, media_key) — so regenerating a swatch REPLACES it
   *      rather than leaving two pictures competing on sort order.
   *
   * The data URL has to become a real File first. `fetch` on a data: URL is
   * the shortest correct way to get a Blob out of one — it is a same-document
   * read with no network involved, and it handles the base64 decode without a
   * hand-rolled atob loop that would have to get the binary string right.
   */
  const save = async (groupKey: string, optionKey: string, label: string) => {
    const id = groupKey + '|' + optionKey;
    const dataUrl = results[id]?.dataUrl;
    if (!dataUrl) return;

    setBusy(id);
    setSaved((p) => ({ ...p, [id]: 'Saving…' }));
    try {
      /**
       * DOWN TO SWATCH SIZE BEFORE IT IS STORED. PHASE 60.
       *
       * This is where the picker's weight was. A swatch is rendered as a
       * rectangle about a third of a phone screen wide — SWATCH_GUIDANCE has
       * said 400x300 all along — and the picker loads twenty-five of them.
       * Uploading the model's full-size output meant every visitor downloading
       * roughly five times the bytes of the picture they were shown, on a
       * storage tier with no resize on read.
       *
       * `shrinkForUpload` returns the ORIGINAL bytes untouched if the render
       * was already this small or if the re-encode came out heavier, so this
       * cannot make a swatch worse than it was.
       */
      const shrunk = await shrinkForUpload(dataUrl, {
        width: SWATCH_GUIDANCE.idealWidth,
        height: SWATCH_GUIDANCE.idealHeight,
      });
      const contentType = shrunk.contentType;
      const file = new File(
        [shrunk.blob],
        `swatch-${groupKey}-${optionKey}.${extensionFor(contentType)}`,
        { type: contentType }
      );

      const signed = await createFinishUploadAction({ contentType });
      if (!signed.ok) {
        setSaved((p) => ({ ...p, [id]: signed.message }));
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.storage
        .from('tool-media')
        .uploadToSignedUrl(signed.path, signed.token, file);
      if (error) {
        setSaved((p) => ({ ...p, [id]: 'Upload refused: ' + error.message }));
        return;
      }

      const res = await saveFinishMediaAction({
        vertical: 'epoxy',
        kind: 'swatch',
        // The picker looks the swatch up by exactly this key. Imported rather
        // than rebuilt inline so the two can never drift apart.
        mediaKey: swatchKeyFor(groupKey, optionKey),
        src: signed.publicUrl,
        alt: label,
        caption: '',
        sortOrder: 0,
      });
      setSaved((p) => ({ ...p, [id]: res.ok ? 'Live in the picker.' : res.message }));
    } catch (e) {
      setSaved((p) => ({
        ...p,
        [id]: 'Could not save: ' + (e instanceof Error ? e.message : String(e)),
      }));
    } finally {
      setBusy(null);
    }
  };

  const run = async (groupKey: string, optionKey: string) => {
    const id = groupKey + '|' + optionKey;
    setBusy(id);
    try {
      const r = await generateSwatchAction(groupKey, optionKey);
      setResults((prev) => ({ ...prev, [id]: r }));
    } catch (e) {
      /**
       * A throw here is the platform, not the action — generateSwatchAction
       * returns a result object for every internal failure. Almost always the
       * execution ceiling: image generation takes 30 to 90 seconds and this
       * page needs its own `maxDuration`, which is set on the route.
       */
      setResults((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          error:
            'The request did not complete. If this took about a minute, the route timed out — check maxDuration on app/admin/swatches/page.tsx. ' +
            (e instanceof Error ? e.message : String(e)),
        },
      }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-10">
      {EPOXY_GROUPS.map((g) => (
        <section key={g.key}>
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">
            {g.label} <span className="font-data text-xs text-rule">/{g.key}</span>
          </h2>

          <div className="mt-3 space-y-3">
            {g.options.map((o) => {
              const id = g.key + '|' + o.key;
              const r = results[id];
              const running = busy === id;
              return (
                <div key={o.key} className="flex flex-wrap items-start gap-3 border-b py-3">
                  {/* What the picker paints today. */}
                  {/* Options with no colour of their own — the topcoats, prep,
                      extras — show an outline here rather than a swatch,
                      because there is no colour to show. They generate on a
                      neutral substrate; the picture that comes back appears in
                      the box to the right like any other. */}
                  <span
                    aria-hidden
                    style={o.hex ? { background: o.hex } : undefined}
                    className={
                      'h-20 w-20 shrink-0 rounded' + (o.hex ? '' : ' border border-dashed')
                    }
                  />

                  {/* What the model produced, at the same size for comparison. */}
                  {r?.ok && r.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.dataUrl}
                      alt={o.label + ' generated swatch'}
                      className="h-20 w-20 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="h-20 w-20 shrink-0 rounded border border-dashed" />
                  )}

                  <div className="min-w-[12rem] flex-1">
                    <p className="font-semibold">{o.label}</p>
                    <p className="font-data text-xs text-rule">
                      {o.hex ?? 'no colour'} · {o.renderHint}
                    </p>

                    {r && !r.ok && (
                      <p className="mt-1 text-xs" role="alert">
                        {r.error}
                        {r.attempts && r.attempts.length > 0 && (
                          <span className="block whitespace-pre-wrap opacity-70">
                            {r.attempts.join('\n')}
                          </span>
                        )}
                      </p>
                    )}
                    {saved[id] && (
                      <p className="mt-1 font-data text-xs" role="status">
                        {saved[id]}
                      </p>
                    )}
                    {r?.ok && (
                      <p className="mt-1 font-data text-xs text-rule">
                        {r.model}
                        {typeof r.costCents === 'number'
                          ? ` · ${(r.costCents / 100).toFixed(3)} USD`
                          : ''}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => run(g.key, o.key)}
                      /* WAS `|| !o.hex`, which locked out all four topcoats
                         and every prep and extra. See swatchGen.ts: a
                         colourless option now generates on a neutral concrete
                         substrate. Only the one-at-a-time rule remains. */
                      disabled={busy !== null}
                      className="rounded border px-3 py-1.5 font-data text-xs uppercase tracking-wide disabled:opacity-40"
                    >
                      {running ? 'Generating…' : r?.ok ? 'Again' : 'Generate'}
                    </button>
                    {r?.ok && r.dataUrl && (
                      <>
                        <button
                          type="button"
                          onClick={() => void save(g.key, o.key, o.label)}
                          disabled={busy !== null}
                          className="rounded border px-3 py-1.5 font-data text-xs uppercase tracking-wide disabled:opacity-40"
                        >
                          Use it
                        </button>
                        {/* The download stays. A generated picture worth
                            keeping outside the product — for a thumbnail, an
                            advert, a supplier conversation — should not have
                            to be screenshotted out of an admin page. */}
                        <a
                          href={r.dataUrl}
                          download={`swatch-${g.key}-${o.key}.png`}
                          className="rounded border px-3 py-1.5 text-center font-data text-xs uppercase tracking-wide"
                        >
                          Download
                        </a>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

