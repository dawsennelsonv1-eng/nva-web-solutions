import { SwatchStudio } from '@/components/admin/SwatchStudio';

/**
 * app/admin/swatches/page.tsx — generate the finish swatches with AI.
 *
 * SITS AT app/admin/* ALONGSIDE ai, appearance, finishes, media AND payments,
 * NOT inside the (admin) route group. That is not an oversight and not a hole:
 * lib/auth/admin.ts records that middleware.ts gates every page under /admin/*
 * by URL, which covers both trees. The five existing screens are here for the
 * same reason — they are operator tools rather than part of the admin
 * dashboard's navigation.
 *
 * generateSwatchAction calls requireAdmin() on its own account anyway, because
 * it spends money on every invocation and the page gate is not the only thing
 * that should stand between an anonymous request and an image bill.
 */

export const dynamic = 'force-dynamic';

/**
 * THE EXECUTION CEILING, FOR THE SAME REASON AS THE TOOL PAGE.
 *
 * A Server Action runs under the limit of the route that defines it.
 * generateSwatchAction performs an image generation, which takes 30 to 90
 * seconds — comfortably past the platform default of 10 to 15. Without this
 * line every button on this page fails after fifteen seconds with a message
 * about the connection, and the connection is fine.
 *
 * VERIFY: 300 is the Pro maximum. On Hobby the cap is 60 and a larger value
 * fails the BUILD rather than being clamped, so if a deploy complains about
 * this line, set it to 60.
 */
export const maxDuration = 300;

export default function SwatchAdminPage() {
  return (
    <div className="px-4 py-8">
      <h1 className="font-display text-2xl font-extrabold uppercase">Finish swatches</h1>
      <p className="mt-2 max-w-[68ch] text-base">
        One photograph per option, generated from that option&apos;s own colour and
        its description in the catalogue. The flat block on the left is what the
        picker paints today; the picture beside it is what was generated. They
        should be the same colour — if they are not, generate again.
      </p>
      <p className="mt-2 max-w-[68ch] text-sm">
        Nothing here is saved automatically. Press Save to download the picture,
        then upload it on the finishes screen. Each generation costs money and
        takes up to a minute, so they run one at a time.
      </p>

      <div className="mt-8">
        <SwatchStudio />
      </div>
    </div>
  );
}
