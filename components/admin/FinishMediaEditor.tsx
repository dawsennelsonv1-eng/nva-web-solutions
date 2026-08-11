'use client';

import { useRef, useState } from 'react';
import {
  saveFinishMediaAction,
  deleteFinishMediaAction,
  createFinishUploadAction,
} from '@/app/actions/finishMedia';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { FinishMediaKind, FinishMediaSlot } from '@/lib/finishes/media-types';

/**
 * components/admin/FinishMediaEditor.tsx — one row per thing that can carry a
 * picture.
 *
 * ============================================================================
 * THE ROWS ARE GENERATED FROM THE CATALOGUE, NOT TYPED IN
 * ============================================================================
 *
 * The parent enumerates every option in lib/verticals/epoxy/options.ts and
 * passes them here, so the operator sees a complete checklist of what COULD
 * have a picture and what currently does. He never has to know that a swatch
 * key is `flake_blend:domino`, and he cannot typo one — a mistyped key would
 * produce a row that saves successfully and is never found by the picker,
 * which is the worst kind of failure: silent and invisible.
 *
 * ============================================================================
 * SAVE IS PER ROW, AND UPLOAD DOES NOT SAVE
 * ============================================================================
 *
 * Forty swatches behind one Save button means one slow write that either
 * succeeds entirely or fails entirely, and an operator who loses an hour to a
 * dropped connection. Per row, a failure costs one picture.
 *
 * Choosing a file uploads it and fills the address in, then STOPS. The row
 * stays dirty until Save is pressed, exactly as if the address had been typed
 * — so a picture with no alt text and no caption never reaches the public
 * picker just because a file finished uploading.
 *
 * Legacy admin tokens, like every other admin screen. Admin is not part of the
 * marketing redesign and should not start looking like it in one corner.
 */

export interface FinishMediaTarget {
  kind: FinishMediaKind;
  mediaKey: string;
  /** 'Flake blend / Domino' — what the operator recognises. */
  label: string;
  /** Fallback colour, where the catalogue names one. */
  hex?: string;
}

interface Draft {
  src: string;
  alt: string;
  caption: string;
  dirty: boolean;
}

function draftFor(target: FinishMediaTarget, existing: FinishMediaSlot | undefined): Draft {
  return {
    src: existing?.src ?? '',
    alt: existing?.alt ?? target.label,
    caption: existing?.caption ?? '',
    dirty: false,
  };
}

