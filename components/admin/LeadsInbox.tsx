'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LeadDetailDrawer } from './LeadDetailDrawer';
import type { LeadListItem } from '@/app/actions/leads';

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
          {leads.map((l) => (
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
