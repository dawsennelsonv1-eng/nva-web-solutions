'use client';

import { useRef, useState } from 'react';
import { saveToolMediaAction, createToolMediaUploadAction } from '@/app/actions/toolMedia';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
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
        const signed = await createToolMediaUploadAction({
          toolId,
          contentType: file.type,
        });
        if (!signed.ok) {
          setNote(signed.message);
          return;
        }

        const supabase = getSupabaseBrowserClient();
        const { error } = await supabase.storage
          .from('tool-media')
          .uploadToSignedUrl(signed.path, signed.token, file);

        if (error) {
          setNote(
            'The upload was refused: ' +
              error.message +
              '. If it mentions size, the ceiling is 8 MB.'
          );
          return;
        }

        const next: Partial<Draft> = { src: signed.publicUrl };
        if (file.type === 'image/gif' || file.type === 'video/mp4') next.kind = 'animation';
        if (file.type === 'image/png' || file.type === 'image/jpeg') next.kind = 'still';
        patch(i, next);
        setNote('Uploaded. Add a caption and a description, then press Save.');
      } catch {
        setNote('That upload did not finish. Check the connection and try again.');
      } finally {
        setUploading(null);
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
                    disabled={uploading !== null}
                    onClick={() => fileRefs.current[i]?.click()}
                  >
                    {uploading === i ? 'Uploading…' : 'Choose a file'}
                  </button>
                  {row.src ? (
                    <span className="text-sm">Filled in</span>
                  ) : (
                    <span className="text-sm">Nothing here yet</span>
                  )}
                </div>

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