export function FinishMediaEditor({
  vertical,
  targets,
  existing,
}: {
  vertical: string;
  targets: FinishMediaTarget[];
  existing: FinishMediaSlot[];
}) {
  const byKey = new Map(existing.map((e) => [e.kind + '|' + e.mediaKey, e]));
  const [rows, setRows] = useState<Draft[]>(
    targets.map((t) => draftFor(t, byKey.get(t.kind + '|' + t.mediaKey)))
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<Record<number, string>>({});
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const patch = (i: number, next: Partial<Draft>) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, ...next, dirty: true } : row)));

  const say = (i: number, msg: string) => setNote((n) => ({ ...n, [i]: msg }));

  const upload = (i: number, file: File | undefined) => {
    const target = targets[i];
    if (!file || !target) return;
    setBusy(i);
    say(i, '');
    void (async () => {
      try {
        const signed = await createFinishUploadAction({ contentType: file.type });
        if (!signed.ok) {
          say(i, signed.message);
          return;
        }
        const supabase = getSupabaseBrowserClient();
        const { error } = await supabase.storage
          .from('tool-media')
          .uploadToSignedUrl(signed.path, signed.token, file);
        if (error) {
          say(i, 'Upload refused: ' + error.message + '. The ceiling is 8 MB.');
          return;
        }
        patch(i, { src: signed.publicUrl });
        say(i, 'Uploaded. Press Save to publish it.');
      } catch {
        say(i, 'That upload did not finish. Check the connection and try again.');
      } finally {
        setBusy(null);
      }
    })();
  };

  const save = (i: number) => {
    const target = targets[i];
    const row = rows[i];
    if (!target || !row) return;
    setBusy(i);
    say(i, '');
    void (async () => {
      const res = await saveFinishMediaAction({
        vertical,
        kind: target.kind,
        mediaKey: target.mediaKey,
        src: row.src,
        alt: row.alt,
        caption: row.caption,
        sortOrder: i,
      });
      say(i, res.ok ? 'Saved.' : res.message);
      if (res.ok) setRows((r) => r.map((x, n) => (n === i ? { ...x, dirty: false } : x)));
      setBusy(null);
    })();
  };

  const remove = (i: number) => {
    const target = targets[i];
    if (!target) return;
    setBusy(i);
    void (async () => {
      const res = await deleteFinishMediaAction({
        vertical,
        kind: target.kind,
        mediaKey: target.mediaKey,
      });
      if (res.ok) {
        setRows((r) => r.map((x, n) => (n === i ? { src: '', alt: target.label, caption: '', dirty: false } : x)));
        say(i, 'Removed.');
      } else {
        say(i, res.message);
      }
      setBusy(null);
    })();
  };

  return (
    <ul className="space-y-4">
      {targets.map((t, i) => {
        const row = rows[i];
        if (!row) return null;
        return (
          <li key={t.kind + t.mediaKey} className="border border-rule bg-sheet p-4">
            <div className="flex items-start gap-3">
              {/* The current picture, or the catalogue's flat colour, or
                  nothing. A flat rectangle is an honest placeholder; a
                  generated photograph would not be. */}
              {row.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.src}
                  alt=""
                  className="h-16 w-24 border border-rule object-cover"
                  loading="lazy"
                />
              ) : (
                <span
                  aria-hidden
                  className="block h-16 w-24 border border-rule"
                  style={t.hex ? { backgroundColor: t.hex } : undefined}
                />
              )}
              <div className="min-w-0">
                <p className="text-base font-semibold">{t.label}</p>
                <p className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                  {t.kind} · {t.mediaKey}
                </p>
              </div>
            </div>

            <input
              ref={(el) => {
                fileRefs.current[i] = el;
              }}
              type="file"
              accept="image/webp,image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                upload(i, e.target.files?.[0]);
                // Cleared so re-picking the same file after a failure still
                // fires onChange, instead of reading as a dead button.
                e.target.value = '';
              }}
            />

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                Address
                <input
                  className="mt-1 min-h-[44px] w-full border border-rule bg-sheet px-2 text-base"
                  value={row.src}
                  onChange={(e) => patch(i, { src: e.target.value })}
                  placeholder="Upload a file, or paste an https:// address"
                />
              </label>
              <label className="block text-sm">
                Alt text — describes it for screen readers
                <input
                  className="mt-1 min-h-[44px] w-full border border-rule bg-sheet px-2 text-base"
                  value={row.alt}
                  onChange={(e) => patch(i, { alt: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Caption — shown under the picture
                <input
                  className="mt-1 min-h-[44px] w-full border border-rule bg-sheet px-2 text-base"
                  value={row.caption}
                  onChange={(e) => patch(i, { caption: e.target.value })}
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="press border border-ink bg-sheet px-4 py-3 text-base"
                disabled={busy !== null}
                onClick={() => fileRefs.current[i]?.click()}
              >
                {busy === i ? 'Working…' : 'Choose a file'}
              </button>
              <button
                type="button"
                className="press border border-ink bg-sheet px-4 py-3 text-base"
                disabled={busy !== null || !row.dirty || row.src.trim().length === 0}
                onClick={() => save(i)}
              >
                Save
              </button>
              {row.src && (
                <button
                  type="button"
                  className="press border border-rule bg-sheet px-4 py-3 text-base"
                  disabled={busy !== null}
                  onClick={() => remove(i)}
                >
                  Remove
                </button>
              )}
            </div>

            {note[i] && <p className="mt-2 text-sm">{note[i]}</p>}
          </li>
        );
      })}
    </ul>
  );
}
