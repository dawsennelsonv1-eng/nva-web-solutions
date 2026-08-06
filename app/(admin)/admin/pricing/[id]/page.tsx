import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getQuoteConfigAction } from '@/app/actions/quoteConfig';
import { QuoteConfigForm } from '@/components/admin/QuoteConfigForm';

/** /admin/pricing/[id] — edit one contractor's rate document. */
export const dynamic = 'force-dynamic';

export default async function PricingDetailPage({ params }: { params: { id: string } }) {
  const config = await getQuoteConfigAction(params.id);
  if (!config) notFound();

  return (
    <div className="mx-auto max-w-3xl p-4">
      <Link href="/admin/pricing" className="font-data text-xs uppercase tracking-wide text-rule">
        ← Pricing configs
      </Link>
      <h1 className="mt-2 font-display font-condensed text-2xl font-bold uppercase tracking-wide">
        /s/{config.slug}
      </h1>
      <p className="mt-1 font-data text-xs uppercase tracking-wide text-rule">
        {config.vertical} · updated {config.updatedAt.slice(0, 10)}
      </p>
      <p className="mt-3 max-w-[60ch] text-base text-rule">
        Every value is validated against the {config.vertical} module&rsquo;s own schema before it
        is written. A rate that would break a quote is refused here rather than discovered by a
        homeowner.
      </p>

      <div className="mt-6">
        <QuoteConfigForm config={config} />
      </div>
    </div>
  );
}
