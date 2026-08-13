'use client';

import { useMemo, useRef, useState } from 'react';
import { generateComboAction, type ComboSpec } from '@/app/actions/comboGen';
import { createFinishUploadAction, saveFinishMediaAction } from '@/app/actions/finishMedia';
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
function enumerateCombos(): Row[] {
  const system = EPOXY_GROUPS.find((g) => g.key === 'system');
  const out: Row[] = [];
  for (const sys of system?.options ?? []) {
    const groups = visibleGroups({ system: sys.key });
    const colour = groups.find((g) => g.key !== 'system' && g.key !== 'topcoat');
    const topcoat = groups.find((g) => g.key === 'topcoat');
    if (!colour || !topcoat) continue;
    for (const c of colour.options) {
      for (const t of topcoat.options) {
        const selections = { system: sys.key, [colour.key]: c.key, topcoat: t.key };
        out.push({
          spec: { system: sys.key, colourGroup: colour.key, colourKey: c.key, topcoat: t.key },
          comboKey: comboKeyFor(selections),
          label: `${sys.label} · ${c.label} · ${t.label}`,
        });
      }
    }
  }
  return out;
}

export function ComboStudio({ existingKeys }: { existingKeys: string[] }) {
  const rows = useMemo(enumerateCombos, []);
  const [photo, setPhoto] = useState<{ base64: string; mediaType: string; url: string } | null>(
    null
  );
  const [state, setState] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const stop = useRef(false);
  const have = useMemo(() => new Set(existingKeys), [existingKeys]);

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

    // Same three-step upload as the swatch studio and CombinationUploader.
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
        new File([blob], row.comboKey + '.webp', { type: contentType })
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
          {running ? 'Generating…' : `Generate all ${rows.length}`}
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
              {st?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={st.url}
                  alt=""
                  style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 4 }}
                />
              ) : (
                <span
                  style={{
                    width: 56,
                    height: 40,
                    borderRadius: 4,
                    border: '1px dashed var(--n15-card-edge)',
                  }}
                />
              )}
              <span style={{ flex: 1, fontSize: '0.85rem' }}>{r.label}</span>
              <span style={{ fontSize: '0.72rem', opacity: 0.7, textAlign: 'right' }}>
                {st?.status === 'running'
                  ? 'Rendering…'
                  : (st?.note ?? (have.has(r.comboKey) ? 'Has a picture' : ''))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
