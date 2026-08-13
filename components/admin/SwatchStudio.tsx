'use client';

import { useState } from 'react';
import { generateSwatchAction, type SwatchGenResult } from '@/app/actions/swatchGen';
import { EPOXY_GROUPS } from '@/lib/verticals/epoxy/options';

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
                      /* `download` on a data: URL saves without a round trip.
                         The filename matches swatchKeyFor's convention so the
                         upload screen's expectations are obvious. */
                      <a
                        href={r.dataUrl}
                        download={`swatch-${g.key}-${o.key}.png`}
                        className="rounded border px-3 py-1.5 text-center font-data text-xs uppercase tracking-wide"
                      >
                        Save
                      </a>
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
