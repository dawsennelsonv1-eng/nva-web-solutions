'use client';

import { useEffect, useState } from 'react';
import { listPresetsAction, saveAsPresetAction, applyPresetAction, type PresetListItem } from '@/app/actions/combiner';

/**
 * components/admin/combiner/PresetsPanel.tsx — item 4: "save a full
 * combination as a named preset, apply to a new prospect in one tap."
 *
 * Reads/writes style_presets (seeded with 4 system rows since Phase 2's
 * seed.sql — real data, not fixtures invented for this phase). Applying a
 * preset writes straight into the staged preview via applyPresetAction, so
 * it shows up instantly through the same refresh path every other change
 * uses, and the admin can still nudge it before deploying.
 */
export function PresetsPanel({
  prototypeId,
  current,
  onApplied,
}: {
  prototypeId: string;
  current: { templateId: string; typographyId: string; buttonStyleId: string; styleVariant: string; primaryHex: string | null };
  onApplied: () => void;
}) {
  const [presets, setPresets] = useState<PresetListItem[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void listPresetsAction().then(setPresets);
  }, []);

  async function handleSave() {
    if (!name.trim()) return;
    setBusy(true);
    const result = await saveAsPresetAction({
      name,
      templateId: current.templateId,
      typographyId: current.typographyId,
      buttonStyleId: current.buttonStyleId,
      styleVariant: current.styleVariant as 'light' | 'dark-industrial',
      primaryHex: current.primaryHex,
    });
    setBusy(false);
    if (result.ok) {
      setMessage('Saved.');
      setName('');
      void listPresetsAction().then(setPresets);
      setTimeout(() => setMessage(null), 1500);
    } else {
      setMessage(result.error ?? 'Could not save.');
    }
  }

  async function handleApply(presetId: string) {
    setBusy(true);
    await applyPresetAction(prototypeId, presetId);
    setBusy(false);
    onApplied();
  }

  return (
    <div className="rounded-milled border bg-sheet p-4">
      <p className="font-data text-xs uppercase tracking-wide text-rule">Presets</p>

      {presets.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => void handleApply(p.id)}
              disabled={busy}
              className="min-h-[2.75rem] rounded-milled border border-rule bg-concrete px-3 font-data text-xs disabled:opacity-60"
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1 font-data text-xs text-rule">No presets yet.</p>
      )}

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          placeholder="Name this combination"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-[2.75rem] flex-1 rounded-milled border border-rule bg-concrete px-2 font-data text-xs"
        />
        <button
          onClick={() => void handleSave()}
          disabled={busy || !name.trim()}
          className="min-h-[2.75rem] rounded-milled border border-ink bg-concrete px-3 font-data text-xs font-semibold disabled:opacity-60"
        >
          Save
        </button>
      </div>
      {message ? <p className="mt-1 font-data text-xs text-rule">{message}</p> : null}
    </div>
  );
}
