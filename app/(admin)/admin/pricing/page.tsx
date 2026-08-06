import Link from 'next/link';
import { listQuoteConfigsAction } from '@/app/actions/quoteConfig';

/**
 * /admin/pricing — every contractor's rate document, one row each.
 *
 * The `verticalRegistered` flag is surfaced rather than hidden. A config whose
 * module is not loaded cannot be validated, so it cannot be edited — and an
 * operator needs to know that BEFORE he opens it and finds the form disabled.
 */
export const dynamic = 'force-dynamic';

export default async function PricingIndexPage() {
  const configs = await listQuoteConfigsAction();

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="font-display font-condensed text-2xl font-bold uppercase tracking-wide">
        Pricing configs
      </h1>
      <p className="mt-1 text-base text-rule">
        The rates every quote is calculated from. A change here applies to the next quote, not to
        quotes already written.
      </p>

      {configs.length === 0 ? (
        <p className="mt-6 rounded-milled border bg-sheet p-4 text-base">
          No quote configs exist yet. One is created with each prototype.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {configs.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/pricing/${c.id}`}
                className="block rounded-milled border bg-sheet p-4 hover:bg-concrete"
              >
                <span className="font-data text-xs uppercase tracking-wide text-rule">
                  {c.vertical} · {c.sqftMin}–{c.sqftMax}
                </span>
                <span className="mt-1 block text-base font-semibold">/s/{c.slug}</span>
                <span className="mt-1 block font-data text-xs text-rule">
                  Updated {c.updatedAt.slice(0, 10)}
                  {c.verticalRegistered ? '' : ' · MODULE NOT REGISTERED — read only'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
