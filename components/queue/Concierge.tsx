'use client';

import React, { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { submitConciergeRequest, type ActionResult } from '@/app/actions/queue';

/**
 * components/queue/Concierge.tsx — for a visitor whose trade is not listed.
 *
 * THREE OUTCOMES, AND THE THIRD IS THE HONEST ONE:
 *   built        -> route him to the tool
 *   spec only    -> show him the specification and the vote, not an email box
 *   nothing      -> take his trade, city and what he wants priced, then tell
 *                   him plainly that it is not built and what would have to
 *                   happen for it to be
 *
 * NO TURNAROUND PROMISE. There is no "custom build in 1-3 days" here, because
 * that is one person working from a phone and it cannot be held. A missed
 * promise to this audience is fatal in a way that an admitted limitation is
 * not. The urgency comes from the queue being real and monthly: one tool enters
 * build per month, and his trade and city are what move it.
 *
 * The index is passed in from the server rather than importing the catalogue,
 * so the spec sheets' trade math never ships to the browser.
 */

export interface ConciergeEntry {
  id: string;
  name: string;
  trade: string;
  built: boolean;
  keywords: string[];
}

type Outcome =
  | { kind: 'none' }
  | { kind: 'match'; entry: ConciergeEntry }
  | { kind: 'miss' };

export function Concierge({ index }: { index: ConciergeEntry[] }) {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
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

  /** onSubmit, not the form `action` prop — see VoteForm for why. */
  const onCapture = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setResult(await submitConciergeRequest(formData));
    });
  };

  return (
    <section className="bg-sheet px-4 py-12" aria-labelledby="concierge-h">
      <div className="mx-auto max-w-5xl">
        <h2 id="concierge-h" className="font-display text-2xl font-extrabold uppercase">
          Your trade is not on the list
        </h2>
        <p className="mt-2 max-w-[60ch] text-base">
          Type it in. You will get one of three answers, and one of them is that it does not exist
          yet.
        </p>

        <div className="mt-4 max-w-xl">
          <label className="block" htmlFor="concierge-q">
            <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
              What do you do
            </span>
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
              className="mt-1 w-full rounded-none border border-rule bg-sheet px-3 py-3 text-base"
            />
          </label>
          <button
            type="button"
            onClick={() => setSearched(true)}
            className="press mt-3 w-full rounded-milled border border-ink bg-hazard px-4 py-3 text-base text-sheet"
          >
            Check the queue
          </button>
        </div>

        {outcome.kind === 'match' && (
          <div className="mt-5 max-w-xl border border-rule bg-concrete p-4">
            <p className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
              {outcome.entry.built ? 'Built and running' : 'Specified, not built'}
            </p>
            <h3 className="mt-1 font-display text-lg font-semibold">{outcome.entry.name}</h3>
            <p className="mt-2 text-sm">
              {outcome.entry.built
                ? 'This one exists and is running on live sites. The spec sheet shows exactly what it prices and how.'
                : 'The specification is written and the trade math is published. It is not built. You can read the whole thing and put your weight behind it.'}
            </p>
            <Link
              href={`/queue/${outcome.entry.id}`}
              className="press mt-3 inline-block rounded-milled border border-ink px-4 py-2.5 text-base"
            >
              {outcome.entry.built ? 'Open the spec sheet' : 'Read it and vote'}
            </Link>
          </div>
        )}

        {outcome.kind === 'miss' && !result && (
          <div className="mt-5 max-w-xl border border-rule bg-concrete p-4">
            <p className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
              Not built, and not specified
            </p>
            <p className="mt-2 text-sm">
              There is no tool for this and no specification for one either. Nineteen trades are on
              this page and yours is not among them. What decides that is the pile below — trade,
              city, and what you would want priced. One tool enters build a month, and nothing
              enters it without demand behind it.
            </p>

            <form onSubmit={onCapture} className="mt-4">
              <input type="hidden" name="trade" value={query} />

              <p className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                Trade: {query}
              </p>

              <label className="mt-3 block" htmlFor="conc-city">
                <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                  Your city
                </span>
                <input
                  id="conc-city"
                  name="city"
                  required
                  maxLength={80}
                  className="mt-1 w-full rounded-none border border-rule bg-sheet px-3 py-3 text-base"
                />
              </label>

              <label className="mt-3 block" htmlFor="conc-wants">
                <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                  What would it need to price
                </span>
                <textarea
                  id="conc-wants"
                  name="wants"
                  rows={3}
                  maxLength={400}
                  className="mt-1 w-full rounded-none border border-rule bg-sheet px-3 py-3 text-base"
                />
              </label>

              <label className="mt-3 block" htmlFor="conc-email">
                <span className="font-data text-2xs uppercase tracking-[0.08em] text-rule">
                  Email — optional
                </span>
                <input
                  id="conc-email"
                  name="email"
                  type="email"
                  maxLength={160}
                  className="mt-1 w-full rounded-none border border-rule bg-sheet px-3 py-3 text-base"
                />
              </label>

              <button
                type="submit"
                disabled={pending}
                className="press mt-4 w-full rounded-milled border border-ink bg-hazard px-4 py-3 text-base text-sheet disabled:border-rule disabled:bg-rule"
              >
                {pending ? 'Recording…' : 'Put it in the pile'}
              </button>
            </form>
          </div>
        )}

        {result && (
          <p className={`mt-4 max-w-xl text-sm ${result.ok ? 'text-cure' : ''}`} role="status">
            {result.message}
          </p>
        )}
      </div>
    </section>
  );
}
