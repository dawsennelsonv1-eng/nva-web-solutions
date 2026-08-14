'use client';

import { useRef, useState } from 'react';
import { saveToolMediaAction, createToolMediaUploadAction } from '@/app/actions/toolMedia';
import { generateToolMediaAction } from '@/app/actions/toolMediaGen';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { MEDIA_PRESETS, firstPresetSubject } from '@/lib/tools/media-presets';
// From media-types, NOT media: client component, value imports.
import {
  MAX_SLOTS,
  MIN_SLOTS,
  DEFAULT_DURATION_MS,
  type MediaSlot,
} from '@/lib/tools/media-types';

/**
 * components/admin/ToolMediaEditor.tsx — the slots for one tool.
 *
 * ============================================================================
 * WHY EVERYTHING SAVES AT ONCE
 * ============================================================================
 *
 * Rows are edited locally and written in a single save that replaces every slot
 * for the tool. There is no per-row save and no autosave.
 *
 * Per-row saving would need the client to track which rows moved, which were
 * deleted and which are new, and every mistake in that bookkeeping shows up as
 * a duplicated or vanished frame on a public page. Replacing the whole list
 * makes the saved state exactly what the operator can see on screen.
 *
 * It also means an abandoned edit changes nothing, which matters on a phone
 * where a call or a notification takes the tab away mid-row.
 *
 * ============================================================================
 * THE COUNT WARNING IS SHOWN, NOT ENFORCED
 * ============================================================================
 *
 * Below three slots the public gallery renders nothing. The editor says so
 * plainly and still lets the save go through, because half-finished is a normal
 * state while somebody is adding recordings one at a time. Blocking the save
 * would mean losing two rows of typing to protect a rule the operator already
 * knows.
 *
 * ============================================================================
 * THE UPLOAD BUTTON — WHY IT EXISTS NOW
 * ============================================================================
 *
 * `src` was a text input and only a text input. It asked for a path like
 * /tools/epoxy/01.gif, which is a file already committed under /public, which
 * is a laptop and a deploy. From a phone there was no way to fill it in at
 * all, and nothing on the screen said so — an empty box that accepts typing
 * reads as a box you are meant to type in, not as a dead end.
 *
 * Choose a file and it goes straight to the tool-media bucket through a
 * one-shot signed URL, then its public address is written into `src` for you.
 *
 * THE TEXT INPUT STAYS. An https:// address that already exists — a CDN, an
 * asset from somewhere else — is still a legitimate answer, and removing the
 * field would break the rows already saved that way. Upload is the easy path,
 * not the only one.
 *
 * THE UPLOAD DOES NOT SAVE THE ROW. It fills the address in and leaves the
 * draft dirty, exactly like typing would, so the operator still presses Save.
 * Uploading and saving in one gesture would mean a half-finished row — a file
 * with no caption and no description — reaching the public gallery.
 *
 * ============================================================================
 * GENERATING A PICTURE, IN THE ROW THAT NEEDS IT — PHASE 38
 * ============================================================================
 *
 * app/actions/toolMediaGen.ts was written before this file had been read, and
 * its header said so plainly: it stops one step short of the slot list because
 * `saveToolMediaAction` replaces a tool's ENTIRE slot set, and a generator
 * that wrote through it without understanding this screen would silently
 * delete the recordings already on a live tool page. So it generated, uploaded
 * and handed back a URL for somebody to carry to the other screen by hand.
 *
 * THAT COPY-AND-PASTE IS GONE, and the danger it was avoiding never arrives,
 * because generating here does exactly what the file upload above already
 * does: it fills `src` on ONE row of the local draft and leaves the draft
 * dirty. It does not call `saveToolMediaAction`. The whole-set write still
 * happens once, from Save, from the list the operator can see.
 *
 * WHY IT DOES NOT SAVE ON ITS OWN, same reason the upload does not: a slot
 * with a picture and no caption and no description is a half-finished row, and
 * on a public gallery that reads as a bug rather than as work in progress.
 *
 * ONE AT A TIME, like the upload. Two renders at once cost twice as much,
 * meter twice against the daily ceiling, and give an operator two things to
 * judge when he was only ready to judge one.
 *
 * THE DESCRIPTION FIELD IS THE PROMPT. When a row already has one, it is what
 * the generator opens with, because "what is happening in it" is exactly the
 * sentence an image model needs and asking for it twice in two boxes is how
 * they end up disagreeing about what the picture shows.
 *
 * Styled with the LEGACY token system, like the rest of admin. Admin is not
 * part of the marketing redesign and should not start looking like it while the
 * screens either side of it do not.
 */

