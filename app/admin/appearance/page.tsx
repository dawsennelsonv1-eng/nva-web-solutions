import { AppearanceToggle } from '@/components/admin/AppearanceToggle';
import { getSiteTheme } from '@/lib/site/theme';

/**
 * app/admin/appearance/page.tsx — renders behind the existing /admin gate, the
 * same way app/admin/ai/page.tsx does.
 *
 * force-dynamic because the whole point is to show the value that is live right
 * now. A cached admin screen showing yesterday's theme is worse than no screen:
 * the operator flips a switch that is already in that position and concludes
 * the feature is broken.
 *
 * getSiteTheme() is itself cached and tag-invalidated, so this does not add a
 * query per request to the public site — only to this page.
 */

export const dynamic = 'force-dynamic';

export default async function AppearancePage() {
  const theme = await getSiteTheme();

  return (
    <div className="px-4 py-8">
      <h1 className="font-display text-2xl font-extrabold uppercase">Appearance</h1>
      <p className="mt-2 max-w-[60ch] text-base">
        Which theme the public site wears. Light is the default. Admin and the
        quoting widget are unaffected by this — it changes the marketing pages
        only.
      </p>

      <div className="mt-6">
        <AppearanceToggle current={theme} />
      </div>
    </div>
  );
}
