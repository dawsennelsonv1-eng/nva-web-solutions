'use client';

import { useState } from 'react';
import { saveToolMediaAction } from '@/app/actions/toolMedia';
import { MAX_SLOTS, MIN_SLOTS, DEFAULT_DURATION_MS, type MediaSlot } from '@/lib/tools/media';

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

  const patch = (i: number, next: Partial<Draft>) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, ...next } : row)));

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

              <label className="block text-sm sm:col-span-2">
                Address — a path like /tools/epoxy/01.gif, or a full https:// link
                <input
                  className="mt-1 min-h-[44px] w-full border border-rule bg-sheet px-2 text-base"
                  value={row.src}
                  onChange={(e) => patch(i, { src: e.target.value })}
                  placeholder="/tools/epoxy/01-visualiser.gif"
                />
              </label>

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
