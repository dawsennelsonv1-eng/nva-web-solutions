import Link from 'next/link';
import { getOrCreateDraftPrototypeAction } from '@/app/actions/combiner';
import { CombinerBoard } from '@/components/admin/combiner/CombinerBoard';
import { trackServer } from '@/lib/analytics.server';

/**
 * /admin/combiner — replacing the Phase 1 placeholder. Reads ?prospectId=X
 * (the natural entry point is a link from /admin/prospects/[id], added
 * below), bootstraps or resumes that prospect's draft prototype, and hands
 * everything to CombinerBoard.
 *
 * "Use Phase 1 tokens for the admin chrome too. No new colour values
 * anywhere" — every class in this file and everything under
 * components/admin/combiner/ is a token utility (bg-sheet, text-rule,
 * border-hazard, etc.) already defined in tailwind.config.ts since Phase 1.
 * Nothing here introduces a hex value.
 */
export const dynamic = 'force-dynamic';

export default async function CombinerPage({
  searchParams,
}: {
  searchParams: { prospectId?: string };
}) {
  if (!searchParams.prospectId) {
    return (
      <div className="mx-auto max-w-md p-4">
        <p className="rounded-milled border bg-sheet p-4 text-base text-rule">
          Open the combiner from a prospect&apos;s page —{' '}
          <Link href="/admin/prospects" className="text-hazard underline underline-offset-4">
            pick one here
          </Link>
          .
        </p>
      </div>
    );
  }

  const bootstrap = await getOrCreateDraftPrototypeAction(searchParams.prospectId);
  if ('error' in bootstrap) {
    return (
      <div className="mx-auto max-w-md p-4">
        <p className="rounded-milled border border-danger/40 bg-danger/5 p-4 text-base">{bootstrap.error}</p>
      </div>
    );
  }

  trackServer('prototype_staged', { template_id: bootstrap.stagedTemplate.templateId, from_preset: false }, {
    surface: 'admin', mode: 'live', prototypeId: bootstrap.prototypeId,
  });

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display font-condensed text-xl font-bold uppercase tracking-wide">Combiner</h1>
        <span className="font-data text-xs text-rule">/s/{bootstrap.slug}</span>
      </div>
      <div className="mt-4">
        <CombinerBoard bootstrap={bootstrap} />
      </div>
    </div>
  );
}
