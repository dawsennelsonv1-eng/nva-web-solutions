/**
 * components/marketing/ImplementationOffer.tsx — 15A.4.
 *
 * REPLACES components/marketing/FranchiseComparison.tsx, which is deleted in
 * this phase. The franchise comparison (OFFER.md §8) was the positioning
 * through Phase 13; 15A cancels it. Nothing here mentions a franchise, the
 * $49,500 buy-in, or a 6–8% royalty.
 *
 * WHY A NEW FILE RATHER THAN A REWRITE IN PLACE: the old filename described
 * the argument it made, and the argument is gone. A file called
 * FranchiseComparison.tsx that no longer compares anything to a franchise is
 * a trap for whoever greps this repo in six months.
 *
 * SAFE TO DELETE THE OLD FILE — and this is stated on evidence, not
 * assumption. A repo-wide grep for `franchise` across ts/tsx/css/json/md
 * returned exactly one import of that component, in app/(public)/pricing/
 * page.tsx, and this phase rewrites that import to point here. The docs/
 * hits are prose, not code.
 *
 * THE PROPS CONTRACT IS UNCHANGED, deliberately: the pricing page already
 * fetches live plan rows and passes cents-derived dollars in, so the numbers
 * in this copy track the `plans` table with no deploy. The defaults are the
 * OFFER.md §6 founding rate.
 *
 * THE FIGURE BLOCK IS DERIVED, NOT WRITTEN DOWN. Year one is setup plus
 * twelve months, computed from the same props — there is no hardcoded total
 * that can drift out of step with the table it is meant to describe. The
 * second column is 0%, which is a fact about the contract rather than a
 * comparison to anyone.
 *
 * STYLING IS LEGACY ON PURPOSE. This sits on the pricing page, which still
 * wears the pre-15A light system and is out of scope until 15B. It uses the
 * same class vocabulary the file it replaces used, so the page stays
 * internally consistent for this deploy.
 */
export function ImplementationOffer({
  foundationSetupDollars = 500,
  foundationMonthlyDollars = 250,
}: {
  foundationSetupDollars?: number;
  foundationMonthlyDollars?: number;
}) {
  const yearOne = foundationSetupDollars + foundationMonthlyDollars * 12;
  const money = (n: number) => '$' + n.toLocaleString('en-US');

  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <p className="font-data text-xs uppercase tracking-wide text-rule">
        What you are actually buying
      </p>
      <h2 className="mt-2 font-display font-condensed text-2xl font-bold sm:text-3xl">
        We implement AI in your business
      </h2>

      <div className="mt-6 space-y-4 text-base leading-relaxed">
        <p>
          Not a website. Not a monthly retainer for &quot;marketing.&quot; We build the
          specific software your trade is missing and we put it on the site you
          already have — a quoting tool that runs your rates, a visualiser that
          shows a customer their finished floor, and whatever else the job turns
          out to need.
        </p>
        <p>
          It is built around how you actually price. Your rates, your prep
          charges, your minimum, your travel — not a generic calculator with your
          logo dropped on it. When your numbers change you change them yourself,
          from the dashboard, and the tool is correct the same minute.
        </p>
        <p>
          {money(foundationSetupDollars)} to set up, {money(foundationMonthlyDollars)} a
          month, and I take 0% of your revenue. Ever. The leads are yours, the data
          is yours, and you can export all of it and leave whenever you want.
        </p>
        <p>
          What it does not do is create traffic. It converts the people already
          looking at you — the ones who land on your site at nine at night, find
          nothing but a contact form, and call somebody else before you have read
          the email.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 border-t pt-6">
        <div>
          <p className="font-data text-xs uppercase tracking-wide text-rule">
            Year one, all in
          </p>
          <p className="tabular mt-1 font-display font-condensed text-3xl font-bold">
            {money(yearOne)}
          </p>
          <p className="font-data text-xs text-rule">
            setup plus twelve months, nothing else
          </p>
        </div>
        <div>
          <p className="font-data text-xs uppercase tracking-wide text-cure">
            Share of what you invoice
          </p>
          <p className="tabular mt-1 font-display font-condensed text-3xl font-bold text-cure">
            0%
          </p>
          <p className="font-data text-xs text-rule">
            on every job, for as long as you stay
          </p>
        </div>
      </div>
    </section>
  );
}
