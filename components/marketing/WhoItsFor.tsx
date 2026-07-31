/**
 * components/marketing/WhoItsFor.tsx.
 *
 * Answers "is this for me?" honestly, which means naming who it is NOT for
 * as plainly as who it is for — OFFER.md §7's qualification scorecard exists
 * precisely because selling to a contractor with no traffic produces an
 * angry customer, and that logic belongs in the public copy too, not just
 * the internal scorecard. This section is the qualification criteria
 * translated into a sentence a contractor reads about himself, not the
 * scoring rubric itself (which stays internal, per §7's own instruction that
 * the admin view is a plain-language warning rather than an exposed number).
 */
export function WhoItsFor() {
  return (
    <section className="border-y bg-sheet py-16">
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="font-display font-condensed text-2xl font-bold sm:text-3xl">Who this is for</h2>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-milled border bg-concrete p-5">
            <p className="font-data text-xs uppercase tracking-wide text-cure">A good fit</p>
            <p className="mt-2 text-base">
              You already get people finding you — Google, ads, reviews, word of mouth — and
              some of them leave without calling. This turns the ones who look around into
              people who leave their number.
            </p>
          </div>
          <div className="rounded-milled border bg-concrete p-5">
            <p className="font-data text-xs uppercase tracking-wide text-rule">Not yet, if</p>
            <p className="mt-2 text-base">
              Almost nobody finds your business online today. This converts traffic — it doesn&apos;t
              create it, and I&apos;d rather tell you that up front than sell you something that
              won&apos;t do anything for you yet.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
