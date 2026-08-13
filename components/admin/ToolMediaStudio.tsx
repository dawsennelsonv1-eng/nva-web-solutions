'use client';

import { useState } from 'react';
import { generateToolMediaAction, type ToolMediaGenResult } from '@/app/actions/toolMediaGen';
import { createToolMediaUploadAction } from '@/app/actions/toolMedia';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * components/admin/ToolMediaStudio.tsx — pictures for the tool page.
 *
 * ============================================================================
 * PRESETS, BECAUSE THE HARD PART IS KNOWING WHAT TO ASK FOR
 * ============================================================================
 *
 * A blank prompt box in an admin screen is a way of handing the difficult part
 * back to the operator. The tool page tells one story in a fixed order —
 * photograph the floor, it works out the size, choose the finish, see it on
 * your own floor, the installer calls — and each beat wants a picture of that
 * specific moment.
 *
 * So the beats are written out as starting points. They are editable, because
 * a contractor selling patios rather than garages needs different words, and
 * because the fastest way to improve a generated picture is usually to change
 * one clause rather than to start again.
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

const PRESETS: readonly { label: string; subject: string }[] = [
  {
    label: 'Photographing the floor',
    subject:
      'a person standing in the doorway of a domestic garage holding up a phone to photograph the bare concrete floor, seen from behind',
  },
  {
    label: 'The bare slab',
    subject:
      'the empty concrete floor of a two-car domestic garage in daylight, swept clean, some staining and hairline cracks visible',
  },
  {
    label: 'Choosing the finish',
    subject:
      'a close-up of two hands holding physical epoxy floor sample tiles side by side over a bare concrete floor, comparing them',
  },
  {
    label: 'The finished floor',
    subject:
      'a domestic garage with a finished decorative flake epoxy floor, a car parked on it, ordinary household clutter along one wall',
  },
  {
    label: 'The installer arrives',
    subject:
      'a contractor in work clothes kneeling on a garage floor with a clipboard and a tape measure, checking the concrete',
  },
];

export function ToolMediaStudio({ toolIds }: { toolIds: string[] }) {
  const [toolId, setToolId] = useState(toolIds[0] ?? '');
  const [subject, setSubject] = useState(PRESETS[0]?.subject ?? '');
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
        {PRESETS.map((p) => (
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
