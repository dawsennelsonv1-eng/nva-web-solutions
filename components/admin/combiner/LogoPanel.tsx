'use client';

import { useRef, useState } from 'react';
import { extractBrandFromFile } from '@/lib/brand/extract.client';
import { extractBrandServerSideAction, validateHexAction } from '@/app/actions/brand';
import { uploadLogoForStagingAction } from '@/app/actions/combiner';

/**
 * components/admin/combiner/LogoPanel.tsx — item 3, "wired to Phase 7:
 * upload, extracted hexes, per-token override, re-extract, and Tier 3
 * manual entry always reachable."
 *
 * TIER ROUTING HAPPENS HERE, CLIENT-SIDE, exactly as Phase 7 designed it:
 * Tier 1 (extractBrandFromFile, the browser canvas) runs first and is the
 * expected path. If it fails, Tier 2 is offered ONLY if the server flag is
 * on (checked via the action's own 'disabled' reason rather than a second
 * env lookup here — the flag's source of truth stays in lib/brand/
 * extract.server.ts). Tier 3 — typing hex values by hand — is not a
 * fallback button that appears after failure; it is ALWAYS visible below
 * the upload control, because "always reachable" means exactly that: an
 * admin who doesn't trust extraction, or has a logo that defeats it, should
 * never have to fail twice before reaching the box where he just types
 * #1B4B8F.
 *
 * The panel does not persist anything to Storage or the database itself
 * beyond uploading the logo file (which needs a real path to preview) —
 * every hex change flows up to CombinerBoard via onChange, which is what
 * calls updatePreviewAction. This keeps LogoPanel a pure input surface.
 */

export interface LogoPanelValue {
  primaryHex: string | null;
  secondaryHex: string | null;
  accentHex: string | null;
  logoPath: string | null;
  logoPreviewUrl: string | null;
}

export function LogoPanel({
  prototypeId,
  value,
  onChange,
}: {
  prototypeId: string;
  value: LogoPanelValue;
  onChange: (next: LogoPanelValue) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualHex, setManualHex] = useState({ primary: value.primaryHex ?? '', secondary: value.secondaryHex ?? '', accent: value.accentHex ?? '' });

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setStatus('Reading the logo…');

    // TIER 1 — the browser canvas.
    const tier1 = await extractBrandFromFile(file);

    if (tier1.ok) {
      setStatus('Extracted from the logo.');
      await commitExtraction(file, tier1.result.primaryHex, tier1.result.secondaryHex, tier1.result.accentHex, tier1.previewUrl);
      return;
    }

    // TIER 2 — server fallback, only if enabled; a clean 'disabled' reason
    // falls straight through to Tier 3 rather than showing an error for a
    // deliberately-off feature.
    setStatus('Trying the server fallback…');
    const base64 = await fileToBase64(file);
    const tier2 = await extractBrandServerSideAction({ prototypeId, base64 });

    if (tier2.ok) {
      setStatus('Extracted server-side.');
      await commitExtraction(file, tier2.primaryHex ?? null, tier2.secondaryHex ?? null, tier2.accentHex ?? null, null);
      return;
    }

    setStatus(tier1.message + ' Enter the colours below instead.');
  }

  async function commitExtraction(
    file: File,
    primaryHex: string | null,
    secondaryHex: string | null,
    accentHex: string | null,
    localPreviewUrl: string | null
  ) {
    setManualHex({ primary: primaryHex ?? '', secondary: secondaryHex ?? '', accent: accentHex ?? '' });

    // Upload now (not at deploy time) so the preview iframe has a real,
    // fetchable URL immediately — see CombinerBoard's header note on why
    // logo upload happens eagerly.
    const base64 = await fileToBase64(file);
    const uploaded = await uploadLogoForStagingAction({ prototypeId, base64, mediaType: file.type });

    onChange({
      primaryHex,
      secondaryHex,
      accentHex,
      logoPath: uploaded.path ?? value.logoPath,
      logoPreviewUrl: uploaded.publicUrl ?? localPreviewUrl ?? value.logoPreviewUrl,
    });
  }

  async function handleManualCommit(field: 'primary' | 'secondary' | 'accent') {
    const raw = manualHex[field];
    if (!raw) {
      onChange({ ...value, [field + 'Hex']: null } as LogoPanelValue);
      return;
    }
    const { valid, normalized } = await validateHexAction(raw);
    if (!valid) {
      setManualError('That is not a valid hex colour.');
      return;
    }
    setManualError(null);
    onChange({ ...value, [field + 'Hex']: normalized } as LogoPanelValue);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-data text-xs uppercase tracking-wide text-rule">Logo</p>
        <div className="mt-2 flex items-center gap-3">
          {value.logoPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.logoPreviewUrl} alt="Logo" className="h-12 w-12 rounded-milled border object-contain bg-sheet p-1" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-milled border bg-sheet font-data text-[9px] text-rule">
              none
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="min-h-[2.75rem] rounded-milled border border-ink bg-sheet px-3 font-data text-sm font-semibold"
          >
            {value.logoPreviewUrl ? 'Replace / re-extract' : 'Upload logo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>
        {status ? <p className="mt-1.5 font-data text-xs text-rule">{status}</p> : null}
      </div>

      {/* TIER 3 — always visible, never gated behind a failure. */}
      <div>
        <p className="font-data text-xs uppercase tracking-wide text-rule">Colours (type or paste a hex)</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {(['primary', 'secondary', 'accent'] as const).map((field) => (
            <label key={field} className="block">
              <span className="font-data text-[10px] uppercase text-rule">{field}</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-6 w-6 shrink-0 rounded-milled border border-rule"
                  style={{ backgroundColor: manualHex[field] || 'transparent' }}
                />
                <input
                  type="text"
                  inputMode="text"
                  placeholder="#1B4B8F"
                  value={manualHex[field]}
                  onChange={(e) => setManualHex((s) => ({ ...s, [field]: e.target.value }))}
                  onBlur={() => void handleManualCommit(field)}
                  className="min-h-[2.75rem] w-full rounded-milled border border-rule bg-sheet px-2 font-data text-xs"
                />
              </div>
            </label>
          ))}
        </div>
        {manualError ? <p className="mt-1 font-data text-xs text-danger">{manualError}</p> : null}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}
