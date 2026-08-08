'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { castVote, type ActionResult } from '@/app/actions/queue';
import { VOTE_DISPLAY_FLOOR } from '@/lib/queue/tools';

/**
 * components/queue/VoteForm.tsx — "Move this up the queue." Restyled, 16I.
 *
 * THE COST OF VOTING IS HIS TRADE AND HIS CITY, not his email. Those two fields
 * are the entire product of this page — they are what decides what gets built
 * next — so they are what the vote costs. Email is optional and buys exactly one
 * thing, stated plainly: a message when the tool ships. Unchanged.
 *
 * ============================================================================
 * THE RANK FLASH SURVIVES, AND IT IS STILL THE POINT
 * ============================================================================
 *
 * 13A permitted three moving things on this site and this was one of them. It
 * stays, for the reason the original gave: it is driven by the rank PROP
 * changing after revalidation, not by the click, so it marks a real change in
 * the world rather than acknowledging a tap.
 *
 * What changed is how it is drawn. It used the legacy `duration-span` Tailwind
 * token, which no longer governs this surface; it is now a keyframe in
 * phase22.css that animates COLOR only and is disabled entirely under
 * prefers-reduced-motion. Colour is not a compositor property, but this runs
 * once for 400ms on a single short span — not per frame, not on scroll — which
 * is the one shape of colour animation the frame budget can absorb.
 *
 * ============================================================================
 * NO useTransition, AND THAT IS A COMPATIBILITY FIX
 * ============================================================================
 *
 * The original called startTransition with an async callback. Under
 * @types/react 18.3.12 — the version this repo pins — that does not typecheck:
 * TransitionFunction returns VoidOrUndefinedOnly and an async arrow returns
 * Promise<void>. Something in this project's build tolerated it, but since this
 * file is being rewritten anyway the fragility goes with it.
 *
 * Pending is plain useState. There is no concurrent-rendering benefit to a
 * transition around a single form submission, so nothing is lost.
 *
 * onSubmit rather than the form `action` prop: React 18 has no client-side form
 * action, and Next 14 backports it for SERVER actions only. Building the
 * FormData by hand is the version that works in this React. Unchanged.
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
  const [pending, setPending] = useState(false);
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

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    void (async () => {
      try {
        setResult(await castVote(formData));
      } catch {
        setResult({ ok: false, message: 'That did not go through. Try again.' });
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <div className="vf">
      <h2 className="n15-h3">Move this up the queue</h2>

      <p className="vf-rank">
        {rank !== null ? (
          <span className={flash ? 'vf-flash' : undefined}>
            #{rank} in queue
            {votes >= VOTE_DISPLAY_FLOOR ? ` · ${votes} votes` : ''}
          </span>
        ) : (
          <span>Taking votes</span>
        )}
      </p>

      <p className="n15-body vf-lede">
        Voting costs your trade and your city, because those are what decide the
        order. One tool enters build per month and the queue leader on the 1st is
        the one that does.
      </p>

      <form onSubmit={onSubmit} className="vf-form">
        <input type="hidden" name="toolId" value={toolId} />

        <label className="rf-field" htmlFor={`trade-${toolId}`}>
          <span className="rf-label">
            Your trade<span className="rf-req">required</span>
          </span>
          <input
            id={`trade-${toolId}`}
            name="trade"
            required
            maxLength={80}
            autoComplete="organization-title"
            placeholder="Roofing"
            className="rf-input"
          />
        </label>

        <label className="rf-field" htmlFor={`city-${toolId}`}>
          <span className="rf-label">
            Your city<span className="rf-req">required</span>
          </span>
          <input
            id={`city-${toolId}`}
            name="city"
            required
            maxLength={80}
            autoComplete="address-level2"
            placeholder="Dallas"
            className="rf-input"
          />
        </label>

        <label className="rf-field" htmlFor={`email-${toolId}`}>
          <span className="rf-label">
            Email<span className="rf-opt">optional</span>
          </span>
          <input
            id={`email-${toolId}`}
            name="email"
            type="email"
            maxLength={160}
            autoComplete="email"
            className="rf-input"
          />
          <span className="rf-hint">
            Only used to tell you when {toolName} ships. Nothing else.
          </span>
        </label>

        <button type="submit" disabled={pending} className="n15-btn n15-btn-primary vf-submit">
          {pending ? 'Recording…' : 'Add my vote'}
        </button>
      </form>

      {result && (
        <p className={'vf-result' + (result.ok ? ' vf-result-ok' : '')} role="status">
          {result.message}
        </p>
      )}
    </div>
  );
}
