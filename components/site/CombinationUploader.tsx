'use client';

import { useRef, useState } from 'react';
import {
  createFinishUploadAction,
  saveFinishMediaAction,
  deleteFinishMediaAction,
} from '@/app/actions/finishMedia';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * components/site/CombinationUploader.tsx — ATTACHING A PHOTOGRAPH TO THE MIX
 * CURRENTLY ON SCREEN.
 *
 * ============================================================================
 * WHY THIS LIVES IN THE PICKER AND NOT IN /admin/finishes
 * ============================================================================
 *
 * Swatches are finite — fifty-two options, one photograph each, and a
 * checklist in an admin screen is exactly right for them.
 *
 * Combinations are not. The catalogue permits hundreds, and their key is a
 * canonical string assembled from a whole set of choices:
 *
 *   system=metallic&metallic_colour=copper_burl&topcoat=gloss
 *
 * Listing every possible one in an admin screen would be a page of several
 * hundred empty rows, and asking the operator to type that key by hand would
 * mean a typo produces a row that saves successfully and is never found by
 * the picker — silent, and invisible until somebody notices a photograph that
 * never appears.
 *
 * So the upload happens HERE, where the mix has just been assembled and the
 * key is already computed by the same function that will later look it up. The
 * operator taps through a combination he has photographed, uploads, and it is
 * attached to precisely that combination. The key cannot be wrong because
 * nobody types it.
 *
 * ============================================================================
 * ONLY THE OPERATOR SEES THIS, AND THE SERVER IS WHAT ENFORCES THAT
 * ============================================================================
 *
 * The parent renders this only when isOperatorAction() came back true. That
 * hides it from visitors; it does not protect anything. Both writes below call
 * actions that check requireAdmin() themselves, so a visitor who forces this
 * on gets a control that refuses him twice.
 */

export function CombinationUploader({
  vertical,
  comboKey,
  summary,
  hasPhoto,
  onSaved,
}: {
  vertical: string;
  /** The canonical key for what is currently selected. */
  comboKey: string;
  /** Human-readable lines, used as the caption and the alt text. */
  summary: string[];
  /** Whether a photograph already exists for this exact combination. */
  hasPhoto: boolean;
  /** Refetch after a change, so the hero updates without a reload. */
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  /**
   * A combination needs a complete mix to be meaningful. An empty key means
   * nothing has been chosen yet, and a photograph attached to "nothing
   * selected" would show up under every incomplete state.
   */
  if (comboKey.length === 0) return null;

  const upload = (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setNote(null);
    void (async () => {
      try {
        const signed = await createFinishUploadAction({ contentType: file.type });
        if (!signed.ok) {
          setNote(signed.message);
          return;
        }

        const supabase = getSupabaseBrowserClient();
        const { error } = await supabase.storage
          .from('tool-media')
          .uploadToSignedUrl(signed.path, signed.token, file);
        if (error) {
          setNote('Upload refused: ' + error.message + '. The ceiling is 8 MB.');
          return;
        }

        /**
         * SAVED IMMEDIATELY, unlike the swatch editor which leaves the row
         * dirty until Save is pressed.
         *
         * The difference is that there is nothing else to fill in here: the
         * caption and the alt text are the selection summary, which is already
         * known and already correct. A Save button would exist only to confirm
         * values nobody typed.
         */
        const alt = summary.join(', ') || 'Finish combination';
        const res = await saveFinishMediaAction({
          vertical,
          kind: 'combination',
          mediaKey: comboKey,
          src: signed.publicUrl,
          alt,
          caption: summary.join(' · '),
          sortOrder: 0,
        });

        if (!res.ok) {
          setNote(res.message);
          return;
        }
        setNote('Attached to this combination.');
        onSaved();
      } catch {
        setNote('That upload did not finish. Check the connection and try again.');
      } finally {
        setBusy(false);
      }
    })();
  };

  const remove = () => {
    setBusy(true);
    setNote(null);
    void (async () => {
      const res = await deleteFinishMediaAction({ vertical, kind: 'combination', mediaKey: comboKey });
      setNote(res.ok ? 'Removed.' : res.message);
      if (res.ok) onSaved();
      setBusy(false);
    })();
  };

  return (
    <div className="cu">
      <p className="cu-h">Operator</p>
      <p className="cu-b">
        {hasPhoto
          ? 'This combination has a reference photo. Uploading again replaces it.'
          : 'No reference photo for this exact combination. Upload one and every visitor who builds this mix will see it.'}
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/webp,image/png,image/jpeg"
        className="cu-file"
        onChange={(e) => {
          upload(e.target.files?.[0]);
          // Cleared so re-picking the same file after a failure still fires
          // onChange, rather than reading as a dead button.
          e.target.value = '';
        }}
      />

      <div className="cu-actions">
        <button
          type="button"
          className="n15-btn n15-btn-ghost"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? 'Working…' : hasPhoto ? 'Replace the photo' : 'Upload a photo of this'}
        </button>
        {hasPhoto && (
          <button type="button" className="n15-btn n15-btn-ghost" disabled={busy} onClick={remove}>
            Remove
          </button>
        )}
      </div>

      {note && <p className="cu-note">{note}</p>}
      <p className="cu-key">{comboKey}</p>
    </div>
  );
}
