import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PriceSpan } from '@/components/widget/PriceSpan';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PRODUCT_NAME } from '@/lib/billing/entity';

/**
 * /q/[quoteId] — the persistent, shareable quote.
 *
 * This page gets texted. It is read on a lock screen, forwarded to a spouse,
 * and opened again three weeks later when the homeowner finally decides. So it
 * is a server component with no widget JavaScript on it at all, it renders the
 * figures as text rather than as an image, and the link never expires.
 *
 * READ PATH: the anon RPC get_quote_by_public_id from 0003_rls.sql — a point
 * lookup by unguessable id against tables that are otherwise sealed. There is
 * no listable surface, so possessing this URL is the entire authorisation, and
 * photo_path is deliberately excluded from the payload.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface QuotePayload {
  public_id: string;
  vertical: string;
  low_cents: number;
  high_cents: number;
  breakdown: { lines?: { id: string; label: string; cents: number }[] } | null;
  used_ai_analysis: boolean;
  created_at: string;
}

async function loadQuote(publicId: string): Promise<QuotePayload | null> {
  try {
    const db = createSupabaseServerClient();
    const { data, error } = await db.rpc('get_quote_by_public_id', { p_public_id: publicId });
    if (error || !data) return null;
    return data as unknown as QuotePayload;
  } catch {
    // No env configured (a fresh clone) or the database is unreachable:
    // a 404 is a better answer than a stack trace on a link someone texted.
    return null;
  }
}

function dollars(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

/**
 * Open Graph tags so the link previews as a price rather than as a bare URL.
 * The range goes in the title because that is the only line most people read
 * in a message preview.
 */
export async function generateMetadata({
  params,
}: {
  params: { quoteId: string };
}): Promise<Metadata> {
  const quote = await loadQuote(params.quoteId);
  if (!quote) return { title: 'Quote not found' };
  const range = dollars(quote.low_cents) + '–' + dollars(quote.high_cents);
  const title = 'Your floor estimate: ' + range;
  const description = 'Estimated range for your floor, prepared from the contractor’s own pricing.';
  return {
    title,
    description,
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary', title, description },
    robots: { index: false, follow: false }, // a private quote, not a landing page
  };
}

export default async function QuotePage({ params }: { params: { quoteId: string } }) {
  const quote = await loadQuote(params.quoteId);
  if (!quote) notFound();

  const created = new Date(quote.created_at);
  const lines = quote.breakdown?.lines ?? [];

  return (
    <div className="mx-auto w-full max-w-md p-4">
      <div className="rounded-milled border bg-sheet p-5">
        <div className="flex items-baseline justify-between">
          <span className="font-display font-condensed text-base font-bold uppercase tracking-wide">
            Estimate
          </span>
          <span className="tabular font-data text-xs text-rule">
            {created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>

        <div className="mt-6">
          <PriceSpan lowCents={quote.low_cents} highCents={quote.high_cents} />
        </div>

        {lines.length > 0 ? (
          <table className="mt-4 w-full border-collapse font-data text-sm">
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-rule/40">
                  <td className="py-1.5 pr-2">{l.label}</td>
                  <td className="tabular py-1.5 text-right">{dollars(l.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <p className="mt-4 font-data text-xs leading-relaxed text-rule">
          This is an estimate based on the details provided, not a final contract price. The
          contractor confirms the figure after seeing the floor.
        </p>
      </div>

      <p className="mt-3 text-center font-data text-xs uppercase tracking-wide text-rule">
        Prepared with {PRODUCT_NAME}
      </p>
    </div>
  );
}
