'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { submitConciergeRequest, type ActionResult } from '@/app/actions/queue';

/**
 * components/queue/Concierge.tsx — for a visitor whose trade is not listed.
 * Restyled, 16I. This closes the last legacy-styled block on /queue.
 *
 * THREE OUTCOMES, AND THE THIRD IS THE HONEST ONE:
 *   built        -> route him to the tool
 *   spec only    -> show him the specification and the vote, not an email box
 *   nothing      -> take his trade, city and what he wants priced, then tell him
 *                   plainly that it is not built and what would have to happen
 *                   for it to be
 *
 * NO TURNAROUND PROMISE. There is no "custom build in 1-3 days" here, because
 * that is one person working from a phone and it cannot be held. A missed
 * promise to this audience is fatal in a way an admitted limitation is not. The
 * urgency comes from the queue being real and monthly.
 *
 * The index is passed in from the server rather than importing the catalogue, so
 * the spec sheets' trade math never ships to the browser. Unchanged.
 *
 * ============================================================================
 * THIS IS NOT THE SAME THING AS THE HOMEPAGE'S ProblemIntake
 * ============================================================================
 *
 * They look similar and they are not. This asks WHICH TRADE, and its answer is a
 * demand signal that changes build order — it writes to concierge_requests and
 * feeds the queue. ProblemIntake asks WHAT IS BROKEN in a business, and its
 * answer is a sales lead for a custom build — it writes to
 * implementation_requests.
 *
 * Two different questions, two different tables, two different next actions. If
 * they are ever merged, the queue loses the input that decides what gets built.
 *
 * ============================================================================
 * NO useTransition — same compatibility fix as VoteForm
 * ============================================================================
 *
 * startTransition with an async callback does not typecheck under this repo's
 * pinned @types/react. Pending is plain useState. onSubmit rather than the form
 * `action` prop, unchanged, for the reason VoteForm documents.
 */

export interface ConciergeEntry {
  id: string;
  name: string;
  trade: string;
  built: boolean;
  keywords: string[];
}

type Outcome = { kind: 'none' } | { kind: 'match'; entry: ConciergeEntry } | { kind: 'miss' };

export function Concierge({ index }: { index: ConciergeEntry[] }) {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const outcome: Outcome = useMemo(() => {
    if (!searched) return { kind: 'none' };
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { kind: 'none' };
    const hit = index.find(
      (e) =>
        e.trade.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.keywords.some((k) => k.includes(q) || q.includes(k))
    );
    return hit ? { kind: 'match', entry: hit } : { kind: 'miss' };
  }, [index, query, searched]);

  const onCapture = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    void (async () => {
      try {
        setResult(await submitConciergeRequest(formData));
      } catch {
        setResult({ ok: false, message: 'That did not go through. Try again.' });
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <section className="n15-sec" aria-labelledby="concierge-h">
      <div className="n15-in">
        <p className="n15-eyebrow">Not on the list</p>
        <h2 id="concierge-h" className="n15-h2">
          Your trade is not on the list
        </h2>
        <p className="n15-lede">
          Type it in. You will get one of three answers, and one of them is that
          it does not exist yet.
        </p>

        <div className="cg-search">
          <label className="rf-field" htmlFor="concierge-q">
            <span className="rf-label">What do you do</span>
            <input
              id="concierge-q"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearched(false);
                setResult(null);
              }}
              placeholder="Septic pumping"
              maxLength={80}
              className="rf-input"
            />
          </label>
          <button
            type="button"
            onClick={() => setSearched(true)}
            className="n15-btn n15-btn-primary cg-go"
          >
            Check the queue
          </button>
        </div>

        {outcome.kind === 'match' && (
          <div className="cg-result">
            <p className="rf-label">
              {outcome.entry.built ? 'Built and running' : 'Specified, not built'}
            </p>
            <h3 className="n15-h3 cg-result-h">{outcome.entry.name}</h3>
            <p className="n15-body">
              {outcome.entry.built
                ? 'This one exists and is running on live sites. The spec sheet shows exactly what it prices and how.'
                : 'The specification is written and the trade math is published. It is not built. You can read the whole thing and put your weight behind it.'}
            </p>
            <div className="tc-actions n15-actions-wide">
              <Link href={`/queue/${outcome.entry.id}`} className="n15-btn n15-btn-ghost">
                {outcome.entry.built ? 'Open the spec sheet' : 'Read it and vote'}
              </Link>
            </div>
          </div>
        )}

        {outcome.kind === 'miss' && !result && (
          <div className="cg-result">
            <p className="rf-label">Not built, and not specified</p>
            <p className="n15-body cg-result-h">
              There is no tool for this and no specification for one either.
              Nineteen trades are on this page and yours is not among them. What
              decides that is the pile below — trade, city, and what you would
              want priced. One tool enters build a month, and nothing enters it
              without demand behind it.
            </p>

            <form onSubmit={onCapture} className="cg-form">
              <input type="hidden" name="trade" value={query} />

              <p className="cg-trade">
                Trade: <strong>{query}</strong>
              </p>

              <label className="rf-field" htmlFor="conc-city">
                <span className="rf-label">
                  Your city<span className="rf-req">required</span>
                </span>
                <input
                  id="conc-city"
                  name="city"
                  required
                  maxLength={80}
                  autoComplete="address-level2"
                  className="rf-input"
                />
              </label>

              <label className="rf-field" htmlFor="conc-wants">
                <span className="rf-label">What would it need to price</span>
                <textarea
                  id="conc-wants"
                  name="wants"
                  rows={3}
                  maxLength={400}
                  className="rf-input rf-textarea"
                />
              </label>

              <label className="rf-field" htmlFor="conc-email">
                <span className="rf-label">
                  Email<span className="rf-opt">optional</span>
                </span>
                <input
                  id="conc-email"
                  name="email"
                  type="email"
                  maxLength={160}
                  autoComplete="email"
                  className="rf-input"
                />
              </label>

              <button
                type="submit"
                disabled={pending}
                className="n15-btn n15-btn-primary cg-submit"
              >
                {pending ? 'Recording…' : 'Put it in the pile'}
              </button>
            </form>
          </div>
        )}

        {result && (
          <p className={'vf-result' + (result.ok ? ' vf-result-ok' : '')} role="status">
            {result.message}
          </p>
        )}
      </div>
    </section>
  );
}
