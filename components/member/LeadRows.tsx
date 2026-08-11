'use client';

import { useState, useTransition } from 'react';
import { setLeadStatusAction, assignLeadAction } from '@/app/actions/member';

/**
 * components/member/LeadRows.tsx — the pipeline, as rows a person acts on.
 *
 * Assignment is only rendered for principals and foremen. That mirrors
 * assignLeadAction's own check, which mirrors 0014's leads policies — three
 * layers saying the same thing, which is correct: the policy is the boundary,
 * the action produces a readable refusal, and this hides a control that would
 * only fail.
 *
 * OPTIMISTIC UI IS DELIBERATELY ABSENT. A lead's status is what a crew tells a
 * homeowner they will do next; showing "contacted" for a write that silently
 * failed is worse than a half-second of latency.
 *
 * PHASE 29: restyled onto the marketing design system, and the phone and email
 * are now both tap targets. The logic is untouched — the same two actions, the
 * same absence of optimism, the same error handling.
 *
 * `startTransition(async () => ...)` below does NOT typecheck under the pinned
 * @types/react 18.3.12 and is left exactly as it was, because it is already
 * shipping and building. Do not copy the pattern into a new file; do not
 * "fix" it here as a drive-by either, since that is a behaviour change riding
 * inside a restyle.
 */

export interface LeadRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  createdAt: string;
  assignedTo: string | null;
  wasDegraded: boolean;
  /**
   * The floor this person specified, 'Group: Option' per line.
   *
   * THE REASON THIS DASHBOARD IS WORTH SHOWING ANYONE. A row with a name and a
   * number is a contact list. A row that also says metallic pour, copper burl,
   * polyaspartic clear, coved base is a job the contractor can price before he
   * picks up the phone — which is the entire product claim, made visible in
   * the one screen a prospect will be shown.
   *
   * Optional: leads captured before the picker have none, and so do degraded
   * ones.
   */
  finishSummary?: string[];
  /** What they were quoted, already formatted. Null when no quote was made. */
  priceRange?: string | null;
}

export interface Assignee {
  id: string;
  email: string;
}

const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

export function LeadRows({
  leads,
  assignees,
  canAssign,
}: {
  leads: LeadRow[];
  assignees: Assignee[];
  canAssign: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const changeStatus = (id: string, status: string) => {
    setError(null);
    startTransition(async () => {
      const r = await setLeadStatusAction(id, status);
      if (!r.ok) setError(r.error ?? 'Could not update that lead.');
    });
  };

  const changeAssignee = (id: string, value: string) => {
    setError(null);
    startTransition(async () => {
      const r = await assignLeadAction(id, value === '' ? null : value);
      if (!r.ok) setError(r.error ?? 'Could not assign that lead.');
    });
  };

  return (
    <>
      {error && (
        <p className="mb-err" role="alert">
          {error}
        </p>
      )}
      <ul className="mb-leads">
        {leads.map((l) => (
          <li
            key={l.id}
            className={'mb-lead' + (l.status === 'new' ? ' mb-lead-new' : '')}
          >
            <div className="mb-lead-top">
              <p className="mb-lead-name">{l.name}</p>
              <span className="mb-lead-when">{l.createdAt.slice(0, 10)}</span>
            </div>

            {/* Tappable, both of them. A contractor reading this is holding a
                phone and the next action is a call — making him copy a number
                out is the difference between a lead worked today and one
                worked eventually. */}
            <p className="mb-lead-contact">
              <a href={`tel:${l.phone}`}>{l.phone}</a>
              <a href={`mailto:${l.email}`}>{l.email}</a>
            </p>

            {/* The price sits beside the contact details, not buried under the
                specification. It is the second thing a contractor looks for
                after the name, and it decides whether he calls now or later. */}
            {l.priceRange && <p className="mb-lead-price">{l.priceRange}</p>}

            {l.finishSummary && l.finishSummary.length > 0 && (
              <ul className="mb-lead-spec">
                {l.finishSummary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}

            {l.wasDegraded && (
              <p className="mb-flag">
                No instant price was shown to this one — the quoting engine was
                degraded. Call to quote it.
              </p>
            )}

            <div className="mb-lead-controls">
              <label className="mb-field">
                <span className="mb-label">Status</span>
                <select
                  className="mb-select"
                  value={l.status}
                  disabled={pending}
                  onChange={(e) => changeStatus(l.id, e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              {canAssign && (
                <label className="mb-field">
                  <span className="mb-label">Assigned to</span>
                  <select
                    className="mb-select"
                    value={l.assignedTo ?? ''}
                    disabled={pending}
                    onChange={(e) => changeAssignee(l.id, e.target.value)}
                  >
                    <option value="">Nobody yet</option>
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.email}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
