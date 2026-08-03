'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { castVote, type ActionResult } from '@/app/actions/queue';
import { VOTE_DISPLAY_FLOOR } from '@/lib/queue/tools';

/**
 * components/queue/VoteForm.tsx — "Move this up the queue."
 *
 * THE COST OF VOTING IS HIS TRADE AND HIS CITY, not his email. Those two
 * fields are the entire product of this page — they are what decides what gets
 * built next — so they are what the vote costs. Email is optional and buys
 * exactly one thing, stated plainly: a message when the tool ships.
 *
 * THE ONE PERMITTED ANIMATION. 13A allows three moving things on this site and
 * this is one of them: when the rank changes, the number flashes once. It is
 * driven by the rank PROP changing after revalidation, not by the click, so it
 * marks a real change in the world rather than acknowledging a tap. It runs
 * once and never again, and it collapses to nothing under prefers-reduced-
 * motion because the duration token it uses is zeroed there.
 */

export function VoteForm({
  toolId,
  rank,
  votes,
  toolName,
}: {
  toolId: string;
  rank: number | null;
  votes: number;
  toolName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [flash, setFlash] = useState(false);
  const previousRank = useRef(rank);

  useEffect(() => {
    if (previousRank.current === rank) return;
    previousRank.current = rank;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 400);
    return () => window.clearTimeout(t);
  }, [rank]);

  /**
   * onSubmit rather than the form `action` prop: React 18 has no client-side
   * form action, and Next 14 backports it for SERVER actions only. Building the
   * FormData by hand is the version that works in this React.
   */
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setResult(await castVote(formData));
    });
  };

  return (
    <div className="border border-rule bg-sheet p-4">
      <h2 className="font-display text-lg font-semibold">Move this up the queue</h2>

      <p className="mt-2 font-data text-2xs uppercase tracking-[0.08em] text-rule">
        {rank !== null ? (
          <span className={flash ? 'text-hazard transition-none' : 'transition-colors duration-span'}>
            #{rank} in queue
            {votes >= VOTE_DISPLAY_FLOOR ? ` · ${votes} votes` : ''}
          </span>
        ) : (
          <span>Taking votes</span>
        )}
      </p>

      <p className="mt-3 max-w-[54ch] text-sm">
        Voting costs your trade and your city, because those are what decide the order. One tool
        enters build per month and the queue leader on the 1st is the one that does.
      </p>

      <form onSubmit={onSubmit} className="mt-4">
        <input type="hidden" name="toolId" value={toolId} />

        <label className="block" htmlFor={`trade-${toolId}`}>
          <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
            Your trade
          </span>
          <input
            id={`trade-${toolId}`}
            name="trade"
            required
            maxLength={80}
            autoComplete="organization-title"
            placeholder="Roofing"
            className="mt-1 w-full rounded-none border border-rule bg-sheet px-3 py-3 text-base"
          />
        </label>

        <label className="mt-3 block" htmlFor={`city-${toolId}`}>
          <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
            Your city
          </span>
          <input
            id={`city-${toolId}`}
            name="city"
            required
            maxLength={80}
            autoComplete="address-level2"
            placeholder="Dallas"
            className="mt-1 w-full rounded-none border border-rule bg-sheet px-3 py-3 text-base"
          />
        </label>

        <label className="mt-3 block" htmlFor={`email-${toolId}`}>
          <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
            Email — optional, only used to tell you when {toolName} ships
          </span>
          <input
            id={`email-${toolId}`}
            name="email"
            type="email"
            maxLength={160}
            autoComplete="email"
            className="mt-1 w-full rounded-none border border-rule bg-sheet px-3 py-3 text-base"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="press mt-4 w-full rounded-milled border border-ink bg-hazard px-4 py-3 text-base text-sheet disabled:border-rule disabled:bg-rule"
        >
          {pending ? 'Recording…' : 'Add my vote'}
        </button>
      </form>

      {result && (
        <p className={`mt-3 text-sm ${result.ok ? 'text-cure' : ''}`} role="status">
          {result.message}
        </p>
      )}
    </div>
  );
}
