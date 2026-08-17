'use client';

import { useMemo, useRef, useState } from 'react';
import { generateComboAction, type ComboSpec } from '@/app/actions/comboGen';
// No ExpandButton here: in a dense list the thumbnail IS the control, and an
// overlay affordance on a 72px tile would cover most of the picture it is
// offering to enlarge.
import { ImageViewer, type ViewerItem } from '@/components/tools/ImageViewer';
import { downloadImage } from '@/lib/media/download';
import { createFinishUploadAction, saveFinishMediaAction } from '@/app/actions/finishMedia';
import { extensionFor } from '@/lib/finishes/resize';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { EPOXY_GROUPS, comboKeyFor, visibleGroups } from '@/lib/verticals/epoxy/options';

/**
 * components/admin/ComboStudio.tsx — every combination, on one garage floor.
 *
 * ============================================================================
 * THE QUEUE RUNS IN THE BROWSER. THAT IS THE DESIGN, NOT A LIMITATION.
 * ============================================================================
 *
 * 136 combinations at 30-90 seconds each is two to three hours. A serverless
 * function dies at 300 seconds, so "one request that does everything" would be
 * killed after the fourth or fifth render with no record of which had worked.
 *
 * Running the loop here instead means the work can be watched, paused,
 * resumed, and — most importantly — SAVED AS IT GOES. Every render is written
 * to finish_media the moment it succeeds, so closing the tab costs the one in
 * flight and nothing else.
 *
 * ============================================================================
 * SEQUENTIAL, NEVER PARALLEL
 * ============================================================================
 *
 * Firing 136 requests at once would be faster in principle and wrong in
 * practice: it would trip the provider's rate limit, blow through the daily
 * spend ceiling before anybody could look at the first result, and produce a
 * hundred failures that each cost money. One at a time, with the ability to
 * stop the moment a result looks wrong, is what makes a run this expensive
 * safe to start.
 */

interface Row {
  spec: ComboSpec;
  comboKey: string;
  label: string;
}

type RowState = { status: 'idle' | 'running' | 'done' | 'failed'; note?: string; url?: string };

/**
 * Every combination the picker can currently produce.
 *
 * Built from `visibleGroups`, not from EPOXY_GROUPS directly, so it tracks the
 * catalogue automatically: the parked groups stay parked, and if
 * NEXT_PUBLIC_EPOXY_ALL_GROUPS is ever switched on this list grows to match
 * without anybody editing it.
 */
function enumerateCombos(systems: Set<string>, topcoats: Set<string>): Row[] {
  const system = EPOXY_GROUPS.find((g) => g.key === 'system');
  const out: Row[] = [];
  for (const sys of system?.options ?? []) {
    if (!systems.has(sys.key)) continue;
    const groups = visibleGroups({ system: sys.key });
    const colour = groups.find((g) => g.key !== 'system' && g.key !== 'topcoat');
    const topcoat = groups.find((g) => g.key === 'topcoat');
    if (!colour || !topcoat) continue;
    for (const c of colour.options) {
      for (const t of topcoat.options) {
        if (!topcoats.has(t.key)) continue;
        const selections = { system: sys.key, [colour.key]: c.key, topcoat: t.key };
        out.push({
          spec: { system: sys.key, colourGroup: colour.key, colourKey: c.key, topcoat: t.key },
          comboKey: comboKeyFor(selections),
          label: `${sys.label} · ${c.label} · ${t.label}`,
        });
      }
      /**
       * DEDUPED BY KEY. PHASE 46.
       *
       * Topcoat left APPEARANCE_GROUPS, so `comboKeyFor` no longer varies by
       * sheen — two ticked topcoats now produce two rows with the SAME key.
       * Left alone that is a quiet money burner: both render, both upsert to
       * one row, and the second silently overwrites the first. The operator
       * pays twice and keeps one picture, with nothing on screen saying so.
       *
       * The first wins, and the topcoat filter still decides which sheen is
       * DRAWN — it just no longer decides how many pictures exist.
       */
    }
  }
  const seen = new Set<string>();
  return out.filter((r) => {
    if (seen.has(r.comboKey)) return false;
    seen.add(r.comboKey);
    return true;
  });
}

/** The five systems and the four topcoats, for the filter rows. */
function systemOptions() {
  return EPOXY_GROUPS.find((g) => g.key === 'system')?.options ?? [];
}
function topcoatOptions() {
  return EPOXY_GROUPS.find((g) => g.key === 'topcoat')?.options ?? [];
}

