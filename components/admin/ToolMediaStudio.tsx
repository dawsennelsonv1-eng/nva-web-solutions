'use client';

import { useState } from 'react';
import { generateToolMediaAction, type ToolMediaGenResult } from '@/app/actions/toolMediaGen';
import { createToolMediaUploadAction } from '@/app/actions/toolMedia';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
// The beats live in lib/tools/media-presets.ts, shared with ToolMediaEditor,
// which grew the same generator in phase 38. Two copies of this list would
// have drifted; see that file.
import { MEDIA_PRESETS, firstPresetSubject } from '@/lib/tools/media-presets';

/**
 * components/admin/ToolMediaStudio.tsx — pictures for the tool page.
 *
 * ============================================================================
 * WHAT THIS SCREEN IS FOR, NOW THAT THE EDITOR CAN GENERATE TOO
 * ============================================================================
 *
 * Phase 38 put the same generator on every slot row in ToolMediaEditor, which
 * is the shorter path for the ordinary case: fill slot 3, describe it, done,
 * without the address ever being visible.
 *
 * THIS SCREEN IS NOT REDUNDANT. It generates WITHOUT committing to a slot,
 * which is what you want when the question is "can the model do this at all"
 * rather than "fill this slot" — trying six wordings for a beat, keeping the
 * one that works, and only then deciding where it goes. It also hands back the
 * bare address, which is the only way to put a generated picture somewhere the
 * slot editor does not reach.
 *
 * The prompt presets it offers are in lib/tools/media-presets.ts, shared with
 * the editor so the two screens cannot produce different pictures for the same
 * named beat.
 *
 * ============================================================================
 * GENERATE, LOOK, THEN UPLOAD — THREE SEPARATE ACTS
 * ============================================================================
 *
 * The upload is a distinct button, not something that happens automatically on
 * a successful generation. Image models miss, the miss rate is high, and an
 * automatic upload fills the bucket with rejects that someone has to identify
 * and clear later. Looking at it first is the actual work.
 */

export function ToolMediaStudio({ toolIds }: { toolIds: string[] }) {
  const [toolId, setToolId] = useState(toolIds[0] ?? '');
  const [subject, setSubject] = useState(firstPresetSubject());
  const [busy, setBusy] = useState<null | 'gen' | 'upload'>(null);
  const [result, setResult] = useState<ToolMediaGenResult | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const generate = async () => {
    setBusy('gen');
    setResult(null);
    setPublicUrl(null);
    setNote(null);
    try {
      setResult(await generateToolMediaAction({ toolId, subject }));
    } catch (e) {
      setResult({
        ok: false,
        error:
          'The request did not complete. If it ran for about a minute the route timed out — check maxDuration on this page. ' +
          (e instanceof Error ? e.message : String(e)),
      });
    } finally {
      setBusy(null);
    }
  };

  const upload = async () => {
    if (!result?.dataUrl) return;
    setBusy('upload');
    setNote(null);
    try {
      const blob = await (await fetch(result.dataUrl)).blob();
      const contentType = blob.type || 'image/webp';

      const signed = await createToolMediaUploadAction({ toolId, contentType });
      if (!signed.ok) {
        setNote(signed.message);
        return;
      }

      // The browser PUTs the file. createToolMediaUploadAction hands back a URL
      // rather than accepting the file for the reason stated in its own header:
      // a server action body is capped at 1 MB and base64 inflates by a third.
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.storage
        .from('tool-media')
        .uploadToSignedUrl(
          signed.path,
          signed.token,
          new File([blob], 'slot.webp', { type: contentType })
        );
      if (error) {
        setNote('Upload refused: ' + error.message);
        return;
      }

      setPublicUrl(signed.publicUrl);
      setNote('Uploaded. Paste the address below into a slot on the Tool media screen.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '1rem' }}>
        <span className="n15-eyebrow">Tool</span>
        <select
          value={toolId}
          onChange={(e) => setToolId(e.target.value)}
          style={{ display: 'block', marginTop: '0.3rem', padding: '0.5rem', minWidth: '14rem' }}
        >
          {toolIds.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <p className="n15-eyebrow">Which moment</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.4rem 0 0.9rem' }}>
        {MEDIA_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="n15-btn n15-btn-ghost"
            onClick={() => setSubject(p.subject)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        rows={3}
        style={{
          width: '100%',
          padding: '0.6rem',
          font: 'inherit',
          fontSize: '0.9rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--n15-card-edge)',
          background: 'transparent',
          color: 'inherit',
        }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.8rem' }}>
        <button
          type="button"
          className="n15-btn n15-btn-primary"
          disabled={busy !== null || !toolId}
          onClick={() => void generate()}
        >
          {busy === 'gen' ? 'Generating…' : 'Generate'}
        </button>
        {result?.ok && (
          <>
            <button
              type="button"
              className="n15-btn n15-btn-ghost"
              disabled={busy !== null}
              onClick={() => void upload()}
            >
              {busy === 'upload' ? 'Uploading…' : 'Use this one'}
            </button>
            <a className="n15-btn n15-btn-ghost" href={result.dataUrl} download="tool-slot.webp">
              Download
            </a>
          </>
        )}
      </div>

      {result?.ok && result.dataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={result.dataUrl}
          alt="Generated illustration"
          style={{ marginTop: '1rem', maxWidth: '100%', borderRadius: '0.6rem' }}
        />
      )}

      {result && !result.ok && (
        <p style={{ marginTop: '0.8rem', fontSize: '0.82rem' }} role="alert">
          {result.error}
          {result.attempts && result.attempts.length > 0 && (
            <span style={{ display: 'block', whiteSpace: 'pre-wrap', opacity: 0.7 }}>
              {result.attempts.join('\n')}
            </span>
          )}
        </p>
      )}

      {note && (
        <p style={{ marginTop: '0.8rem', fontSize: '0.82rem' }} role="status">
          {note}
        </p>
      )}

      {publicUrl && (
        /* Selected on focus, because the next thing that happens to this string
           is always a copy — and selecting a long URL by hand on a phone is
           genuinely difficult. */
        <input
          readOnly
          value={publicUrl}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            width: '100%',
            marginTop: '0.5rem',
            padding: '0.5rem',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '0.72rem',
            borderRadius: '0.4rem',
            border: '1px solid var(--n15-card-edge)',
            background: 'transparent',
            color: 'inherit',
          }}
        />
      )}
    </div>
  );
}

