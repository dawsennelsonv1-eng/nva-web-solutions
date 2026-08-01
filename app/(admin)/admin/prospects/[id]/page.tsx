import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getProspectAction } from '@/app/actions/prospects';
import { ProspectForm, type ProspectFormValues } from '@/components/admin/ProspectForm';

/**
 * /admin/prospects/[id] — detail + edit, reusing ProspectForm so the live
 * scorecard preview works identically whether creating or editing.
 * Related prototypes are listed (a prospect may have staged one once
 * pitched — Phase 8/9 build the staging flow this links toward).
 */
export const dynamic = 'force-dynamic';

export default async function ProspectDetailPage({ params }: { params: { id: string } }) {
  const result = await getProspectAction(params.id);
  if (!result) notFound();
  const { prospect, prototypes } = result;

  const initial: ProspectFormValues = {
    id: prospect.id,
    businessName: prospect.business_name,
    contactName: prospect.contact_name ?? '',
    phone: prospect.phone ?? '',
    email: prospect.email ?? '',
    city: prospect.city ?? '',
    state: prospect.state ?? '',
    websiteUrl: prospect.website_url ?? '',
    vertical: prospect.vertical,
    qualificationNotes: prospect.qualification_notes ?? '',
    status: prospect.status,
    scorecard: {
      hasGoogleAds: prospect.has_google_ads ?? false,
      googleReviewCount: prospect.google_review_count ?? 0,
      searchRank: prospect.google_search_rank,
      estimatedMonthlyTraffic: prospect.estimated_monthly_traffic ?? 0,
      hasQuoteOrPricingTool: prospect.has_quote_or_pricing_tool,
      siteLooksAbandoned: prospect.site_looks_abandoned,
    },
  };

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Link href="/admin/prospects" className="font-data text-sm text-rule hover:text-ink">
        ← Prospects
      </Link>
      <h1 className="mt-2 font-display font-condensed text-2xl font-bold uppercase tracking-wide">
        {prospect.business_name}
      </h1>

      {prototypes.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {prototypes.map((p) => (
            <a
              key={p.id}
              href={'/s/' + p.slug}
              className="rounded-milled border bg-sheet px-3 py-1.5 font-data text-xs"
            >
              /s/{p.slug} · {p.status}
            </a>
          ))}
        </div>
      ) : null}

      {/* Phase 9: the combiner is where a prototype's brand/template gets
          staged and deployed. Always shown — getOrCreateDraftPrototypeAction
          creates one on first visit if this prospect doesn't have one yet. */}
      <a
        href={'/admin/combiner?prospectId=' + prospect.id}
        className="mt-3 flex min-h-[2.75rem] w-full items-center justify-center rounded-milled bg-hazard px-4 font-data text-sm font-semibold text-sheet"
      >
        {prototypes.length > 0 ? 'Edit design' : 'Stage a prototype'}
      </a>

      <div className="mt-6">
        <ProspectForm initial={initial} />
      </div>
    </div>
  );
}
