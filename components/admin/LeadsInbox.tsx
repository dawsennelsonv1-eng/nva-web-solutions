'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LeadDetailDrawer } from './LeadDetailDrawer';
import { deleteLeadAction, type LeadListItem } from '@/app/actions/leads';

const SOURCES = ['all', 'public_hub', 'demo', 'prototype', 'direct'] as const;
const STATUSES = ['all', 'new', 'contacted', 'qualified', 'dead'] as const;

/**
 * components/admin/LeadsInbox.tsx — filter pills + list + drawer, as one
 * client component so tapping a row can open the drawer without a
 * navigation. Filters write to the URL (router.push with searchParams) so
 * the SERVER component re-fetches with the new filter — the client never
 * re-implements the query, it just tells the URL what to ask for.
 */
export function LeadsInbox({ leads }: { leads: LeadListItem[] }) {
  /**
   * ==========================================================================
   * DELETING A LEAD. TWO TAPS, AND THE SECOND ONE SAYS THE NAME.
   * ==========================================================================
   *
   * A one-tap delete beside a row you tap to OPEN is a mis-tap waiting to
   * happen, and this is the one control here that cannot be undone — every
   * other action on this screen changes a status that can be changed back.
   *
   * NOT `window.confirm`. It is blocked in some embedded browsers, it cannot
   * be styled, and on a phone it renders as a browser-chrome dialog that looks
   * like a scam prompt. Arming the row instead keeps the confirmation inside
   * the page, and lets it name the person being deleted — which is the
   * difference between "are you sure?" and "delete Maria Reyes?".
   *
   * `armed` holds one id at a time, so arming a second row disarms the first
   * and there can never be two live delete buttons on screen.
   */
  const [armed, setArmed] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  /** Rows removed in this session, hidden immediately rather than on refresh. */
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const [problem, setProblem] = useState<string | null>(null);

  const remove = async (id: string) => {
    setDeleting(id);
    setProblem(null);
    try {
      const res = await deleteLeadAction(id);
      if (res.ok) {
        /**
         * Hidden locally AND the route refreshed. The local hide is what makes
         * the row disappear the instant it is gone; `router.refresh()` is what
         * makes the counts and the filters above it agree. Doing only the
         * second leaves the row on screen for a beat, which reads as the
         * button not having worked.
         */
        setGone((g) => new Set(g).add(id));
        setArmed(null);
        router.refresh();
      } else {
        setProblem(res.message ?? 'That lead could not be deleted.');
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'That lead could not be deleted.');
    } finally {
      setDeleting(null);
    }
  };

  const router = useRouter();
  const searchParams = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);

  const source = searchParams.get('source') ?? 'all';
  const status = searchParams.get('status') ?? 'all';

  function setFilter(key: 'source' | 'status', value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') params.delete(key);
    else params.set(key, value);
    router.push('/admin/leads?' + params.toString());
  }

  function exportUrl(): string {
    const params = new URLSearchParams();
    if (source !== 'all') params.set('source', source);
    if (status !== 'all') params.set('status', status);
    const qs = params.toString();
    return '/api/admin/leads/export' + (qs ? '?' + qs : '');
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <FilterSelect label="Source" value={source} options={SOURCES} onChange={(v) => setFilter('source', v)} />
        <FilterSelect label="Status" value={status} options={STATUSES} onChange={(v) => setFilter('status', v)} />
        <a
          href={exportUrl()}
          className="ml-auto flex shrink-0 items-center rounded-milled border border-ink bg-sheet px-3 font-data text-xs font-semibold"
        >
          Export CSV
        </a>
      </div>

      {leads.length === 0 ? (
        <p className="mt-6 rounded-milled border bg-sheet p-4 text-base text-rule">
          No leads match this filter.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {problem && (
            <li className="font-data text-xs text-warning" role="alert">
              {problem}
            </li>
          )}
          {leads.filter((l) => !gone.has(l.id)).map((l) => (
            <li key={l.id}>
              <button
                onClick={() => setOpenId(l.id)}
                className="flex w-full items-center justify-between gap-3 rounded-milled border bg-sheet p-3 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-base text-ink">{l.name}</p>
                  <p className="font-data text-xs text-rule">
                    {l.source} · {new Date(l.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {l.wasDegraded ? (
                    <span className="rounded-milled border border-warning/40 bg-warning/5 px-1.5 py-0.5 font-data text-[10px] uppercase text-warning">
                      Degraded
                    </span>
                  ) : null}
                  <span className="font-data text-xs capitalize text-rule">{l.status}</span>
                </div>
              </button>

              {/* OUTSIDE the row button, never nested inside it: a <button>
                  within a <button> is invalid HTML and the inner one's clicks
                  are unreliable across browsers. */}
              <div className="mt-1 flex items-center justify-end gap-2">
                {armed === l.id ? (
                  <>
                    <span className="font-data text-xs text-rule">
                      Delete {l.name}? This cannot be undone.
                    </span>
                    <button
                      type="button"
                      disabled={deleting !== null}
                      onClick={() => void remove(l.id)}
                      className="rounded-milled border border-warning/40 px-2 py-1 font-data text-[11px] uppercase text-warning disabled:opacity-40"
                    >
                      {deleting === l.id ? 'Deleting…' : 'Delete'}
                    </button>
                    <button
                      type="button"
                      disabled={deleting !== null}
                      onClick={() => setArmed(null)}
                      className="rounded-milled border px-2 py-1 font-data text-[11px] uppercase disabled:opacity-40"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setArmed(l.id)}
                    className="font-data text-[11px] uppercase text-rule opacity-60 hover:opacity-100"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {openId ? <LeadDetailDrawer leadId={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function FilterSelect<T extends string>({
  label, value, options, onChange,
}: { label: string; value: string; options: readonly T[]; onChange: (v: string) => void }) {
  return (
    <label className="shrink-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[2.75rem] rounded-milled border border-rule bg-sheet px-2 font-data text-xs capitalize"
      >
        {options.map((o) => (
          <option key={o} value={o}>{label}: {o}</option>
        ))}
      </select>
    </label>
  );
}