/**
 * What is ALREADY in finish_media, with its address.
 *
 * It used to be `existingKeys: string[]` — keys and nothing else. That is the
 * whole reason this screen appeared to lose work: see the note on `saved`
 * below.
 */
export interface ExistingCombo {
  mediaKey: string;
  src: string;
}

export function ComboStudio({ existing }: { existing: ExistingCombo[] }) {
  /**
   * ==========================================================================
   * YOU CHOOSE THE SUBSET. THE DEFAULT IS ONE TOPCOAT, NOT ALL FOUR.
   * ==========================================================================
   *
   * The full space is 136 renders — two to three hours and a real bill — and
   * offering that as the only option was the wrong default. Most of it is not
   * wanted yet.
   *
   * WHY TOPCOAT IS THE ONE TRIMMED FIRST, and not the colours: topcoat changes
   * SHEEN. In a thumbnail on a picker, the difference between satin and high
   * gloss on the same colour is a slightly different reflection — real, worth
   * showing eventually, and the least visible of the three decisions at that
   * size. Colour is what a person points at on the screen, so every colour in
   * a chosen system is generated.
   *
   * Starting with high gloss alone takes 136 down to 34: every system, every
   * colour, one sheen. That is the set that makes the picker feel finished.
   *
   * Nothing is locked. Tick another topcoat or untick a system and the count
   * updates before anything is spent — which is the point. A run this
   * expensive should be decided deliberately, not defaulted into.
   */
  const [systems, setSystems] = useState<Set<string>>(
    () => new Set(systemOptions().map((o) => o.key))
  );
  const [topcoats, setTopcoats] = useState<Set<string>>(() => {
    const all = topcoatOptions();
    // Gloss if the catalogue has it, otherwise whatever comes first — never an
    // empty set, which would render an empty list and a dead button.
    const gloss = all.find((o) => o.key === 'gloss') ?? all[0];
    return new Set(gloss ? [gloss.key] : []);
  });

  const rows = useMemo(() => enumerateCombos(systems, topcoats), [systems, topcoats]);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const [photo, setPhoto] = useState<{ base64: string; mediaType: string; url: string } | null>(
    null
  );
  const [state, setState] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const stop = useRef(false);
  const [viewing, setViewing] = useState<ViewerItem | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  /**
   * ==========================================================================
   * THE PICTURES WERE NEVER LOST. THIS SCREEN WAS JUST FORGETTING THEM.
   * ==========================================================================
   *
   * The reported symptom was that generated combinations "are gone after I
   * refresh". They were not. `runOne` uploads to the bucket and calls
   * `saveFinishMediaAction` on every success, and the upsert in
   * lib/finishes/media.ts is correct — the rows were in finish_media the whole
   * time.
   *
   * What vanished was this list's memory of them. The thumbnail came from
   * `state[key].url`, which is the data URL the model returned, held in React
   * state and therefore gone the instant the page reloads. The page handed
   * down only the KEYS of what existed, so after a refresh every row could say
   * "Has a picture" beside an empty dashed box. A screen that says a thing
   * exists while showing nothing is indistinguishable from one where the work
   * failed, and the reasonable conclusion was that it had.
   *
   * So the page now passes the `src` as well, and a row falls back to the
   * STORED picture whenever there is no fresh one in memory. The list shows
   * what is actually in the database, which is the only thing it was ever
   * supposed to be reporting.
   */
  const savedSrc = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of existing) m.set(e.mediaKey, e.src);
    return m;
  }, [existing]);

  const have = useMemo(() => new Set(existing.map((e) => e.mediaKey)), [existing]);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const base64 = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] ?? '');
      r.onerror = () => rej(new Error('read failed'));
      r.readAsDataURL(file);
    });
    setPhoto({ base64, mediaType: file.type, url });
  };

  /** Render one, then upload and attach it. Returns a status line. */
  const runOne = async (row: Row): Promise<RowState> => {
    if (!photo) return { status: 'failed', note: 'Pick a base photo first.' };

    const gen = await generateComboAction({
      photoBase64: photo.base64,
      photoMediaType: photo.mediaType,
      spec: row.spec,
    });
    if (!gen.ok || !gen.dataUrl) {
      return { status: 'failed', note: gen.error ?? 'Render failed.' };
    }

    /**
     * ======================================================================
     * COMBINATION RENDERS ARE UPLOADED AT FULL SIZE. PHASE 61.
     * ======================================================================
     *
     * Phase 60 put a 1200x800 downscale here and it was a mistake, for a
     * reason worth writing down so it is not repeated: the two kinds of finish
     * media have opposite economics and were treated as one problem.
     *
     *   A SWATCH is a small rectangle and the picker loads twenty-five of them
     *   at once. Bytes are the entire cost. It is still resized, in
     *   SwatchStudio, and that is where the weight complaint actually came
     *   from.
     *
     *   A COMBINATION is the hero. Exactly ONE is on screen at a time, it is
     *   the largest thing in the picker, and it is the picture a homeowner
     *   leans in to look at. Resolution is the product here. Trading it for
     *   bandwidth on a single image is optimising the wrong picture.
     *
     * PHASE 60 ALSO ASSERTED, IN A COMMENT, THAT THE HERO IS CAPPED AT 32vh.
     * That number was invented. The stylesheet governing `.fp-stage` had never
     * been read when it was written. It is removed rather than corrected,
     * because the honest statement is that this file does not know how large
     * the picture will be displayed and has no business deciding on its
     * behalf.
     *
     * `extensionFor` is kept: the stored filename should still match the
     * content type the model actually returned.
     */
    const blob = await (await fetch(gen.dataUrl)).blob();
    const contentType = blob.type || 'image/webp';
    const signed = await createFinishUploadAction({ contentType });
    if (!signed.ok) return { status: 'failed', note: signed.message };

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.storage
      .from('tool-media')
      .uploadToSignedUrl(
        signed.path,
        signed.token,
        new File([blob], row.comboKey + '.' + extensionFor(contentType), {
          type: contentType,
        })
      );
    if (error) return { status: 'failed', note: 'Upload refused: ' + error.message };

    const saved = await saveFinishMediaAction({
      vertical: 'epoxy',
      kind: 'combination',
      mediaKey: row.comboKey,
      src: signed.publicUrl,
      alt: row.label,
      caption: (gen.summary ?? []).join(' · '),
      sortOrder: 0,
    });
    if (!saved.ok) return { status: 'failed', note: saved.message };

    return { status: 'done', note: 'Live in the picker.', url: gen.dataUrl };
  };

  const runAll = async () => {
    if (!photo || running) return;
    stop.current = false;
    setRunning(true);
    try {
      for (const row of rows) {
        if (stop.current) break;
        if (skipExisting && have.has(row.comboKey)) {
          setState((p) => ({ ...p, [row.comboKey]: { status: 'done', note: 'Already had one.' } }));
          continue;
        }
        setState((p) => ({ ...p, [row.comboKey]: { status: 'running' } }));
        try {
          const r = await runOne(row);
          setState((p) => ({ ...p, [row.comboKey]: r }));
        } catch (e) {
          setState((p) => ({
            ...p,
            [row.comboKey]: {
              status: 'failed',
              note: e instanceof Error ? e.message : String(e),
            },
          }));
        }
      }
    } finally {
      setRunning(false);
    }
  };

  const saveOne = async (src: string, comboKey: string) => {
    setSaveNote(null);
    try {
      const outcome = await downloadImage(src, comboKey);
      setSaveNote(
        outcome === 'downloaded'
          ? 'Saved to your downloads.'
          : 'Opened in a new tab — long-press there to save it.'
      );
    } catch {
      setSaveNote('It could not be saved. Long-press the picture instead.');
    }
  };

  const done = rows.filter((r) => state[r.comboKey]?.status === 'done').length;
  const failed = rows.filter((r) => state[r.comboKey]?.status === 'failed').length;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
        <label className="n15-btn n15-btn-ghost" style={{ cursor: 'pointer' }}>
          {photo ? 'Change the base photo' : 'Choose a base photo'}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void pickPhoto(e.target.files?.[0])}
          />
        </label>

        <button
          type="button"
          className="n15-btn n15-btn-primary"
          disabled={!photo || running}
          onClick={() => void runAll()}
        >
          {running ? 'Generating…' : `Generate ${rows.length}`}
        </button>

        {running && (
          <button
            type="button"
            className="n15-btn n15-btn-ghost"
            onClick={() => {
              stop.current = true;
            }}
          >
            Stop after this one
          </button>
        )}

        <label style={{ fontSize: '0.8rem', opacity: 0.75 }}>
          <input
            type="checkbox"
            checked={skipExisting}
            onChange={(e) => setSkipExisting(e.target.checked)}
          />{' '}
          Skip combinations that already have a picture
        </label>
      </div>

      {/* ----------------------------------------------------------------
          WHAT TO GENERATE. Shown above the run button on purpose: the count
          has to be visible before the money is spent, not after.
         ---------------------------------------------------------------- */}
      <fieldset
        style={{ marginTop: '1.25rem', border: 0, padding: 0 }}
        disabled={running}
      >
        <legend style={{ fontSize: '0.72rem', letterSpacing: '0.08em', opacity: 0.6 }}>
          COATINGS
        </legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
          {systemOptions().map((o) => (
            <label key={o.key} style={{ fontSize: '0.82rem' }}>
              <input
                type="checkbox"
                checked={systems.has(o.key)}
                onChange={() => setSystems((s0) => toggle(s0, o.key))}
              />{' '}
              {o.label}
            </label>
          ))}
        </div>

        <legend
          style={{
            fontSize: '0.72rem',
            letterSpacing: '0.08em',
            opacity: 0.6,
            marginTop: '0.9rem',
          }}
        >
          FINISHES
        </legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
          {topcoatOptions().map((o) => (
            <label key={o.key} style={{ fontSize: '0.82rem' }}>
              <input
                type="checkbox"
                checked={topcoats.has(o.key)}
                onChange={() => setTopcoats((s0) => toggle(s0, o.key))}
              />{' '}
              {o.label}
            </label>
          ))}
        </div>
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.6, maxWidth: '58ch' }}>
          Every colour in a ticked coating is generated. Sheen is the least
          visible of the three at thumbnail size, so one finish is usually
          enough to make the picker feel complete.
        </p>
      </fieldset>

      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.url}
          alt="Base photograph"
          style={{ marginTop: '1rem', maxHeight: '14rem', borderRadius: '0.6rem' }}
        />
      )}

      <p style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.75 }}>
        {done} done · {failed} failed · {rows.length} total. Each one takes up to a
        minute and costs money, so this runs one at a time and can be stopped.
      </p>

      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.35rem' }}>
        {rows.map((r) => {
          const st = state[r.comboKey];
          /**
           * Fresh render first, stored picture second.
           *
           * The order matters during a run: the moment a combination is
           * regenerated, the operator has to see THE NEW ONE, not the old one
           * still sitting in the database from a previous session. Outside a
           * run `st` is undefined and the stored picture is all there is,
           * which is the case that used to show an empty box.
           */
          const thumb = st?.url ?? savedSrc.get(r.comboKey) ?? null;
          return (
            <div
              key={r.comboKey}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.4rem 0',
                borderBottom: '1px solid var(--n15-card-edge)',
                opacity: st?.status === 'running' ? 1 : 0.9,
              }}
            >
              {thumb ? (
                <button
                  type="button"
                  className="cs-thumb"
                  onClick={() =>
                    setViewing({
                      src: thumb,
                      alt: r.label,
                      caption: r.comboKey,
                      downloadName: r.comboKey,
                    })
                  }
                  aria-label={'See ' + r.label + ' full size'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb} alt="" />
                </button>
              ) : (
                <span
                  style={{
                    width: 72,
                    height: 52,
                    flex: '0 0 auto',
                    borderRadius: 4,
                    border: '1px dashed var(--n15-card-edge)',
                  }}
                />
              )}
              <span style={{ flex: 1, fontSize: '0.85rem', minWidth: 0 }}>{r.label}</span>

              {thumb ? (
                <button
                  type="button"
                  className="n15-btn n15-btn-ghost cs-save"
                  onClick={() => void saveOne(thumb, r.comboKey)}
                >
                  Download
                </button>
              ) : null}

              <span
                style={{
                  fontSize: '0.72rem',
                  opacity: 0.7,
                  textAlign: 'right',
                  flex: '0 0 7rem',
                }}
              >
                {st?.status === 'running'
                  ? 'Rendering…'
                  : (st?.note ?? (have.has(r.comboKey) ? 'Has a picture' : ''))}
              </span>
            </div>
          );
        })}
      </div>

      {saveNote ? (
        <p style={{ marginTop: '0.8rem', fontSize: '0.82rem' }} role="status">
          {saveNote}
        </p>
      ) : null}

      <ImageViewer item={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}


