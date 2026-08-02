import type { Metadata } from 'next';
import Link from 'next/link';
import { Plate } from '@/components/ui/Plate';

/**
 * app/(public)/queue/page.tsx — PLACEHOLDER, on purpose.
 *
 * The real build queue, the spec sheets and the voting mechanism are Phase
 * 13C. This route exists now only because the header links to it, and a nav
 * link to a 404 on a page whose entire argument is that it does not overstate
 * what exists would undo the argument.
 *
 * It wears a SPEC ONLY plate, which is the accurate status of this page about
 * itself. That is the Plate working as intended.
 */

export const metadata: Metadata = {
  title: 'Build queue',
  description:
    'The order in which tools get built, published in the open. One tool enters build per month.',
};

export default function QueuePage() {
  return (
    <section className="bg-concrete px-4 pb-16 pt-8">
      <div className="mx-auto max-w-5xl">
        <Plate
          unit="NVA-QUEUE"
          status="SPEC ONLY"
          rev={1}
          date="2026-08"
          count={{ label: 'Rows published', value: 0 }}
        />

        <h1 className="mt-4 max-w-[18ch] font-display text-3xl font-extrabold uppercase">
          The build queue is not published yet
        </h1>

        <p className="mt-3 max-w-[60ch] text-base">
          One vertical is live: concrete and epoxy coating. Painting was pulled because the module
          could not price honestly under the current contract, and a tool that cannot price is
          worse on your screen than a tool that is absent.
        </p>

        <p className="mt-3 max-w-[60ch] text-base">
          When this page opens it will show every tool in order — what is in service, what is in
          build with a date, what is queued, and what is a specification and nothing more. Each
          unbuilt row will publish its actual input schema, because anyone can list a trade name
          and only somebody who has shipped one can write the next one&rsquo;s maths.
        </p>

        <Link
          href="/"
          className="press mt-6 inline-block rounded-milled border border-ink px-4 py-2.5 text-base"
        >
          Back to the quoting engine
        </Link>
      </div>
    </section>
  );
}