interface Draft {
  kind: 'animation' | 'still';
  src: string;
  alt: string;
  caption: string;
  durationMs: number;
}

function toDraft(s: MediaSlot): Draft {
  return {
    kind: s.kind,
    src: s.src,
    alt: s.alt,
    caption: s.caption,
    durationMs: s.durationMs,
  };
}

const EMPTY: Draft = {
  kind: 'animation',
  src: '',
  alt: '',
  caption: '',
  durationMs: DEFAULT_DURATION_MS,
};

export function ToolMediaEditor({ toolId, initial }: { toolId: string; initial: MediaSlot[] }) {
  const [rows, setRows] = useState<Draft[]>(initial.map(toDraft));
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /** Index of the row currently uploading, or null. One at a time, on purpose. */
  const [uploading, setUploading] = useState<number | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  /**
   * The open generator, or null. ONE OBJECT, NOT A MAP KEYED BY ROW.
   *
   * Only one row can be generating at a time — the same rule the upload
   * follows — so a map would be a second place for "which row is busy" to be
   * recorded, and the two would eventually disagree. `index` is the single
   * answer to that question.
   */
  const [gen, setGen] = useState<{
    index: number;
    subject: string;
    busy: boolean;
    dataUrl: string | null;
    error: string | null;
    attempts: string[];
  } | null>(null);

  const patch = (i: number, next: Partial<Draft>) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, ...next } : row)));

  /**
   * Reads the chosen file straight to Storage.
   *
   * `kind` is set from the file's own type rather than left to the operator:
   * a GIF or an MP4 is an animation and a PNG or a JPG is a still, and getting
   * that wrong changes the order frames appear in on the public page. WebP is
   * the ambiguous one — it can be either — so it is the only type that leaves
   * the existing choice alone.
   */
  const upload = (i: number, file: File | undefined) => {
    if (!file) return;
    setUploading(i);
    setNote(null);
    void (async () => {
      try {
        /**
         * `kind` is set from the file's own type rather than left to the
         * operator: a GIF or an MP4 is an animation and a PNG or a JPG is a
         * still, and getting that wrong changes the order frames appear in on
         * the public page. WebP is the ambiguous one — it can be either — so it
         * is the only type that leaves the existing choice alone.
         */
        const extra: Partial<Draft> = {};
        if (file.type === 'image/gif' || file.type === 'video/mp4') extra.kind = 'animation';
        if (file.type === 'image/png' || file.type === 'image/jpeg') extra.kind = 'still';

        const failure = await putAndPatch(i, file, file.type, extra);
        if (failure) {
          setNote(
            'The upload was refused: ' + failure + '. If it mentions size, the ceiling is 8 MB.'
          );
          return;
        }
        setNote('Uploaded. Add a caption and a description, then press Save.');
      } catch {
        setNote('That upload did not finish. Check the connection and try again.');
      } finally {
        setUploading(null);
      }
    })();
  };

  /**
   * Push a file that is already in memory to the bucket and write its address
   * into the row.
   *
   * Shared by the upload above and the generator below, because they are the
   * same three steps — mint a signed URL, PUT to Storage, patch `src` — and
   * the one that matters is the third. A second copy of this would be a second
   * place for the "did we actually write it into the draft" bug to live.
   *
   * Returns a message on failure and null on success, so each caller can put
   * its own words around it: an upload that fails is usually a size problem, a
   * generation that fails is usually not.
   */
  const putAndPatch = async (
    i: number,
    body: Blob,
    contentType: string,
    extra: Partial<Draft>
  ): Promise<string | null> => {
    const signed = await createToolMediaUploadAction({ toolId, contentType });
    if (!signed.ok) return signed.message;

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.storage
      .from('tool-media')
      .uploadToSignedUrl(
        signed.path,
        signed.token,
        new File([body], 'slot', { type: contentType })
      );
    if (error) return error.message;

    patch(i, { src: signed.publicUrl, ...extra });
    return null;
  };

  const openGenerator = (i: number) => {
    const row = rows[i];
    /**
     * The row's own description, when it has one, otherwise the first beat.
     * `alt` is already written for a person who cannot see the picture, which
     * is the same job as a prompt: describe the action, not the file.
     */
    const seed = row && row.alt.trim().length >= 8 ? row.alt.trim() : firstPresetSubject();
    setGen({ index: i, subject: seed, busy: false, dataUrl: null, error: null, attempts: [] });
  };

  const generate = () => {
    if (!gen || gen.busy) return;
    const { index, subject } = gen;
    setGen((g) => (g ? { ...g, busy: true, dataUrl: null, error: null, attempts: [] } : g));
    setNote(null);
    void (async () => {
      try {
        const res = await generateToolMediaAction({ toolId, subject });
        setGen((g) =>
          g && g.index === index
            ? {
                ...g,
                busy: false,
                dataUrl: res.ok ? (res.dataUrl ?? null) : null,
                error: res.ok ? null : (res.error ?? 'It did not come back with a picture.'),
                attempts: res.attempts ?? [],
              }
            : g
        );
      } catch (e) {
        setGen((g) =>
          g && g.index === index
            ? {
                ...g,
                busy: false,
                error:
                  'The request did not complete. If it ran for about a minute the route timed out — check maxDuration on this page. ' +
                  (e instanceof Error ? e.message : String(e)),
              }
            : g
        );
      }
    })();
  };

  /**
   * Keep the generated picture: upload it and fill the row in.
   *
   * `kind` is forced to 'still'. Everything this generator can produce is a
   * single frame, and a still filed as an animation gets whatever hold time
   * the row was carrying — which on the public gallery is a photograph sitting
   * on screen for six seconds because somebody once typed that in for a
   * recording.
   */
  const keepGenerated = () => {
    if (!gen || !gen.dataUrl || gen.busy) return;
    const { index, dataUrl } = gen;
    setGen((g) => (g ? { ...g, busy: true } : g));
    setNote(null);
    void (async () => {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const contentType = blob.type || 'image/webp';
        const failure = await putAndPatch(index, blob, contentType, { kind: 'still' });
        if (failure) {
          setGen((g) => (g ? { ...g, busy: false, error: 'It could not be stored: ' + failure } : g));
          return;
        }
        setGen(null);
        setNote(
          'Picture stored and slot ' +
            (index + 1) +
            ' filled in. Add a caption, then press Save — nothing is live until you do.'
        );
      } catch {
        setGen((g) => (g ? { ...g, busy: false, error: 'It could not be stored. Try again.' } : g));
      }
    })();
  };

  const move = (i: number, delta: number) =>
    setRows((r) => {
      const j = i + delta;
      const a = r[i];
      const b = r[j];
      if (!a || !b) return r;
      const copy = [...r];
      copy[i] = b;
      copy[j] = a;
      return copy;
    });

  const save = () => {
    setPending(true);
    setNote(null);
    void (async () => {
      const res = await saveToolMediaAction({ toolId, slots: rows });
      setNote(
        res.ok
          ? `Saved ${res.count} slot${res.count === 1 ? '' : 's'}. Live on the next page load.`
          : res.message
      );
      setPending(false);
    })();
  };

  return (
    <section className="border border-rule bg-sheet p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold uppercase">{toolId}</h2>
        <span className="text-sm">
          {rows.length}/{MAX_SLOTS}
        </span>
      </div>

      {rows.length < MIN_SLOTS && (
        <p className="mt-2 border border-rule bg-concrete p-2 text-sm">
          {MIN_SLOTS - rows.length} more needed before the gallery appears on the
          public page. Below {MIN_SLOTS} it renders nothing at all.
        </p>
      )}

      <div className="mt-4 space-y-4">
        {rows.map((row, i) => (
          <div key={i} className="border border-rule p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-data text-xs uppercase">Slot {i + 1}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="press border border-rule px-3 py-2 text-sm"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move slot ${i + 1} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="press border border-rule px-3 py-2 text-sm"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  aria-label={`Move slot ${i + 1} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="press border border-rule px-3 py-2 text-sm"
                  onClick={() => setRows((r) => r.filter((_, n) => n !== i))}
                  aria-label={`Remove slot ${i + 1}`}
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Kind
                <select
                  className="mt-1 min-h-[44px] w-full border border-rule bg-sheet px-2 text-base"
                  value={row.kind}
                  onChange={(e) =>
                    patch(i, { kind: e.target.value === 'still' ? 'still' : 'animation' })
                  }
                >
                  <option value="animation">Animation (GIF / animated WebP)</option>
                  <option value="still">Still picture</option>
                </select>
              </label>

              <label className="block text-sm">
                How long it holds (seconds)
                {/* Seconds in the UI, milliseconds in the database. Nobody
                    thinks about a recording in milliseconds. */}
                <input
                  type="number"
                  min={0.8}
                  max={30}
                  step={0.5}
                  className="mt-1 min-h-[44px] w-full border border-rule bg-sheet px-2 text-base"
                  value={row.durationMs / 1000}
                  onChange={(e) =>
                    patch(i, { durationMs: Math.round(Number(e.target.value) * 1000) })
                  }
                />
              </label>

              <div className="block text-sm sm:col-span-2">
                <span className="block">The picture or recording itself</span>

                {/* The easy path first. A file from the phone, straight up. */}
                <input
                  ref={(el) => {
                    fileRefs.current[i] = el;
                  }}
                  type="file"
                  accept="image/gif,image/webp,image/png,image/jpeg,video/mp4"
                  className="hidden"
                  onChange={(e) => {
                    upload(i, e.target.files?.[0]);
                    // Cleared so choosing the SAME file twice still fires
                    // onChange — otherwise a retry after a failed upload does
                    // nothing at all and looks like a broken button.
                    e.target.value = '';
                  }}
                />
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="press border border-ink bg-sheet px-4 py-3 text-base"
                    disabled={uploading !== null || gen?.busy === true}
                    onClick={() => fileRefs.current[i]?.click()}
                  >
                    {uploading === i ? 'Uploading…' : 'Choose a file'}
                  </button>

                  {/* The second way to fill this slot. Deliberately beside the
                      file picker rather than on a separate screen: they answer
                      the same question and the operator should not have to know
                      which screen owns which answer. */}
                  <button
                    type="button"
                    className="press border border-rule bg-sheet px-4 py-3 text-base"
                    disabled={uploading !== null || gen?.busy === true}
                    onClick={() => (gen?.index === i ? setGen(null) : openGenerator(i))}
                  >
                    {gen?.index === i ? 'Close' : 'Generate one'}
                  </button>

                  {row.src ? (
                    <span className="text-sm">Filled in</span>
                  ) : (
                    <span className="text-sm">Nothing here yet</span>
                  )}
                </div>

                {gen?.index === i && (
                  <div className="mt-3 border border-rule bg-concrete p-3">
                    <span className="font-data text-xs uppercase">Which moment</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {MEDIA_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          className="press border border-rule bg-sheet px-3 py-2 text-sm"
                          disabled={gen.busy}
                          onClick={() =>
                            setGen((g) => (g ? { ...g, subject: preset.subject } : g))
                          }
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    {/* Editable, always. A preset is a starting point; the
                        fastest way to improve a generated picture is usually to
                        change one clause rather than to start again. */}
                    <textarea
                      className="mt-2 min-h-[88px] w-full border border-rule bg-sheet p-2 text-base"
                      rows={3}
                      value={gen.subject}
                      disabled={gen.busy}
                      onChange={(e) =>
                        setGen((g) => (g ? { ...g, subject: e.target.value } : g))
                      }
                    />

                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="press border border-ink bg-sheet px-4 py-3 text-base"
                        disabled={gen.busy}
                        onClick={generate}
                      >
                        {gen.busy && !gen.dataUrl ? 'Generating…' : gen.dataUrl ? 'Try again' : 'Generate'}
                      </button>

                      {/* Only after there is something to look at. LOOKING IS
                          THE WORK — image models miss often, and a generator
                          that filled the slot automatically would put rejects
                          on a public page and rubbish in the bucket. */}
                      {gen.dataUrl && (
                        <button
                          type="button"
                          className="press border border-ink bg-hazard px-4 py-3 text-base text-sheet"
                          disabled={gen.busy}
                          onClick={keepGenerated}
                        >
                          {gen.busy ? 'Storing…' : 'Use this one'}
                        </button>
                      )}
                    </div>

                    {gen.dataUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={gen.dataUrl}
                        alt="The picture just generated, not yet stored"
                        className="mt-2 max-h-64 w-full border border-rule object-contain"
                      />
                    )}

                    {gen.error && (
                      <p className="mt-2 border border-rule bg-sheet p-2 text-sm" role="alert">
                        {gen.error}
                        {gen.attempts.length > 0 && (
                          <span className="mt-1 block whitespace-pre-wrap opacity-70">
                            {gen.attempts.join('\n')}
                          </span>
                        )}
                      </p>
                    )}

                    <p className="mt-2 text-sm">
                      Each one costs money and takes up to a minute. Nothing reaches
                      the public page until you press Save.
                    </p>
                  </div>
                )}

                {/* A thumbnail, so the operator can see WHICH file this is
                    without opening a second tab. Stills and GIFs both render
                    in an img; an mp4 does not, and the address below is the
                    honest fallback for that case. */}
                {row.src && row.kind === 'still' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.src}
                    alt=""
                    className="mt-2 max-h-32 border border-rule"
                    loading="lazy"
                  />
                ) : null}

                <span className="mt-3 block">
                  Or paste an address — a path like /tools/epoxy/01.gif, or a full
                  https:// link
                </span>
                <input
                  className="mt-1 min-h-[44px] w-full border border-rule bg-sheet px-2 text-base"
                  value={row.src}
                  onChange={(e) => patch(i, { src: e.target.value })}
                  placeholder="/tools/epoxy/01-visualiser.gif"
                />
              </div>

              <label className="block text-sm sm:col-span-2">
                Caption — shown under the frame
                <input
                  className="mt-1 min-h-[44px] w-full border border-rule bg-sheet px-2 text-base"
                  value={row.caption}
                  onChange={(e) => patch(i, { caption: e.target.value })}
                  placeholder="Their own garage, finished"
                />
              </label>

              <label className="block text-sm sm:col-span-2">
                Description — what is happening in it. Read aloud to anyone using
                a screen reader, so describe the action, not the file.
                <input
                  className="mt-1 min-h-[44px] w-full border border-rule bg-sheet px-2 text-base"
                  value={row.alt}
                  onChange={(e) => patch(i, { alt: e.target.value })}
                  placeholder="A bare garage floor turning into the same floor with a metallic coating on it"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="press border border-rule bg-sheet px-4 py-3 text-base"
          onClick={() => setRows((r) => [...r, { ...EMPTY }])}
          disabled={rows.length >= MAX_SLOTS}
        >
          Add a slot
        </button>
        <button
          type="button"
          className="press border border-ink bg-hazard px-4 py-3 text-base text-sheet"
          onClick={save}
          disabled={pending}
        >
          {pending ? 'Saving…' : 'Save ' + toolId}
        </button>
      </div>

      {note && (
        <p className="mt-3 border border-rule bg-concrete p-3 text-sm" role="status">
          {note}
        </p>
      )}
    </section>
  );
}


