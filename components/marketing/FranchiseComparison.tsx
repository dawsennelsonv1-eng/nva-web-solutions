/**
 * components/marketing/FranchiseComparison.tsx — OFFER.md §8, verbatim.
 *
 * This is sales copy Dawsen wrote in Phase 0 as canonical — it is reproduced
 * here exactly, not paraphrased or "improved." The two dollar figures in the
 * prose ($500 setup / $250 monthly) are accepted as props defaulting to the
 * OFFER.md canonical numbers, so a caller that already fetched live plan
 * data (app/(public)/pricing/page.tsx) can pass the real cents-derived
 * values through and the copy stays correct automatically if the founding
 * rate in the database ever changes (OFFER.md §6) — without turning
 * hand-written sales prose into a template full of placeholders.
 */
export function FranchiseComparison({
  foundationSetupDollars = 500,
  foundationMonthlyDollars = 250,
}: {
  foundationSetupDollars?: number;
  foundationMonthlyDollars?: number;
}) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <p className="font-data text-xs uppercase tracking-wide text-rule">The real comparison</p>
      <h2 className="mt-2 font-display font-condensed text-2xl font-bold sm:text-3xl">
        What a franchise charges to hand you the same thing
      </h2>

      <div className="mt-6 space-y-4 text-base leading-relaxed">
        <p>
          An epoxy franchise costs $49,500 to join, plus 6 to 8 percent of everything you invoice,
          for as long as you&apos;re in it. A large part of what that buys is the system that gets
          you customers — the branded site, the instant quotes, the lead follow-up.
        </p>
        <p>
          That&apos;s what this is. ${foundationSetupDollars.toLocaleString('en-US')} to set up, $
          {foundationMonthlyDollars.toLocaleString('en-US')} a month, and I take 0% of your revenue.
          Ever.
        </p>
        <p>On $600,000 of annual work, a franchise&apos;s 7% is $42,000 a year. This is $3,000.</p>
        <p>
          I&apos;m not going to tell you a franchise is worthless — some of them are genuinely good
          at training crews and buying material. But if what you actually need is the thing that
          turns the people already looking at your site into booked jobs, you shouldn&apos;t have to
          sign away 7% of your revenue forever to get it.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 border-t pt-6">
        <div>
          <p className="font-data text-xs uppercase tracking-wide text-rule">Franchise, $600k/yr</p>
          <p className="tabular mt-1 font-display font-condensed text-3xl font-bold">$42,000</p>
          <p className="font-data text-xs text-rule">7% of gross, every year</p>
        </div>
        <div>
          <p className="font-data text-xs uppercase tracking-wide text-cure">This system, $600k/yr</p>
          <p className="tabular mt-1 font-display font-condensed text-3xl font-bold text-cure">$3,000</p>
          <p className="font-data text-xs text-rule">0% of revenue, always</p>
        </div>
      </div>
    </section>
  );
}
