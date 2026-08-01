'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { useEffect, useRef } from 'react';
import { deployPrototypeAction, revokePrototypeAction, setExpiryAction } from '@/app/actions/combiner';

/**
 * components/admin/combiner/DeploymentPanel.tsx — item 5, THE DEPLOYMENT
 * ENGINE, and item 6, lifecycle.
 *
 * One button. On success: full URL, a copy button, a QR code (rendered
 * client-side via the `qrcode` package straight to a canvas — no network
 * call to a third-party QR API, so a prospect's private link is never sent
 * to an external service just to draw a square of dots), and the
 * pre-written SMS from lib/combiner/smsTemplate.ts, editable before send
 * since "pre-written" should mean "a strong draft," not "locked text."
 *
 * Lifecycle controls (expiry date, revoke) sit in the same panel post-
 * deploy — draft/live/expired/revoked all live on prototypes.status/
 * expires_at already (Phase 2), so these are thin wrappers over
 * setExpiryAction/revokePrototypeAction.
 */
export function DeploymentPanel({
  prototypeId,
  currentStatus,
  currentExpiresAt,
}: {
  prototypeId: string;
  currentStatus: string;
  currentExpiresAt: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployed, setDeployed] = useState<{ url: string; slug: string; sms: string } | null>(null);
  const [smsText, setSmsText] = useState('');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [expiresAt, setExpiresAtLocal] = useState(currentExpiresAt);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (deployed && canvasRef.current) {
      void QRCode.toCanvas(canvasRef.current, deployed.url, { width: 160, margin: 1 });
    }
  }, [deployed]);

  async function handleDeploy() {
    setBusy(true);
    setError(null);
    const result = await deployPrototypeAction(prototypeId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDeployed(result);
    setSmsText(result.sms);
    setStatus('live');
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard API unavailable — the text is still visible to copy by hand */
    }
  }

  async function handleRevoke() {
    if (!window.confirm('Revoke this link? It will stop working immediately.')) return;
    const result = await revokePrototypeAction(prototypeId);
    if (result.ok) setStatus('revoked');
  }

  async function handleSetExpiry(days: number | null) {
    const iso = days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString();
    const result = await setExpiryAction(prototypeId, iso);
    if (result.ok) setExpiresAtLocal(iso);
  }

  if (deployed) {
    return (
      <div className="rounded-milled border border-cure/40 bg-cure/5 p-4">
        <p className="font-data text-xs uppercase tracking-wide text-cure">Live</p>
        <p className="mt-1 break-all font-data text-sm">{deployed.url}</p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => void handleCopy(deployed.url)}
            className="min-h-[2.75rem] flex-1 rounded-milled border border-ink bg-sheet px-3 font-data text-xs font-semibold"
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>

        <canvas ref={canvasRef} className="mx-auto mt-4 rounded-milled border bg-sheet p-2" />

        <div className="mt-4">
          <p className="font-data text-xs uppercase tracking-wide text-rule">Text to send</p>
          <textarea
            rows={3}
            value={smsText}
            onChange={(e) => setSmsText(e.target.value)}
            className="mt-1 w-full rounded-milled border border-rule bg-sheet p-2 font-data text-sm"
          />
          <button
            onClick={() => void handleCopy(smsText)}
            className="mt-2 min-h-[2.75rem] w-full rounded-milled bg-hazard px-4 font-body text-sm font-semibold text-sheet"
          >
            Copy text
          </button>
        </div>

        <LifecycleControls status={status} expiresAt={expiresAt} onRevoke={handleRevoke} onSetExpiry={handleSetExpiry} />
      </div>
    );
  }

  return (
    <div className="rounded-milled border bg-sheet p-4">
      <p className="font-data text-xs uppercase tracking-wide text-rule">Deploy</p>
      <p className="mt-1 text-sm text-rule">
        Saves everything staged above for real, mints the link, and gives you a text to send.
      </p>
      {error ? <p className="mt-2 font-data text-xs text-danger">{error}</p> : null}
      <button
        onClick={() => void handleDeploy()}
        disabled={busy}
        className="mt-3 min-h-[3rem] w-full rounded-milled bg-hazard px-4 font-body text-base font-semibold text-sheet disabled:opacity-60"
      >
        {busy ? 'Deploying…' : 'Get this live'}
      </button>
      {status !== 'draft' ? (
        <LifecycleControls status={status} expiresAt={expiresAt} onRevoke={handleRevoke} onSetExpiry={handleSetExpiry} />
      ) : null}
    </div>
  );
}

function LifecycleControls({
  status, expiresAt, onRevoke, onSetExpiry,
}: {
  status: string;
  expiresAt: string | null;
  onRevoke: () => void;
  onSetExpiry: (days: number | null) => void;
}) {
  return (
    <div className="mt-4 border-t pt-3">
      <p className="font-data text-xs uppercase tracking-wide text-rule">
        Status: <span className="capitalize text-ink">{status}</span>
        {expiresAt ? ' · expires ' + new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {[7, 30, null].map((days) => (
          <button
            key={String(days)}
            onClick={() => onSetExpiry(days)}
            className="min-h-[2.5rem] rounded-milled border border-rule bg-sheet px-2 font-data text-xs"
          >
            {days === null ? 'No expiry' : days + ' days'}
          </button>
        ))}
        {status !== 'revoked' ? (
          <button
            onClick={onRevoke}
            className="min-h-[2.5rem] rounded-milled border border-danger/40 bg-danger/5 px-2 font-data text-xs text-danger"
          >
            Revoke
          </button>
        ) : null}
      </div>
    </div>
  );
}
