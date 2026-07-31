'use client';

import { useEffect, useState } from 'react';
import { getLeadDetailAction, updateLeadNotesAction, updateLeadStatusAction, type LeadDetail } from '@/app/actions/leads';
import { formatCentsWhole } from '@/lib/quote/pricing';
import type { DbLeadStatus } from '@/types/database';

/**
 * components/admin/LeadDetailDrawer.tsx — bottom sheet on 360px, not a
 * desktop side panel that technically reflows. Fetches its own detail on
 * open rather than the list page preloading every lead's quote/photo —
 * the list stays light, the drawer pays for what it actually shows.
 */

const STATUS_PIPELINE: DbLeadStatus[] = ['new', 'contacted', 'qualified', 'dead'];

const DEGRADED_LABEL: Record<string, string> = {
  cap_reached: 'Cap reached',
  subscription_suspended: 'Subscription suspended',
  ai_unavailable: 'AI unavailable',
};

export function LeadDetailDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getLeadDetailAction(leadId).then((d) => {
      if (cancelled) return;
      setDetail(d);
      setNotes(d?.notes ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  async function changeStatus(status: DbLeadStatus) {
    if (!detail) return;
    setDetail({ ...detail, status });
    await updateLeadStatusAction(leadId, status);
  }

  async function saveNotes() {
    setSavingNotes(true);
    const res = await updateLeadNotesAction(leadId, notes);
    setSavingNotes(false);
    setNotesSaved(res.ok);
    if (res.ok) setTimeout(() => setNotesSaved(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-milled border-t bg-concrete p-4 sm:max-w-lg sm:rounded-milled sm:border">
        <div className="flex items-center justify-between">
          <span className="font-data text-xs uppercase tracking-wide text-rule">Lead</span>
          <button onClick={onClose} className="font-data text-sm text-rule hover:text-ink">Close</button>
        </div>

        {!detail ? (
          <p className="mt-6 text-base text-rule">Loading…</p>
        ) : (
          <>
            <h2 className="mt-1 font-display font-condensed text-xl font-bold">{detail.name}</h2>
            <dl className="mt-2 space-y-1 font-data text-sm">
              <Row label="Phone" value={detail.phone} />
              <Row label="Email" value={detail.email} />
              <Row label="Timeline" value={detail.timeline ?? '—'} />
              <Row label="Source" value={detail.source} />
              <Row label="Received" value={new Date(detail.createdAt).toLocaleString('en-US')} />
            </dl>

            {detail.wasDegraded ? (
              <div className="mt-3 rounded-milled border border-warning/40 bg-warning/5 p-3">
                <p className="font-data text-xs uppercase tracking-wide text-warning">
                  Degraded — {detail.degradedReason ? DEGRADED_LABEL[detail.degradedReason] : 'unknown'}
                </p>
                <p className="mt-1 text-sm">No instant price was shown. This homeowner needs a callback.</p>
              </div>
            ) : null}

            {detail.photoUrl ? (
              <div className="mt-4">
                <p className="font-data text-xs uppercase tracking-wide text-rule">Photo</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.photoUrl}
                  alt="Uploaded floor photo"
                  className="mt-1 max-h-64 w-full rounded-milled border object-cover"
                />
                <p className="mt-1 font-data text-[10px] text-rule">Signed link, expires in 5 minutes.</p>
              </div>
            ) : null}

            {detail.quote ? (
              <div className="mt-4">
                <p className="font-data text-xs uppercase tracking-wide text-rule">Quote</p>
                <p className="tabular font-display font-condensed text-2xl font-bold">
                  {formatCentsWhole(detail.quote.lowCents)}–{formatCentsWhole(detail.quote.highCents)}
                </p>
                <p className="font-data text-xs text-rule">
                  {detail.quote.usedAiAnalysis ? 'AI-assisted' : 'Manual entry'}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer font-data text-sm text-rule">Full payload</summary>
                  <pre className="mt-2 overflow-x-auto rounded-milled border bg-sheet p-2 font-data text-[10px]">
                    {JSON.stringify({ inputs: detail.quote.inputs, breakdown: detail.quote.breakdown }, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <p className="mt-4 font-data text-sm text-rule">No quote attached to this lead.</p>
            )}

            <div className="mt-5">
              <p className="font-data text-xs uppercase tracking-wide text-rule">Status</p>
              <div className="mt-1 grid grid-cols-4 gap-1.5">
                {STATUS_PIPELINE.map((s) => (
                  <button
                    key={s}
                    onClick={() => void changeStatus(s)}
                    aria-pressed={detail.status === s}
                    className={
                      'min-h-[2.75rem] rounded-milled border font-data text-xs capitalize transition-colors duration-step ' +
                      (detail.status === s ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet')
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label className="block">
                <span className="font-data text-xs uppercase tracking-wide text-rule">Notes</span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-milled border border-rule bg-sheet p-3 text-base"
                />
              </label>
              <button
                onClick={() => void saveNotes()}
                disabled={savingNotes}
                className="mt-2 min-h-[2.75rem] rounded-milled border border-ink bg-sheet px-4 font-data text-sm font-semibold disabled:opacity-60"
              >
                {savingNotes ? 'Saving…' : notesSaved ? 'Saved' : 'Save notes'}
              </button>
            </div>

            <a
              href={'tel:' + detail.phone.replace(/[^\d+]/g, '')}
              className="mt-6 flex min-h-[3rem] w-full items-center justify-center rounded-milled bg-hazard font-body text-base font-semibold text-sheet"
            >
              Call {detail.name}
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-rule">{label}</dt>
      <dd className="truncate text-right text-ink">{value}</dd>
    </div>
  );
}
