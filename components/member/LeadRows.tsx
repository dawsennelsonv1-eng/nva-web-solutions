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
      {error && <p className="mt-4 text-base text-danger">{error}</p>}
      <ul className="mt-4 space-y-3">
        {leads.map((l) => (
          <li key={l.id} className="border border-rule bg-sheet p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-base font-semibold">{l.name}</p>
              <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                {l.createdAt.slice(0, 10)}
              </span>
            </div>
            <p className="mt-1 font-data text-sm tabular">
              <a href={`tel:${l.phone}`} className="underline underline-offset-4">
                {l.phone}
              </a>
            </p>
            <p className="font-data text-2xs text-rule">{l.email}</p>

            {l.wasDegraded && (
              <p className="mt-2 font-data text-2xs uppercase tracking-[0.08em] text-hazard">
                Captured without a price — the widget was degraded
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <label className="block">
                <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                  Status
                </span>
                <select
                  value={l.status}
                  disabled={pending}
                  onChange={(e) => changeStatus(l.id, e.target.value)}
                  className="mt-1 block min-h-[3rem] rounded-milled border border-rule bg-sheet px-3 text-base"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              {canAssign && (
                <label className="block">
                  <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                    Assigned to
                  </span>
                  <select
                    value={l.assignedTo ?? ''}
                    disabled={pending}
                    onChange={(e) => changeAssignee(l.id, e.target.value)}
                    className="mt-1 block min-h-[3rem] rounded-milled border border-rule bg-sheet px-3 text-base"
                  >
                    <option value="">Nobody</option>
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
